import 'server-only';
import { ServerActionError } from './server/errors';

const TAVILY_URL = 'https://api.tavily.com/search';

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilyResponse {
  /** Tavilyjev sažeti odgovor (ako je tražen include_answer) */
  answer?: string;
  results: TavilyResult[];
  query: string;
}

interface TavilyOptions {
  maxResults?: number;
  depth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  /** 'general' ili 'news' (svježije, vremenski osjetljivo) */
  topic?: 'general' | 'news';
}

/**
 * Server-side web pretraga preko Tavilyja (search API napravljen za AI agente).
 * Vraća čist sadržaj + linkove koje onda LLM uzemljuje u odgovor.
 */
export async function tavilySearch(
  query: string,
  { maxResults = 6, depth = 'basic', includeAnswer = true, topic = 'general' }: TavilyOptions = {}
): Promise<TavilyResponse> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new ServerActionError('Research search is not configured. Missing TAVILY_API_KEY.', 500, 'missing_search_key');

  const res = await fetch(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: depth,
      max_results: maxResults,
      include_answer: includeAnswer,
      topic,
    }),
  });

  if (!res.ok) {
    throw new ServerActionError(
      res.status === 429
        ? 'Research search provider is rate limited right now. Try again in a minute.'
        : 'Research search provider is temporarily unavailable. Try again shortly.',
      res.status === 429 ? 429 : 502,
      res.status === 401 || res.status === 403 ? 'search_provider_auth_failed' : res.status === 429 ? 'search_rate_limited' : 'search_unavailable'
    );
  }

  const data = await res.json();
  return {
    answer: typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : undefined,
    results: Array.isArray(data.results)
      ? data.results.map((r: Record<string, unknown>) => ({
          title: String(r.title ?? ''),
          url: String(r.url ?? ''),
          content: String(r.content ?? ''),
          score: typeof r.score === 'number' ? r.score : undefined,
        }))
      : [],
    query,
  };
}

/** Kompaktni tekstualni blok rezultata za ubacivanje u LLM kontekst. */
export function formatResearchForLLM(r: TavilyResponse): string {
  const lines: string[] = [];
  if (r.answer) lines.push(`QUICK ANSWER: ${r.answer}`, '');
  lines.push('SOURCES:');
  r.results.forEach((res, i) => {
    const snippet = res.content.length > 600 ? res.content.slice(0, 600) + '…' : res.content;
    lines.push(`[${i + 1}] ${res.title}\nURL: ${res.url}\n${snippet}`, '');
  });
  return lines.join('\n').trim();
}
