import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { summarizePersonaContext } from '@/lib/persona-context';
import { computePricingCore, type RawPricePoint } from '@/lib/pricing';
import type { IdeaFormData, PersonaAttributes, PersonaReaction, PricePoint, PricingAnalysis } from '@/lib/types';
import { ServerActionError } from './errors';

const BATCH_SIZE = 10;
const MAX_PERSONAS = 60;

export interface PricingRequest {
  idea: IdeaFormData;
  personas: PersonaAttributes[];
  reactions?: PersonaReaction[];
  language: 'hr' | 'en';
}

export interface PricingResponse {
  pricing: PricingAnalysis;
}

function selectPricingPersonas(
  idea: IdeaFormData,
  personas: PersonaAttributes[],
  language: 'hr' | 'en',
  reactions?: PersonaReaction[]
): { personas: PersonaAttributes[]; sampleLabel: string } {
  const side = idea.business_model === 'B2B2C' ? 'payer' : 'any';
  const compressedIds = summarizePersonaContext(personas, reactions, { marketSide: side, maxPersonas: MAX_PERSONAS })
    ?.representativePersonas.map((persona) => persona.id);
  if (compressedIds?.length) {
    const byId = new Map(personas.map((persona) => [persona.id, persona]));
    const selected = compressedIds.map((id) => byId.get(id)).filter((persona): persona is PersonaAttributes => Boolean(persona));
    if (selected.length >= 8 || idea.business_model !== 'B2B2C') {
      return {
        personas: selected,
        sampleLabel: idea.business_model === 'B2B2C'
          ? language === 'en' ? 'representative business-side payers' : 'reprezentativni biznis platiše'
          : language === 'en' ? 'representative tested buyers' : 'reprezentativni testirani kupci',
      };
    }
  }

  if (idea.business_model !== 'B2B2C') {
    return {
      personas,
      sampleLabel: language === 'en' ? 'all paying buyers' : 'svi kupci koji plaćaju',
    };
  }

  const payers = personas.filter((p) => p.market_side === 'payer' || p.market_side === 'partner' || p.market_side === 'both');
  return {
    personas: payers.length >= 8 ? payers : personas,
    sampleLabel: language === 'en' ? 'business-side payers only' : 'samo biznis strana / platiše',
  };
}

function detectCurrency(priceModel: string): string {
  const pm = priceModel.toLowerCase();
  if (pm.includes('$') || /\busd\b|dolar/.test(pm)) return '$';
  if (pm.includes('£') || /\bgbp\b/.test(pm)) return '£';
  if (/\bkn\b|kuna/.test(pm)) return 'kn';
  return '€';
}

function detectUnit(priceModel: string, language: 'hr' | 'en'): string {
  const pm = priceModel.toLowerCase();
  if (/mjeseč|month|\/mo\b|\/mj\b|monthly/.test(pm)) return language === 'en' ? '/mo' : '/mj';
  if (/godišnj|annual|year|yearly|\/yr\b|\/god\b/.test(pm)) return language === 'en' ? '/yr' : '/god';
  return '';
}

function detectCurrentPrice(priceModel: string): number | null {
  const m = priceModel.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) ? v : null;
}

function fmt(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

async function getBatchPrices(
  personas: PersonaAttributes[],
  idea: IdeaFormData,
  currency: string,
  language: 'hr' | 'en'
): Promise<PricePoint[]> {
  const slim = personas.map((p) => ({
    id: p.id,
    age: p.age,
    role: p.role,
    income: p.income,
    region: p.region,
    tech: `${p.tech_literacy}/10`,
    market_side: p.market_side ?? 'both',
  }));

  const descBlock =
    idea.business_model === 'B2B2C'
      ? `${idea.b2b2c_consumer_description || ''} ${idea.b2b2c_business_description || ''}`
      : idea.detailed_description || '';

  const prompt = `You simulate how specific people would price a product, using the Van Westendorp Price Sensitivity Meter.

PRODUCT:
Name: "${idea.product_name}"
Pitch: "${idea.elevator_pitch}"
What it is: "${descBlock}"
The founder prices it as: "${idea.price_model}".
${idea.business_model === 'B2B2C' ? 'This pricing study is for the business-side payer/partner audience, not end consumers unless consumer premium pricing is explicitly described.' : ''}
User/report language: ${language === 'en' ? 'English' : 'Croatian'}.

Give ALL prices as PLAIN NUMBERS in ${currency}, for the SAME period/unit as that pricing model (e.g. per month if it's a monthly subscription). Numbers only, no text.

For each persona estimate four price thresholds. They MUST be strictly ascending: too_cheap < cheap < expensive < too_expensive.
- too_cheap: at/below this price they would doubt the product is any good
- cheap: feels like a bargain / great value
- expensive: starting to feel expensive, but they would still consider it
- too_expensive: so expensive they would NOT buy
Reflect each persona's income, role and region — a student prices very differently than a CFO.

PERSONAS:
${JSON.stringify(slim)}

Return ONLY this JSON (${personas.length} items, same order):
{ "prices": [ { "persona_id": number, "too_cheap": number, "cheap": number, "expensive": number, "too_expensive": number } ] }`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You simulate realistic price sensitivity. Return valid JSON only, numbers only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.7, maxTokens: 2000, json: true }
  );

  const parsed = safeParseJson<{ prices: PricePoint[] }>(raw);
  return parsed?.prices ?? [];
}

