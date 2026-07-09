import type {
  ProjectKnowledge,
  KBSection,
  KBSectionKey,
  OnboardingAnswers,
  MemoryItem,
  MemoryKind,
} from './types';

export const SECTION_KEYS: KBSectionKey[] = [
  'product',
  'technical',
  'marketing',
  'legal',
  'business',
  'sales',
  'distribution',
];

export const SECTION_LABELS: Record<KBSectionKey, { hr: string; en: string }> = {
  product: { hr: 'Proizvod', en: 'Product' },
  technical: { hr: 'Tehnologija', en: 'Technology' },
  marketing: { hr: 'Marketing', en: 'Marketing' },
  legal: { hr: 'Pravno i financije', en: 'Legal & Finance' },
  business: { hr: 'Biznis', en: 'Business' },
  sales: { hr: 'Prodaja', en: 'Sales' },
  distribution: { hr: 'Distribucija', en: 'Distribution' },
};

function emptySection(): KBSection {
  return { summary: '', facts: [], gaps: [], memories: [] };
}

export function emptyKnowledge(): ProjectKnowledge {
  return {
    sections: {
      product: emptySection(),
      technical: emptySection(),
      marketing: emptySection(),
      legal: emptySection(),
      business: emptySection(),
      sales: emptySection(),
      distribution: emptySection(),
    },
    digest: '',
    onboarding: null,
    updated_at: new Date().toISOString(),
  };
}

/** Dedupe case-insensitive, čuva originalni tekst, ograniči duljinu liste. */
function mergeList(existing: string[], incoming: string[] | undefined, cap = 25): string[] {
  const out = [...existing];
  const seen = new Set(existing.map((s) => s.trim().toLowerCase()));
  for (const item of incoming ?? []) {
    const key = item.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out.slice(-cap);
}

const clampScore = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

function memoryId(text: string, kind: MemoryKind): string {
  const normalized = `${kind}:${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `mem_${hash.toString(36)}`;
}

function makeMemory(
  text: string,
  kind: MemoryKind,
  source: MemoryItem['source'],
  now: string,
  importance = kind === 'gap' ? 0.65 : 0.7,
  confidence = source === 'validation' ? 0.8 : 0.7
): MemoryItem {
  const clean = text.trim();
  return {
    id: memoryId(clean, kind),
    text: clean,
    kind,
    importance: clampScore(importance, 0.7),
    confidence: clampScore(confidence, 0.7),
    source,
    mentions: 1,
    created_at: now,
    last_seen_at: now,
  };
}

function normalizeMemory(raw: unknown, fallbackKind: MemoryKind, fallbackSource: MemoryItem['source'], now: string): MemoryItem | null {
  if (typeof raw === 'string') {
    const clean = raw.trim();
    return clean ? makeMemory(clean, fallbackKind, fallbackSource, now) : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<MemoryItem>;
  if (!item.text?.trim()) return null;
  const kind = (['fact', 'gap', 'decision', 'risk', 'preference', 'task'] as const).includes(item.kind as never)
    ? item.kind as MemoryKind
    : fallbackKind;
  const source = (['seed', 'chat', 'intake', 'validation', 'research', 'manual'] as const).includes(item.source as never)
    ? item.source as MemoryItem['source']
    : fallbackSource;
  return {
    id: item.id || memoryId(item.text, kind),
    text: item.text.trim(),
    kind,
    importance: clampScore(item.importance, kind === 'gap' ? 0.65 : 0.7),
    confidence: clampScore(item.confidence, 0.7),
    source,
    mentions: Math.max(1, Math.round(typeof item.mentions === 'number' ? item.mentions : 1)),
    created_at: item.created_at || now,
    last_seen_at: item.last_seen_at || now,
  };
}

function sectionMemories(section: KBSection, now: string): MemoryItem[] {
  const explicit = (section.memories ?? [])
    .map((item) => normalizeMemory(item, 'fact', 'seed', now))
    .filter((item): item is MemoryItem => Boolean(item));
  const fromFacts = (section.facts ?? [])
    .map((text) => normalizeMemory(text, 'fact', 'seed', now))
    .filter((item): item is MemoryItem => Boolean(item));
  const fromGaps = (section.gaps ?? [])
    .map((text) => normalizeMemory(text, 'gap', 'seed', now))
    .filter((item): item is MemoryItem => Boolean(item));
  return mergeMemories([...explicit, ...fromFacts, ...fromGaps], [], now, 60);
}

function mergeMemories(existing: MemoryItem[], incoming: MemoryItem[] | undefined, now: string, cap = 60): MemoryItem[] {
  const byKey = new Map<string, MemoryItem>();
  for (const item of [...existing, ...(incoming ?? [])]) {
    const normalized = normalizeMemory(item, item.kind, item.source, now);
    if (!normalized) continue;
    const key = `${normalized.kind}:${normalized.text.toLowerCase().replace(/\s+/g, ' ')}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, normalized);
      continue;
    }
    byKey.set(key, {
      ...prev,
      importance: Math.max(prev.importance, normalized.importance),
      confidence: Math.max(prev.confidence, normalized.confidence),
      mentions: prev.mentions + normalized.mentions,
      last_seen_at: normalized.last_seen_at || now,
    });
  }

  return [...byKey.values()]
    .sort((a, b) => memoryRank(b, now) - memoryRank(a, now))
    .slice(0, cap);
}

