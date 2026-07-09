'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  createProject,
  getProject,
  updateProjectKnowledge,
  updateProjectPanel,
  updateProjectTasks,
  updateProjectDigests,
} from '@/lib/projects';
import OnboardingChat from '@/components/OnboardingChat';
import PanelChat from '@/components/PanelChat';
import TokenWallet from '@/components/TokenWallet';
import ReadinessMeter from '@/components/ReadinessMeter';
import { aiClient } from '@/lib/ai-client';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type {
  IdeaFormData,
  ValidationReport,
  ProjectKnowledge,
  ChatMessage,
  ProjectTask,
  SessionDigest,
  MarketIntelligence,
} from '@/lib/types';

export default function AdvisorsPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();

  const [booting, setBooting] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [idea, setIdea] = useState<IdeaFormData | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [knowledge, setKnowledge] = useState<ProjectKnowledge | null>(null);
  const [panel, setPanel] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [digests, setDigests] = useState<SessionDigest[]>([]);
  const [market, setMarket] = useState<MarketIntelligence | null>(null);
  const [prefillInput, setPrefillInput] = useState('');

  useEffect(() => {
    const prefill = sessionStorage.getItem('aivalidator_advisor_prefill');
    if (prefill) {
      setPrefillInput(prefill);
      sessionStorage.removeItem('aivalidator_advisor_prefill');
    }
  }, []);
  const [seeding, setSeeding] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [fatalError, setFatalError] = useState('');
  const bootedRef = useRef(false);

  const t = {
    hr: {
      kicker: 'Protokol — savjetnici',
      home: '← Početna',
      title: 'Next-step savjetnici',
      subtitle: 'Šest savjetnika sjedi s druge strane stola i sluša svaki tvoj unos. Kad netko ima konkretan doprinos, podigne ruku — klikni ga da mu daš riječ. Klikni bilo koga izravno da ga pitaš za mišljenje. Sve se sprema lokalno uz ovaj projekt.',
      bootingTitle: 'Pripremam AI savjetnike',
      booting: 'Spajam projekt, izvještaj i memoriju. Ovo obično traje par sekundi.',
      noProjectTitle: 'Još nema projekta za savjetnike',
      noProject: 'Savjetnici trebaju barem jednu validiranu ideju ili spremljeni izvještaj da bi znali o čemu razgovaraju.',
      goValidate: 'Validiraj ideju',
      backToResults: 'Vrati se na izvještaj',
      errorTitle: 'Nismo uspjeli pripremiti savjetnike',
      errorHelp: 'Možeš pokušati ponovno bez dodatnog razgovora ili se vratiti na izvještaj i nastaviti od tamo.',
      retrySeed: 'Pokušaj ponovno',
      seedError: 'Greška pri pripremi savjetnika. Pokušaj ponovno.',
      tokenError: (missing: number) => tokenShortfallMessage('hr', 'Priprema savjetnika', TOKEN_COSTS.advisor_setup, missing),
      localSaved: 'Spremljeno',
      localSaving: 'Spremam...',
      localUnsaved: 'Čeka prvo spremanje',
      localError: 'Spremanje nije uspjelo',
      savedAt: (value: string) => `Zadnje spremanje: ${value}`,
      plan: 'Biznis plan',
      market: 'Tržište',
      settings: 'Postavke',
    },
    en: {
      kicker: 'Protocol — advisors',
      home: '← Home',
      title: 'Next-step advisors',
      subtitle: 'Six advisors sit across the table and listen to everything you type. When one of them has something concrete to add, they raise a hand — click them to give the floor. Click anyone directly to ask for their take. Everything here saves locally with this project.',
      bootingTitle: 'Preparing AI advisors',
      booting: 'Connecting your project, report, and memory. This usually takes a few seconds.',
      noProjectTitle: 'No project for advisors yet',
      noProject: 'Advisors need at least one validated idea or saved report so they know what to discuss.',
      goValidate: 'Validate an idea',
      backToResults: 'Back to report',
      errorTitle: 'We could not prepare advisors',
      errorHelp: 'You can retry without the extra chat or go back to the report and continue there.',
      retrySeed: 'Try again',
      seedError: 'Error preparing advisors. Try again.',
      tokenError: (missing: number) => tokenShortfallMessage('en', 'Advisor setup', TOKEN_COSTS.advisor_setup, missing),
      localSaved: 'Saved',
      localSaving: 'Saving...',
      localUnsaved: 'Waiting for first save',
      localError: 'Save failed',
      savedAt: (value: string) => `Last saved: ${value}`,
      plan: 'Business plan',
      market: 'Market',
      settings: 'Settings',
    },
  }[language];

  const markSaving = () => setSaveState('saving');
  const markSaved = () => {
    setSaveState('saved');
    setSavedAt(new Date());
  };
  const markSaveError = (err: unknown) => {
    console.error('Advisor auto-save error:', err);
    setSaveState('error');
  };

  const savedAtLabel = savedAt
    ? savedAt.toLocaleString(language === 'en' ? 'en-US' : 'hr-HR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
  const localSaveLabel =
    saveState === 'saving'
      ? t.localSaving
      : saveState === 'error'
      ? t.localError
      : saveState === 'saved'
      ? t.localSaved
      : t.localUnsaved;

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [user, authLoading, router]);

  // Boot: učitaj/spremi projekt + njegovu bazu znanja
  useEffect(() => {
    if (!user || bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      const rawForm = sessionStorage.getItem('aivalidator_form');
      const rawReport = sessionStorage.getItem('aivalidator_report');
      if (!rawForm) {
        setBooting(false);
        return; // nema ideje → prikazujemo "noProject"
      }

      const parsedIdea: IdeaFormData = JSON.parse(rawForm);
      const parsedReport: ValidationReport | null = rawReport ? JSON.parse(rawReport) : null;
      setIdea(parsedIdea);
      setReport(parsedReport);

      const savedId = sessionStorage.getItem('aivalidator_project_id');

      try {
        if (savedId) {
          const proj = await getProject(savedId, user.uid);
          if (proj) {
            setProjectId(proj.id);
            setIdea(proj.idea);
            setReport(proj.report);
            setKnowledge(proj.knowledge);
            setPanel(proj.panel || []);
            setTasks(proj.tasks || []);
            setDigests(proj.digests || []);
            setMarket(proj.market ?? null);
            setSaveState('saved');
            setSavedAt(new Date(proj.updated_at || proj.created_at));
            setBooting(false);
            return;
          }
        }
        // nema spremljenog projekta → kreiraj ga (advisori traže trajan dom za bazu znanja)
        const newId = await createProject(user.uid, { idea: parsedIdea, report: parsedReport });
        sessionStorage.setItem('aivalidator_project_id', newId);
        setProjectId(newId);
        markSaved();
        setBooting(false);
      } catch (err) {
        console.error('Boot error:', err);
        setFatalError(t.seedError);
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleOnboardingComplete = async (transcript: { role: 'user' | 'assistant'; content: string }[]) => {
    if (!projectId || !idea) return;
    setSeeding(true);
    setFatalError('');
    try {
      const spent = spendTokens(TOKEN_COSTS.advisor_setup, 'Priprema savjetnika');
      if (!spent.ok) {
        throw new Error(t.tokenError(spent.missing));
      }
      const data = await aiClient.updateKnowledge<{ knowledge?: ProjectKnowledge }>(
        { mode: 'seed', idea, report, intakeTranscript: transcript },
        t.seedError
      );
      if (!data.knowledge) throw new Error(t.seedError);
      const kb: ProjectKnowledge = data.knowledge;
      setKnowledge(kb);
      markSaving();
      await updateProjectKnowledge(projectId, kb);
      markSaved();
    } catch (err) {
      console.error('Seed error:', err);
      setFatalError(err instanceof Error ? err.message : t.seedError);
    } finally {
      setSeeding(false);
    }
  };

  const handleRetrySeed = () => {
    if (!seeding) void handleOnboardingComplete([]);
  };

  const handlePersistPanel = (messages: ChatMessage[]) => {
    setPanel(messages);
    if (projectId) {
      markSaving();
      void updateProjectPanel(projectId, messages).then(markSaved).catch(markSaveError);
    }
  };

  const handleKnowledgeUpdate = (kb: ProjectKnowledge) => {
    setKnowledge(kb);
    if (projectId) {
      markSaving();
      void updateProjectKnowledge(projectId, kb).then(markSaved).catch(markSaveError);
    }
  };

  const handlePersistTasks = (nextTasks: ProjectTask[]) => {
    setTasks(nextTasks);
    if (projectId) {
      markSaving();
      void updateProjectTasks(projectId, nextTasks).then(markSaved).catch(markSaveError);
    }
  };

  const handlePersistDigests = (nextDigests: SessionDigest[]) => {
    setDigests(nextDigests);
    if (projectId) {
      markSaving();
      void updateProjectDigests(projectId, nextDigests).then(markSaved).catch(markSaveError);
    }
  };

  const saveStatusStyle: Record<typeof saveState, string> = {
    saved: 'var(--verdict-green)',
    saving: 'var(--annotate)',
    error: 'var(--verdict-red)',
    idle: 'var(--ink-faint)',
  };

  // ── Render states ──
  if (authLoading || !user || booting) {
    return (
      <div className="paper-root paper-advisors flex min-h-screen flex-col items-center justify-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
        <span className="font-data text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">{t.bootingTitle}</span>
        <p className="max-w-xs text-center text-xs leading-relaxed text-[var(--ink-faint)]">{t.booting}</p>
      </div>
    );
  }

  return (
    <div className="paper-root paper-advisors min-h-screen">
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button type="button" onClick={() => router.push(report ? '/results' : '/')} className="link-ink text-sm">
            {t.home}
          </button>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => router.push('/plan')} className="link-ink text-sm">
              {t.plan}
            </button>
            <button type="button" onClick={() => router.push('/market')} className="link-ink text-sm">
              {t.market}
            </button>
            <button type="button" onClick={() => router.push('/settings')} className="link-ink text-sm">
              {t.settings}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <section className="pt-10 sm:pt-12">
          <p className="kicker">{t.kicker}</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h1 className="text-3xl text-[var(--ink)] sm:text-4xl">{t.title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
            </div>
            {idea && (
              <span
                className="font-data whitespace-nowrap text-[11px] uppercase tracking-wider"
                style={{ color: saveStatusStyle[saveState] }}
                title={savedAtLabel ? t.savedAt(savedAtLabel) : localSaveLabel}
              >
                ● {localSaveLabel}
              </span>
            )}
          </div>

          {idea && (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <TokenWallet language={language} compact />
              {knowledge && <ReadinessMeter language={language} input={{ report, knowledge, idea, market }} variant="compact" />}
            </div>
          )}
        </section>

        <div className="mt-8">
          {!idea ? (
            <div className="sheet mx-auto max-w-xl p-8 text-center">
              <p className="kicker">{t.kicker}</p>
              <h2 className="mt-3 text-2xl text-[var(--ink)]">{t.noProjectTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t.noProject}</p>
              <button onClick={() => router.push('/')} className="btn-ink mt-6 text-sm">
                {t.goValidate}
              </button>
            </div>
          ) : !knowledge ? (
            <div className="space-y-4">
              <OnboardingChat
                language={language}
                seeding={seeding}
                ideaSummary={`Product: ${idea.product_name} (${idea.business_model}). Pitch: ${idea.elevator_pitch}. ${idea.detailed_description || ''} ${idea.b2b2c_consumer_description || ''} ${idea.b2b2c_business_description || ''} Price: ${idea.price_model}.`}
                onComplete={handleOnboardingComplete}
              />
              {fatalError && (
                <div className="sheet mx-auto max-w-2xl border-l-4 !border-l-[var(--verdict-red)] p-4">
                  <h2 className="text-sm font-semibold text-[var(--ink)]">{t.errorTitle}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{fatalError}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--ink-faint)]">{t.errorHelp}</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleRetrySeed}
                      disabled={seeding}
                      className="btn-ink text-sm disabled:opacity-60"
                    >
                      {seeding ? t.bootingTitle : t.retrySeed}
                    </button>
                    {report && (
                      <button type="button" onClick={() => router.push('/results')} className="btn-line text-sm">
                        {t.backToResults}
                      </button>
                    )}
                    <button type="button" onClick={() => router.push('/')} className="link-ink text-sm">
                      {t.goValidate}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <PanelChat
              language={language}
              knowledge={knowledge}
              market={market}
              initialMessages={panel}
              initialTasks={tasks}
              initialDigests={digests}
              initialInput={prefillInput}
              onPersistPanel={handlePersistPanel}
              onKnowledgeUpdate={handleKnowledgeUpdate}
              onPersistTasks={handlePersistTasks}
              onPersistDigests={handlePersistDigests}
            />
          )}
        </div>
      </main>
    </div>
  );
}
