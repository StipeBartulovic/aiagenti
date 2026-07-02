import { AGENTS } from '@/lib/agents';
import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import { formatResearchForLLM, tavilySearch } from '@/lib/tavily';
import type { AgentId, ResearchSource } from '@/lib/types';
import { ServerActionError } from './errors';

export type AdvisorToolName = 'web_search' | 'github_repo_search';

export interface AdvisorToolCall {
  tool: AdvisorToolName;
  query: string;
  reason?: string;
}

export interface AdvisorToolResult {
  tool: AdvisorToolName;
  label: string;
  query: string;
  summary: string;
  sources: ResearchSource[];
  modelContext: string;
}

const TOOL_LABELS: Record<AdvisorToolName, string> = {
  web_search: 'Live web search',
  github_repo_search: 'GitHub repository search',
};

const TOOL_DESCRIPTIONS: Record<AdvisorToolName, string> = {
  web_search:
    'Searches the live web for competitors, pricing, regulations, funding, SEO demand, Reddit/review language, Product Hunt, Crunchbase mentions, and current market facts.',
  github_repo_search:
    'Searches GitHub repositories to find open-source projects, starter kits, libraries, and build-vs-buy shortcuts for the CTO.',
};

function toolsForAgent(agentId: AgentId): AdvisorToolName[] {
  if (agentId === 'tech') return ['github_repo_search', 'web_search'];
  return ['web_search'];
}

export function shouldConsiderAdvisorTools(agentId: AgentId, userMessage: string, deepMode: boolean): boolean {
  const text = userMessage.toLowerCase();
  if (deepMode) return true;
  if (agentId === 'tech' && /github|open.source|repo|library|framework|starter|boilerplate|fork|kod|code|stack/.test(text)) return true;
  return /istraž|istraz|pretraž|pretraz|gugl|google|web|internet|izvor|source|research|nađ|nadji|nađi|find|lookup|provjeri|check|konkur|competitor|cijen|pricing|keyword|seo|reddit|review|recenz|demand|potraž|potraz|žig|zig|trademark|domain|domena|regulat|zakon|funding|vc|product hunt|crunchbase/.test(text);
}

export async function planAdvisorToolCalls(args: {
  agentId: AgentId;
  language: 'hr' | 'en';
  userMessage: string;
  context: string;
}): Promise<AdvisorToolCall[]> {
  const allowed = toolsForAgent(args.agentId);
  const agent = AGENTS[args.agentId];
  const availableTools = allowed
    .map((tool) => `- ${tool}: ${TOOL_DESCRIPTIONS[tool]}`)
    .join('\n');

  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: `You decide whether an advisor needs external tools before answering.
Return valid JSON only. Never answer the founder here.

Schema:
{
  "calls": [
    { "tool": "web_search" | "github_repo_search", "query": "precise query", "reason": "short reason" }
  ]
}

Rules:
- Use tools only when current external facts would materially improve the answer.
- If the founder asks for opinion, strategy, prioritization, or explanation that does not need live facts, return {"calls":[]}.
- Pick at most 2 tool calls.
- Only use allowed tools.
- Queries should be concise and searchable.
- For trademark/domain/legal availability, use web_search and phrase the query as a preliminary lookup, not a final legal conclusion.
- For CTO build-vs-buy/open-source checks, prefer github_repo_search.

Advisor: ${agent.name} (${agent.title.en})
Allowed tools:
${availableTools}`,
    },
    {
      role: 'user',
      content: `Founder message:
${args.userMessage}

Project context:
${args.context.slice(0, 1800)}

Language: ${args.language}`,
    },
  ];

  const raw = await callDeepSeek(messages, { temperature: 0.1, maxTokens: 500, json: true });
  const parsed = safeParseJson<{ calls?: Array<{ tool?: string; query?: string; reason?: string }> }>(raw);
  if (!parsed?.calls?.length) return [];

  return parsed.calls
    .filter((call): call is { tool: AdvisorToolName; query: string; reason?: string } =>
      Boolean(call.tool && allowed.includes(call.tool as AdvisorToolName) && call.query?.trim())
    )
    .slice(0, 2)
    .map((call) => ({
      tool: call.tool,
      query: call.query.trim().slice(0, 300),
      reason: call.reason?.trim().slice(0, 180),
    }));
}

async function runWebSearch(call: AdvisorToolCall): Promise<AdvisorToolResult> {
  const found = await tavilySearch(call.query, { maxResults: 6, depth: 'basic' });
  const sources = found.results.slice(0, 5).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content.length > 220 ? r.content.slice(0, 220) + '...' : r.content,
  }));

  return {
    tool: 'web_search',
    label: TOOL_LABELS.web_search,
    query: call.query,
    summary: found.answer || (sources.length ? 'Live web results found.' : 'No useful web results found.'),
    sources,
    modelContext: `Tool: web_search
Query: ${call.query}
Reason: ${call.reason || 'External market facts'}

${formatResearchForLLM(found)}`,
  };
}

async function runGithubRepoSearch(call: AdvisorToolCall): Promise<AdvisorToolResult> {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', call.query);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', '5');

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'AI-Validator',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new ServerActionError(
      res.status === 403
        ? 'GitHub repository search is rate limited. Try again later or add GITHUB_TOKEN.'
        : 'GitHub repository search failed.',
      res.status === 403 ? 429 : 502,
      res.status === 403 ? 'github_rate_limited' : 'github_search_failed'
    );
  }

  const data = await res.json() as {
    items?: Array<{
      full_name: string;
      html_url: string;
      description?: string | null;
      stargazers_count?: number;
      language?: string | null;
      updated_at?: string;
    }>;
  };
  const repos = data.items ?? [];
  const sources = repos.map((repo) => ({
    title: `${repo.full_name}${typeof repo.stargazers_count === 'number' ? ` (${repo.stargazers_count.toLocaleString('en-US')} stars)` : ''}`,
    url: repo.html_url,
    snippet: [
      repo.description || 'No description.',
      repo.language ? `Language: ${repo.language}.` : '',
      repo.updated_at ? `Updated: ${repo.updated_at.slice(0, 10)}.` : '',
    ].filter(Boolean).join(' '),
  }));

  return {
    tool: 'github_repo_search',
    label: TOOL_LABELS.github_repo_search,
    query: call.query,
    summary: sources.length ? `Found ${sources.length} relevant GitHub repositories.` : 'No relevant GitHub repositories found.',
    sources,
    modelContext: `Tool: github_repo_search
Query: ${call.query}
Reason: ${call.reason || 'Build-vs-buy/open-source check'}

Results:
${sources.map((source, index) => `[${index + 1}] ${source.title}
URL: ${source.url}
${source.snippet || ''}`).join('\n\n') || 'No results.'}`,
  };
}

export async function executeAdvisorTool(call: AdvisorToolCall): Promise<AdvisorToolResult> {
  if (call.tool === 'web_search') return runWebSearch(call);
  if (call.tool === 'github_repo_search') return runGithubRepoSearch(call);
  throw new ServerActionError('Unknown advisor tool.', 400, 'unknown_advisor_tool');
}

export function formatToolResultsForPrompt(results: AdvisorToolResult[]): string {
  return results.map((result, index) => `TOOL RESULT ${index + 1}: ${result.label}
Query: ${result.query}
Summary: ${result.summary}

${result.modelContext}`).join('\n\n---\n\n');
}
