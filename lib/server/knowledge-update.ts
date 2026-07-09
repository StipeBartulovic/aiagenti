import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { mergeKnowledge, emptyKnowledge, SECTION_KEYS } from '@/lib/knowledge';
import { AGENTS } from '@/lib/agents';
import type {
  ProjectKnowledge,
  KBSection,
  KBSectionKey,
  IdeaFormData,
  ValidationReport,
  OnboardingAnswers,
  AgentId,
  MemoryItem,
  MemoryKind,
} from '@/lib/types';
import { ServerActionError } from './errors';

type ExtractResult = {
  sections?: Partial<Record<KBSectionKey, Partial<KBSection>>>;
  resolvedGaps?: Partial<Record<KBSectionKey, string[]>>;
};

type IndexResult = {
  digest?: string;
  summaries?: Partial<Record<KBSectionKey, string>>;
};

export type KnowledgeUpdateRequest = {
  mode: 'seed' | 'extract';
  knowledge?: ProjectKnowledge | null;
  idea?: IdeaFormData;
  report?: ValidationReport | null;
  onboarding?: OnboardingAnswers;
  intakeTranscript?: { role: 'user' | 'assistant'; content: string }[];
  agentId?: AgentId;
  userMessage?: string;
  assistantMessage?: string;
};

export type KnowledgeUpdateResponse =
  | { knowledge: ProjectKnowledge; changed?: never }
  | { knowledge: ProjectKnowledge; changed: boolean };

const SECTION_GUIDE = `SECTIONS:
- product: what the product is, value proposition, problem solved, target user
- technical: tech stack, architecture, security, data handling, infrastructure, build plan
- marketing: customer acquisition channels, positioning, audience, budget, CAC/conversion
- legal: country/jurisdiction, company structure, GDPR/data protection, contracts, IP, taxes/invoicing
- business: business model, who pays & why, pricing, unit economics, competition, edge, milestones
- sales: sales motion, ideal buyer profile, outreach approach, objections, pipeline, conversion targets
- distribution: where the target audience's attention lives (newsletters, communities, creators, search), words buyers use, pain sentence, hooks (curiosity/fear/status/money), channels chosen and why, stage-specific distribution plan`;

const MEMORY_KINDS: MemoryKind[] = ['fact', 'gap', 'decision', 'risk', 'preference', 'task'];
const clamp = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

function sanitizeExtracted(result: ExtractResult, source: MemoryItem['source']): ExtractResult {
  const now = new Date().toISOString();
  const sections: ExtractResult['sections'] = {};

  for (const key of SECTION_KEYS) {
    const section = result.sections?.[key];
    if (!section) continue;
    const rawMemories = Array.isArray(section.memories) ? section.memories : [];
    const memories = rawMemories
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw as Partial<MemoryItem>;
        if (!item.text?.trim()) return null;
        const kind = MEMORY_KINDS.includes(item.kind as MemoryKind) ? item.kind as MemoryKind : 'fact';
        return {
          id: item.id || '',
          text: item.text.trim().slice(0, 180),
          kind,
          importance: clamp(item.importance, kind === 'gap' ? 0.62 : 0.7),
          confidence: clamp(item.confidence, 0.72),
          source,
          mentions: Math.max(1, Math.round(typeof item.mentions === 'number' ? item.mentions : 1)),
          created_at: item.created_at || now,
          last_seen_at: now,
        } satisfies MemoryItem;
      })
      .filter((item): item is MemoryItem => Boolean(item))
      .slice(0, 12);

    const asStringList = (value: unknown, max: number): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, max)
        : [];

    sections[key] = {
      ...section,
      facts: asStringList(section.facts, 12),
      gaps: asStringList(section.gaps, 10),
      memories,
    };
  }

  return { ...result, sections };
}

