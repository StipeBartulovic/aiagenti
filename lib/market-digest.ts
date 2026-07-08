import type { MarketIntelligence } from './types';

/**
 * Kompaktni tekstualni sažetak tržišnog istraživanja za ubacivanje u engine
 * promptove — isti obrazac kao website_context/document_context (plain string
 * na IdeaFormData), tako da ga runEngine ne treba posebno provlačiti kroz
 * potpise funkcija: čim je na formi, personе ga vide.
 */
export function buildMarketDigest(market: MarketIntelligence): string {
  const lines: string[] = [];
  lines.push(`Scope: ${market.scope.scope} — ${market.scope.region}.`);
  if (market.market_summary) lines.push(market.market_summary);

  const topCompetitors = market.competitors.slice(0, 6);
  if (topCompetitors.length) {
    lines.push('Real competitors (use these instead of inventing a generic alternative when one fits):');
    topCompetitors.forEach((c) => {
      const bits = [
        `- ${c.name} [${c.tier}]: ${c.summary}`,
        c.pricing ? `Price: ${c.pricing}.` : '',
        c.weaknesses.length ? `Customer complaints: ${c.weaknesses.join('; ')}.` : '',
        c.battlecard ? `Sales battlecard — when buyer says "${c.battlecard.objection}", respond: "${c.battlecard.response}" (proof: ${c.battlecard.proof}).` : '',
      ].filter(Boolean);
      lines.push(bits.join(' '));
    });
  }

  if (market.gaps.length) {
    lines.push(`Known market gaps: ${market.gaps.join('; ')}`);
  }

  return lines.join('\n').slice(0, 2600);
}

/** Što se promijenilo između dva istraživanja — tržišno znanje blijedi za ~90 dana, ovo pokazuje što je novo. */
export interface MarketDiff {
  newCompetitors: string[];
  goneCompetitors: string[];
  pricingChanges: { name: string; before: string; after: string }[];
  newSignals: string[];
  newGaps: string[];
  resolvedGaps: string[];
}

function normalizeKey(text: string): string {
  return text.trim().toLowerCase();
}

export function diffMarketIntelligence(previous: MarketIntelligence, next: MarketIntelligence): MarketDiff {
  const prevByName = new Map(previous.competitors.map((c) => [normalizeKey(c.name), c]));
  const nextByName = new Map(next.competitors.map((c) => [normalizeKey(c.name), c]));

  const newCompetitors = next.competitors.filter((c) => !prevByName.has(normalizeKey(c.name))).map((c) => c.name);
  const goneCompetitors = previous.competitors.filter((c) => !nextByName.has(normalizeKey(c.name))).map((c) => c.name);

  const pricingChanges: MarketDiff['pricingChanges'] = [];
  for (const [key, prevCompetitor] of prevByName) {
    const nextCompetitor = nextByName.get(key);
    if (nextCompetitor?.pricing && prevCompetitor.pricing && nextCompetitor.pricing !== prevCompetitor.pricing) {
      pricingChanges.push({ name: nextCompetitor.name, before: prevCompetitor.pricing, after: nextCompetitor.pricing });
    }
  }

  const prevSignalKeys = new Set(previous.signals.map((s) => normalizeKey(s.signal)));
  const newSignals = next.signals.filter((s) => !prevSignalKeys.has(normalizeKey(s.signal))).map((s) => s.signal);

  const prevGapKeys = new Set(previous.gaps.map(normalizeKey));
  const nextGapKeys = new Set(next.gaps.map(normalizeKey));
  const newGaps = next.gaps.filter((g) => !prevGapKeys.has(normalizeKey(g)));
  const resolvedGaps = previous.gaps.filter((g) => !nextGapKeys.has(normalizeKey(g)));

  return { newCompetitors, goneCompetitors, pricingChanges, newSignals, newGaps, resolvedGaps };
}

export function isMarketDiffEmpty(diff: MarketDiff): boolean {
  return (
    diff.newCompetitors.length === 0 &&
    diff.goneCompetitors.length === 0 &&
    diff.pricingChanges.length === 0 &&
    diff.newSignals.length === 0 &&
    diff.newGaps.length === 0 &&
    diff.resolvedGaps.length === 0
  );
}
