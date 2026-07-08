import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { SECTION_KEYS } from '@/lib/knowledge';
import type { KBSectionKey, ProjectKnowledge } from '@/lib/types';
import { ServerActionError } from './errors';

export interface KnowledgeTranslateRequest {
  knowledge: ProjectKnowledge;
  targetLanguage: 'hr';
}

export interface KnowledgeTranslateResponse {
  knowledge: ProjectKnowledge;
}

type TranslationPayload = {
  digest?: string;
  sections?: Partial<Record<KBSectionKey, {
    summary?: string;
    facts?: string[];
    gaps?: string[];
    memories?: Array<{ id: string; text: string }>;
  }>>;
};

function compactKnowledge(knowledge: ProjectKnowledge): TranslationPayload {
  const sections: NonNullable<TranslationPayload['sections']> = {};
  for (const key of SECTION_KEYS) {
    const section = knowledge.sections[key];
    sections[key] = {
      summary: section.summary,
      facts: section.facts,
      gaps: section.gaps,
      memories: (section.memories ?? []).map((memory) => ({ id: memory.id, text: memory.text })),
    };
  }
  return { digest: knowledge.digest, sections };
}

function applyTranslation(base: ProjectKnowledge, translated: TranslationPayload): ProjectKnowledge {
  const next: ProjectKnowledge = {
    ...base,
    digest: translated.digest?.trim() || base.digest,
    sections: { ...base.sections },
  };

  for (const key of SECTION_KEYS) {
    const baseSection = base.sections[key];
    const incoming = translated.sections?.[key];
    const memoryTextById = new Map((incoming?.memories ?? []).map((item) => [item.id, item.text?.trim()]));
    next.sections[key] = {
      ...baseSection,
      summary: incoming?.summary?.trim() || baseSection.summary,
      facts: Array.isArray(incoming?.facts) && incoming.facts.length ? incoming.facts.map(String) : baseSection.facts,
      gaps: Array.isArray(incoming?.gaps) && incoming.gaps.length ? incoming.gaps.map(String) : baseSection.gaps,
      memories: (baseSection.memories ?? []).map((memory) => ({
        ...memory,
        text: memoryTextById.get(memory.id) || memory.text,
      })),
    };
  }

  return next;
}

export async function translateKnowledgeForDisplay(body: KnowledgeTranslateRequest): Promise<KnowledgeTranslateResponse> {
  if (!body.knowledge) throw new ServerActionError('Nedostaje baza znanja.', 400, 'missing_knowledge');
  if (body.targetLanguage !== 'hr') throw new ServerActionError('Nepodržan jezik prijevoda.', 400, 'unsupported_language');

  const payload = compactKnowledge(body.knowledge);
  const prompt = `You are a UI translation agent for a business-plan dossier.

Translate the JSON text values from English to Croatian for DISPLAY ONLY.
Keep all JSON keys, section keys, memory ids, array order, numbers, dates, URLs, product names, brands, and technical terms intact.
Do not add new facts. Do not summarize. Do not change memory ids.
Use natural Croatian business language, not literal machine translation.

JSON:
${JSON.stringify(payload)}

Return ONLY valid JSON with the same shape:
{
  "digest": "...",
  "sections": {
    "product": { "summary": "...", "facts": [], "gaps": [], "memories": [{ "id": "...", "text": "..." }] }
  }
}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You translate product/business dossier text for UI display. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.1, maxTokens: 3500, json: true }
  );

  const translated = safeParseJson<TranslationPayload>(raw);
  if (!translated) throw new ServerActionError('Prijevod dosjea nije uspio.', 422, 'knowledge_translation_failed');

  return { knowledge: applyTranslation(body.knowledge, translated) };
}
