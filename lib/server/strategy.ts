import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import type { IdeaFormData, StrategyMode, StrategyReview, StrategyTask, ValidationReport } from '@/lib/types';
import { ServerActionError } from './errors';

export interface StrategyRequest {
  idea: IdeaFormData;
  report: Pick<ValidationReport, 'score' | 'summary' | 'intent' | 'confidence' | 'target_audience' | 'rejection' | 'top_questions' | 'action_plan' | 'opportunity' | 'segments'>;
  mode: StrategyMode;
  language: 'hr' | 'en';
}

export interface StrategyResponse {
  strategy: StrategyReview;
}

const modes: Record<StrategyMode, { label: string; instruction: string }> = {
  go_bigger: {
    label: 'Go bigger',
    instruction: 'Find the 10x more ambitious version of this opportunity. Expand only where the data supports it. Show what would make the product feel meaningfully more valuable.',
  },
  tighten_wedge: {
    label: 'Tighten wedge',
    instruction: 'Reduce scope to the smallest sharp wedge that can win a specific buyer or segment. Cut broad platform thinking. Prioritize a paid pilot or narrow first use case.',
  },
  fix_objections: {
    label: 'Fix objections',
    instruction: 'Focus only on the objections, skeptic quotes, and open questions. Produce a plan that directly removes the highest-friction blockers.',
  },
  prepare_launch: {
    label: 'Prepare launch',
    instruction: 'Turn the validation into a launch plan: landing page promise, proof, outreach, first experiment, and conversion path.',
  },
};

const asStr = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const asStrArray = (v: unknown, maxItems: number, maxChars = 180): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxChars))
    .slice(0, maxItems);

function asOwner(v: unknown): StrategyTask['owner'] {
  return v === 'product' || v === 'marketing' || v === 'sales' || v === 'research' || v === 'legal' || v === 'business'
    ? v
    : 'business';
}

function asPriority(v: unknown): StrategyTask['priority'] {
  return v === 'low' || v === 'medium' || v === 'high' ? v : 'medium';
}

function cleanTasks(input: unknown): StrategyTask[] {
  return (Array.isArray(input) ? input : [])
    .map((task) => {
      const t = task as Partial<StrategyTask>;
      return {
        title: asStr(t.title, 90),
        details: asStr(t.details, 260),
        owner: asOwner(t.owner),
        priority: asPriority(t.priority),
      };
    })
    .filter((task) => task.title && task.details)
    .slice(0, 7);
}

