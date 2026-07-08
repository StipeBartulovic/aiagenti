import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { formatResearchForLLM, tavilySearch, type TavilyResponse } from '@/lib/tavily';
import type {
  CompetitorProfile,
  IdeaFormData,
  MarketHumanTask,
  MarketIntelligence,
  MarketScope,
  MarketSignal,
  ResearchSource,
} from '@/lib/types';
import { ServerActionError } from './errors';

/**
 * Istraživanje tržišta (konkurentska inteligencija) u dva koraka:
 * 1. 'scope' — procjena geografskog dosega (lokalno/nacionalno/internacionalno),
 *    KRITIČNO: ugradnja prozora oko Zagreba ne smije dobiti konkurente s Novog Zelanda.
 * 2. 'run' — plan upita na jeziku regije → Tavily (konkurenti/zamjene/pritužbe/signali)
 *    → LLM sinteza u strukturirani MarketIntelligence. Imena i brojke strogo iz izvora.
 */

export type MarketRequest =
  | { action: 'scope'; idea: IdeaFormData; language: 'hr' | 'en' }
  | { action: 'run'; idea: IdeaFormData; language: 'hr' | 'en'; scope: MarketScope };

export type MarketResponse =
  | { scope: MarketScope }
  | { market: MarketIntelligence };

function ideaBlock(idea: IdeaFormData): string {
  return [
    `PRODUCT: "${idea.product_name}" (${idea.business_model})`,
    `PITCH: ${idea.elevator_pitch}`,
    idea.detailed_description ? `DESCRIPTION: ${idea.detailed_description}` : '',
    idea.price_model ? `PRICE MODEL: ${idea.price_model}` : '',
    idea.target_market ? `TARGET MARKET (founder's words): ${idea.target_market}` : '',
    idea.competitors ? `COMPETITORS THE FOUNDER ALREADY KNOWS: ${idea.competitors}` : '',
  ].filter(Boolean).join('\n');
}

async function detectMarketScope(idea: IdeaFormData, language: 'hr' | 'en'): Promise<MarketScope> {
  // Code-first: eksplicitno nacrtana geo područja = lokalni biznis, bez LLM-a.
  const geoAreas = idea.geo_areas?.length ? idea.geo_areas : idea.geo_area ? [idea.geo_area] : [];
  if (geoAreas.length > 0) {
    const region = geoAreas.map((area) => area.label).filter(Boolean).join(', ');
    return {
      scope: 'local',
      region: region || (language === 'en' ? 'selected area' : 'odabrano područje'),
      rationale:
        language === 'en'
          ? 'The founder drew explicit service areas on the map — research stays inside them.'
          : 'Founder je nacrtao konkretna područja djelovanja na karti — istraživanje ostaje unutar njih.',
    };
  }

  const langName = language === 'en' ? 'English' : 'Croatian';
  const prompt = `Classify the geographic scope of this business. This decides WHERE we research competitors — a window-installation service around Zagreb must NOT be compared to New Zealand companies, while a SaaS app usually competes globally.

${ideaBlock(idea)}

Rules:
- 'local': physical service/product tied to a city or region (installation, delivery, gym, local food...).
- 'national': operates country-wide but is language/regulation-bound (local-language content, legal services, country-specific marketplace).
- 'international': digital product usable anywhere; competes with global players.

Return ONLY this JSON (region and rationale in ${langName}):
{ "scope": "local|national|international", "region": "specific region/country, or 'globalno'/'global' for international", "rationale": "one sentence why" }`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You classify business scope. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 220, json: true }
  );

  const parsed = safeParseJson<Partial<MarketScope>>(raw);
  const scope: MarketScope['scope'] =
    parsed?.scope === 'local' || parsed?.scope === 'national' || parsed?.scope === 'international'
      ? parsed.scope
      : 'international';
  return {
    scope,
    region: parsed?.region?.trim() || (language === 'en' ? 'global' : 'globalno'),
    rationale: parsed?.rationale?.trim() || '',
  };
}