function tokenSet(text: string): Set<string> {
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'koji', 'koja', 'koje', 'kako', 'zbog', 'treba', 'ima', 'the']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !stop.has(token))
  );
}

function similarity(a: string, b: string): number {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
}

function strongerMemory(a: MemoryItem, b: MemoryItem, now: string): MemoryItem {
  const scoreA = memoryRank(a, now) + (a.source === 'manual' ? 0.2 : 0);
  const scoreB = memoryRank(b, now) + (b.source === 'manual' ? 0.2 : 0);
  const base = scoreA >= scoreB ? a : b;
  const other = base === a ? b : a;
  return {
    ...base,
    importance: Math.max(a.importance, b.importance),
    confidence: Math.max(a.confidence, b.confidence),
    mentions: a.mentions + b.mentions,
    created_at: new Date(Math.min(new Date(a.created_at).getTime(), new Date(b.created_at).getTime())).toISOString(),
    last_seen_at: new Date(Math.max(new Date(a.last_seen_at).getTime(), new Date(b.last_seen_at).getTime())).toISOString(),
    source: base.source === 'manual' || other.source !== 'manual' ? base.source : other.source,
  };
}

function consolidateMemories(items: MemoryItem[], now: string, cap = 45): MemoryItem[] {
  const sorted = [...items].sort((a, b) => memoryRank(b, now) - memoryRank(a, now));
  const out: MemoryItem[] = [];

  for (const item of sorted) {
    const existingIndex = out.findIndex((candidate) =>
      candidate.kind === item.kind &&
      (candidate.text.trim().toLowerCase() === item.text.trim().toLowerCase() || similarity(candidate.text, item.text) >= 0.72)
    );
    if (existingIndex === -1) {
      out.push(item);
      continue;
    }
    out[existingIndex] = strongerMemory(out[existingIndex], item, now);
  }

  return out
    .sort((a, b) => memoryRank(b, now) - memoryRank(a, now))
    .slice(0, cap);
}

function memoryRank(item: MemoryItem, nowIso: string): number {
  const ageMs = Math.max(0, new Date(nowIso).getTime() - new Date(item.last_seen_at).getTime());
  const ageDays = ageMs / 86_400_000;
  const recency = Math.exp(-ageDays / 45);
  const mentionBoost = Math.min(0.18, Math.log1p(item.mentions) / 12);
  return item.importance * 0.5 + item.confidence * 0.25 + recency * 0.2 + mentionBoost;
}

export function consolidateKnowledge(knowledge: ProjectKnowledge): ProjectKnowledge {
  const now = new Date().toISOString();
  const sections = {} as Record<KBSectionKey, KBSection>;

  for (const key of SECTION_KEYS) {
    const section = knowledge.sections[key] ?? emptySection();
    const memories = consolidateMemories(sectionMemories(section, now), now, 45);
    sections[key] = {
      ...section,
      memories,
      facts: memories.filter((memory) => memory.kind !== 'gap').map((memory) => memory.text).slice(0, 25),
      gaps: memories.filter((memory) => memory.kind === 'gap').map((memory) => memory.text).slice(0, 25),
    };
  }

  return {
    ...knowledge,
    sections,
    updated_at: now,
  };
}

function topMemories(section: KBSection, kinds: MemoryKind[], now: string, cap: number): MemoryItem[] {
  return sectionMemories(section, now)
    .filter((item) => kinds.includes(item.kind))
    .sort((a, b) => memoryRank(b, now) - memoryRank(a, now))
    .slice(0, cap);
}

function topKnowledgeMemories(
  knowledge: ProjectKnowledge,
  kinds: MemoryKind[],
  now: string,
  cap: number
): Array<MemoryItem & { section: KBSectionKey }> {
  return SECTION_KEYS.flatMap((key) =>
    sectionMemories(knowledge.sections[key], now)
      .filter((item) => kinds.includes(item.kind))
      .map((item) => ({ ...item, section: key }))
  )
    .sort((a, b) => memoryRank(b, now) - memoryRank(a, now))
    .slice(0, cap);
}

