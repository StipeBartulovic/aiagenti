import { AGENTS } from '@/lib/agents';
import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import type { AgentId, ChatMessage, ProjectTask } from '@/lib/types';
import { ServerActionError } from './errors';

export interface TaskRequest {
  transcript: ChatMessage[];
  userRequest: string;
  language: 'hr' | 'en';
  existingTasks?: ProjectTask[];
}

export interface TaskResponse {
  task: ProjectTask;
}

const asStr = (v: unknown, max = 600): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const asPriority = (v: unknown): ProjectTask['priority'] =>
  v === 'low' || v === 'medium' || v === 'high' ? v : 'medium';
const asAgent = (v: unknown): AgentId | undefined =>
  typeof v === 'string' && v in AGENTS ? (v as AgentId) : undefined;

function makeId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTaskFromConversation(body: TaskRequest): Promise<TaskResponse> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }

  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const now = new Date();
  const transcript = (body.transcript ?? []).slice(-14).map((m) => {
    const who = m.role === 'assistant' && m.agentId ? AGENTS[m.agentId]?.name ?? 'Advisor' : m.role === 'user' ? 'Founder' : 'System';
    return `${who}: ${m.content}`;
  }).join('\n\n');

  const existing = (body.existingTasks ?? [])
    .filter((t) => t.status === 'open')
    .slice(-12)
    .map((t) => `- ${t.title}: ${t.details}`)
    .join('\n');

  const prompt = `You convert an advisor conversation into ONE concrete task for the founder.

CURRENT DATE/TIME: ${now.toISOString()}
LANGUAGE: Write the task in ${langName}.

FOUNDER REQUEST THAT TRIGGERED TASK CREATION:
"${body.userRequest}"

RECENT CONVERSATION:
${transcript || '(none)'}

OPEN TASKS ALREADY IN THE MANAGER:
${existing || '(none)'}

Create a task that captures the concrete thing the founder agreed should be done. If the request says "put that in task manager", infer "that" from the recent conversation. Do not duplicate an existing open task; if it overlaps, make it more specific or write the next step.

Return ONLY this JSON:
{
  "title": "short imperative task title, max 80 chars",
  "details": "clear implementation/next-step detail with acceptance criteria, 2-5 sentences",
  "owner_agent": "business|tech|marketing|legal|sales|distribution or empty",
  "priority": "low|medium|high",
  "due_at": "ISO timestamp if a date/time is explicitly implied, otherwise null",
  "source_summary": "one sentence explaining what conversation point this came from"
}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You extract actionable project tasks. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.25, maxTokens: 900, json: true }
  );

  const parsed = safeParseJson<{
    title?: string;
    details?: string;
    owner_agent?: string;
    priority?: string;
    due_at?: string | null;
    source_summary?: string;
  }>(raw);

  if (!parsed?.title || !parsed.details) {
    throw new ServerActionError('Neuspjelo generiranje taska.', 422, 'task_generation_failed');
  }

  const ts = now.toISOString();
  const task: ProjectTask = {
    id: makeId(),
    title: asStr(parsed.title, 80),
    details: asStr(parsed.details, 900),
    owner_agent: asAgent(parsed.owner_agent),
    source_summary: asStr(parsed.source_summary, 240),
    status: 'open',
    priority: asPriority(parsed.priority),
    due_at: typeof parsed.due_at === 'string' && parsed.due_at.trim() ? parsed.due_at : null,
    created_at: ts,
    updated_at: ts,
  };

  return { task };
}
