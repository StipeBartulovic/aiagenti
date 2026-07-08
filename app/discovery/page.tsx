'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { buildCandidateQuestions, type DiscoveryQuestion } from '@/lib/discovery';
import { SECTION_KEYS, SECTION_LABELS } from '@/lib/knowledge';
import { createProject, getProject, updateProject, updateProjectKnowledge } from '@/lib/projects';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type {
  DiscoveryAnswer,
  IdeaFormData,
  MarketIntelligence,
  ProjectKnowledge,
  ValidationReport,
} from '@/lib/types';
import type { DiscoveryNextResponse } from '@/lib/server/discovery';

type Phase = 'booting' | 'intro' | 'asking' | 'waiting' | 'done' | 'error';

interface LogEntry {
  question: string;
  why?: string;
  answer: string | null; // null = preskočeno
}

function categoryFor(item: DiscoveryQuestion): DiscoveryAnswer['category'] {
  if (item.source === 'objection') return 'risk';
  if (item.source === 'doubt') return 'proof';
  if (item.source === 'gap') return 'status_quo';
  if (item.source === 'market_gap') return 'wedge';
  return item.side === 'payer' ? 'buyer' : 'pain';
}

export default function DiscoveryPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();

  const [phase, setPhase] = useState<Phase>('booting');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [idea, setIdea] = useState<IdeaFormData | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [knowledge, setKnowledge] = useState<ProjectKnowledge | null>(null);
  const [candidates, setCandidates] = useState<DiscoveryQuestion[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [current, setCurrent] = useState<{ candidate: DiscoveryQuestion; question: string; why: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [changedSections, setChangedSections] = useState<Set<string>>(new Set());
  const bootedRef = useRef(false);
  const ingestChainRef = useRef<Promise<void>>(Promise.resolve());
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const t = {
    hr: {
      kicker: 'Protokol — ispitivanje',
      title: 'Dubinsko ispitivanje',
      subtitle: 'Persone su odbile ili sumnjale najviše zbog rupa u podacima. Ovdje ih zatvaraš: pitanje po pitanje, svaki odgovor ide ravno u dosje projekta.',
      loading: 'Pripremam ispitivanje...',
      seeding: 'Otvaram dosje projekta (prvi put traje malo duže)...',
      noIdea: 'Ispitivanje treba postojeću ideju. Najprije pokreni test.',
      goHome: 'Na početnu',
      introReady: (n: number) => `Spremno ${n} pitanja iz reakcija kupaca i rupa u dosjeu.`,
      introHow: 'Ispitivač (AI) bira redoslijed — najprije ono što najviše mijenja sliku. Možeš preskočiti bilo koje pitanje i završiti kad želiš.',
      introCost: `Svako sljedeće pitanje: ${TOKEN_COSTS.discovery_question} tokena · zapis u dosje: ${TOKEN_COSTS.advisor_memory} tokena`,
      start: 'Kreni s ispitivanjem',
      interviewer: 'Ispitivač',
      you: 'Ti',
      whyLabel: 'Zašto ovo pitam',
      thinking: 'Biram sljedeće pitanje...',
      answerPlaceholder: 'Odgovori svojim riječima — konkretno je bolje od savršenog...',
      send: 'Odgovori',
      skip: 'Preskoči',
      finish: 'Završi ispitivanje',
      skipped: '— preskočeno —',
      ingesting: 'Zapisujem u dosje...',
      dossier: 'Dosje se puni',
      dossierHint: 'Ovo je kontekst koji persone i savjetnici vide u sljedećem krugu.',
      digest: 'Sažetak projekta',
      facts: 'činjenica',
      gaps: 'rupa',
      lastWritten: 'Zadnje zapisano',
      answeredCount: (n: number) => `${n} odgovoreno`,
      doneTitle: 'Ispitivanje završeno',
      doneText: (n: number) => `Zapisano ${n} odgovora u dosje. Sljedeći test kreće s ovim znanjem — persone će reagirati na tvoja pojašnjenja.`,
      rerun: 'Ponovi test s novim podacima',
      rerunning: 'Persone čitaju tvoje odgovore... (traje par minuta)',
      rerunCost: `Trošak: ${TOKEN_COSTS.validation} tokena`,
      openPlan: 'Otvori biznis plan',
      backResults: 'Natrag na izvještaj',
      continueAsking: 'Nastavi ispitivanje',
      errorGeneric: 'Nešto je puklo. Pokušaj ponovno.',
      retry: 'Pokušaj ponovno',
      noMore: 'Ispitivač procjenjuje da preostala pitanja ne donose ništa novo.',
    },
    en: {
      kicker: 'Protocol — interrogation',
      title: 'Deep discovery',
      subtitle: 'Personas rejected or doubted mostly because of missing data. Close the gaps here: one question at a time, every answer goes straight into the project dossier.',
      loading: 'Preparing the interview...',
      seeding: 'Opening the project dossier (first time takes a bit longer)...',
      noIdea: 'Discovery needs an existing idea. Run a test first.',
      goHome: 'Go home',
      introReady: (n: number) => `${n} questions ready, sourced from buyer reactions and dossier gaps.`,
      introHow: 'The AI interviewer picks the order — what changes the picture most comes first. Skip any question, finish whenever you want.',
      introCost: `Each next question: ${TOKEN_COSTS.discovery_question} tokens · dossier write: ${TOKEN_COSTS.advisor_memory} tokens`,
      start: 'Start the interview',
      interviewer: 'Interviewer',
      you: 'You',
      whyLabel: 'Why I ask',
      thinking: 'Choosing the next question...',
      answerPlaceholder: 'Answer in your own words — concrete beats perfect...',
      send: 'Answer',
      skip: 'Skip',
      finish: 'Finish interview',
      skipped: '— skipped —',
      ingesting: 'Writing to dossier...',
      dossier: 'Dossier filling up',
      dossierHint: 'This is the context personas and advisors see in the next round.',
      digest: 'Project digest',
      facts: 'facts',
      gaps: 'gaps',
      lastWritten: 'Last written',
      answeredCount: (n: number) => `${n} answered`,
      doneTitle: 'Interview finished',
      doneText: (n: number) => `${n} answers written into the dossier. The next test starts with this knowledge — personas will react to your clarifications.`,
      rerun: 'Re-run test with new data',
      rerunning: 'Personas are reading your answers... (takes a few minutes)',
      rerunCost: `Cost: ${TOKEN_COSTS.validation} tokens`,
      openPlan: 'Open business plan',
      backResults: 'Back to report',
      continueAsking: 'Continue the interview',
      errorGeneric: 'Something broke. Try again.',
      retry: 'Try again',
      noMore: 'The interviewer judges the remaining questions add nothing new.',
    },
  }[language];

  // ── Boot: projekt + dosje ──
  useEffect(() => {
    if (authLoading || !user || bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      const rawForm = sessionStorage.getItem('aivalidator_form');
      if (!rawForm) {
        setPhase('error');
        setErrorMsg(t.noIdea);
        return;
      }
      let parsedIdea: IdeaFormData = JSON.parse(rawForm);
      const rawReport = sessionStorage.getItem('aivalidator_report');
      let parsedReport: ValidationReport | null = rawReport ? JSON.parse(rawReport) : null;
      let kb: ProjectKnowledge | null = null;
      let market: MarketIntelligence | null = null;

      try {
        const savedId = sessionStorage.getItem('aivalidator_project_id');
        let pid = savedId;
        if (savedId) {
          const proj = await getProject(savedId, user.uid);
          if (proj) {
            parsedIdea = proj.idea;
            parsedReport = proj.report;
            kb = proj.knowledge;
            market = proj.market ?? null;
          } else {
            pid = null;
          }
        }
        if (!pid) {
          pid = await createProject(user.uid, { idea: parsedIdea, report: parsedReport });
          sessionStorage.setItem('aivalidator_project_id', pid);
        }
        setProjectId(pid);
        setIdea(parsedIdea);
        setReport(parsedReport);

        if (!kb) {
          // dosje još ne postoji → automatski seed iz ideje + izvještaja
          setNoticeMsg(t.seeding);
          const shortfall = spendTokens(TOKEN_COSTS.advisor_setup, language === 'en' ? 'Dossier setup' : 'Priprema dosjea');
          if (!shortfall.ok) {
            throw new Error(tokenShortfallMessage(language, language === 'en' ? 'Dossier setup' : 'Priprema dosjea', TOKEN_COSTS.advisor_setup, shortfall.missing));
          }
          const data = await aiClient.updateKnowledge<{ knowledge?: ProjectKnowledge }>(
            { mode: 'seed', idea: parsedIdea, report: parsedReport, intakeTranscript: [] },
            t.errorGeneric
          );
          if (!data.knowledge) throw new Error(t.errorGeneric);
          kb = data.knowledge;
          await updateProjectKnowledge(pid, kb);
          setNoticeMsg('');
        }
        setKnowledge(kb);

        const answeredSet = new Set(
          (parsedIdea.discovery_answers ?? []).map((a) => a.question.trim().toLowerCase())
        );
        const cands = buildCandidateQuestions(parsedReport, kb, language, market)
          .filter((c) => !answeredSet.has(c.question.trim().toLowerCase()));
        setCandidates(cands);
        setPhase('intro');
      } catch (err) {
        console.error('Discovery boot error:', err);
        setErrorMsg(err instanceof Error ? err.message : t.errorGeneric);
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [log, current, phase]);

  // ── Sljedeće pitanje ──
  const fetchNext = async (
    remaining: DiscoveryQuestion[],
    answeredLog: LogEntry[],
    kb: ProjectKnowledge | null,
    baseIdea: IdeaFormData
  ) => {
    if (remaining.length === 0) {
      setCurrent(null);
      setPhase('done');
      return;
    }
    setPhase('asking');
    setErrorMsg('');
    try {
      const shortfall = spendTokens(TOKEN_COSTS.discovery_question, language === 'en' ? 'Discovery question' : 'Pitanje ispitivanja');
      if (!shortfall.ok) {
        throw new Error(tokenShortfallMessage(language, language === 'en' ? 'Discovery question' : 'Pitanje ispitivanja', TOKEN_COSTS.discovery_question, shortfall.missing));
      }
      const data = await aiClient.discoveryNext<DiscoveryNextResponse>({
        language,
        idea: {
          product_name: baseIdea.product_name,
          elevator_pitch: baseIdea.elevator_pitch,
          business_model: baseIdea.business_model,
        },
        digest: kb?.digest || '',
        candidates: remaining.map((c) => ({
          question: c.question,
          context: c.context,
          source: c.source,
          side: c.side,
          section: c.section,
        })),
        answered: answeredLog
          .filter((entry) => entry.answer !== null)
          .map((entry) => ({ question: entry.question, answer: entry.answer as string })),
        skipped: answeredLog.filter((entry) => entry.answer === null).map((entry) => entry.question),
      }, t.errorGeneric);

      if (data.done || data.index === null) {
        setCurrent(null);
        setNoticeMsg(t.noMore);
        setPhase('done');
        return;
      }
      const candidate = remaining[data.index];
      setCurrent({ candidate, question: data.question || candidate.question, why: data.why });
      setPhase('waiting');
    } catch (err) {
      console.error('Discovery next error:', err);
      setErrorMsg(err instanceof Error ? err.message : t.errorGeneric);
      setPhase('error');
    }
  };

  const handleStart = () => {
    if (!idea) return;
    void fetchNext(candidates, log, knowledge, idea);
  };

  // ── Zapis odgovora u dosje (serijalizirano da se KB ne pregazi) ──
  const ingestAnswer = (question: string, answer: string) => {
    if (!projectId) return;
    setIngesting(true);
    ingestChainRef.current = ingestChainRef.current.then(async () => {
      try {
        const spent = spendTokens(TOKEN_COSTS.advisor_memory, language === 'en' ? 'Dossier write' : 'Zapis u dosje');
        if (!spent.ok) return; // bez tokena preskačemo sintezu, odgovor je ipak spremljen u ideju
        const data = await aiClient.updateKnowledge<{ knowledge?: ProjectKnowledge; changed?: boolean }>(
          {
            mode: 'extract',
            knowledge: knowledgeRef.current,
            userMessage: `INTERVIEW QUESTION: ${question}\nFOUNDER ANSWER: ${answer}`,
            assistantMessage: '',
          },
          t.errorGeneric
        );
        if (data.knowledge && data.changed !== false) {
          const prev = knowledgeRef.current;
          const next = data.knowledge;
          // označi sekcije s novim zapisima za "puni se" indikator
          const changed = new Set<string>();
          for (const key of SECTION_KEYS) {
            const before = (prev?.sections[key]?.memories ?? []).length + (prev?.sections[key]?.facts ?? []).length;
            const after = (next.sections[key]?.memories ?? []).length + (next.sections[key]?.facts ?? []).length;
            if (after > before) changed.add(key);
          }
          knowledgeRef.current = next;
          setKnowledge(next);
          setChangedSections(changed);
          setTimeout(() => setChangedSections(new Set()), 4000);
          await updateProjectKnowledge(projectId, next);
        }
      } catch (err) {
        console.error('Dossier ingest error:', err);
      }
    }).finally(() => setIngesting(false));
  };

  // ref drži najsvježiji KB za serijalizirane ingeste
  const knowledgeRef = useRef<ProjectKnowledge | null>(null);
  useEffect(() => {
    knowledgeRef.current = knowledge;
  }, [knowledge]);

  const persistIdea = async (nextIdea: IdeaFormData) => {
    setIdea(nextIdea);
    sessionStorage.setItem('aivalidator_form', JSON.stringify(nextIdea));
    if (projectId) {
      try {
        await updateProject(projectId, { idea: nextIdea, report });
      } catch (err) {
        console.error('Idea persist error:', err);
      }
    }
  };

  const handleAnswer = async () => {
    if (!current || !idea || !draft.trim()) return;
    const answer = draft.trim();
    const entry: LogEntry = { question: current.question, why: current.why, answer };
    const nextLog = [...log, entry];
    const nextCandidates = candidates.filter((c) => c !== current.candidate);
    setLog(nextLog);
    setCandidates(nextCandidates);
    setDraft('');
    setCurrent(null);

    const nextIdea: IdeaFormData = {
      ...idea,
      discovery_answers: [
        ...(idea.discovery_answers ?? []),
        { question: current.question, answer, category: categoryFor(current.candidate) },
      ],
    };
    void persistIdea(nextIdea);
    ingestAnswer(current.question, answer);
    void fetchNext(nextCandidates, nextLog, knowledgeRef.current, nextIdea);
  };

  const handleSkip = () => {
    if (!current || !idea) return;
    const entry: LogEntry = { question: current.question, why: current.why, answer: null };
    const nextLog = [...log, entry];
    const nextCandidates = candidates.filter((c) => c !== current.candidate);
    setLog(nextLog);
    setCandidates(nextCandidates);
    setDraft('');
    setCurrent(null);
    void fetchNext(nextCandidates, nextLog, knowledgeRef.current, idea);
  };

  const handleFinish = () => {
    setCurrent(null);
    setPhase('done');
  };

  const handleContinue = () => {
    if (!idea) return;
    setNoticeMsg('');
    void fetchNext(candidates, log, knowledgeRef.current, idea);
  };

  // ── Ponovni test s obogaćenom idejom ──
  const handleRerun = async () => {
    if (!idea || rerunning) return;
    setRerunning(true);
    setErrorMsg('');
    try {
      const spent = spendTokens(TOKEN_COSTS.validation, language === 'en' ? 'Validation re-run' : 'Ponovni test');
      if (!spent.ok) {
        throw new Error(tokenShortfallMessage(language, language === 'en' ? 'Validation re-run' : 'Ponovni test', TOKEN_COSTS.validation, spent.missing));
      }
      const baseForm: IdeaFormData = { ...idea, personas: undefined, clarifications: undefined };
      const data = await aiClient.validateIdea<ValidationReport>({ ...baseForm, language }, t.errorGeneric);
      sessionStorage.setItem('aivalidator_report', JSON.stringify(data));
      sessionStorage.setItem('aivalidator_form', JSON.stringify(baseForm));
      if (projectId) {
        await updateProject(projectId, { idea: baseForm, report: data });
      }
      router.push('/results');
    } catch (err) {
      console.error('Rerun error:', err);
      setErrorMsg(err instanceof Error ? err.message : t.errorGeneric);
      setRerunning(false);
    }
  };

  const answeredCount = useMemo(() => log.filter((entry) => entry.answer !== null).length, [log]);
  const totalQuestions = log.length + candidates.length;

  const recentMemories = useMemo(() => {
    if (!knowledge) return [];
    return SECTION_KEYS.flatMap((key) =>
      (knowledge.sections[key]?.memories ?? []).map((memory) => ({ ...memory, section: key }))
    )
      .sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at))
      .slice(0, 4);
  }, [knowledge]);

  // ── Render ──
  if (authLoading || !user || phase === 'booting') {
    return (
      <div className="paper-root flex min-h-screen flex-col items-center justify-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
        <span className="font-data text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          {noticeMsg || t.loading}
        </span>
      </div>
    );
  }

  if (phase === 'error' && !idea) {
    return (
      <div className="paper-root flex min-h-screen items-center justify-center px-4">
        <div className="sheet max-w-md p-8 text-center">
          <p className="kicker">{t.kicker}</p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--ink-soft)]">{errorMsg || t.noIdea}</p>
          <button type="button" onClick={() => router.push('/')} className="btn-ink mt-6 text-sm">
            {t.goHome}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-root min-h-screen">
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button type="button" onClick={() => router.push(report ? '/results' : '/')} className="link-ink text-sm">
            ← {t.backResults}
          </button>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => router.push('/plan')} className="link-ink text-sm">
              {t.openPlan}
            </button>
            <span className="font-data text-xs uppercase tracking-wider text-[var(--ink-faint)]">
              {t.answeredCount(answeredCount)}{totalQuestions > 0 ? ` / ${totalQuestions}` : ''}
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <section className="pt-10 sm:pt-12">
          <p className="kicker">{t.kicker}</p>
          <h1 className="mt-3 text-3xl text-[var(--ink)] sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* ── Lijevo: razgovor ── */}
          <div>
            {phase === 'intro' && (
              <div className="sheet p-6 sm:p-8">
                <p className="font-data text-xs uppercase tracking-wider text-[var(--ink-faint)]">
                  {t.introReady(candidates.length)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t.introHow}</p>
                <p className="font-data mt-4 text-[11px] text-[var(--ink-faint)]">{t.introCost}</p>
                <button type="button" onClick={handleStart} className="btn-ink mt-6 text-sm">
                  {t.start}
                </button>
              </div>
            )}

            {phase !== 'intro' && (
              <div className="space-y-5">
                {log.map((entry, index) => (
                  <div key={`${entry.question}-${index}`} className="space-y-3">
                    <div className="max-w-xl">
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        {t.interviewer}
                      </p>
                      <div className="mt-1 border-l-4 border-[var(--ink)] bg-[var(--paper-raised)] px-4 py-3">
                        <p className="text-sm leading-relaxed text-[var(--ink)]">{entry.question}</p>
                      </div>
                    </div>
                    <div className="ml-auto max-w-xl text-right">
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.you}</p>
                      {entry.answer === null ? (
                        <p className="mt-1 inline-block px-4 py-2 text-sm italic text-[var(--ink-faint)]">{t.skipped}</p>
                      ) : (
                        <div className="mt-1 inline-block border border-[var(--hairline-strong)] bg-[var(--paper)] px-4 py-3 text-left">
                          <p className="text-sm leading-relaxed text-[var(--ink)]">{entry.answer}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {phase === 'asking' && (
                  <div className="flex items-center gap-3 py-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
                    <span className="font-data text-xs uppercase tracking-wider text-[var(--ink-faint)]">{t.thinking}</span>
                  </div>
                )}

                {phase === 'waiting' && current && (
                  <div className="max-w-xl">
                    <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                      {t.interviewer}
                    </p>
                    <div className="mt-1 border-l-4 border-[var(--verdict-red)] bg-[var(--paper-raised)] px-4 py-4">
                      <p className="text-base leading-relaxed text-[var(--ink)]">{current.question}</p>
                      {current.why && (
                        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-faint)]">
                          <span className="font-data uppercase tracking-wider">{t.whyLabel}:</span> {current.why}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            void handleAnswer();
                          }
                        }}
                        rows={4}
                        placeholder={t.answerPlaceholder}
                        className="paper-field w-full resize-none text-sm"
                        autoFocus
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAnswer()}
                          disabled={!draft.trim()}
                          className="btn-ink text-sm disabled:opacity-50"
                        >
                          {t.send}
                        </button>
                        <button type="button" onClick={handleSkip} className="btn-line text-sm">
                          {t.skip}
                        </button>
                        <button type="button" onClick={handleFinish} className="link-ink ml-auto text-sm">
                          {t.finish}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {phase === 'error' && (
                  <div className="border-l-4 border-[var(--verdict-red)] bg-[var(--paper-raised)] px-4 py-3">
                    <p className="text-sm text-[var(--ink)]">{errorMsg}</p>
                    <button type="button" onClick={handleContinue} className="btn-line mt-3 text-sm">
                      {t.retry}
                    </button>
                  </div>
                )}

                {phase === 'done' && (
                  <div className="sheet p-6 sm:p-8">
                    <span className="stamp !text-[11px]" style={{ color: 'var(--verdict-green)', borderColor: 'var(--verdict-green)' }}>
                      {t.doneTitle}
                    </span>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--ink-soft)]">{t.doneText(answeredCount)}</p>
                    {noticeMsg && <p className="mt-2 text-xs italic text-[var(--ink-faint)]">{noticeMsg}</p>}
                    {errorMsg && <p className="mt-2 text-xs text-[var(--verdict-red)]">{errorMsg}</p>}
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRerun()}
                        disabled={rerunning || answeredCount === 0}
                        className="btn-ink text-sm disabled:opacity-50"
                      >
                        {rerunning ? t.rerunning : t.rerun}
                      </button>
                      {candidates.length > 0 && !rerunning && (
                        <button type="button" onClick={handleContinue} className="btn-line text-sm">
                          {t.continueAsking}
                        </button>
                      )}
                      {!rerunning && (
                        <button type="button" onClick={() => router.push('/plan')} className="link-ink text-sm">
                          {t.openPlan}
                        </button>
                      )}
                    </div>
                    {!rerunning && <p className="font-data mt-3 text-[11px] text-[var(--ink-faint)]">{t.rerunCost}</p>}
                  </div>
                )}

                <div ref={logEndRef} />
              </div>
            )}
          </div>

          {/* ── Desno: dosje se puni ── */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="kicker !mb-0">{t.dossier}</p>
                {ingesting && (
                  <span className="font-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--annotate)]">
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[var(--annotate)] border-t-transparent" />
                    {t.ingesting}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-faint)]">{t.dossierHint}</p>

              <div className="mt-4 space-y-1.5">
                {SECTION_KEYS.map((key) => {
                  const section = knowledge?.sections[key];
                  const factsCount = Math.max(section?.facts?.length ?? 0, (section?.memories ?? []).filter((m) => m.kind !== 'gap').length);
                  const gapsCount = Math.max(section?.gaps?.length ?? 0, (section?.memories ?? []).filter((m) => m.kind === 'gap').length);
                  const highlight = changedSections.has(key);
                  return (
                    <div
                      key={key}
                      className={`leader-row text-sm transition-colors duration-700 ${highlight ? 'bg-[var(--annotate)]/15' : ''}`}
                    >
                      <span className="text-[var(--ink)]">{SECTION_LABELS[key][language]}</span>
                      <span className="leader-fill" />
                      <span className="font-data text-xs text-[var(--ink-soft)]">
                        {factsCount} {t.facts}
                        {gapsCount > 0 && <span className="text-[var(--verdict-red)]"> · {gapsCount} {t.gaps}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>

              {recentMemories.length > 0 && (
                <div className="mt-5 border-t border-[var(--hairline)] pt-4">
                  <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.lastWritten}</p>
                  <ul className="mt-2 space-y-2">
                    {recentMemories.map((memory) => (
                      <li key={memory.id} className="text-xs leading-relaxed text-[var(--ink-soft)]">
                        <span className="font-data text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                          [{SECTION_LABELS[memory.section][language]}]
                        </span>{' '}
                        {memory.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