async function extractFacts(sourceText: string): Promise<ExtractResult> {
  const prompt = `You are a precise information extractor building a structured business plan from founder input.

${SECTION_GUIDE}

From the SOURCE below, extract concrete project memory and assign each item to the right section.
Only include what is genuinely supported by the source — do NOT invent. Keep each fact short (max ~120 chars), first-person-neutral (e.g. "Targets freelancers in Croatia", "Uses Next.js + Firebase").

Memory kind rules:
- fact: stable project, customer, business, product, market, legal, sales, or technical information.
- gap: important unanswered question, missing evidence, vague assumption, or unknown that should be explored.
- decision: founder has chosen, committed to, ruled out, prioritized, or accepted something.
- risk: blocker, fragile assumption, compliance/financial/technical/market risk, or reason the project could fail.
- preference: founder/user working preference, constraint, style choice, UX preference, budget preference, or decision style.
- task: concrete next action or commitment with an implied owner; do NOT create task memories for vague advice.

Use facts/gaps for backwards compatibility, but put the most useful context in memories. Extract decisions, risks, preferences, and concrete task-like commitments as memories even when they do not fit a plain fact/gap list.

SOURCE:
${sourceText}

Return ONLY this JSON:
{
  "sections": {
    "product": { "facts": [], "gaps": [], "memories": [] },
    "technical": { "facts": [], "gaps": [], "memories": [] },
    "marketing": { "facts": [], "gaps": [], "memories": [] },
    "legal": { "facts": [], "gaps": [], "memories": [] },
    "business": { "facts": [], "gaps": [], "memories": [] },
    "sales": { "facts": [], "gaps": [], "memories": [] },
    "distribution": { "facts": [], "gaps": [], "memories": [] }
  },
  "resolvedGaps": { "product": [], "technical": [], "marketing": [], "legal": [], "business": [], "sales": [], "distribution": [] }
}
Each memory item must be:
{ "text": "short specific memory", "kind": "fact|gap|decision|risk|preference|task", "importance": 0-1, "confidence": 0-1 }
Importance guide: legal/financial constraints, target market, pricing, goal, stage, objections, explicit decisions, concrete next actions, and risks are high (0.75-0.95). Casual details are low. Omit weak memories.
Omit nothing structurally; use empty arrays where there's no info. resolvedGaps = previously-open questions that THIS source now answers (leave empty if unknown).`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You extract structured data. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 1500, json: true }
  );

  return safeParseJson<ExtractResult>(raw) ?? {};
}

async function indexDigest(knowledge: ProjectKnowledge): Promise<IndexResult> {
  const sectionsText = SECTION_KEYS.map((key) => {
    const section = knowledge.sections[key];
    const memories = (section.memories ?? [])
      .sort((a, b) => (b.importance * b.confidence) - (a.importance * a.confidence))
      .slice(0, 12)
      .map((memory) => `${memory.kind}:${memory.text}`)
      .join(' | ');
    return `[${key}]\nsummary: ${section.summary || '(none)'}\nmemories: ${memories || '(none)'}\nfacts: ${section.facts.join(' | ') || '(none)'}\ngaps: ${section.gaps.join(' | ') || '(none)'}`;
  }).join('\n\n');

  const prompt = `You are the project indexer. Produce a COMPACT, structured snapshot of this project so other AI advisors can get context fast without re-reading everything.

CURRENT KNOWLEDGE:
${sectionsText}

Return ONLY this JSON:
{
  "digest": "A tight 4-7 sentence overview of the whole project: what it is, who it's for, business model, current stage, and the biggest open risks/unknowns. Neutral, factual, dense.",
  "summaries": {
    "product": "1 sentence",
    "technical": "1 sentence",
    "marketing": "1 sentence",
    "legal": "1 sentence",
    "business": "1 sentence",
    "sales": "1 sentence",
    "distribution": "1 sentence"
  }
}
If a section has no info, set its summary to an empty string. Write in English (internal use).`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You are a summarizer/indexer. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.3, maxTokens: 700, json: true }
  );

  return safeParseJson<IndexResult>(raw) ?? {};
}

function applySummaries(knowledge: ProjectKnowledge, summaries?: Partial<Record<KBSectionKey, string>>) {
  if (!summaries) return;
  for (const key of SECTION_KEYS) {
    const summary = summaries[key];
    if (typeof summary === 'string' && summary.trim()) {
      knowledge.sections[key].summary = summary.trim();
    }
  }
}

