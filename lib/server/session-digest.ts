import { AGENTS } from '@/lib/agents';
import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import type { AgentId, ChatMessage, ProjectTask, SessionDigest } from '@/lib/types';
import { ServerActionError } from './errors';

export interface SessionDigestRequest {
  transcript: ChatMessage[];
  language: 'hr' | 'en';
  existingTasks?: ProjectTask[];
}

const asStr = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const asPriority = (v: unknown): ProjectTask['priority'] =>
  v === 'low' || v === 'medium' || v === 'high' ? v : 'medium';
const asAgent = (v: unknown): AgentId | undefined =>
  typeof v === 'string' && v in AGENTS ? (v as AgentId) : undefined;
const asStrArray = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, maxLen)).slice(0, maxItems)
    : [];

function makeId(): string {
  return `digest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function buildSessionDigest(body: SessionDigestRequest): Promise<{ digest: SessionDigest }> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }

  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const transcriptMsgs = (body.transcript ?? []).slice(-60);
  const transcript = transcriptMsgs
    .map((m) => {
      const who = m.role === 'assistant' && m.agentId ? AGENTS[m.agentId]?.name ?? 'Advisor' : m.role === 'user' ? 'Founder' : 'System';
      return `${who}: ${m.content}`;
    })
    .join('\n\n');

  if (!transcript.trim()) {
    throw new ServerActionError('Nema novih poruka za zapisnik.', 400, 'nothing_to_digest');
  }

  const existing = (body.existingTasks ?? [])
    .filter((t) => t.status === 'open')
    .slice(-12)
    .map((t) => `- ${t.title}`)
    .join('\n');

  const prompt = `You are turning a founder's conversation with their AI advisory board into concise "session minutes" — a structured record that will be pinned in the app so the founder never loses good advice inside a long chat.

LANGUAGE: Write everything in ${langName}.

CONVERSATION SINCE THE LAST SESSION SUMMARY:
${transcript}

OPEN TASKS ALREADY IN THE MANAGER (do not duplicate these as new actions):
${existing || '(none)'}

Return ONLY this JSON:
{
  "summary": "2-3 sentences: what this stretch of conversation was actually about and where it landed",
  "decisions": ["a concrete decision or conclusion that was reached", "..."],
  "open_questions": ["a real unresolved question the founder still needs to answer", "..."],
  "actions": [
    {
      "title": "short imperative task title, max 80 chars",
      "details": "clear next-step detail with acceptance criteria, 1-3 sentences",
      "owner_agent": "business|tech|marketing|legal|sales|distribution or empty",
      "priority": "low|medium|high"
    }
  ]
}

Rules:
- decisions: max 6, only things that were actually decided/concluded, not generic advice
- open_questions: max 6, only genuinely unresolved items
- actions: max 6, only concrete next steps the founder agreed to or clearly should do next; skip if nothing actionable came up
- If the conversation was pure small talk with nothing substantive, return short/empty arrays and say so plainly in the summary
- Do not invent content that wasn't discussed`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You extract structured meeting minutes from advisor conversations. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 1400, json: true }
  );

  const parsed = safeParseJson<{
    summary?: string;
    decisions?: unknown;
    open_questions?: unknown;
    actions?: unknown;
  }>(raw);

  if (!parsed?.summary) {
    throw new ServerActionError('Neuspjelo generiranje zapisnika.', 422, 'digest_generation_failed');
  }

  const actionsRaw = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 6) : [];
  const actions = actionsRaw
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => ({
      title: asStr(a.title, 80),
      details: asStr(a.details, 500),
      owner_agent: asAgent(a.owner_agent),
      priority: asPriority(a.priority),
    }))
    .filter((a) => a.title && a.details);

  const digest: SessionDigest = {
    id: makeId(),
    created_at: new Date().toISOString(),
    summary: asStr(parsed.summary, 500),
    decisions: asStrArray(parsed.decisions, 6, 300),
    open_questions: asStrArray(parsed.open_questions, 6, 300),
    actions,
    message_count: transcriptMsgs.length,
  };

  return { digest };
}
