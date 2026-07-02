import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import { formatPersonaContext, summarizePersonaContext } from '@/lib/persona-context';
import type { ConversionLever, ConversionPlan, IdeaFormData, PersonaAttributes, PersonaReaction } from '@/lib/types';
import { ServerActionError } from './errors';

interface ConversionContext {
  intent?: { buy: number; maybe: number; reject: number };
  rejection_reasons?: { reason: string; percentage: number }[];
  quotes?: string[];
  top_questions?: string[];
  personas?: PersonaAttributes[];
  reactions?: PersonaReaction[];
}

export interface ConversionRequest {
  idea: IdeaFormData;
  context: ConversionContext;
  language: 'hr' | 'en';
}

export interface ConversionResponse {
  conversion: ConversionPlan;
}

const asStr = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampPct = (v: unknown): number => {
  const n = typeof v === 'number' ? Math.round(v) : NaN;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
};
const asEffort = (v: unknown): ConversionLever['effort'] =>
  v === 'low' || v === 'medium' || v === 'high' ? v : 'medium';

function cleanLevers(input: unknown): ConversionLever[] {
  return (Array.isArray(input) ? input : [])
    .filter((l) => l && typeof l.change === 'string' && l.change.trim())
    .map((l) => {
      const lever = l as Partial<ConversionLever>;
      return {
        change: asStr(lever.change, 250),
        addresses: asStr(lever.addresses, 200),
        could_convert: clampPct(lever.could_convert),
        effort: asEffort(lever.effort),
      };
    })
    .sort((a, b) => b.could_convert - a.could_convert)
    .slice(0, 6);
}

function summarizeSide(
  personas: PersonaAttributes[] | undefined,
  reactions: PersonaReaction[] | undefined,
  side: 'payer' | 'user'
): string {
  const summary = summarizePersonaContext(personas, reactions, { marketSide: side, maxPersonas: 10 });
  const formatted = formatPersonaContext(summary);
  if (!formatted) return '';
  return `${side === 'payer' ? 'BUSINESS/PAYER SIDE' : 'CONSUMER/USER SIDE'}\n${formatted}`;
}

export async function generateConversionPlan({ idea, context, language }: ConversionRequest): Promise<ConversionResponse> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }

  if (!idea) {
    throw new ServerActionError('Nedostaje idea.', 400, 'missing_idea');
  }

  const langName = language === 'en' ? 'English' : 'Croatian';
  const c = context || {};

  const descBlock =
    idea.business_model === 'B2B2C'
      ? `${idea.b2b2c_consumer_description || ''} ${idea.b2b2c_business_description || ''}`
      : idea.detailed_description || '';

  const barriers = [
    c.intent ? `Current intent: buy ${c.intent.buy}% / maybe ${c.intent.maybe}% / reject ${c.intent.reject}%` : '',
    c.rejection_reasons?.length
      ? `Rejection reasons (with share of objections): ${c.rejection_reasons.map((r) => `${r.reason} (${r.percentage}%)`).join('; ')}`
      : '',
    c.quotes?.length ? `Skeptic quotes: ${c.quotes.map((q) => `"${q}"`).join(' | ')}` : '',
    c.top_questions?.length ? `Open questions: ${c.top_questions.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const payerBlock = idea.business_model === 'B2B2C' ? summarizeSide(c.personas, c.reactions, 'payer') : '';
  const userBlock = idea.business_model === 'B2B2C' ? summarizeSide(c.personas, c.reactions, 'user') : '';
  const personaBlock = idea.business_model !== 'B2B2C'
    ? formatPersonaContext(summarizePersonaContext(c.personas, c.reactions, { maxPersonas: 12 }))
    : '';

  const systemPrompt = `You are a sharp product strategist. The founder ran a market test; many simulated customers said "maybe" or "reject". Your job: turn those barriers into a PRIORITIZED action plan - the specific changes that would convert the most non-buyers.

PRODUCT:
- ${idea.business_model} · "${idea.product_name}" - ${idea.elevator_pitch}
- What it is: ${descBlock}
- Price: ${idea.price_model}

WHAT BLOCKED THE NON-BUYERS:
${barriers || '(little detail - infer the most likely barriers for this kind of product)'}
${personaBlock ? `\n\nCOMPRESSED PERSONA SIGNALS:\n${personaBlock}` : ''}
${payerBlock ? `\n\nB2B2C SIDE-SPECIFIC DATA:\n${payerBlock}\n\n${userBlock}` : ''}

Produce 3-5 concrete "levers". Each lever = one specific change the founder could make that removes a real barrier above. For each, estimate how much of the current maybe+reject crowd it could realistically convert, and the effort to build it. Be specific to THIS product (not "improve marketing"). Order by impact (could_convert desc). Don't invent barriers that aren't implied by the data.
${idea.business_model === 'B2B2C' ? 'Because this is B2B2C, ALSO split the plan into two sections: payer = business partners who pay; user = end-consumer demand/adoption. Payer levers should improve monetization, ROI, trust, operational value, partner acquisition. User levers should improve demand, trust, convenience, usage, and consumer-side activation.' : ''}

Write everything in ${langName}. Return ONLY this JSON:
{
  "summary": "1-2 sentences: the single biggest opportunity to convert non-buyers",
  "levers": [
    { "change": "the specific change to make", "addresses": "which objection/barrier it removes", "could_convert": <integer 0-100, % of current maybe+reject it could flip>, "effort": "low|medium|high" }
  ]${idea.business_model === 'B2B2C' ? `,
  "sections": [
    { "side": "payer", "label": "Business partners / payers", "summary": "1 sentence", "levers": [ { "change": "...", "addresses": "...", "could_convert": 0, "effort": "low|medium|high" } ] },
    { "side": "user", "label": "End users / demand", "summary": "1 sentence", "levers": [ { "change": "...", "addresses": "...", "could_convert": 0, "effort": "low|medium|high" } ] }
  ]` : ''}
}`;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate the conversion plan. Return the JSON.' },
  ];

  const raw = await callDeepSeek(messages, { temperature: 0.5, maxTokens: 1200, json: true });
  const parsed = safeParseJson<{
    summary?: string;
    levers?: ConversionLever[];
    sections?: ConversionPlan['sections'];
  }>(raw);

  if (!parsed) {
    throw new ServerActionError('Neuspjelo generiranje plana.', 422, 'conversion_generation_failed');
  }

  const sections = idea.business_model === 'B2B2C'
    ? (parsed.sections ?? [])
        .filter((s) => s && (s.side === 'payer' || s.side === 'user'))
        .map((s) => ({
          side: s.side,
          label: asStr(s.label, 80) || (s.side === 'payer' ? 'Business partners / payers' : 'End users / demand'),
          summary: asStr(s.summary, 300),
          levers: cleanLevers(s.levers),
        }))
        .filter((s) => s.levers.length > 0)
    : undefined;

  const levers: ConversionLever[] = cleanLevers(parsed.levers);

  if (levers.length === 0 && (!sections || sections.length === 0)) {
    throw new ServerActionError('Neuspjelo generiranje plana.', 422, 'conversion_generation_failed');
  }

  const conversion: ConversionPlan = {
    summary: asStr(parsed.summary, 400),
    levers: levers.length ? levers : sections?.flatMap((s) => s.levers).sort((a, b) => b.could_convert - a.could_convert).slice(0, 5) ?? [],
    sections,
  };

  return { conversion };
}
