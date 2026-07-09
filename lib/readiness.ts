import { SECTION_KEYS } from './knowledge';
import type { IdeaFormData, MarketIntelligence, ProjectKnowledge, ValidationReport } from './types';

const MARKET_STALE_DAYS = 90;
const DISCOVERY_TARGET_ANSWERS = 8;

export type ReadinessKey = 'validation' | 'knowledge' | 'discovery' | 'market';

export interface ReadinessSegment {
  key: ReadinessKey;
  value: number;
  weight: number;
  label: { hr: string; en: string };
}

export interface ReadinessNextStep {
  key: ReadinessKey;
  label: { hr: string; en: string };
  href: string;
}

export interface ReadinessResult {
  overall: number;
  segments: ReadinessSegment[];
  nextStep: ReadinessNextStep;
}

export interface ReadinessInput {
  report: ValidationReport | null;
  knowledge: ProjectKnowledge | null;
  idea: IdeaFormData | null;
  market?: MarketIntelligence | null;
}

const SEGMENT_LABELS: Record<ReadinessKey, { hr: string; en: string }> = {
  validation: { hr: 'Test', en: 'Test' },
  knowledge: { hr: 'Biznis plan', en: 'Business plan' },
  discovery: { hr: 'Dubinsko ispitivanje', en: 'Discovery interview' },
  market: { hr: 'Tržište', en: 'Market' },
};

const NEXT_STEP_LABELS: Record<ReadinessKey, { hr: string; en: string }> = {
  validation: { hr: 'Pokreni prvi test ideje', en: 'Run your first idea test' },
  knowledge: { hr: 'Otvori biznis plan i popuni rupe', en: 'Open the business plan and fill the gaps' },
  discovery: { hr: 'Odgovori na dubinska pitanja', en: 'Answer the discovery questions' },
  market: { hr: 'Pokreni istraživanje tržišta', en: 'Run market research' },
};

const NEXT_STEP_HREF: Record<ReadinessKey, string> = {
  validation: '/',
  knowledge: '/plan',
  discovery: '/discovery',
  market: '/market',
};

function knowledgeCompleteness(knowledge: ProjectKnowledge | null): number {
  if (!knowledge) return 0;
  let facts = 0;
  let gaps = 0;
  for (const key of SECTION_KEYS) {
    const section = knowledge.sections?.[key];
    if (!section) continue;
    const memories = section.memories ?? [];
    if (memories.length) {
      facts += memories.filter((m) => m.kind !== 'gap').length;
      gaps += memories.filter((m) => m.kind === 'gap').length;
    } else {
      facts += section.facts?.length ?? 0;
      gaps += section.gaps?.length ?? 0;
    }
  }
  if (facts + gaps === 0) return 0;
  return Math.round((facts / (facts + gaps)) * 100);
}

function marketScore(market: MarketIntelligence | null | undefined): number {
  if (!market) return 0;
  const ageDays = Math.floor((Date.now() - Date.parse(market.created_at)) / 86_400_000);
  return ageDays > MARKET_STALE_DAYS ? 55 : 100;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const validationValue = input.report ? 100 : 0;
  const knowledgeValue = knowledgeCompleteness(input.knowledge);
  const discoveryCount = input.idea?.discovery_answers?.length ?? 0;
  const discoveryValue = Math.round(Math.min(100, (discoveryCount / DISCOVERY_TARGET_ANSWERS) * 100));
  const marketValue = marketScore(input.market);

  const segments: ReadinessSegment[] = [
    { key: 'validation', value: validationValue, weight: 0.3, label: SEGMENT_LABELS.validation },
    { key: 'knowledge', value: knowledgeValue, weight: 0.3, label: SEGMENT_LABELS.knowledge },
    { key: 'discovery', value: discoveryValue, weight: 0.2, label: SEGMENT_LABELS.discovery },
    { key: 'market', value: marketValue, weight: 0.2, label: SEGMENT_LABELS.market },
  ];

  const overall = Math.round(segments.reduce((sum, s) => sum + s.value * s.weight, 0));

  const weakest = [...segments].sort((a, b) => a.value - b.value)[0];
  const nextStep: ReadinessNextStep = {
    key: weakest.key,
    label: NEXT_STEP_LABELS[weakest.key],
    href: NEXT_STEP_HREF[weakest.key],
  };

  return { overall, segments, nextStep };
}

export function readinessColor(value: number): string {
  return value >= 70 ? 'var(--verdict-green)' : value >= 40 ? 'var(--annotate)' : 'var(--verdict-red)';
}
