import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { formatResearchForLLM, tavilySearch } from '@/lib/tavily';
import type {
  IdeaFormData,
  ResearchAngle,
  ResearchFinding,
  ResearchReport,
  ResearchSource,
} from '@/lib/types';
import { ServerActionError } from './errors';

export interface ResearchRequest {
  query?: string;
  angle?: ResearchAngle;
  idea?: IdeaFormData;
  language: 'hr' | 'en';
}

export interface ResearchResponse {
  report: ResearchReport;
}

function buildQuery(angle: ResearchAngle, idea: IdeaFormData | undefined, raw: string | undefined): string {
  const name = idea?.product_name?.trim();
  const market = idea?.target_market?.trim();
  const pitch = idea?.elevator_pitch?.trim();
  const category = idea?.inferred_category?.trim();
  const businessModel = idea?.business_model?.trim();
  const subject = name || pitch || raw || '';
  const ctx = [subject, category, market].filter(Boolean).join(' ');

  switch (angle) {
    case 'competitors':
      return `${ctx} competitors alternatives similar products`;
    case 'pricing':
      return `${subject} pricing plans cost per month subscription`;
    case 'voice_of_customer':
      return `${subject} reviews complaints reddit "I wish" frustrations`;
    case 'demand':
      return `${subject} market size demand trends how many users`;
    case 'grants':
      return `${ctx} startup grants subsidies government incentives EU funds ${market || 'Croatia'} application eligibility`;
    case 'funding':
      return `${ctx} ${businessModel || ''} startup VC angel investors accelerators funds ${market || 'Europe'} fundraising`;
    case 'local_growth':
      return `${ctx} local business growth expansion customer acquisition repeat customers ${market || 'local market'} case studies`;
    default:
      return raw || ctx;
  }
}

const ANGLE_GUIDE: Record<ResearchAngle, string> = {
  competitors: 'Identify REAL competing/alternative products by name, what each does, rough pricing and positioning. Note gaps the founder could exploit.',
  pricing: 'Find REAL pricing of comparable products (numbers, tiers, currency). What is the typical price range in this category?',
  voice_of_customer: 'Surface what REAL users say about similar products - pain points, complaints, unmet needs, the exact words they use.',
  demand: 'Assess whether real demand exists - market size signals, search/usage trends, growth, communities discussing the problem.',
  grants: 'Find real grants, subsidies, government incentives, EU programs, accelerators, and eligibility signals relevant to this project and market. Mention deadlines only if the source supports them.',
  funding: 'Map realistic funding paths: angel investors, VC funds, accelerators, revenue-first options, and what traction/evidence comparable investors usually expect.',
  local_growth: 'Research practical growth paths for local services or product businesses: expansion areas, lead channels, repeat purchase/referral systems, capacity constraints, and local competition signals.',
  custom: 'Answer the research query factually from the sources.',
};

export async function runMarketResearch(body: ResearchRequest): Promise<ResearchResponse> {
  const angle: ResearchAngle = body.angle ?? 'custom';
  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const query = buildQuery(angle, body.idea, body.query).trim();

  if (!query) {
    throw new ServerActionError('Nedostaje upit za istraživanje.', 400, 'missing_research_query');
  }

  const found = await tavilySearch(query, {
    maxResults: 8,
    depth: 'advanced',
    includeAnswer: true,
    topic: angle === 'demand' || angle === 'grants' || angle === 'funding' ? 'news' : 'general',
  });

  const sources: ResearchSource[] = found.results.slice(0, 6).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content.length > 240 ? r.content.slice(0, 240) + '…' : r.content,
  }));

  if (!found.results.length) {
    const empty: ResearchReport = {
      query,
      angle,
      summary:
        body.language === 'en'
          ? 'No solid web results found for this query. Try rephrasing or a more specific angle.'
          : 'Nema čvrstih web rezultata za ovaj upit. Probaj preformulirati ili uži kut.',
      findings: [],
      sources: [],
      created_at: new Date().toISOString(),
    };
    return { report: empty };
  }

  const prompt = `You are a sharp market researcher. ${ANGLE_GUIDE[angle]}

Based STRICTLY on the web results below (do NOT invent facts not supported by them), write a tight, useful brief for a startup founder.

WEB RESULTS:
${formatResearchForLLM(found)}

Return ONLY this JSON, written in ${langName}:
{
  "summary": "2-4 sentence synthesis answering the research goal, grounded in the sources",
  "findings": [
    { "point": "concise concrete finding (with real names/numbers where available)", "detail": "optional 1 sentence of nuance or the source angle" }
  ]
}
Give 3-6 findings. Be specific and factual. If the sources are thin or off-topic, say so honestly in the summary rather than padding.`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You are a factual market researcher. Return valid JSON only. Never invent data beyond the provided sources.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.3, maxTokens: 1100, json: true }
  );

  const parsed = safeParseJson<{ summary?: string; findings?: ResearchFinding[] }>(raw);

  const report: ResearchReport = {
    query,
    angle,
    summary: parsed?.summary?.trim() || found.answer || '',
    findings: Array.isArray(parsed?.findings)
      ? parsed!.findings
          .filter((f) => f && typeof f.point === 'string' && f.point.trim())
          .map((f) => ({ point: f.point.trim(), detail: f.detail?.trim() || undefined }))
          .slice(0, 8)
      : [],
    sources,
    created_at: new Date().toISOString(),
  };

  return { report };
}
