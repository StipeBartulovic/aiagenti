import type { CompetitorProfile, PricingAnalysis } from './types';

/**
 * Križa Van Westendorp prihvatljivi raspon (report.pricing, iz simuliranih persona)
 * sa stvarnim cijenama konkurenata (market.competitors[].pricing, iz web izvora).
 * Konkurentske cijene su slobodan tekst iz LLM-a ("6-8 EUR po obroku") pa se prvo
 * moraju izvući brojevi — ostatak (pozicija naspram raspona) je čisti kod.
 */

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const CURRENCY = String.raw`(?:€|eur|kn|hrk|usd|\$)`;
/** Raspon s valutom nakon njega, npr. "6-8 EUR" ili "6–8€". */
const RANGE_RE = new RegExp(`(${NUM})\\s*(?:-|–|do)\\s*(${NUM})\\s*${CURRENCY}`, 'i');
/** Jedan broj neposredno uz oznaku valute (bilo koji redoslijed), npr. "€9.99" ili "9,99 EUR". */
const SINGLE_RE = new RegExp(`(?:${CURRENCY}\\s*(${NUM}))|(?:(${NUM})\\s*${CURRENCY})`, 'gi');

/**
 * Izvuče najmanji i najveći broj iz slobodnog cjenovnog teksta — SAMO brojeve
 * neposredno uz valutu, da se prag za besplatnu dostavu ili minimalna narudžba
 * ("besplatna dostava iznad 180 €") ne protumači kao cijena proizvoda.
 */
export function parseCompetitorPrice(pricing: string | undefined): { low: number; high: number } | null {
  if (!pricing) return null;

  const range = pricing.match(RANGE_RE);
  if (range) {
    const a = parseFloat(range[1].replace(',', '.'));
    const b = parseFloat(range[2].replace(',', '.'));
    if (Number.isFinite(a) && Number.isFinite(b)) return { low: Math.min(a, b), high: Math.max(a, b) };
  }

  const values: number[] = [];
  let match: RegExpExecArray | null;
  SINGLE_RE.lastIndex = 0;
  while ((match = SINGLE_RE.exec(pricing))) {
    const raw = match[1] ?? match[2];
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n < 100_000) values.push(n);
  }
  if (!values.length) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

export interface PriceCompareEntry {
  name: string;
  tier: CompetitorProfile['tier'];
  low: number;
  high: number;
  raw: string;
  /** Gdje pada naspram NAŠEG prihvatljivog raspona (Van Westendorp) */
  position: 'below' | 'within' | 'above';
}

export function buildPriceComparison(
  competitors: CompetitorProfile[],
  range: { low: number; high: number }
): PriceCompareEntry[] {
  return competitors
    .map((c) => {
      const parsed = parseCompetitorPrice(c.pricing);
      if (!parsed) return null;
      const mid = (parsed.low + parsed.high) / 2;
      const position: PriceCompareEntry['position'] = mid < range.low ? 'below' : mid > range.high ? 'above' : 'within';
      return { name: c.name, tier: c.tier, low: parsed.low, high: parsed.high, raw: c.pricing as string, position };
    })
    .filter((entry): entry is PriceCompareEntry => Boolean(entry));
}

export interface PriceScale {
  min: number;
  max: number;
  /** Postotak pozicije neke vrijednosti na skali 0-100, za CSS left/width. */
  pct: (value: number) => number;
}

export function buildPriceScale(
  range: { low: number; high: number },
  entries: PriceCompareEntry[],
  currentPrice?: number | null
): PriceScale {
  const values = [range.low, range.high, ...entries.flatMap((e) => [e.low, e.high])];
  if (currentPrice != null) values.push(currentPrice);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.1);
  min = Math.max(0, min - pad);
  max = max + pad;
  const span = Math.max(1, max - min);
  return { min, max, pct: (value: number) => Math.min(100, Math.max(0, ((value - min) / span) * 100)) };
}

/** Postoji li dovoljno podataka (naš raspon + barem 1 konkurentska cijena) da usporedba ima smisla. */
export function canCompare(pricing: PricingAnalysis | undefined | null, entries: PriceCompareEntry[]): boolean {
  return Boolean(pricing?.range) && entries.length > 0;
}
