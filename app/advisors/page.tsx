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
} from '@/lib/projects';
import OnboardingChat from '@/components/OnboardingChat';
import PanelChat from '@/components/PanelChat';
import TokenWallet from '@/components/TokenWallet';
import { aiClient } from '@/lib/ai-client';
import { TOKEN_COSTS, formatTokens, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import { ChevronDown, ChevronUp, Menu, Settings2 } from 'lucide-react';
import type {
  IdeaFormData,
  ValidationReport,
  ProjectKnowledge,
  ChatMessage,
  ProjectTask,
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
  const [seeding, setSeeding] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [fatalError, setFatalError] = useState('');
  const [showMobileUtilities, setShowMobileUtilities] = useState(false);
  const bootedRef = useRef(false);

  const t = {
    hr: {
      back: '← Natrag',
      title: 'Next-step savjetnici',
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
      localSaved: 'Lokalno spremljeno',
      localSaving: 'Spremam lokalno...',
      localUnsaved: 'Čeka prvo spremanje',
      localError: 'Lokalno spremanje nije uspjelo',
      savedAt: (value: string) => `Zadnje spremanje: ${value}`,
      subtitle: 'Najprije Research i Positioning smjer, pa tek onda ostali specijalisti ako zatrebaju.',
      utilities: 'Alati i status',
      hideUtilities: 'Sakrij',
      showUtilities: 'Prikaži',
      mobileHintTitle: 'Kreni od sljedeceg poteza',
      mobileHintText: 'Na telefonu prvo otvori Research ili Positioning smjer u panelu, pa tek onda idi u plan i taskove.',
      workspaceReady: 'Workspace je spreman',
      workspaceReadyText: 'Projekt, memorija i razgovor su spojeni. Sve sto napravis ovdje sprema se lokalno uz ovaj projekt.',
    },
    en: {
      back: '← Back',
      title: 'Next-step advisors',
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
      localSaved: 'Saved locally',
      localSaving: 'Saving locally...',
      localUnsaved: 'Waiting for first save',
      localError: 'Local save failed',
      savedAt: (value: string) => `Last saved: ${value}`,
      subtitle: 'Start with Research and Positioning, then bring in the other specialists only when needed.',
      utilities: 'Tools and status',
      hideUtilities: 'Hide',
      showUtilities: 'Show',
      mobileHintTitle: 'Start from the next move',
      mobileHintText: 'On phone, begin with the Research or Positioning path inside the panel before jumping into plan and tasks.',
      workspaceReady: 'Workspace is ready',
      workspaceReadyText: 'The project, memory, and conversation are connected. Everything you do here is saved locally with this project.',
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
      const spent = spendTokens(TOKEN_COSTS.advisor_setup);
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

  // ── Render states ──
  if (authLoading || !user || booting) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="mx-4 max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-center shadow-2xl shadow-indigo-950/20">
          <span className="mx-auto mb-4 block w-9 h-9 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
          <h1 className="text-lg font-semibold text-white">{t.bootingTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.booting}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => router.push(report ? '/results' : '/')}
                className="text-zinc-400 hover:text-white transition-colors text-sm cursor-pointer"
              >
                {t.back}
              </button>
              <span className="text-zinc-700">|</span>
              <div className="min-w-0 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-950/30">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" fill="white" fillOpacity="0.9" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{t.title}</span>
                  <p className="mt-0.5 text-xs text-zinc-500">{t.subtitle}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileUtilities((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white lg:hidden"
            >
              <Menu className="h-3.5 w-3.5" />
              {showMobileUtilities ? t.hideUtilities : t.showUtilities}
              {showMobileUtilities ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className={`${showMobileUtilities ? 'flex' : 'hidden'} flex-col gap-3 rounded-[1.6rem] border border-zinc-800/80 bg-zinc-900/50 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.14)] lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <TokenWallet language={language} compact />
              <button
                type="button"
                onClick={() => router.push('/settings')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                title={language === 'en' ? 'Open settings' : 'Otvori postavke'}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {language === 'en' ? 'Settings' : 'Postavke'}
              </button>
            </div>
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${
                saveState === 'saved'
                  ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-200'
                  : saveState === 'saving'
                  ? 'border-cyan-800/50 bg-cyan-950/30 text-cyan-100'
                  : saveState === 'error'
                  ? 'border-red-800/60 bg-red-950/30 text-red-200'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400'
              }`}
              title={savedAtLabel ? t.savedAt(savedAtLabel) : localSaveLabel}
            >
              <span className="font-semibold">{localSaveLabel}</span>
              {savedAtLabel && saveState === 'saved' && (
                <span className="ml-2 hidden text-zinc-400 sm:inline">{savedAtLabel}</span>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="px-4 py-6 sm:py-8">
        {!idea ? (
          <div className="mx-auto max-w-xl rounded-[1.8rem] border border-zinc-800 bg-zinc-900/70 p-8 text-center shadow-2xl shadow-zinc-950/30">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/15 text-indigo-200">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4V20M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">{t.noProjectTitle}</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{t.noProject}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 cursor-pointer"
            >
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
              <div className="mx-auto max-w-2xl rounded-2xl border border-red-900/60 bg-red-950/25 p-4">
                <h2 className="text-sm font-semibold text-red-100">{t.errorTitle}</h2>
                <p className="mt-1 text-sm leading-relaxed text-red-200/80">{fatalError}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t.errorHelp}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleRetrySeed}
                    disabled={seeding}
                    className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {seeding ? t.bootingTitle : t.retrySeed}
                  </button>
                  {report && (
                    <button
                      type="button"
                      onClick={() => router.push('/results')}
                      className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                    >
                      {t.backToResults}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                  >
                    {t.goValidate}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[1.4rem] border border-emerald-900/40 bg-emerald-950/10 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-100">{t.workspaceReady}</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-100/75">{t.workspaceReadyText}</p>
                </div>
                <div
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    saveState === 'saved'
                      ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-200'
                      : saveState === 'saving'
                      ? 'border-cyan-800/50 bg-cyan-950/30 text-cyan-100'
                      : saveState === 'error'
                      ? 'border-red-800/60 bg-red-950/30 text-red-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}
                  title={savedAtLabel ? t.savedAt(savedAtLabel) : localSaveLabel}
                >
                  <span className="font-semibold">{localSaveLabel}</span>
                </div>
              </div>
            </div>
            <div className="rounded-[1.4rem] border border-cyan-900/40 bg-cyan-950/10 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.12)] lg:hidden">
              <p className="text-sm font-bold text-cyan-100">{t.mobileHintTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-cyan-100/75">{t.mobileHintText}</p>
            </div>
            <PanelChat
              language={language}
              knowledge={knowledge}
              initialMessages={panel}
              initialTasks={tasks}
              onPersistPanel={handlePersistPanel}
              onKnowledgeUpdate={handleKnowledgeUpdate}
              onPersistTasks={handlePersistTasks}
            />
          </div>
        )}
      </main>
    </div>
  );
}
