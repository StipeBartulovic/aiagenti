'use client';

import { getTauriInvoke } from './tauri';
import { desktopTokenShortfallMessage } from './token-messages';

type ApiEndpoint =
  | 'angles'
  | 'audiences'
  | 'chat'
  | 'conversion'
  | 'conjoint'
  | 'discovery'
  | 'idea-brief'
  | 'intake'
  | 'interview'
  | 'kb-translate'
  | 'kb-update'
  | 'market'
  | 'obsidian-build'
  | 'pricing'
  | 'research'
  | 'strategy'
  | 'tasks'
  | 'translate'
  | 'triage'
  | 'validate';

type AiCommand =
  | 'ai_angles'
  | 'ai_audiences'
  | 'ai_chat'
  | 'ai_conversion'
  | 'ai_conjoint'
  | 'ai_discovery'
  | 'ai_idea_brief'
  | 'ai_intake'
  | 'ai_interview'
  | 'ai_kb_translate'
  | 'ai_kb_update'
  | 'ai_market'
  | 'ai_obsidian_build'
  | 'ai_pricing'
  | 'ai_research'
  | 'ai_strategy'
  | 'ai_tasks'
  | 'ai_translate'
  | 'ai_triage'
  | 'ai_validate';

const endpointCommands: Record<ApiEndpoint, AiCommand> = {
  angles: 'ai_angles',
  audiences: 'ai_audiences',
  chat: 'ai_chat',
  conversion: 'ai_conversion',
  conjoint: 'ai_conjoint',
  discovery: 'ai_discovery',
  'idea-brief': 'ai_idea_brief',
  intake: 'ai_intake',
  interview: 'ai_interview',
  'kb-translate': 'ai_kb_translate',
  'kb-update': 'ai_kb_update',
  market: 'ai_market',
  'obsidian-build': 'ai_obsidian_build',
  pricing: 'ai_pricing',
  research: 'ai_research',
  strategy: 'ai_strategy',
  tasks: 'ai_tasks',
  translate: 'ai_translate',
  triage: 'ai_triage',
  validate: 'ai_validate',
};

export class AiClientError extends Error {
  constructor(message: string, public status?: number, public data?: unknown, public code?: string) {
    super(message);
    this.name = 'AiClientError';
  }
}

function publicClientMessage(code: string | undefined, message: string, fallbackError: string): string {
  if (code === 'missing_api_key') {
    return 'AI engine is not configured yet. Add DEEPSEEK_API_KEY in production environment variables and redeploy.';
  }
  if (code === 'missing_search_key') {
    return 'Research search is not configured yet. Add TAVILY_API_KEY in production environment variables and redeploy.';
  }
  if (code === 'ai_provider_auth_failed') {
    return 'AI provider rejected the API key. Check the production DEEPSEEK_API_KEY value.';
  }
  if (code === 'ai_rate_limited') {
    return 'AI provider is rate limited right now. Try again in a minute.';
  }
  if (code === 'external_ai_unavailable' || code === 'external_connection_failed') {
    return 'AI service is temporarily unavailable. Try again shortly.';
  }
  if (code === 'insufficient_desktop_tokens') {
    return desktopTokenShortfallMessage('en');
  }
  return message || fallbackError;
}

function normalizeError(error: unknown, fallbackError: string): AiClientError {
  if (error instanceof AiClientError) return error;
  if (error instanceof Error) return new AiClientError(error.message || fallbackError);
  if (typeof error === 'string') return new AiClientError(error || fallbackError);
  return new AiClientError(fallbackError, undefined, error);
}

