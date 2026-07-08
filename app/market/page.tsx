'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { getProject, listProjects, updateProject, updateProjectKnowledge, updateProjectMarket, updateProjectTasks } from '@/lib/projects';
import { buildMarketDigest, diffMarketIntelligence, isMarketDiffEmpty, type MarketDiff } from '@/lib/market-digest';
import { buildPriceComparison, buildPriceScale, canCompare } from '@/lib/price-crossover';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type {
  CompetitorProfile,
  IdeaFormData,
  MarketIntelligence,
  MarketScope,
  MarketSignal,
  ProjectKnowledge,
  ProjectTask,
  ValidationReport,
} from '@/lib/types';

const STALE_DAYS = 90;

export default function MarketPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();

  const [booting, setBooting] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [idea, setIdea] = useState<IdeaFormData | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [knowledge, setKnowledge] = useState<ProjectKnowledge | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [market, setMarket] = useState<MarketIntelligence | null>(null);
  const [marketHistory, setMarketHistory] = useState<MarketIntelligence[]>([]);
  const [diff, setDiff] = useState<MarketDiff | null>(null);
  const [scope, setScope] = useState<MarketScope | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [running, setRunning] = useState(false);
  const [syncedToAdvisors, setSyncedToAdvisors] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const bootedRef = useRef(false);

  const t = {
    hr: {
      kicker: 'Protokol — tržište',
      title: 'Istraživanje tržišta',
      subtitle: 'Tko to već radi, po čemu smo slični, po čemu različiti i gdje možemo biti bolji. Imena i brojke dolaze iz stvarnih web izvora, ne iz mašte modela.',
      loading: 'Otvaram istraživanje...',
      noProjectTitle: 'Još nema projekta',
      noProjectText: 'Istraživanje tržišta treba postojeću ideju. Najprije pokreni test.',
      goValidate: 'Validiraj ideju',
      scopeTitle: 'Geografski doseg',
      scopeHint: 'Ovo odlučuje GDJE tražimo konkurenciju. Lokalna usluga oko Zagreba ne uspoređuje se s Novim Zelandom — a globalni SaaS ne smije stati na Hrvatskoj. Ispravi ako procjena ne valja.',
      scopeDetecting: 'Procjenjujem doseg iz ideje...',
      scopeLocal: 'Lokalno',
      scopeNational: 'Nacionalno',
      scopeInternational: 'Internacionalno',
      regionLabel: 'Regija istraživanja',
      regionPlaceholder: 'npr. Zagreb i okolica, Hrvatska',
      run: `Pokreni istraživanje (${TOKEN_COSTS.market_research} tokena)`,
      rerun: `Osvježi istraživanje (${TOKEN_COSTS.market_research} tokena)`,
      running: 'Pretražujem web i analiziram konkurenciju... (do minute)',
      summaryTitle: 'Stanje tržišta',
      freshness: 'Istraženo',
      staleWarning: `Ovo istraživanje je starije od ${STALE_DAYS} dana — znanje o tržištu do tada izblijedi. Osvježi ga prije važnih odluka.`,
      competitorsTitle: 'Konkurencija',
      tierDirect: 'Izravni — isti kupci, isti proizvod',
      tierIndirect: 'Neizravni — isti problem, drugi pristup',
      tierSubstitute: 'Zamjene — uklanjaju potrebu za proizvodom',
      overlap: 'Sličnosti',
      differences: 'Razlike',
      ourEdge: 'Naša prednost',
      weaknesses: 'Slabosti / pritužbe kupaca',
      pricing: 'Cijena',
      gapsTitle: 'Tržišne praznine',
      gapsSubtitle: 'Nezadovoljstva tuđih kupaca i rupe u ponudi — oko njih gradiš poruku.',
      signalsTitle: 'Signali',
      signalsSubtitle: 'Taktički = što rade sada · Strateški = kako se pozicioniraju · Usmjeravajući = rani znakovi budućih poteza.',
      horizonTactical: 'Taktički',
      horizonStrategic: 'Strateški',
      horizonDirectional: 'Usmjeravajući',
      implication: 'Što to znači za tebe',
      humanTitle: 'Ovdje bot staje — tvoji zadaci',
      humanSubtitle: 'Do ovoga AI nema pristup: skrivene ponude, razgovori s izgubljenim kupcima, tuđi checkout iz prve ruke.',
      humanWhy: 'Zašto',
      humanHow: 'Kako',
      sourcesTitle: 'Izvori',
      advisorsSynced: 'Nalazi su zapisani u dosje — savjetnici ih sada vide u svakom razgovoru.',
      advisorsSyncCost: `Uključuje zapis u dosje (${TOKEN_COSTS.advisor_memory} tokena${'}'.length ? '' : ''})`,
      openAdvisors: 'Pitaj savjetnike',
      openPlan: 'Biznis plan',
      backResults: 'Izvještaj',
      home: '← Početna',
      errorGeneric: 'Nešto je puklo. Pokušaj ponovno.',
      legalNote: 'Samo javno dostupni izvori. Bez struganja zaštićenih baza i tuđih tajni — to nije inteligencija nego špijunaža.',
      diffTitle: 'Što se promijenilo od zadnjeg puta',
      diffNewCompetitors: 'Novi konkurenti',
      diffGoneCompetitors: 'Nestali iz rezultata',
      diffPricingChanges: 'Promjene cijena',
      diffNewSignals: 'Novi signali',
      diffNewGaps: 'Nove praznine',
      diffResolvedGaps: 'Praznine koje više ne vidimo',
      historyTitle: 'Povijest istraživanja',
      historySubtitle: 'Prijašnji snimci ovog tržišta — znanje blijedi, zato ih čuvamo za usporedbu.',
      historyCompetitors: 'konkurenata',
      priceCompareTitle: 'Cjenovna usporedba',
      priceCompareSubtitle: 'Tvoj prihvatljivi raspon (Van Westendorp, iz simuliranih kupaca) naspram stvarnih cijena konkurencije (iz weba).',
      priceCompareOurRange: 'Tvoj prihvatljiv raspon',
      priceCompareOurPrice: 'Tvoja cijena',
      priceCompareBelow: 'ispod tvog raspona',
      priceCompareWithin: 'unutar tvog raspona',
      priceCompareAbove: 'iznad tvog raspona',
      priceCompareNeedsPricing: 'Konkurenti imaju cijene iz weba, ali još nemaš svoj prihvatljivi raspon. Pokreni analizu cijene na izvještaju da vidiš usporedbu.',
      priceCompareOpenPricing: 'Otvori analizu cijene',
      addToTasks: 'Dodaj u taskove',
      addedToTasks: '✓ U taskovima',
      battlecardsTitle: 'Battlecards — izravni konkurenti',
      battlecardsSubtitle: 'Kad kupac spomene ovo ime, ovako mu Zvonko (prodaja) odgovara.',
      battlecardObjection: 'Kupac kaže',
      battlecardResponse: 'Ti odgovaraš',
      battlecardProof: 'Dokaz',
    },
    en: {
      kicker: 'Protocol — market',
      title: 'Market research',
      subtitle: 'Who already does this, where we overlap, where we differ, and where we can win. Names and numbers come from real web sources, not model imagination.',
      loading: 'Opening research...',
      noProjectTitle: 'No project yet',
      noProjectText: 'Market research needs an existing idea. Run a test first.',
      goValidate: 'Validate an idea',
      scopeTitle: 'Geographic scope',
      scopeHint: 'This decides WHERE we look for competition. A local service around Zagreb must not be compared to New Zealand — and a global SaaS must not stop at Croatia. Correct it if the guess is off.',
      scopeDetecting: 'Estimating scope from the idea...',
      scopeLocal: 'Local',
      scopeNational: 'National',
      scopeInternational: 'International',
      regionLabel: 'Research region',
      regionPlaceholder: 'e.g. Zagreb area, Croatia',
      run: `Run research (${TOKEN_COSTS.market_research} tokens)`,
      rerun: `Refresh research (${TOKEN_COSTS.market_research} tokens)`,
      running: 'Searching the web and analyzing competitors... (up to a minute)',
      summaryTitle: 'State of the market',
      freshness: 'Researched',
      staleWarning: `This research is older than ${STALE_DAYS} days — market knowledge fades by then. Refresh before big decisions.`,
      competitorsTitle: 'Competition',
      tierDirect: 'Direct — same customers, same product',
      tierIndirect: 'Indirect — same problem, different approach',
      tierSubstitute: 'Substitutes — remove the need for the product',
      overlap: 'Similarities',
      differences: 'Differences',
      ourEdge: 'Our edge',
      weaknesses: 'Weaknesses / customer complaints',
      pricing: 'Pricing',
      gapsTitle: 'Market gaps',
      gapsSubtitle: 'Complaints of competitors\' customers and missing offers — build your message around these.',
      signalsTitle: 'Signals',
      signalsSubtitle: 'Tactical = what they do now · Strategic = how they position · Directional = early signs of future moves.',
      horizonTactical: 'Tactical',
      horizonStrategic: 'Strategic',
      horizonDirectional: 'Directional',
      implication: 'What it means for you',
      humanTitle: 'Where the bot stops — your tasks',
      humanSubtitle: 'AI cannot reach these: opaque quotes, win/loss calls, a competitor\'s checkout first-hand.',
      humanWhy: 'Why',
      humanHow: 'How',
      sourcesTitle: 'Sources',
      advisorsSynced: 'Findings written into the dossier — advisors now see them in every conversation.',
      advisorsSyncCost: '',
      openAdvisors: 'Ask the advisors',
      openPlan: 'Business plan',
      backResults: 'Report',
      home: '← Home',
      errorGeneric: 'Something broke. Try again.',
      legalNote: 'Public sources only. No scraping protected databases or trade secrets — that is not intelligence, it is espionage.',
      diffTitle: 'What changed since last time',
      diffNewCompetitors: 'New competitors',
      diffGoneCompetitors: 'Dropped out of results',
      diffPricingChanges: 'Pricing changes',
      diffNewSignals: 'New signals',
      diffNewGaps: 'New gaps',
      diffResolvedGaps: 'Gaps no longer visible',
      historyTitle: 'Research history',
      historySubtitle: 'Past snapshots of this market — knowledge fades, so we keep them for comparison.',
      historyCompetitors: 'competitors',
      priceCompareTitle: 'Price comparison',
      priceCompareSubtitle: 'Your acceptable range (Van Westendorp, from simulated buyers) against real competitor prices (from the web).',
      priceCompareOurRange: 'Your acceptable range',
      priceCompareOurPrice: 'Your price',
      priceCompareBelow: 'below your range',
      priceCompareWithin: 'within your range',
      priceCompareAbove: 'above your range',
      priceCompareNeedsPricing: 'Competitors have web-sourced prices, but you have no acceptable range yet. Run the pricing analysis on the report to see the comparison.',
      priceCompareOpenPricing: 'Open pricing analysis',
      addToTasks: 'Add to tasks',
      addedToTasks: '✓ In tasks',
      battlecardsTitle: 'Battlecards — direct competitors',
      battlecardsSubtitle: 'When a buyer brings up this name, here is how Zvonko (sales) answers.',
      battlecardObjection: 'Buyer says',
      battlecardResponse: 'You answer',
      battlecardProof: 'Proof',
    },
  }[language];

  // ── Boot ──
  useEffect(() => {
    if (authLoading || !user || bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      try {
        let proj = null;
        const savedId = sessionStorage.getItem('aivalidator_project_id');
        if (savedId) proj = await getProject(savedId, user.uid);
        if (!proj) {
          const projects = await listProjects(user.uid);
          proj = projects[0] ?? null;
          if (proj) sessionStorage.setItem('aivalidator_project_id', proj.id);
        }
        if (proj) {
          setProjectId(proj.id);
          setIdea(proj.idea);
          setReport(proj.report);
          setKnowledge(proj.knowledge);
          setTasks(proj.tasks ?? []);
          setMarketHistory(proj.market_history ?? []);
          if (proj.market) {
            setMarket(proj.market);
            setScope(proj.market.scope);
          } else {
            // procijeni doseg odmah (mala akcija) da korisnik vidi i ispravi prije skupog rune
            setDetecting(true);
            try {
              const spent = spendTokens(TOKEN_COSTS.market_scope, language === 'en' ? 'Market scope' : 'Procjena dosega tržišta');
              if (spent.ok) {
                const data = await aiClient.marketIntelligence<{ scope?: MarketScope }>(
                  { action: 'scope', idea: proj.idea, language },
                  'scope failed'
                );
                if (data.scope) setScope(data.scope);
              }
            } catch (err) {
              console.error('Scope detect error:', err);
            } finally {
              setDetecting(false);
            }
          }
        }
      } catch (err) {
        console.error('Market boot error:', err);
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const effectiveScope: MarketScope = scope ?? {
    scope: 'international',
    region: language === 'en' ? 'global' : 'globalno',
    rationale: '',
  };

  // ── Sinteza nalaza u dosje da ih savjetnici vide ──
  const syncToAdvisors = async (intel: MarketIntelligence) => {
    if (!projectId || !knowledge) return; // dosje još nije otvoren → nalazi žive na projektu, u KB ulaze kad se dosje otvori kroz ispitivanje/savjetnike
    if (!intel.market_summary && intel.competitors.length === 0) return; // prazna analiza ne ide u dosje
    try {
      const spent = spendTokens(TOKEN_COSTS.advisor_memory, language === 'en' ? 'Dossier write (market)' : 'Zapis u dosje (tržište)');
      if (!spent.ok) return;
      const digest = [
        `MARKET RESEARCH FINDINGS (web-sourced, scope: ${intel.scope.scope} — ${intel.scope.region}):`,
        intel.market_summary,
        ...intel.competitors.slice(0, 6).map((c) =>
          `Competitor [${c.tier}] ${c.name}: ${c.summary}${c.pricing ? ` Pricing: ${c.pricing}.` : ''} Our edge: ${c.our_edge}${c.battlecard ? ` Sales battlecard — objection: "${c.battlecard.objection}", response: "${c.battlecard.response}" (proof: ${c.battlecard.proof}).` : ''}`
        ),
        intel.gaps.length ? `Market gaps: ${intel.gaps.join('; ')}` : '',
        ...intel.signals.slice(0, 4).map((s) => `Signal (${s.horizon}): ${s.signal} → ${s.implication}`),
      ].filter(Boolean).join('\n');

      const data = await aiClient.updateKnowledge<{ knowledge?: ProjectKnowledge; changed?: boolean }>(
        { mode: 'extract', knowledge, userMessage: digest, assistantMessage: '' },
        t.errorGeneric
      );
      if (data.knowledge && data.changed !== false) {
        setKnowledge(data.knowledge);
        await updateProjectKnowledge(projectId, data.knowledge);
      }
      setSyncedToAdvisors(true);
    } catch (err) {
      console.error('Advisor sync error:', err);
    }
  };

  const isHumanTaskAdded = (title: string) =>
    tasks.some((task) => task.title.trim().toLowerCase() === title.trim().toLowerCase());

  const addHumanTaskToManager = async (task: { title: string; why: string; how: string }) => {
    if (!projectId || isHumanTaskAdded(task.title)) return;
    const now = new Date().toISOString();
    const newTask: ProjectTask = {
      id: `market_task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: task.title.slice(0, 80),
      details: [task.why, task.how].filter(Boolean).join(' '),
      source_summary: language === 'en' ? 'From market research — human-in-the-loop task.' : 'Iz istraživanja tržišta — zadatak koji AI ne može odraditi umjesto tebe.',
      status: 'open',
      priority: 'medium',
      due_at: null,
      created_at: now,
      updated_at: now,
    };
    const nextTasks = [...tasks, newTask];
    setTasks(nextTasks);
    try {
      await updateProjectTasks(projectId, nextTasks);
    } catch (err) {
      console.error('Task add error:', err);
    }
  };

  const handleRun = async () => {
    if (!idea || !projectId || running) return;
    setRunning(true);
    setErrorMsg('');
    setSyncedToAdvisors(false);
    const previousMarket = market;
    try {
      const spent = spendTokens(TOKEN_COSTS.market_research, language === 'en' ? 'Market research' : 'Istraživanje tržišta');
      if (!spent.ok) {
        throw new Error(tokenShortfallMessage(language, language === 'en' ? 'Market research' : 'Istraživanje tržišta', TOKEN_COSTS.market_research, spent.missing));
      }
      const data = await aiClient.marketIntelligence<{ market?: MarketIntelligence }>(
        { action: 'run', idea, language, scope: effectiveScope },
        t.errorGeneric
      );
      if (!data.market) throw new Error(t.errorGeneric);
      setMarket(data.market);
      setScope(data.market.scope);
      await updateProjectMarket(projectId, data.market);

      if (previousMarket) {
        const nextDiff = diffMarketIntelligence(previousMarket, data.market);
        setDiff(isMarketDiffEmpty(nextDiff) ? null : nextDiff);
        setMarketHistory((prev) => [previousMarket, ...prev].slice(0, 5));
      } else {
        setDiff(null);
      }

      // Nalazi idu i na idea.market_context: sljedeći put kad se validacija pokrene (regenerate/rerun
      // bilo gdje u appu) personе automatski dobiju stvarnu konkurenciju umjesto izmišljene.
      const nextIdea: IdeaFormData = { ...idea, market_context: buildMarketDigest(data.market) };
      setIdea(nextIdea);
      sessionStorage.setItem('aivalidator_form', JSON.stringify(nextIdea));
      await updateProject(projectId, { idea: nextIdea, report });

      void syncToAdvisors(data.market);
    } catch (err) {
      console.error('Market run error:', err);
      setErrorMsg(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setRunning(false);
    }
  };

  // ── Render helpers ──
  const tierLabel: Record<CompetitorProfile['tier'], string> = {
    direct: t.tierDirect,
    indirect: t.tierIndirect,
    substitute: t.tierSubstitute,
  };
  const horizonLabel: Record<MarketSignal['horizon'], string> = {
    tactical: t.horizonTactical,
    strategic: t.horizonStrategic,
    directional: t.horizonDirectional,
  };

  const priceComparison = useMemo(() => {
    if (!market?.competitors.length) return [];
    return buildPriceComparison(market.competitors, report?.pricing?.range ?? { low: 0, high: 0 });
  }, [market, report]);
  const hasPriceComparison = canCompare(report?.pricing, priceComparison);
  const priceScale = useMemo(() => {
    if (!hasPriceComparison || !report?.pricing?.range) return null;
    return buildPriceScale(report.pricing.range, priceComparison, report.pricing.current_price);
  }, [hasPriceComparison, report, priceComparison]);
  const positionLabel: Record<'below' | 'within' | 'above', string> = {
    below: t.priceCompareBelow,
    within: t.priceCompareWithin,
    above: t.priceCompareAbove,
  };

  const CompetitorCard = ({ c }: { c: CompetitorProfile }) => (
    <div className="border border-[var(--hairline-strong)] bg-[var(--paper-raised)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-lg text-[var(--ink)]">
          {c.url ? (
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="link-ink">{c.name}</a>
          ) : c.name}
        </h4>
        <span className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          {c.region || ''}{c.pricing ? `${c.region ? ' · ' : ''}${t.pricing}: ${c.pricing}` : ''}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{c.summary}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {c.overlap && (
          <div className="flex gap-2">
            <dt className="font-data w-28 shrink-0 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] pt-0.5">{t.overlap}</dt>
            <dd className="text-[var(--ink)]">{c.overlap}</dd>
          </div>
        )}
        {c.differences && (
          <div className="flex gap-2">
            <dt className="font-data w-28 shrink-0 text-[10px] uppercase tracking-wider text-[var(--ink-faint)] pt-0.5">{t.differences}</dt>
            <dd className="text-[var(--ink)]">{c.differences}</dd>
          </div>
        )}
        {c.our_edge && (
          <div className="flex gap-2">
            <dt className="font-data w-28 shrink-0 text-[10px] uppercase tracking-wider pt-0.5" style={{ color: 'var(--verdict-green)' }}>{t.ourEdge}</dt>
            <dd className="font-medium text-[var(--ink)]">{c.our_edge}</dd>
          </div>
        )}
      </dl>
      {c.weaknesses.length > 0 && (
        <div className="mt-3 border-t border-[var(--hairline)] pt-2">
          <p className="font-data text-[10px] uppercase tracking-wider" style={{ color: 'var(--verdict-red)' }}>{t.weaknesses}</p>
          <ul className="mt-1 space-y-0.5">
            {c.weaknesses.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-[var(--ink-soft)]">— {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // ── Render ──
  if (authLoading || !user || booting) {
    return (
      <div className="paper-root flex min-h-screen flex-col items-center justify-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
        <span className="font-data text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">{t.loading}</span>
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="paper-root flex min-h-screen items-center justify-center px-4">
        <div className="sheet max-w-md p-8 text-center">
          <p className="kicker">{t.kicker}</p>
          <h1 className="mt-3 text-2xl text-[var(--ink)]">{t.noProjectTitle}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t.noProjectText}</p>
          <button type="button" onClick={() => router.push('/')} className="btn-ink mt-6 text-sm">
            {t.goValidate}
          </button>
        </div>
      </div>
    );
  }

  const staleDays = market ? Math.floor((Date.now() - Date.parse(market.created_at)) / 86_400_000) : 0;
  const researchedLabel = market
    ? new Date(market.created_at).toLocaleDateString(language === 'en' ? 'en-US' : 'hr-HR', { dateStyle: 'medium' })
    : null;
  const tiersInOrder: CompetitorProfile['tier'][] = ['direct', 'indirect', 'substitute'];
  const horizonsInOrder: MarketSignal['horizon'][] = ['tactical', 'strategic', 'directional'];

  return (
    <div className="paper-root min-h-screen">
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button type="button" onClick={() => router.push('/')} className="link-ink text-sm">
            {t.home}
          </button>
          <div className="flex items-center gap-5">
            {report && (
              <button type="button" onClick={() => router.push('/results')} className="link-ink text-sm">
                {t.backResults}
              </button>
            )}
            <button type="button" onClick={() => router.push('/plan')} className="link-ink text-sm">
              {t.openPlan}
            </button>
            <button type="button" onClick={() => router.push('/advisors')} className="link-ink text-sm">
              {t.openAdvisors}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <section className="pt-10 sm:pt-12">
          <p className="kicker">{t.kicker}</p>
          <h1 className="mt-3 text-3xl text-[var(--ink)] sm:text-4xl">{t.title} — {idea.product_name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
        </section>

        {/* ── Geografski doseg ── */}
        <section className="mt-8 border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-5">
          <p className="kicker !mb-0">{t.scopeTitle}</p>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--ink-faint)]">{t.scopeHint}</p>
          {detecting ? (
            <p className="font-data mt-4 flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--ink-faint)]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
              {t.scopeDetecting}
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ['local', t.scopeLocal],
                  ['national', t.scopeNational],
                  ['international', t.scopeInternational],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope({ ...effectiveScope, scope: value })}
                    className={`cursor-pointer border px-4 py-2 text-sm font-semibold transition-colors ${
                      effectiveScope.scope === value
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                        : 'border-[var(--hairline-strong)] bg-[var(--paper)] text-[var(--ink-soft)] hover:border-[var(--ink)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 max-w-md">
                <label className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.regionLabel}</label>
                <input
                  type="text"
                  value={effectiveScope.region}
                  onChange={(event) => setScope({ ...effectiveScope, region: event.target.value })}
                  placeholder={t.regionPlaceholder}
                  className="paper-field mt-1 w-full text-sm"
                />
              </div>
              {effectiveScope.rationale && (
                <p className="mt-2 text-xs italic text-[var(--ink-faint)]">{effectiveScope.rationale}</p>
              )}
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={running || detecting || !effectiveScope.region.trim()}
              className="btn-ink text-sm disabled:opacity-60"
            >
              {running ? t.running : market ? t.rerun : t.run}
            </button>
            {errorMsg && <p className="text-sm text-[var(--verdict-red)]">{errorMsg}</p>}
          </div>
          <p className="font-data mt-3 text-[10px] text-[var(--ink-faint)]">{t.legalNote}</p>
        </section>

        {market && (
          <>
            {/* Svježina */}
            <section className="mt-8 flex flex-wrap items-center gap-3">
              <span
                className="stamp !text-[11px]"
                style={
                  staleDays > STALE_DAYS
                    ? { color: 'var(--verdict-red)', borderColor: 'var(--verdict-red)' }
                    : { color: 'var(--verdict-green)', borderColor: 'var(--verdict-green)' }
                }
              >
                {t.freshness}: {researchedLabel}
              </span>
              <span className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                {market.scope.scope === 'local' ? t.scopeLocal : market.scope.scope === 'national' ? t.scopeNational : t.scopeInternational} · {market.scope.region}
              </span>
              {syncedToAdvisors && (
                <span className="font-data text-[11px] uppercase tracking-wider" style={{ color: 'var(--verdict-green)' }}>
                  ✓ {t.advisorsSynced}
                </span>
              )}
            </section>
            {staleDays > STALE_DAYS && (
              <section className="mt-3 border-l-4 border-[var(--verdict-red)] bg-[var(--paper-raised)] px-4 py-3">
                <p className="text-sm text-[var(--ink)]">{t.staleWarning}</p>
              </section>
            )}

            {/* Što se promijenilo od zadnjeg istraživanja */}
            {diff && (
              <section className="mt-6 border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-5">
                <p className="kicker !mb-0">{t.diffTitle}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {diff.newCompetitors.length > 0 && (
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-wider" style={{ color: 'var(--verdict-green)' }}>{t.diffNewCompetitors}</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.newCompetitors.map((name) => (
                          <li key={name} className="text-sm text-[var(--ink)]">+ {name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.goneCompetitors.length > 0 && (
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.diffGoneCompetitors}</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.goneCompetitors.map((name) => (
                          <li key={name} className="text-sm text-[var(--ink-faint)] line-through">{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.pricingChanges.length > 0 && (
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-wider" style={{ color: 'var(--annotate)' }}>{t.diffPricingChanges}</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.pricingChanges.map((change) => (
                          <li key={change.name} className="text-sm text-[var(--ink)]">
                            {change.name}: <span className="text-[var(--ink-faint)] line-through">{change.before}</span> → {change.after}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.newSignals.length > 0 && (
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-wider" style={{ color: 'var(--annotate)' }}>{t.diffNewSignals}</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.newSignals.map((signal, i) => (
                          <li key={i} className="text-sm text-[var(--ink)]">{signal}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.newGaps.length > 0 && (
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-wider" style={{ color: 'var(--verdict-red)' }}>{t.diffNewGaps}</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.newGaps.map((gap, i) => (
                          <li key={i} className="text-sm text-[var(--ink)]">{gap}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.resolvedGaps.length > 0 && (
                    <div>
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.diffResolvedGaps}</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.resolvedGaps.map((gap, i) => (
                          <li key={i} className="text-sm text-[var(--ink-faint)] line-through">{gap}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Sažetak */}
            {market.market_summary && (
              <section className="mt-8">
                <p className="kicker">{t.summaryTitle}</p>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--ink)]">{market.market_summary}</p>
              </section>
            )}

            {/* Konkurenti po razinama */}
            {market.competitors.length > 0 && (
              <section className="mt-10">
                <h2 className="border-b-2 border-[var(--ink)] pb-2 text-2xl text-[var(--ink)]">{t.competitorsTitle}</h2>
                {tiersInOrder.map((tier) => {
                  const group = market.competitors.filter((c) => c.tier === tier);
                  if (!group.length) return null;
                  return (
                    <div key={tier} className="mt-6">
                      <p className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">{tierLabel[tier]}</p>
                      <div className="mt-2 grid gap-4 md:grid-cols-2">
                        {group.map((c) => <CompetitorCard key={`${tier}-${c.name}`} c={c} />)}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Cjenovno križanje: naš Van Westendorp raspon × stvarne cijene konkurencije */}
            {(hasPriceComparison || priceComparison.length > 0) && (
              <section className="mt-10">
                <h2 className="border-b-2 border-[var(--ink)] pb-2 text-2xl text-[var(--ink)]">{t.priceCompareTitle}</h2>
                <p className="mt-2 text-xs text-[var(--ink-faint)]">{t.priceCompareSubtitle}</p>

                {!hasPriceComparison ? (
                  <div className="mt-4 border-l-4 border-[var(--annotate)] bg-[var(--paper-raised)] px-4 py-3">
                    <p className="text-sm text-[var(--ink)]">{t.priceCompareNeedsPricing}</p>
                    <button type="button" onClick={() => router.push('/results')} className="link-ink mt-2 text-sm">
                      {t.priceCompareOpenPricing}
                    </button>
                  </div>
                ) : priceScale && report?.pricing ? (
                  <div className="mt-5">
                    <div className="relative h-8">
                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--hairline-strong)]" />
                      <div
                        className="absolute top-1/2 h-3 -translate-y-1/2 border border-[var(--verdict-green)] bg-[var(--verdict-green)]/15"
                        style={{
                          left: `${priceScale.pct(report.pricing.range.low)}%`,
                          width: `${Math.max(0.5, priceScale.pct(report.pricing.range.high) - priceScale.pct(report.pricing.range.low))}%`,
                        }}
                      />
                      {report.pricing.current_price != null && (
                        <div
                          className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-[var(--ink)]"
                          style={{ left: `${priceScale.pct(report.pricing.current_price)}%` }}
                          title={t.priceCompareOurPrice}
                        />
                      )}
                      {priceComparison.map((entry) => (
                        <div
                          key={entry.name}
                          className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2"
                          style={{
                            left: `${priceScale.pct((entry.low + entry.high) / 2)}%`,
                            backgroundColor:
                              entry.position === 'within' ? 'var(--verdict-red)' : 'var(--ink-faint)',
                          }}
                          title={`${entry.name}: ${entry.raw}`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-[10px]">
                      <span className="font-data flex items-center gap-1.5 uppercase tracking-wider text-[var(--ink-faint)]">
                        <span className="inline-block h-2.5 w-4 border border-[var(--verdict-green)] bg-[var(--verdict-green)]/15" />
                        {t.priceCompareOurRange} ({report.pricing.currency}{report.pricing.range.low}–{report.pricing.range.high}{report.pricing.unit})
                      </span>
                      {report.pricing.current_price != null && (
                        <span className="font-data flex items-center gap-1.5 uppercase tracking-wider text-[var(--ink-faint)]">
                          <span className="inline-block h-3 w-0.5 bg-[var(--ink)]" />
                          {t.priceCompareOurPrice}
                        </span>
                      )}
                    </div>

                    <ul className="mt-4 max-w-2xl space-y-1.5">
                      {priceComparison.map((entry) => (
                        <li key={entry.name} className="leader-row text-sm">
                          <span className="text-[var(--ink)]">{entry.name}</span>
                          <span className="leader-fill" />
                          <span
                            className="font-data text-xs"
                            style={{ color: entry.position === 'within' ? 'var(--verdict-red)' : 'var(--ink-soft)' }}
                          >
                            {entry.raw} · {positionLabel[entry.position]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )}

            {/* Battlecards za izravne konkurente */}
            {market.competitors.some((c) => c.tier === 'direct' && c.battlecard) && (
              <section className="mt-10">
                <h2 className="border-b-2 border-[var(--ink)] pb-2 text-2xl text-[var(--ink)]">{t.battlecardsTitle}</h2>
                <p className="mt-2 text-xs text-[var(--ink-faint)]">{t.battlecardsSubtitle}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {market.competitors
                    .filter((c) => c.tier === 'direct' && c.battlecard)
                    .map((c) => (
                      <div key={c.name} className="border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-4">
                        <h3 className="text-base font-semibold text-[var(--ink)]">{c.name}</h3>
                        <div className="mt-2 space-y-2 text-sm">
                          <p>
                            <span className="font-data text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">{t.battlecardObjection}:</span>{' '}
                            <span className="italic text-[var(--ink-soft)]">&ldquo;{c.battlecard!.objection}&rdquo;</span>
                          </p>
                          <p>
                            <span className="font-data text-[9px] uppercase tracking-wider" style={{ color: 'var(--verdict-green)' }}>{t.battlecardResponse}:</span>{' '}
                            <span className="font-medium text-[var(--ink)]">{c.battlecard!.response}</span>
                          </p>
                          {c.battlecard!.proof && (
                            <p>
                              <span className="font-data text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">{t.battlecardProof}:</span>{' '}
                              <span className="text-[var(--ink-soft)]">{c.battlecard!.proof}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Praznine */}
            {market.gaps.length > 0 && (
              <section className="mt-10">
                <h2 className="border-b-2 border-[var(--ink)] pb-2 text-2xl text-[var(--ink)]">{t.gapsTitle}</h2>
                <p className="mt-2 text-xs text-[var(--ink-faint)]">{t.gapsSubtitle}</p>
                <ul className="mt-3 max-w-3xl space-y-2">
                  {market.gaps.map((gap, i) => (
                    <li key={i} className="border-l-4 border-[var(--annotate)] bg-[var(--paper-raised)] px-4 py-2.5 text-sm leading-relaxed text-[var(--ink)]">
                      {gap}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Signali po horizontima */}
            {market.signals.length > 0 && (
              <section className="mt-10">
                <h2 className="border-b-2 border-[var(--ink)] pb-2 text-2xl text-[var(--ink)]">{t.signalsTitle}</h2>
                <p className="mt-2 text-xs text-[var(--ink-faint)]">{t.signalsSubtitle}</p>
                <div className="mt-3 grid gap-6 md:grid-cols-3">
                  {horizonsInOrder.map((horizon) => {
                    const group = market.signals.filter((s) => s.horizon === horizon);
                    return (
                      <div key={horizon}>
                        <p className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">{horizonLabel[horizon]}</p>
                        {group.length === 0 ? (
                          <p className="mt-2 text-xs italic text-[var(--ink-faint)]">—</p>
                        ) : (
                          <div className="mt-1">
                            {group.map((s, i) => (
                              <div key={i} className="border-b border-[var(--hairline)] py-2.5 last:border-b-0">
                                <p className="text-sm leading-relaxed text-[var(--ink)]">
                                  {s.source_url ? (
                                    <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="link-ink">{s.signal}</a>
                                  ) : s.signal}
                                </p>
                                {s.implication && (
                                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">
                                    <span className="font-data text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">{t.implication}:</span> {s.implication}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Human-in-the-loop */}
            {market.human_tasks.length > 0 && (
              <section className="mt-10 border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-5">
                <h2 className="text-2xl text-[var(--ink)]">{t.humanTitle}</h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">{t.humanSubtitle}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {market.human_tasks.map((task, i) => (
                    <div key={i} className="border border-[var(--hairline-strong)] bg-[var(--paper)] p-4">
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{String(i + 1).padStart(2, '0')}</p>
                      <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">{task.title}</h3>
                      {task.why && (
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-soft)]">
                          <span className="font-data text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">{t.humanWhy}:</span> {task.why}
                        </p>
                      )}
                      {task.how && (
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-soft)]">
                          <span className="font-data text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">{t.humanHow}:</span> {task.how}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void addHumanTaskToManager(task)}
                        disabled={isHumanTaskAdded(task.title)}
                        className="link-ink mt-2 text-[11px] disabled:cursor-default"
                        style={isHumanTaskAdded(task.title) ? { color: 'var(--verdict-green)' } : undefined}
                      >
                        {isHumanTaskAdded(task.title) ? t.addedToTasks : t.addToTasks}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Izvori */}
            {market.sources.length > 0 && (
              <section className="mt-10">
                <p className="kicker">{t.sourcesTitle}</p>
                <ul className="mt-3 space-y-1.5">
                  {market.sources.map((source, i) => (
                    <li key={source.url} className="text-sm">
                      <span className="font-data text-[10px] text-[var(--ink-faint)]">[{i + 1}]</span>{' '}
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="link-ink">
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Povijest istraživanja */}
        {marketHistory.length > 0 && (
          <section className="mt-10">
            <p className="kicker">{t.historyTitle}</p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">{t.historySubtitle}</p>
            <ul className="mt-3 max-w-2xl space-y-1.5">
              {marketHistory.map((snapshot, i) => (
                <li key={`${snapshot.created_at}-${i}`} className="leader-row text-sm">
                  <span className="text-[var(--ink)]">
                    {new Date(snapshot.created_at).toLocaleDateString(language === 'en' ? 'en-US' : 'hr-HR', { dateStyle: 'medium' })}
                  </span>
                  <span className="leader-fill" />
                  <span className="font-data text-xs text-[var(--ink-soft)]">
                    {snapshot.scope.scope === 'local' ? t.scopeLocal : snapshot.scope.scope === 'national' ? t.scopeNational : t.scopeInternational} · {snapshot.scope.region} · {snapshot.competitors.length} {t.historyCompetitors}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
