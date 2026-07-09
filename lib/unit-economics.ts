import { parseCompetitorPrice } from './price-crossover';
import type { UnitEconomicsInputs } from './types';

export type { UnitEconomicsInputs };

export interface UnitEconomicsResult {
  marginPerUnit: number;
  marginPct: number;
  breakEvenUnits: number | null;
  breakEvenRevenue: number | null;
  monthlyProfitAtVolume: number;
  isViable: boolean;
}

export function defaultUnitEconomics(): UnitEconomicsInputs {
  return { price: 0, variable_cost: 0, fixed_costs: 0, expected_volume: 0, updated_at: new Date().toISOString() };
}

/** Pokušaj pogoditi početnu cijenu iz slobodnog teksta (npr. idea.price_model) — samo prijedlog, korisnik uvijek može promijeniti. */
export function guessPriceFromText(text: string | undefined): number | null {
  const parsed = parseCompetitorPrice(text);
  if (!parsed) return null;
  return Math.round(((parsed.low + parsed.high) / 2) * 100) / 100;
}

export function computeUnitEconomics(inputs: UnitEconomicsInputs): UnitEconomicsResult {
  const margin = inputs.price - inputs.variable_cost;
  const marginPct = inputs.price > 0 ? (margin / inputs.price) * 100 : 0;
  const breakEvenUnits = margin > 0 ? Math.ceil(inputs.fixed_costs / margin) : null;
  const breakEvenRevenue = breakEvenUnits != null ? breakEvenUnits * inputs.price : null;
  const monthlyProfitAtVolume = margin * inputs.expected_volume - inputs.fixed_costs;

  return {
    marginPerUnit: margin,
    marginPct,
    breakEvenUnits,
    breakEvenRevenue,
    monthlyProfitAtVolume,
    isViable: margin > 0,
  };
}
