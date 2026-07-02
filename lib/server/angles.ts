import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import type {
  EmergentCluster,
  IdeaFormData,
  MarketingAngle,
  OpportunityAnalysis,
  ValidationReport,
} from '@/lib/types';
import { ServerActionError } from './errors';

export interface AnglesRequest {
  idea: IdeaFormData;
  language: 'hr' | 'en';
  context: {
    clusters?: EmergentCluster[];
    opportunity?: OpportunityAnalysis | null;
    target_audience?: ValidationReport['target_audience'];
    rejection?: ValidationReport['rejection'];
  };
}

export interface AnglesResponse {
  angles: MarketingAngle[];
}

export async function generateMarketingAngles(body: AnglesRequest): Promise<AnglesResponse> {
  const { idea, context } = body;
  if (!idea) {
    throw new ServerActionError('Nedostaje idea.', 400, 'missing_idea');
  }

  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const clusters = context.clusters ?? [];

  const groupsBlock = clusters.length
    ? `CUSTOMER GROUPS (emerged from the data - write ONE angle per group, keep the exact label):\n${clusters
        .map(
          (c) =>
            `- "${c.label}" (${c.size_pct}% of buyers): buy ${c.intent.buy}%/maybe ${c.intent.maybe}%/reject ${c.intent.reject}%, opportunity ${c.avg_opportunity}/100. Wants: "${c.top_problem || '-'}". Main objection: "${c.top_objection || '-'}". ${c.descriptor}`
        )
        .join('\n')}`
    : `No distinct groups detected. Produce 2-3 angles for the primary audience: ${context.target_audience?.profile || '(unknown)'}. Top rejection reasons: ${(context.rejection?.reasons ?? []).map((r) => r.reason).join('; ') || '-'}.`;

  const insightBlock = [
    context.opportunity?.top_problems?.length
      ? `Top jobs/unmet needs: ${context.opportunity.top_problems.map((p) => `${p.problem} (opp ${p.opportunity})`).join('; ')}`
      : '',
    context.opportunity?.top_alternatives?.length
      ? `Current alternatives buyers use: ${context.opportunity.top_alternatives.map((a) => `${a.name} (${a.count})`).join('; ')}`
      : '',
    context.rejection?.quotes?.length
      ? `Raw skeptic quotes to mine for voice-of-customer language: ${context.rejection.quotes.map((q) => `"${q}"`).join(' | ')}`
      : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a senior performance marketer. Turn customer insight into concrete, ready-to-run marketing angles.

PRODUCT: "${idea.product_name}" - ${idea.elevator_pitch}
PRICE: ${idea.price_model}
${groupsBlock}
${insightBlock ? `\n\nCUSTOMER INSIGHT:\n${insightBlock}` : ''}

For each angle give: the positioning angle (the ONE thing to lead with), a concrete ad/landing headline a copywriter could ship as-is, the proof/reason-to-believe, the single best channel to run it, the CTA, and the main objection the message must pre-empt.
Use the customer's own language where possible. Prefer narrow, testable messages over broad brand slogans.

Return ONLY this JSON (write all text in ${langName}):
{ "angles": [ { "cluster_label": "exact group label or empty", "angle": "2-5 word positioning angle", "message": "one concrete headline, max 90 chars", "proof": "specific proof/reason-to-believe, max 100 chars", "channel": "one specific channel", "cta": "specific CTA, max 55 chars", "preempt_objection": "the objection to neutralize, short" } ] }
Be specific and distinct per group. No generic 'increase awareness' fluff. The message must be sharp enough to A/B test today.`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You are a performance marketer. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.6, maxTokens: 1100, json: true }
  );

  const parsed = safeParseJson<{ angles: MarketingAngle[] }>(raw);
  const byLabel = new Map(clusters.map((c) => [c.label, c.size_pct]));

  const angles: MarketingAngle[] = (parsed?.angles ?? [])
    .filter((a) => a && typeof a.angle === 'string' && a.angle.trim() && typeof a.message === 'string' && a.message.trim())
    .map((a) => {
      const label = (a.cluster_label || '').trim();
      return {
        cluster_label: label || undefined,
        target_pct: label ? byLabel.get(label) : undefined,
        angle: a.angle.trim(),
        message: a.message.trim(),
        proof: (a.proof || '').trim() || undefined,
        channel: (a.channel || '').trim(),
        cta: (a.cta || '').trim() || undefined,
        preempt_objection: (a.preempt_objection || '').trim(),
      };
    })
    .slice(0, 6);

  return { angles };
}