export async function updateKnowledgeAction(body: KnowledgeUpdateRequest): Promise<KnowledgeUpdateResponse> {
  if (body.mode === 'seed') {
    const idea = body.idea;
    if (!idea) throw new ServerActionError('Nedostaje idea.', 400);

    const reportBits = body.report
      ? `\nSYNTHETIC AI PERSONA VALIDATION (directional signal, not real customer proof):\n- Score: ${body.report.score}/100 from simulated AI personas\n- Simulated intent: buy ${body.report.intent.buy}% / maybe ${body.report.intent.maybe}% / reject ${body.report.intent.reject}%\n- Summary: ${body.report.summary}\n- Simulated target audience: ${body.report.target_audience.profile}\n- Top simulated rejection reasons: ${body.report.rejection.reasons.map((reason) => reason.reason).join(', ')}\n- Questions raised by simulated personas: ${body.report.top_questions.join(' | ')}\nIMPORTANT: Advisors must not treat these as real clicks, paid sales, analytics, or interviews unless founder later provides real-world evidence.`
      : '';

    const onboarding = body.onboarding;
    const onboardingBits = onboarding
      ? `\nFOUNDER CONTEXT:\n- Country: ${onboarding.country}\n- Technical situation: ${onboarding.tech_situation}\n- Stage: ${onboarding.stage}\n- Marketing budget: ${onboarding.marketing_budget}\n- 6-month goal: ${onboarding.primary_goal}${onboarding.extra ? `\n- Note: ${onboarding.extra}` : ''}`
      : '';

    const intakeBits = body.intakeTranscript?.length
      ? `\n\nINTAKE CONVERSATION (founder answered the host's questions — extract concrete facts and conclusions from this):\n${body.intakeTranscript
          .map((message) => `${message.role === 'user' ? 'FOUNDER' : 'HOST'}: ${message.content}`)
          .join('\n')}`
      : '';

    const source = `PRODUCT NAME: ${idea.product_name}
BUSINESS MODEL: ${idea.business_model}
ELEVATOR PITCH: ${idea.elevator_pitch}
DESCRIPTION: ${idea.detailed_description || ''} ${idea.b2b2c_consumer_description || ''} ${idea.b2b2c_business_description || ''}
PRICE MODEL: ${idea.price_model}
TARGET MARKET: ${idea.target_market || ''}
ASSUMED CUSTOMER: ${idea.assumed_customer || ''}
COMPETITORS: ${idea.competitors || ''}${reportBits}${onboardingBits}${intakeBits}`;

    const extracted = sanitizeExtracted(await extractFacts(source), 'seed');
    let knowledge = mergeKnowledge(emptyKnowledge(), { ...extracted, source: 'seed' });
    knowledge.onboarding = onboarding ?? null;

    const indexed = await indexDigest(knowledge);
    knowledge = { ...knowledge, digest: indexed.digest?.trim() || knowledge.digest };
    applySummaries(knowledge, indexed.summaries);

    return { knowledge };
  }

  const base = body.knowledge ?? emptyKnowledge();
  const agent = body.agentId ? AGENTS[body.agentId] : null;

  const exchange = `Conversation excerpt with the ${agent ? agent.title.en : 'advisor'}:
FOUNDER: ${body.userMessage || ''}
ADVISOR: ${body.assistantMessage || ''}`;

  const extracted = sanitizeExtracted(await extractFacts(exchange), 'chat');
  const hasNew = SECTION_KEYS.some((key) => {
    const section = extracted.sections?.[key];
    return (section?.facts?.length ?? 0) > 0 ||
      (section?.gaps?.length ?? 0) > 0 ||
      (section?.memories?.length ?? 0) > 0;
  });

  if (!hasNew) {
    return { knowledge: base, changed: false };
  }

  let knowledge = mergeKnowledge(base, { ...extracted, source: 'chat' });
  const indexed = await indexDigest(knowledge);
  knowledge = { ...knowledge, digest: indexed.digest?.trim() || knowledge.digest };
  applySummaries(knowledge, indexed.summaries);

  return { knowledge, changed: true };
}
