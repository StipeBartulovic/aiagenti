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
  const bootedRef = useRef(false);

  const t = {
    hr: {
      back: '← Natrag',
      title: 'AI Savjetnici',
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
      tokenError: (missing: number) => `Priprema savjetnika treba ${formatTokens(TOKEN_COSTS.advisor_setup)} tokena. Nedostaje ${formatTokens(missing)} tokena. Klikni Dodaj 10€ u walletu za nastavak.`,
      localSaved: 'Lokalno spremljeno',
      localSaving: 'Spremam lokalno...',
      localUnsaved: 'Čeka prvo spremanje',
      localError: 'Lokalno spremanje nije uspjelo',
      savedAt: (value: string) => `Zadnje spremanje: ${value}`,
    },
    en: {
      back: '← Back',
      title: 'AI Advisors',
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
      tokenError: (missing: number) => `Advisor setup needs ${formatTokens(TOKEN_COSTS.advisor_setup)} tokens. Missing ${formatTokens(missing)} tokens. Use Add €10 in the wallet to continue.`,
      localSaved: 'Saved locally',
      localSaving: 'Saving locally...',
      localUnsaved: 'Waiting for first save',
      localError: 'Local save failed',
      savedAt: (value: string) => `Last saved: ${value}`,
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
      <nav className="border-b border-zinc-800 px-6 py-4 flex flex-col gap-3 sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(report ? '/results' : '/')}
            className="text-zinc-400 hover:text-white transition-colors text-sm cursor-pointer"
          >
            {t.back}
          </button>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-white">{t.title}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`rounded-xl border px-3 py-1.5 text-xs ${
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
          <TokenWallet language={language} compact />
        </div>
      </nav>

      <main className="px-4 py-8">
        {!idea ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900/70 p-8 text-center shadow-2xl shadow-zinc-950/30">
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
          <PanelChat
            language={language}
            knowledge={knowledge}
            initialMessages={panel}
            initialTasks={tasks}
            onPersistPanel={handlePersistPanel}
            onKnowledgeUpdate={handleKnowledgeUpdate}
            onPersistTasks={handlePersistTasks}
          />
        )}
      </main>
    </div>
  );
}