function pushMemoryBlock(
  lines: string[],
  title: string,
  memories: Array<MemoryItem & { section?: KBSectionKey }>,
  includeSection = true
) {
  if (!memories.length) return;
  lines.push(`${title}:`);
  memories.forEach((memory) => {
    const label = includeSection && memory.section ? `[${memory.section}] ` : '';
    lines.push(`- ${label}${memory.text}`);
  });
  lines.push('');
}

/**
 * Spaja djelomično ažuriranje (iz ekstraktora) u postojeću bazu znanja.
 * Ekstraktor vraća samo nove/promijenjene činjenice po sekciji + opcionalno digest.
 */
export function mergeKnowledge(
  base: ProjectKnowledge,
  update: {
    sections?: Partial<Record<KBSectionKey, Partial<KBSection>>>;
    digest?: string;
    resolvedGaps?: Partial<Record<KBSectionKey, string[]>>;
    source?: MemoryItem['source'];
  }
): ProjectKnowledge {
  const now = new Date().toISOString();
  const source = update.source ?? 'chat';
  const next: ProjectKnowledge = {
    ...base,
    sections: {} as Record<KBSectionKey, KBSection>,
    updated_at: now,
  };

  for (const key of SECTION_KEYS) {
    const current = base.sections?.[key] ?? emptySection();
    const upd = update.sections?.[key];
    const resolved = update.resolvedGaps?.[key] ?? [];

    if (!upd && resolved.length === 0) {
      next.sections[key] = current;
      continue;
    }

    const resolvedSet = new Set(resolved.map((s) => s.trim().toLowerCase()));
    const existingMemories = sectionMemories(current, now).filter(
      (item) => !(item.kind === 'gap' && resolvedSet.has(item.text.trim().toLowerCase()))
    );
    const incomingMemories = [
      ...(upd?.memories ?? []),
      ...(upd?.facts ?? []).map((text) => makeMemory(text, 'fact', source, now)),
      ...(upd?.gaps ?? []).map((text) => makeMemory(text, 'gap', source, now, 0.62, 0.72)),
    ];
    const memories = consolidateMemories(mergeMemories(existingMemories, incomingMemories, now, 60), now, 45);

    next.sections[key] = {
      summary: upd?.summary?.trim() ? upd.summary.trim() : current.summary,
      facts: mergeList(current.facts, upd?.facts),
      // dodaj nove gapove, makni one koje je razgovor riješio
      gaps: mergeList(current.gaps, upd?.gaps).filter(
        (g) => !resolvedSet.has(g.trim().toLowerCase())
      ),
      memories,
    };
  }

  if (update.digest?.trim()) next.digest = update.digest.trim();
  return next;
}

/* ── Onboarding upitnik ───────────────────────────────────────── */

export interface OnboardingQuestion {
  id: keyof OnboardingAnswers;
  label: { hr: string; en: string };
  type: 'select' | 'text';
  options?: { hr: string; en: string }[];
  placeholder?: { hr: string; en: string };
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 'country',
    label: {
      hr: 'U kojoj državi gradiš/pokrećeš proizvod?',
      en: 'Which country are you building/launching in?',
    },
    type: 'text',
    placeholder: { hr: 'npr. Hrvatska, Njemačka, SAD...', en: 'e.g. Croatia, Germany, USA...' },
  },
  {
    id: 'tech_situation',
    label: { hr: 'Kakva je tvoja tehnička situacija?', en: 'What is your technical situation?' },
    type: 'select',
    options: [
      { hr: 'Sam/a sam developer', en: "I'm a developer myself" },
      { hr: 'Imam tehničkog suosnivača/tim', en: 'I have a technical co-founder/team' },
      { hr: 'Netehnički sam, plaćam/outsourcam razvoj', en: 'Non-technical, I outsource development' },
      { hr: 'Još ništa nije izgrađeno', en: 'Nothing built yet' },
    ],
  },
  {
    id: 'stage',
    label: { hr: 'U kojoj si fazi?', en: 'What stage are you at?' },
    type: 'select',
    options: [
      { hr: 'Samo ideja', en: 'Just an idea' },
      { hr: 'Gradim MVP', en: 'Building MVP' },
      { hr: 'Lansirano, tražim prve korisnike', en: 'Launched, seeking first users' },
      { hr: 'Imam korisnike/prihod', en: 'Have users/revenue' },
    ],
  },
  {
    id: 'marketing_budget',
    label: {
      hr: 'Koliki mjesečni budžet imaš za marketing/oglase?',
      en: 'What monthly budget do you have for marketing/ads?',
    },
    type: 'select',
    options: [
      { hr: 'Gotovo ništa (0–100€)', en: 'Almost none (€0–100)' },
      { hr: 'Mali (100–500€)', en: 'Small (€100–500)' },
      { hr: 'Srednji (500–2000€)', en: 'Medium (€500–2000)' },
      { hr: 'Veći (2000€+)', en: 'Larger (€2000+)' },
    ],
  },
  {
    id: 'primary_goal',
    label: {
      hr: 'Koji ti je glavni cilj u sljedećih 6 mjeseci?',
      en: 'What is your main goal in the next 6 months?',
    },
    type: 'select',
    options: [
      { hr: 'Validirati ideju', en: 'Validate the idea' },
      { hr: 'Prvi plaćeni korisnici', en: 'First paying customers' },
      { hr: 'Skalirati rast', en: 'Scale growth' },
      { hr: 'Prikupiti investiciju', en: 'Raise funding' },
    ],
  },
  {
    id: 'extra',
    label: {
      hr: 'Išta još što savjetnici trebaju znati? (opcionalno)',
      en: 'Anything else the advisors should know? (optional)',
    },
    type: 'text',
    placeholder: {
      hr: 'npr. najveća briga, rok, posebne okolnosti...',
      en: 'e.g. biggest worry, deadline, special circumstances...',
    },
  },
];

