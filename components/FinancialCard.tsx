'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeUnitEconomics, guessPriceFromText } from '@/lib/unit-economics';
import type { UnitEconomicsInputs } from '@/lib/types';

interface Props {
  language: 'hr' | 'en';
  inputs: UnitEconomicsInputs;
  productName: string;
  priceHint?: string;
  onCommit: (next: UnitEconomicsInputs) => void;
}

const FIELD_KEYS = ['price', 'variable_cost', 'fixed_costs', 'expected_volume'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

export default function FinancialCard({ language, inputs, productName, priceHint, onCommit }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<FieldKey, string>>({
    price: inputs.price ? String(inputs.price) : '',
    variable_cost: inputs.variable_cost ? String(inputs.variable_cost) : '',
    fixed_costs: inputs.fixed_costs ? String(inputs.fixed_costs) : '',
    expected_volume: inputs.expected_volume ? String(inputs.expected_volume) : '',
  });

  useEffect(() => {
    setDraft({
      price: inputs.price ? String(inputs.price) : '',
      variable_cost: inputs.variable_cost ? String(inputs.variable_cost) : '',
      fixed_costs: inputs.fixed_costs ? String(inputs.fixed_costs) : '',
      expected_volume: inputs.expected_volume ? String(inputs.expected_volume) : '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.updated_at]);

  const t = {
    hr: {
      title: 'Financijska kartica',
      subtitle: 'Unit economics za ovaj proizvod. Upiši svoje pretpostavke — sve dolje se računa uživo, bez AI-ja.',
      guess: 'Pokušaj pogoditi cijenu iz opisa',
      price: 'Cijena po kupcu/period',
      variable_cost: 'Varijabilni trošak po kupcu',
      fixed_costs: 'Fiksni troškovi (period)',
      expected_volume: 'Očekivan broj kupaca (period)',
      margin: 'Marža po kupcu',
      breakEven: 'Break-even (kupci)',
      breakEvenRevenue: 'Break-even (prihod)',
      monthlyProfit: 'Profit pri očekivanom volumenu',
      units: 'kupaca',
      notViable: 'Nedostižno pri ovoj cijeni/trošku',
      negativeMarginWarning: 'Varijabilni trošak je jednak ili veći od cijene — svaka prodaja te trenutno košta novca. Podigni cijenu ili spusti trošak prije nego skaliraš.',
      askAdvisor: 'Pitaj Viktora da komentira ove brojke',
    },
    en: {
      title: 'Financial card',
      subtitle: 'Unit economics for this product. Enter your assumptions — everything below is computed live, no AI involved.',
      guess: 'Try to guess price from description',
      price: 'Price per customer/period',
      variable_cost: 'Variable cost per customer',
      fixed_costs: 'Fixed costs (period)',
      expected_volume: 'Expected customers (period)',
      margin: 'Margin per customer',
      breakEven: 'Break-even (customers)',
      breakEvenRevenue: 'Break-even (revenue)',
      monthlyProfit: 'Profit at expected volume',
      units: 'customers',
      notViable: 'Unreachable at this price/cost',
      negativeMarginWarning: 'Variable cost equals or exceeds price — every sale currently costs you money. Raise the price or cut the cost before you scale.',
      askAdvisor: 'Ask Viktor to comment on these numbers',
    },
  }[language];

  const fieldLabels: Record<FieldKey, string> = {
    price: t.price,
    variable_cost: t.variable_cost,
    fixed_costs: t.fixed_costs,
    expected_volume: t.expected_volume,
  };

  const parseField = (key: FieldKey): number => {
    const n = parseFloat(draft[key].replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const liveInputs: UnitEconomicsInputs = {
    price: parseField('price'),
    variable_cost: parseField('variable_cost'),
    fixed_costs: parseField('fixed_costs'),
    expected_volume: parseField('expected_volume'),
    updated_at: inputs.updated_at,
  };

  const result = computeUnitEconomics(liveInputs);
  const priceGuess = guessPriceFromText(priceHint);

  const commit = () => onCommit({ ...liveInputs, updated_at: new Date().toISOString() });

  const applyGuess = () => {
    if (priceGuess == null) return;
    setDraft((d) => ({ ...d, price: String(priceGuess) }));
    onCommit({ ...liveInputs, price: priceGuess, updated_at: new Date().toISOString() });
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat(language === 'en' ? 'en-US' : 'hr-HR', { maximumFractionDigits: 2 }).format(n);

  const askAdvisor = () => {
    commit();
    const summary = language === 'en'
      ? `Here are the current unit economics for ${productName}: price ${fmt(liveInputs.price)}, variable cost ${fmt(liveInputs.variable_cost)}, fixed costs ${fmt(liveInputs.fixed_costs)} per period, expected volume ${fmt(liveInputs.expected_volume)}. Margin per customer: ${fmt(result.marginPerUnit)} (${fmt(result.marginPct)}%). Break-even: ${result.breakEvenUnits != null ? `${fmt(result.breakEvenUnits)} customers / ${fmt(result.breakEvenRevenue ?? 0)} revenue` : 'not reachable at this margin'}. Profit at expected volume: ${fmt(result.monthlyProfitAtVolume)}. What do you think — is this viable, and what would you change first?`
      : `Evo trenutnih unit economics brojki za ${productName}: cijena ${fmt(liveInputs.price)}, varijabilni trošak ${fmt(liveInputs.variable_cost)}, fiksni troškovi ${fmt(liveInputs.fixed_costs)} po periodu, očekivan volumen ${fmt(liveInputs.expected_volume)}. Marža po kupcu: ${fmt(result.marginPerUnit)} (${fmt(result.marginPct)}%). Break-even: ${result.breakEvenUnits != null ? `${fmt(result.breakEvenUnits)} kupaca / ${fmt(result.breakEvenRevenue ?? 0)} prihoda` : 'nedostižan pri ovoj marži'}. Profit pri očekivanom volumenu: ${fmt(result.monthlyProfitAtVolume)}. Što misliš — je li ovo održivo, i što bi prvo promijenio?`;
    sessionStorage.setItem('aivalidator_advisor_prefill', summary);
    router.push('/advisors');
  };

  return (
    <section className="sheet p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="kicker !mb-0">{t.title}</p>
        {priceGuess != null && (
          <button type="button" onClick={applyGuess} className="link-ink text-xs">
            {t.guess} ({fmt(priceGuess)})
          </button>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--ink-faint)]">{t.subtitle}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELD_KEYS.map((key) => (
          <label key={key} className="block">
            <span className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{fieldLabels[key]}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              onBlur={commit}
              placeholder="0"
              className="paper-field mt-1 w-full text-sm"
            />
          </label>
        ))}
      </div>

      <div className="mt-5 grid gap-4 border-t border-[var(--hairline-strong)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.margin}</p>
          <p className="mt-1 text-lg text-[var(--ink)]">
            {fmt(result.marginPerUnit)} <span className="text-xs text-[var(--ink-faint)]">({fmt(result.marginPct)}%)</span>
          </p>
        </div>
        <div>
          <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.breakEven}</p>
          <p className="mt-1 text-lg text-[var(--ink)]">
            {result.breakEvenUnits != null ? `${fmt(result.breakEvenUnits)} ${t.units}` : t.notViable}
          </p>
        </div>
        <div>
          <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.breakEvenRevenue}</p>
          <p className="mt-1 text-lg text-[var(--ink)]">
            {result.breakEvenRevenue != null ? fmt(result.breakEvenRevenue) : '—'}
          </p>
        </div>
        <div>
          <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.monthlyProfit}</p>
          <p
            className="mt-1 text-lg"
            style={{ color: result.monthlyProfitAtVolume >= 0 ? 'var(--verdict-green)' : 'var(--verdict-red)' }}
          >
            {fmt(result.monthlyProfitAtVolume)}
          </p>
        </div>
      </div>

      {!result.isViable && (liveInputs.price > 0 || liveInputs.variable_cost > 0) && (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--verdict-red)' }}>
          {t.negativeMarginWarning}
        </p>
      )}

      <button type="button" onClick={askAdvisor} className="btn-line mt-5 text-sm">
        {t.askAdvisor}
      </button>
    </section>
  );
}
