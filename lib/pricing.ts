import type { PricingCurvePoint } from './types';

/** Jedan set od četiri Van Westendorp praga (bez persona_id). */
export interface RawPricePoint {
  too_cheap: number;
  cheap: number;
  expensive: number;
  too_expensive: number;
}

/** Numerička jezgra analize cijene (sve što se računa iz podataka, bez valute/verdikta). */
export interface PricingCore {
  sample_size: number;
  opp: number;
  ipp: number;
  pmc: number;
  pme: number;
  range: { low: number; high: number };
  curve: PricingCurvePoint[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** p-ti percentil sortiranog niza (p u 0..100). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

/** Cijena na kojoj se dvije krivulje sijeku (linearna interpolacija prvog presjeka). */
function intersect(curve: PricingCurvePoint[], ka: keyof PricingCurvePoint, kb: keyof PricingCurvePoint): number | null {
  for (let i = 1; i < curve.length; i++) {
    const d0 = (curve[i - 1][ka] as number) - (curve[i - 1][kb] as number);
    const d1 = (curve[i][ka] as number) - (curve[i][kb] as number);
    if (d0 === 0) return curve[i - 1].price;
    if ((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0)) {
      const t = d0 / (d0 - d1);
      return curve[i - 1].price + t * (curve[i].price - curve[i - 1].price);
    }
  }
  return null;
}

/**
 * Van Westendorp Price Sensitivity Meter.
 * Iz odgovora persona gradi 4 kumulativne krivulje i nalazi presjeke (OPP/IPP/PMC/PME).
 * Sve brojke iz koda — LLM daje samo sirove pragove po personi.
 */
export function computePricingCore(points: RawPricePoint[]): PricingCore | null {
  // očisti i forsiraj monotonost (too_cheap <= cheap <= expensive <= too_expensive)
  const clean = points
    .filter((p) =>
      [p.too_cheap, p.cheap, p.expensive, p.too_expensive].every(
        (v) => typeof v === 'number' && isFinite(v) && v >= 0
      )
    )
    .map((p) => {
      const [a, b, c, d] = [p.too_cheap, p.cheap, p.expensive, p.too_expensive].sort((x, y) => x - y);
      return { too_cheap: a, cheap: b, expensive: c, too_expensive: d };
    });

  const n = clean.length;
  if (n < 4) return null;

  // raspon grafa iz 5–95 percentila (otpornost na ekstreme), krivulje koriste SVE podatke
  const pooled = clean.flatMap((p) => [p.too_cheap, p.cheap, p.expensive, p.too_expensive]).sort((x, y) => x - y);
  let lo = percentile(pooled, 5);
  let hi = percentile(pooled, 95);
  if (hi <= lo) hi = lo + Math.max(1, lo * 0.5);
  if (lo > 0) lo = Math.max(0, lo - (hi - lo) * 0.05); // mali zazor

  const STEPS = 48;
  const stepSize = (hi - lo) / STEPS;
  const curve: PricingCurvePoint[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const price = lo + i * stepSize;
    curve.push({
      price: round2(price),
      too_cheap: round2((100 * clean.filter((p) => p.too_cheap >= price).length) / n), // descending
      cheap: round2((100 * clean.filter((p) => p.cheap >= price).length) / n), // descending (bargain)
      expensive: round2((100 * clean.filter((p) => p.expensive <= price).length) / n), // ascending
      too_expensive: round2((100 * clean.filter((p) => p.too_expensive <= price).length) / n), // ascending
    });
  }

  const oppRaw = intersect(curve, 'too_cheap', 'too_expensive');
  const ippRaw = intersect(curve, 'cheap', 'expensive');
  const pmcRaw = intersect(curve, 'too_cheap', 'expensive');
  const pmeRaw = intersect(curve, 'cheap', 'too_expensive');

  // fallbackovi ako se neki presjek ne nađe u rasponu
  const pmc = pmcRaw ?? lo;
  const pme = pmeRaw ?? hi;
  const opp = oppRaw ?? (pmc + pme) / 2;
  const ipp = ippRaw ?? opp;

  const low = Math.min(pmc, pme);
  const high = Math.max(pmc, pme);

  return {
    sample_size: n,
    opp: round2(opp),
    ipp: round2(ipp),
    pmc: round2(pmc),
    pme: round2(pme),
    range: { low: round2(low), high: round2(high) },
    curve,
  };
}
