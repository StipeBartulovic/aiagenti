import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import type { IdeaFormData, SegmentSpec } from '@/lib/types';
import { ServerActionError } from './errors';

export interface AudiencesRequest {
  idea: IdeaFormData;
  language: 'hr' | 'en';
}

interface RawSegment {
  label?: string;
  description?: string;
  roles?: string[];
  age_range?: [number, number];
  regions?: string[];
  income_skew?: string;
  tech_range?: [number, number];
  rationale?: string;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? Math.round(v) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const asStrArray = (v: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(v)) return fallback;
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
  return out.length ? out : fallback;
};

function formatDiscoveryAnswers(idea: IdeaFormData): string {
  const answers = (idea.discovery_answers ?? []).filter((item) => item.answer.trim().length > 0);
  const adaptive = (idea.adaptive_answers ?? []).filter((item) => item.answer.trim().length > 0);
  if (answers.length === 0 && adaptive.length === 0) return '';

  const discovery = answers
    .map((item) => `- [${item.category}] ${item.question}\n  Founder answer: ${item.answer.trim()}`)
    .join('\n');
  const adaptiveBlock = adaptive
    .map((item) => `- [adaptive:${item.category}] ${item.question}\n  Founder answer: ${item.answer.trim()}`)
    .join('\n');

  return [discovery, adaptiveBlock].filter(Boolean).join('\n');
}

function sanitize(raw: RawSegment, index: number): SegmentSpec | null {
  if (!raw || typeof raw.label !== 'string' || !raw.label.trim()) return null;

  const ageLo = clampInt(raw.age_range?.[0], 16, 80, 25);
  const ageHi = clampInt(raw.age_range?.[1], 16, 80, 45);
  const techLo = clampInt(raw.tech_range?.[0], 1, 10, 3);
  const techHi = clampInt(raw.tech_range?.[1], 1, 10, 8);

  const incomeRaw = (raw.income_skew || '').toLowerCase();
  const income_skew = (['low', 'medium', 'high', 'mixed'] as const).includes(incomeRaw as never)
    ? (incomeRaw as SegmentSpec['income_skew'])
    : 'mixed';

  return {
    id: `seg${index + 1}`,
    label: raw.label.trim().replace(/["\n\r]/g, '').slice(0, 60),
    description: (raw.description || '').trim().slice(0, 200),
    roles: asStrArray(raw.roles, ['Professional']).slice(0, 6),
    age_range: [Math.min(ageLo, ageHi), Math.max(ageLo, ageHi)],
    regions: asStrArray(raw.regions, ['Global']).slice(0, 3),
    income_skew,
    tech_range: [Math.min(techLo, techHi), Math.max(techLo, techHi)],
    rationale: (raw.rationale || '').trim().slice(0, 300),
  };
}

export async function suggestAudiences({ idea, language }: AudiencesRequest): Promise<{ segments: SegmentSpec[] }> {
  if (!idea) throw new ServerActionError('Nedostaje idea.', 400);

  const langName = language === 'en' ? 'English' : 'Croatian';
  const descBlock =
    idea.business_model === 'B2B2C'
      ? `Consumer side: ${idea.b2b2c_consumer_description || ''}\nBusiness side: ${idea.b2b2c_business_description || ''}`
      : idea.detailed_description || '';
  const geoAreas = idea.geo_areas?.length ? idea.geo_areas : idea.geo_area ? [idea.geo_area] : [];
  const geoBlock = geoAreas.length
    ? `- Selected geographic areas:
${geoAreas.map((area, index) => `  ${index + 1}. ${area.label}
     Center: ${area.center.lat.toFixed(5)}, ${area.center.lng.toFixed(5)}
     Bounds: north ${area.bounds.north.toFixed(5)}, south ${area.bounds.south.toFixed(5)}, east ${area.bounds.east.toFixed(5)}, west ${area.bounds.west.toFixed(5)}`).join('\n')}`
    : '';
  const discoveryBlock = formatDiscoveryAnswers(idea);

  const systemPrompt = `You are a market segmentation expert. Given a product, you identify the most plausible DISTINCT target audiences to test it against.

Return 3 candidate audiences that are genuinely DIFFERENT from each other (not three flavors of the same person). A good set usually includes:
1. The most obvious/expected buyer.
2. An adjacent or non-obvious segment that might surprise the founder.
3. A different angle (different age, profession, region, or use-case).

Each audience must be specific enough to generate realistic personas from. Tie regions to the founder's stated target market/country when given; if a selected geographic area is provided, use that area and nearby neighborhoods/cities as the region context instead of generic regions.
For the MVP, prefer audiences that make sense for a solo founder validating a digital or SaaS product before MVP, unless the product context clearly points to local service, retail, or another offline model.

PRODUCT:
- Business model: ${idea.business_model}
- Name: ${idea.product_name}
- Pitch: ${idea.elevator_pitch}
${idea.initial_brief ? `- Initial founder brief: ${idea.initial_brief}` : ''}
${idea.inferred_category ? `- Inferred business category: ${idea.inferred_category}` : ''}
- Description: ${descBlock}
${idea.document_context ? `- Uploaded project document context: ${idea.document_context.slice(0, 2500)}` : ''}
- Price: ${idea.price_model}
${idea.target_market ? `- Founder's target market: ${idea.target_market}` : ''}
${geoBlock}
${idea.assumed_customer ? `- Founder's assumed customer: ${idea.assumed_customer}` : ''}
${discoveryBlock ? `- Founder Office Hours answers:\n${discoveryBlock}` : ''}

Return ONLY this JSON:
{
  "segments": [
    {
      "label": "short audience name in ${langName} (e.g. 'Freelance dizajneri')",
      "description": "one sentence in ${langName} describing who they are",
      "roles": ["3-6 concrete job titles / personas that belong to this audience"],
      "age_range": [minAge, maxAge],
      "regions": ["1-3 regions, e.g. 'Croatia', 'DACH region', 'North America'"],
      "income_skew": "low | medium | high | mixed",
      "tech_range": [minTech, maxTech],
      "rationale": "one sentence in ${langName}: why this audience might (or might not) buy"
    }
  ]
}
Exactly 3 segments. age 16-80, tech 1-10. Be concrete and realistic for THIS product.`;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Propose the 3 candidate audiences. Return the JSON.' },
  ];

  const raw = await callDeepSeek(messages, { temperature: 0.6, maxTokens: 900, json: true });
  const parsed = safeParseJson<{ segments: RawSegment[] }>(raw);

  const segments = (parsed?.segments ?? [])
    .map((segment, index) => sanitize(segment, index))
    .filter((segment): segment is SegmentSpec => segment !== null)
    .slice(0, 3);

  return { segments };
}