/**
 * Gradi kompaktni kontekst za pojedinog agenta: globalni digest + činjenice
 * iz proizvoda + činjenice/rupe iz NJEGOVE sekcije. Tako agent ne dobiva cijeli
 * razgovor nego skraćenu, ciljanju relevantnu sliku.
 */
export function buildAgentContext(
  knowledge: ProjectKnowledge,
  section: KBSectionKey,
  marketDigest?: string
): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(
    'EVIDENCE NOTE:',
    '- Validation metrics, persona quotes, buy/maybe/reject percentages, pricing signals, and objections are synthetic AI-persona simulation outputs unless explicitly labeled as real customer interviews, paid sales, analytics, or live web research.',
    '- Treat synthetic metrics as directional signals for what to test next, not as real proof.',
    ''
  );

  if (knowledge.digest) {
    lines.push('PROJECT DIGEST:', knowledge.digest, '');
  }

  if (marketDigest?.trim()) {
    lines.push(
      'REAL MARKET RESEARCH (grounded — from live web research the founder ran, NOT synthetic):',
      marketDigest.trim(),
      'When you reference a competitor or a market fact, prefer these real names/prices over a generic invented alternative, and make clear it comes from the founder\'s own market research rather than a guess.',
      ''
    );
  }

  const product = knowledge.sections.product;
  const productFacts = topMemories(product, ['fact', 'decision', 'risk', 'preference'], now, 8);
  if (productFacts.length) {
    lines.push('KNOWN ABOUT THE PRODUCT:');
    productFacts.forEach((m) => lines.push(`- ${m.text}`));
    lines.push('');
  }

  pushMemoryBlock(
    lines,
    'KEY DECISIONS / CONSTRAINTS (respect these unless founder changes them)',
    topKnowledgeMemories(knowledge, ['decision'], now, 8)
  );
  pushMemoryBlock(
    lines,
    'RISKS TO WATCH (do not ignore these)',
    topKnowledgeMemories(knowledge, ['risk'], now, 8)
  );
  pushMemoryBlock(
    lines,
    'FOUNDER PREFERENCES / WORKING STYLE',
    topKnowledgeMemories(knowledge, ['preference'], now, 6)
  );
  pushMemoryBlock(
    lines,
    'TASK-LIKE COMMITMENTS ALREADY MENTIONED',
    topKnowledgeMemories(knowledge, ['task'], now, 6)
  );

  const own = knowledge.sections[section];
  const ownFacts = topMemories(own, ['fact', 'decision', 'risk', 'preference'], now, 10);
  const ownGaps = topMemories(own, ['gap'], now, 6);
  if (ownFacts.length) {
    lines.push(`ALREADY KNOWN IN YOUR AREA (do NOT ask again — build on these):`);
    ownFacts.forEach((m) => lines.push(`- ${m.text}`));
    lines.push('');
  }
  if (ownGaps.length) {
    lines.push('OPEN GAPS IN YOUR AREA (good things to explore):');
    ownGaps.forEach((m) => lines.push(`- ${m.text}`));
    lines.push('');
  }

  if (knowledge.onboarding) {
    const o = knowledge.onboarding;
    lines.push('FOUNDER CONTEXT:');
    lines.push(`- Country/jurisdiction: ${o.country || 'unknown'}`);
    lines.push(`- Technical situation: ${o.tech_situation || 'unknown'}`);
    lines.push(`- Stage: ${o.stage || 'unknown'}`);
    lines.push(`- Marketing budget: ${o.marketing_budget || 'unknown'}`);
    lines.push(`- 6-month goal: ${o.primary_goal || 'unknown'}`);
    if (o.extra) lines.push(`- Note: ${o.extra}`);
  }

  return lines.join('\n').trim() || 'No project knowledge gathered yet.';
}