async function callAi<TResponse = unknown, TPayload = unknown>(
  endpoint: ApiEndpoint,
  payload: TPayload,
  fallbackError: string
): Promise<TResponse> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke<TResponse>(endpointCommands[endpoint], { payload });
    } catch (error) {
      throw normalizeError(error, fallbackError);
    }
  }

  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null) as { error?: unknown; code?: unknown } | null;
    if (!res.ok) {
      const message = typeof data?.error === 'string' ? data.error : fallbackError;
      const code = typeof data?.code === 'string' ? data.code : undefined;
      throw new AiClientError(publicClientMessage(code, message, fallbackError), res.status, data, code);
    }
    return data as TResponse;
  } catch (error) {
    throw normalizeError(error, fallbackError);
  }
}

export const aiClient = {
  validateIdea: <TResponse = unknown>(payload: unknown, fallbackError = 'Validation failed') =>
    callAi<TResponse>('validate', payload, fallbackError),

  suggestAudiences: <TResponse = unknown>(payload: unknown, fallbackError = 'Audience suggestion failed') =>
    callAi<TResponse>('audiences', payload, fallbackError),

  createIdeaBrief: <TResponse = unknown>(payload: unknown, fallbackError = 'Idea brief failed') =>
    callAi<TResponse>('idea-brief', payload, fallbackError),

  intake: <TResponse = unknown>(payload: unknown, fallbackError = 'Intake failed') =>
    callAi<TResponse>('intake', payload, fallbackError),

  advisorChat: <TResponse = unknown>(payload: unknown, fallbackError = 'Advisor chat failed') =>
    callAi<TResponse>('chat', payload, fallbackError),

  triageAdvisors: <TResponse = unknown>(payload: unknown, fallbackError = 'Advisor triage failed') =>
    callAi<TResponse>('triage', payload, fallbackError),

  updateKnowledge: <TResponse = unknown>(payload: unknown, fallbackError = 'Knowledge update failed') =>
    callAi<TResponse>('kb-update', payload, fallbackError),

  translateKnowledge: <TResponse = unknown>(payload: unknown, fallbackError = 'Knowledge translation failed') =>
    callAi<TResponse>('kb-translate', payload, fallbackError),

  discoveryNext: <TResponse = unknown>(payload: unknown, fallbackError = 'Discovery question failed') =>
    callAi<TResponse>('discovery', payload, fallbackError),

  marketIntelligence: <TResponse = unknown>(payload: unknown, fallbackError = 'Market research failed') =>
    callAi<TResponse>('market', payload, fallbackError),

  createTask: <TResponse = unknown>(payload: unknown, fallbackError = 'Task creation failed') =>
    callAi<TResponse>('tasks', payload, fallbackError),

  runPricing: <TResponse = unknown>(payload: unknown, fallbackError = 'Pricing analysis failed') =>
    callAi<TResponse>('pricing', payload, fallbackError),

  buildInterview: <TResponse = unknown>(payload: unknown, fallbackError = 'Interview kit failed') =>
    callAi<TResponse>('interview', payload, fallbackError),

  buildStrategy: <TResponse = unknown>(payload: unknown, fallbackError = 'Strategy failed') =>
    callAi<TResponse>('strategy', payload, fallbackError),

  runResearch: <TResponse = unknown>(payload: unknown, fallbackError = 'Research failed') =>
    callAi<TResponse>('research', payload, fallbackError),

  buildConversion: <TResponse = unknown>(payload: unknown, fallbackError = 'Conversion plan failed') =>
    callAi<TResponse>('conversion', payload, fallbackError),

  buildAngles: <TResponse = unknown>(payload: unknown, fallbackError = 'Marketing angles failed') =>
    callAi<TResponse>('angles', payload, fallbackError),

  runConjoint: <TResponse = unknown>(payload: unknown, fallbackError = 'Conjoint analysis failed') =>
    callAi<TResponse>('conjoint', payload, fallbackError),

  translateReport: <TResponse = unknown>(payload: unknown, fallbackError = 'Translation failed') =>
    callAi<TResponse>('translate', payload, fallbackError),

  buildObsidianVault: <TResponse = unknown>(payload: unknown, fallbackError = 'Obsidian export failed') =>
    callAi<TResponse>('obsidian-build', payload, fallbackError),
};
