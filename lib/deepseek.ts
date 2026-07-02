import 'server-only';
import { ServerActionError } from './server/errors';

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  /** true = forsiraj JSON izlaz (response_format json_object) */
  json?: boolean;
}

/**
 * Server-side poziv DeepSeek chat API-ja.
 * Podržava i slobodni tekst (chat agenti) i strogi JSON (ekstraktor/indekser).
 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
  { temperature = 0.7, maxTokens = 1500, json = false }: CallOptions = {}
): Promise<string> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('AI engine is not configured. Missing DEEPSEEK_API_KEY.', 500, 'missing_api_key');
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    throw new ServerActionError(
      res.status === 429
        ? 'AI provider is rate limited right now. Try again in a minute.'
        : 'External AI service is temporarily unavailable. Try again shortly.',
      res.status === 429 ? 429 : 502,
      res.status === 401 || res.status === 403 ? 'ai_provider_auth_failed' : res.status === 429 ? 'ai_rate_limited' : 'external_ai_unavailable'
    );
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

/** Sigurno parsiranje JSON-a iz LLM izlaza (skida ``` ograde ako ih ima). */
export function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
