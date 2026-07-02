import type { PersonaAttributes, PersonaReaction } from './types';

export interface PersonaContextSummary {
  sampleSize: number;
  intent: { buy: number; maybe: number; reject: number };
  topObjections: string[];
  topQuestions: string[];
  topBuyingReasons: string[];
  skepticQuotes: string[];
  representativePersonas: Array<{
    id: number;
    role: string;
    industry: string;
    region: string;
    income: PersonaAttributes['income'];
    tech_literacy: number;
    market_side?: PersonaAttributes['market_side'];
    disposition?: PersonaAttributes['disposition'];
    decision?: PersonaReaction['decision'];
    main_reason?: string;
    main_objection?: string;
  }>;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

function topCounts(items: string[], limit: number): string[] {
  const counts = new Map<string, { text: string; count: number }>();
  for (const raw of items) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const prev = counts.get(key);
    counts.set(key, { text, count: (prev?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => `${item.text}${item.count > 1 ? ` (${item.count}x)` : ''}`);
}

function reactionWeight(reaction?: PersonaReaction): number {
  if (!reaction) return 0;
  const decisionWeight = reaction.decision === 'reject' ? 3 : reaction.decision === 'maybe' ? 2 : 1;
  const objectionWeight = (reaction.objections?.length ?? 0) * 0.6;
  const questionWeight = (reaction.questions?.length ?? 0) * 0.4;
  const importance = typeof reaction.importance === 'number' ? reaction.importance / 10 : 0.5;
  return decisionWeight + objectionWeight + questionWeight + importance;
}

export function summarizePersonaContext(
  personas: PersonaAttributes[] | undefined,
  reactions: PersonaReaction[] | undefined,
  opts: { maxPersonas?: number; marketSide?: 'payer' | 'user' | 'any' } = {}
): PersonaContextSummary | null {
  if (!personas?.length) return null;
  const maxPersonas = opts.maxPersonas ?? 12;
  const reactionById = new Map((reactions ?? []).map((reaction) => [reaction.persona_id, reaction]));
  const filtered = personas.filter((persona) => {
    if (!opts.marketSide || opts.marketSide === 'any') return true;
    if (opts.marketSide === 'payer') {
      return persona.market_side === 'payer' || persona.market_side === 'partner' || persona.market_side === 'both';
    }
    return persona.market_side === 'user';
  });
  const base = filtered.length ? filtered : personas;
  const paired = base.map((persona) => ({ persona, reaction: reactionById.get(persona.id) }));
  const relevantReactions = paired.map((item) => item.reaction).filter((item): item is PersonaReaction => Boolean(item));

  const buy = relevantReactions.filter((reaction) => reaction.decision === 'buy').length;
  const maybe = relevantReactions.filter((reaction) => reaction.decision === 'maybe').length;
  const reject = relevantReactions.filter((reaction) => reaction.decision === 'reject').length;
  const total = relevantReactions.length || base.length;

  const byDecision = (decision: PersonaReaction['decision']) =>
    paired
      .filter((item) => item.reaction?.decision === decision)
      .sort((a, b) => reactionWeight(b.reaction) - reactionWeight(a.reaction));

  const balanced = [
    ...byDecision('reject').slice(0, Math.ceil(maxPersonas * 0.45)),
    ...byDecision('maybe').slice(0, Math.ceil(maxPersonas * 0.35)),
    ...byDecision('buy').slice(0, Math.ceil(maxPersonas * 0.2)),
  ];
  const seen = new Set<number>();
  const representative = [...balanced, ...paired.sort((a, b) => reactionWeight(b.reaction) - reactionWeight(a.reaction))]
    .filter((item) => {
      if (seen.has(item.persona.id)) return false;
      seen.add(item.persona.id);
      return true;
    })
    .slice(0, maxPersonas);

  return {
    sampleSize: base.length,
    intent: {
      buy: pct(buy, total),
      maybe: pct(maybe, total),
      reject: pct(reject, total),
    },
    topObjections: topCounts(relevantReactions.flatMap((reaction) => reaction.objections ?? []), 8),
    topQuestions: topCounts(relevantReactions.flatMap((reaction) => reaction.questions ?? []), 6),
    topBuyingReasons: topCounts(
      relevantReactions.filter((reaction) => reaction.decision === 'buy').map((reaction) => reaction.main_reason),
      6
    ),
    skepticQuotes: relevantReactions
      .filter((reaction) => reaction.decision !== 'buy' && reaction.quote)
      .sort((a, b) => reactionWeight(b) - reactionWeight(a))
      .slice(0, 5)
      .map((reaction) => reaction.quote),
    representativePersonas: representative.map(({ persona, reaction }) => ({
      id: persona.id,
      role: persona.role,
      industry: persona.industry,
      region: persona.region,
      income: persona.income,
      tech_literacy: persona.tech_literacy,
      market_side: persona.market_side,
      disposition: persona.disposition,
      decision: reaction?.decision,
      main_reason: reaction?.main_reason,
      main_objection: reaction?.objections?.[0],
    })),
  };
}

export function formatPersonaContext(summary: PersonaContextSummary | null): string {
  if (!summary) return '';
  return [
    `Compressed persona context (${summary.sampleSize} tested personas): buy ${summary.intent.buy}% / maybe ${summary.intent.maybe}% / reject ${summary.intent.reject}%.`,
    summary.topObjections.length ? `Top objections: ${summary.topObjections.join('; ')}` : '',
    summary.topQuestions.length ? `Top questions: ${summary.topQuestions.join('; ')}` : '',
    summary.topBuyingReasons.length ? `Top buying triggers: ${summary.topBuyingReasons.join('; ')}` : '',
    summary.skepticQuotes.length ? `Skeptic quotes: ${summary.skepticQuotes.map((quote) => `"${quote}"`).join(' | ')}` : '',
    `Representative personas: ${JSON.stringify(summary.representativePersonas)}`,
  ].filter(Boolean).join('\n');
}