interface PlannedQuery {
  purpose: 'competitors' | 'alternatives' | 'complaints' | 'signals';
  query: string;
}

async function planQueries(idea: IdeaFormData, scope: MarketScope): Promise<PlannedQuery[]> {
  const prompt = `You plan web-search queries for competitive intelligence about this business.

${ideaBlock(idea)}

GEOGRAPHIC SCOPE: ${scope.scope} — ${scope.region}
${scope.scope !== 'international'
    ? `IMPORTANT: this is a ${scope.scope} business. Write the queries in the local language of "${scope.region}" and include the region/city in them, so results come from the right area — NOT from other countries.`
    : 'This is an international product: write the queries in English for the global market.'}

Write exactly 4 search queries:
1. purpose "competitors": find DIRECT competitors (same customer, same product/service) in scope.
2. purpose "alternatives": find INDIRECT competitors and SUBSTITUTES (other ways customers solve this today).
3. purpose "complaints": find what customers of such products/services complain about (reviews, forums, Reddit) — the market gap.
4. purpose "signals": recent news in this category/region (new entrants, funding, price moves, regulation).

Return ONLY this JSON:
{ "queries": [ { "purpose": "competitors", "query": "..." }, { "purpose": "alternatives", "query": "..." }, { "purpose": "complaints", "query": "..." }, { "purpose": "signals", "query": "..." } ] }`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You are a search-query planner. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.3, maxTokens: 400, json: true }
  );

  const parsed = safeParseJson<{ queries?: PlannedQuery[] }>(raw);
  const valid = (parsed?.queries ?? []).filter(
    (q): q is PlannedQuery =>
      Boolean(q?.query?.trim()) &&
      ['competitors', 'alternatives', 'complaints', 'signals'].includes(q?.purpose)
  );
  if (valid.length >= 2) return valid.slice(0, 4);

  // deterministički fallback ako planer padne
  const base = `${idea.product_name} ${idea.elevator_pitch}`.slice(0, 120);
  const regionSuffix = scope.scope !== 'international' ? ` ${scope.region}` : '';
  return [
    { purpose: 'competitors', query: `${base} competitors${regionSuffix}` },
    { purpose: 'alternatives', query: `${base} alternatives substitutes${regionSuffix}` },
    { purpose: 'complaints', query: `${base} reviews complaints problems` },
    { purpose: 'signals', query: `${base} news funding launch${regionSuffix}` },
  ];
}

const COMPETITOR_TIERS = ['direct', 'indirect', 'substitute'] as const;
const SIGNAL_HORIZONS = ['tactical', 'strategic', 'directional'] as const;