export async function generateStrategyReview(body: StrategyRequest): Promise<StrategyResponse> {
  const { idea, report, mode, language } = body;
  if (!idea || !report) {
    throw new ServerActionError('Nedostaje idea ili report.', 400, 'missing_idea_or_report');
  }
  if (!modes[mode]) {
    throw new ServerActionError('Nepoznat strategy mode.', 400, 'unknown_strategy_mode');
  }

  const langName = language === 'en' ? 'English' : 'Croatian';
  const modeInfo = modes[mode];
  const descBlock =
    idea.business_model === 'B2B2C'
      ? `Consumer side: ${idea.b2b2c_consumer_description || ''}\nBusiness side: ${idea.b2b2c_business_description || ''}`
      : idea.detailed_description || '';
  const discovery = (idea.discovery_answers ?? [])
    .filter((answer) => answer.answer.trim())
    .map((answer) => `- [${answer.category}] ${answer.question}: ${answer.answer}`)
    .join('\n');

  const prompt = `You are a founder strategy partner. The founder has run a synthetic market validation. Your job is to turn the report into a strategic next sprint.

MODE: ${modeInfo.label}
MODE INSTRUCTION: ${modeInfo.instruction}

PRODUCT:
- Business model: ${idea.business_model}
- Name: ${idea.product_name}
- Pitch: ${idea.elevator_pitch}
- Description: ${descBlock}
- Price: ${idea.price_model}
- Target market: ${idea.target_market || 'not specified'}
- Founder assumed customer: ${idea.assumed_customer || 'not specified'}
${discovery ? `\nFOUNDER OFFICE HOURS:\n${discovery}` : ''}

VALIDATION REPORT:
- Score: ${report.score}/100
- Summary: ${report.summary}
- Intent: buy ${report.intent.buy}% / maybe ${report.intent.maybe}% / reject ${report.intent.reject}%
- Confidence: ${report.confidence ? `${report.confidence.score}/100 ${report.confidence.label}; missing evidence: ${report.confidence.missing_evidence.join('; ')}` : 'not available'}
- Target audience: ${report.target_audience.profile}
- Assumption vs reality: ${report.target_audience.assumption_vs_reality}
- Top reasons to buy: ${report.target_audience.top_reasons_to_buy.join('; ')}
- Rejection reasons: ${report.rejection.reasons.map((reason) => `${reason.reason} (${reason.percentage}%)`).join('; ')}
- Skeptic quotes: ${report.rejection.quotes.map((quote) => `"${quote}"`).join(' | ')}
- Open questions: ${report.top_questions.join('; ')}
- Current action plan: product=${report.action_plan.product}; marketing=${report.action_plan.marketing}; pricing=${report.action_plan.pricing}
${report.opportunity ? `- Opportunity: ${report.opportunity.verdict}; top unmet needs: ${report.opportunity.top_problems.map((p) => `${p.problem} (${p.opportunity})`).join('; ')}` : ''}
${report.segments?.length ? `- Segment results: ${report.segments.map((s) => `${s.label}: score ${s.score}, buy ${s.intent.buy}%, maybe ${s.intent.maybe}%, reject ${s.intent.reject}%`).join(' | ')}` : ''}

Rules:
- Be direct. Do not flatter the founder.
- Make one clear recommendation for this selected mode.
- Include concrete scope: what to do now and what NOT to do now.
- Produce tasks that could be executed this week.
- If evidence is weak, say what proof is needed before scaling.
- Write all text in ${langName}.

Return ONLY this JSON:
{
  "recommendation": "one sentence recommendation",
  "strategic_read": "2-3 sentences explaining the strategic read",
  "accepted_scope": ["3-6 items to include now"],
  "not_in_scope": ["3-6 tempting things to avoid/defer"],
  "next_tasks": [
    { "title": "short task title", "details": "specific task details", "owner": "product|marketing|sales|research|legal|business", "priority": "low|medium|high" }
  ],
  "risks": ["2-5 concrete risks"],
  "open_decisions": ["2-5 decisions the founder must make"]
}`;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: 'You are a founder strategy partner. Return valid JSON only.' },
    { role: 'user', content: prompt },
  ];
  const raw = await callDeepSeek(messages, { temperature: 0.55, maxTokens: 1600, json: true });
  const parsed = safeParseJson<Omit<StrategyReview, 'mode' | 'created_at'>>(raw);
  if (!parsed) {
    throw new ServerActionError('Neuspjelo generiranje strategije.', 422, 'strategy_generation_failed');
  }

  const strategy: StrategyReview = {
    mode,
    recommendation: asStr(parsed.recommendation, 260),
    strategic_read: asStr(parsed.strategic_read, 600),
    accepted_scope: asStrArray(parsed.accepted_scope, 6),
    not_in_scope: asStrArray(parsed.not_in_scope, 6),
    next_tasks: cleanTasks(parsed.next_tasks),
    risks: asStrArray(parsed.risks, 5),
    open_decisions: asStrArray(parsed.open_decisions, 5),
    created_at: new Date().toISOString(),
  };

  if (!strategy.recommendation || !strategy.strategic_read || strategy.next_tasks.length === 0) {
    throw new ServerActionError('Strategija nije dovoljno kompletna.', 422, 'strategy_incomplete');
  }

  return { strategy };
}