function buildVerdict(
  range: { low: number; high: number },
  opp: number,
  currency: string,
  unit: string,
  currentPrice: number | null,
  language: 'hr' | 'en'
): string {
  const money = (v: number) => `${fmt(v)}${currency}${unit}`;
  const rangeStr = `${money(range.low)}–${money(range.high)}`;

  if (language === 'en') {
    let s = `Acceptable price range: ${rangeStr}. Optimal price (least resistance): ~${money(opp)}.`;
    if (currentPrice != null) {
      if (currentPrice < range.low) s += ` Your price (${money(currentPrice)}) is BELOW the range — you're likely leaving money on the table or signalling "too cheap".`;
      else if (currentPrice > range.high) s += ` Your price (${money(currentPrice)}) is ABOVE the range — a large part of the market will reject it as too expensive.`;
      else s += ` Your price (${money(currentPrice)}) sits inside the acceptable range — well positioned.`;
    }
    return s;
  }

  let s = `Prihvatljiv raspon cijene: ${rangeStr}. Optimalna cijena (najmanje otpora): ~${money(opp)}.`;
  if (currentPrice != null) {
    if (currentPrice < range.low) s += ` Tvoja cijena (${money(currentPrice)}) je ISPOD raspona — vjerojatno ostavljaš novac na stolu ili djeluje "prejeftino".`;
    else if (currentPrice > range.high) s += ` Tvoja cijena (${money(currentPrice)}) je IZNAD raspona — velik dio tržišta odbit će je kao preskupu.`;
    else s += ` Tvoja cijena (${money(currentPrice)}) je unutar prihvatljivog raspona — dobro pozicionirana.`;
  }
  return s;
}

export async function analyzePricing({ idea, personas, reactions, language }: PricingRequest): Promise<PricingResponse> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }
  if (!idea || !idea.price_model) {
    throw new ServerActionError('Nedostaje idea / price_model.', 400, 'missing_idea_or_price_model');
  }
  if (!Array.isArray(personas) || personas.length === 0) {
    throw new ServerActionError('Nedostaju persone za analizu cijene.', 400, 'missing_pricing_personas');
  }

  const currency = detectCurrency(idea.price_model);
  const unit = detectUnit(idea.price_model, language);
  const currentPrice = detectCurrentPrice(idea.price_model);

  const selected = selectPricingPersonas(idea, personas, language, reactions);
  const used = selected.personas.slice(0, MAX_PERSONAS);
  const batches: PersonaAttributes[][] = [];
  for (let i = 0; i < used.length; i += BATCH_SIZE) {
    batches.push(used.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map((b) => getBatchPrices(b, idea, currency, language)));
  const points: RawPricePoint[] = results.flat();

  const core = computePricingCore(points);
  if (!core) {
    throw new ServerActionError('Nedovoljno valjanih odgovora za analizu cijene.', 422, 'insufficient_pricing_responses');
  }

  const pricing: PricingAnalysis = {
    currency,
    unit,
    sample_size: core.sample_size,
    sample_label: selected.sampleLabel,
    opp: core.opp,
    ipp: core.ipp,
    pmc: core.pmc,
    pme: core.pme,
    range: core.range,
    curve: core.curve,
    current_price: currentPrice,
    verdict: buildVerdict(core.range, core.opp, currency, unit, currentPrice, language),
  };

  return { pricing };
}