export async function runMarketIntelligence(
  idea: IdeaFormData,
  language: 'hr' | 'en',
  scope: MarketScope
): Promise<MarketIntelligence> {
  const queries = await planQueries(idea, scope);

  const searches = await Promise.all(
    queries.map(async (planned) => {
      try {
        const found = await tavilySearch(planned.query, {
          maxResults: planned.purpose === 'signals' ? 5 : 6,
          depth: 'advanced',
          includeAnswer: true,
          topic: planned.purpose === 'signals' ? 'news' : 'general',
        });
        return { planned, found };
      } catch {
        // jedan pali upit ne ruši cijelo istraživanje
        return { planned, found: null as TavilyResponse | null };
      }
    })
  );

  const usable = searches.filter((s): s is { planned: PlannedQuery; found: TavilyResponse } => Boolean(s.found?.results.length));
  if (!usable.length) {
    throw new ServerActionError(
      language === 'en'
        ? 'Web search returned no usable results for this market. Try adjusting the region or try again later.'
        : 'Web pretraga nije vratila upotrebljive rezultate za ovo tržište. Prilagodi regiju ili pokušaj kasnije.',
      502,
      'market_no_results'
    );
  }

  const seenUrls = new Set<string>();
  const sources: ResearchSource[] = [];
  for (const { found } of usable) {
    for (const result of found.results) {
      if (!result.url || seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      sources.push({
        title: result.title,
        url: result.url,
        snippet: result.content.length > 200 ? result.content.slice(0, 200) + '…' : result.content,
      });
    }
  }

  const resultBlocks = usable
    .map(({ planned, found }) => `=== ${planned.purpose.toUpperCase()} (query: "${planned.query}") ===\n${formatResearchForLLM(found)}`)
    .join('\n\n');

  const langName = language === 'en' ? 'English' : 'Croatian';
  const prompt = `You are a competitive-intelligence analyst. Build a structured market brief for this founder, based STRICTLY on the web results below. Never invent companies, prices, or facts not supported by the sources — if the sources are thin, say so in market_summary instead of padding.

${ideaBlock(idea)}

GEOGRAPHIC SCOPE: ${scope.scope} — ${scope.region}
GEO FILTER (critical): only include competitors and signals relevant to this scope. If a source describes a company that clearly operates elsewhere and could not serve/compete in "${scope.region}", DISCARD it${scope.scope === 'international' ? ' (international scope: global players are relevant)' : ''}.

WEB RESULTS:
${resultBlocks}

Competitor tiers: "direct" = same customer + same product/service; "indirect" = same problem, different approach; "substitute" = removes the need for the product entirely (manual workaround, doing nothing, an adjacent habit).
Signal horizons: "tactical" = current moves (prices, features, promotions); "strategic" = positioning/tech/coverage; "directional" = early warnings of future moves (hiring, funding, M&A, patents, regulation).
human_tasks = things a bot CANNOT do and the founder must do personally, made specific to THIS business: mystery-shopping opaque pricing (ask about setup fees, cancellation penalties, SLA), win/loss interviews, walking through a competitor's actual signup/checkout/support, industry events. 3-4 tasks, each concrete.
battlecard (ONLY for tier "direct", omit entirely for indirect/substitute) = a sales battlecard: how a buyer actually phrases the objection ("Why not just use X?"), the salesperson's punchy response, and the proof/reason-to-believe behind it — grounded in overlap/differences/our_edge, ready to say out loud today.

Return ONLY this JSON (all text in ${langName}):
{
  "market_summary": "2-4 sentences: state of this market within the scope, grounded in sources",
  "competitors": [
    { "name": "real name from sources", "tier": "direct|indirect|substitute", "url": "source or company url if available", "summary": "what they do, 1-2 sentences", "overlap": "similarities with the founder's product", "differences": "key differences", "weaknesses": ["customer complaint or weakness from sources"], "our_edge": "one concrete way the founder can be better", "pricing": "ONLY the actual price of the product/service itself (subscription fee, per-unit price, one-time cost) — e.g. '9.99€/month' or '6-8€ per meal'. NEVER put unrelated monetary figures here (free-shipping thresholds, discount amounts, order minimums). Omit the field entirely if the real price is not stated.", "region": "where they operate or omit", "battlecard": { "objection": "buyer's own words, max 90 chars", "response": "max 120 chars", "proof": "max 100 chars" } }
  ],
  "gaps": ["market gap / unmet need visible in complaints or missing offers"],
  "signals": [ { "horizon": "tactical|strategic|directional", "signal": "what is happening", "implication": "what it means for the founder", "source_url": "url or omit" } ],
  "human_tasks": [ { "title": "short imperative", "why": "what decision it unlocks", "how": "concrete steps incl. what to ask" } ]
}
Give 3-6 competitors across tiers (at least attempt each tier), 3-5 gaps, 3-5 signals. BE TERSE: every field one short sentence, max 2 weaknesses per competitor — the whole JSON must stay compact. Be specific: names, numbers, quotes where the sources have them.`;

  type SynthesisResult = {
    market_summary?: string;
    competitors?: Partial<CompetitorProfile>[];
    gaps?: string[];
    signals?: Partial<MarketSignal>[];
    human_tasks?: Partial<MarketHumanTask>[];
  };

  // veliki JSON zna biti odrezan max_tokens limitom → parse padne; jedan retry s još kraćim zahtjevom
  let parsed: SynthesisResult | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: 'You are a factual competitive-intelligence analyst. Return valid JSON only. Never invent data beyond the provided sources.' },
        {
          role: 'user',
          content: attempt === 0
            ? prompt
            : `${prompt}\n\nIMPORTANT: your previous answer was cut off. Keep it SHORTER this time: max 4 competitors, max 3 gaps, max 3 signals, max 3 human_tasks, every text field under 120 characters.`,
        },
      ],
      { temperature: 0.35, maxTokens: 5200, json: true }
    );
    parsed = safeParseJson<SynthesisResult>(raw);
    if (!parsed) console.warn(`Market synthesis parse failed (attempt ${attempt + 1}), raw length ${raw.length}`);
  }

  if (!parsed) {
    throw new ServerActionError(
      language === 'en'
        ? 'The analysis output could not be assembled. Try running the research again.'
        : 'Analiza se nije uspjela složiti. Pokreni istraživanje ponovno.',
      502,
      'market_synthesis_failed'
    );
  }

  const competitors: CompetitorProfile[] = (parsed?.competitors ?? [])
    .filter((c) => c?.name?.trim() && c?.summary?.trim())
    .map((c) => {
      const tier = COMPETITOR_TIERS.includes(c.tier as never) ? (c.tier as CompetitorProfile['tier']) : 'direct';
      const rawBattlecard = c.battlecard;
      const battlecard =
        tier === 'direct' && rawBattlecard?.objection?.trim() && rawBattlecard?.response?.trim()
          ? {
              objection: rawBattlecard.objection.trim().slice(0, 140),
              response: rawBattlecard.response.trim().slice(0, 180),
              proof: rawBattlecard.proof?.trim().slice(0, 150) || '',
            }
          : undefined;
      return {
        name: c.name!.trim(),
        tier,
        url: c.url?.trim() || undefined,
        summary: c.summary!.trim(),
        overlap: c.overlap?.trim() || '',
        differences: c.differences?.trim() || '',
        weaknesses: (c.weaknesses ?? []).map((w) => String(w).trim()).filter(Boolean).slice(0, 4),
        our_edge: c.our_edge?.trim() || '',
        pricing: c.pricing?.trim() || undefined,
        region: c.region?.trim() || undefined,
        battlecard,
      };
    })
    .slice(0, 8);

  const signals: MarketSignal[] = (parsed?.signals ?? [])
    .filter((s) => s?.signal?.trim())
    .map((s) => ({
      horizon: SIGNAL_HORIZONS.includes(s.horizon as never) ? (s.horizon as MarketSignal['horizon']) : 'tactical',
      signal: s.signal!.trim(),
      implication: s.implication?.trim() || '',
      source_url: s.source_url?.trim() || undefined,
    }))
    .slice(0, 8);

  const humanTasks: MarketHumanTask[] = (parsed?.human_tasks ?? [])
    .filter((task) => task?.title?.trim())
    .map((task) => ({
      title: task.title!.trim(),
      why: task.why?.trim() || '',
      how: task.how?.trim() || '',
    }))
    .slice(0, 5);

  return {
    scope,
    market_summary: parsed?.market_summary?.trim() || '',
    competitors,
    gaps: (parsed?.gaps ?? []).map((g) => String(g).trim()).filter(Boolean).slice(0, 6),
    signals,
    human_tasks: humanTasks,
    sources: sources.slice(0, 12),
    created_at: new Date().toISOString(),
  };
}

export async function marketAction(body: MarketRequest): Promise<MarketResponse> {
  if (!body?.idea?.product_name?.trim()) {
    throw new ServerActionError('Nedostaje idea.', 400, 'missing_idea');
  }
  if (body.action === 'scope') {
    return { scope: await detectMarketScope(body.idea, body.language) };
  }
  if (body.action === 'run') {
    if (!body.scope?.region) throw new ServerActionError('Nedostaje geografski doseg.', 400, 'missing_scope');
    return { market: await runMarketIntelligence(body.idea, body.language, body.scope) };
  }
  throw new ServerActionError('Nepoznata akcija.', 400, 'unknown_action');
}
