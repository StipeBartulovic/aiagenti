'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import ObsidianSync from '@/components/ObsidianSync';
import TokenWallet from '@/components/TokenWallet';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { createProject, updateProject } from '@/lib/projects';
import type { ValidationReport, IdeaFormData } from '@/lib/types';

export default function ResultsPage() {
  const router = useRouter();
  const { user, loading, language, setLanguage } = useAuth();
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [form, setForm] = useState<IdeaFormData | null>(null);
  const [copied, setCopied] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [authPrompt, setAuthPrompt] = useState(false);
  const [showAdvancedActions, setShowAdvancedActions] = useState(false);

  useEffect(() => {
    let active = true;
    const rawReport = sessionStorage.getItem('aivalidator_report');
    if (!rawReport) {
      router.replace('/');
      return () => {
        active = false;
      };
    }
    let parsedReport: ValidationReport;
    try {
      parsedReport = JSON.parse(rawReport);
    } catch {
      router.replace('/');
      return () => {
        active = false;
      };
    }

    let parsedForm: IdeaFormData | null = null;
    const rawForm = sessionStorage.getItem('aivalidator_form');
    if (rawForm) {
      try {
        parsedForm = JSON.parse(rawForm);
      } catch {}
    }

    const savedId = sessionStorage.getItem('aivalidator_project_id');
    queueMicrotask(() => {
      if (!active) return;
      setReport(parsedReport);
      if (parsedForm) setForm(parsedForm);
      if (savedId) {
        setProjectId(savedId);
        setSaveState('saved');
        setSavedAt(new Date());
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const handleSave = async () => {
    if (!report || !form || saveState === 'saving') return;
    if (!user) {
      setAuthPrompt(true);
      return;
    }
    setSaveState('saving');
    try {
      const input = { idea: form, report };
      if (projectId) {
        await updateProject(projectId, input);
      } else {
        const newId = await createProject(user.uid, input);
        setProjectId(newId);
        sessionStorage.setItem('aivalidator_project_id', newId);
      }
      setSaveState('saved');
      setSavedAt(new Date());
    } catch (err) {
      console.error('Save error:', err);
      setSaveState('error');
    }
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewTest = () => {
    sessionStorage.removeItem('aivalidator_report');
    sessionStorage.removeItem('aivalidator_form');
    sessionStorage.removeItem('aivalidator_project_id');
    router.push('/');
  };

  const handleLanguageChange = async (targetLang: 'hr' | 'en') => {
    if (targetLang === language) return;
    if (!report) return;

    setTranslating(true);
    setTranslationError('');
    try {
      // Izdvoji teške/brojčano-kritične strukture iz prijevoda da ih LLM ne pomrsi ni ispusti.
      // Prevode se samo osnovni narativni dijelovi; ostalo se vraća netaknuto.
      const {
        personas,
        reactions,
        opportunity,
        clusters,
        conjoint,
        pricing,
        segments,
        ...restReport
      } = report;

      const data = await aiClient.translateReport<Partial<ValidationReport>>(
        { report: restReport, targetLanguage: targetLang },
        'Greška pri prijevodu'
      );

      const updatedReport = {
        ...data,
        personas,
        reactions,
        opportunity,
        clusters,
        conjoint,
        pricing,
        segments,
      } as ValidationReport;

      setReport(updatedReport);
      sessionStorage.setItem('aivalidator_report', JSON.stringify(updatedReport));
      setLanguage(targetLang);
    } catch (err: unknown) {
      setTranslationError(err instanceof Error ? err.message : language === 'en' ? 'Translation failed.' : 'Greška kod prevođenja.');
    } finally {
      setTranslating(false);
    }
  };

  const t = {
    hr: {
      back: '← Natrag',
      reportTitle: 'Izvještaj',
      copyJson: 'Kopiraj JSON',
      copied: '✓ Kopirano',
      newTest: '+ Novi test',
      simulatedBuyers: 'simuliranih kupaca',
      buy: 'Kupio bi',
      maybe: 'Možda',
      reject: 'Odbija',
      loadingText: 'Učitavam...',
      translatingText: 'Prevodim izvještaj...',
      save: 'Spremi projekt',
      saving: 'Spremam...',
      saved: '✓ Spremljeno',
      localSaved: 'Lokalno spremljeno',
      localSaving: 'Spremam lokalno...',
      localUnsaved: 'Nije spremljeno lokalno',
      localError: 'Lokalno spremanje nije uspjelo',
      savedAt: (value: string) => `Zadnje spremanje: ${value}`,
      saveError: 'Greška — pokušaj ponovno',
      myProjects: 'Moji projekti',
      advisors: '✨ AI Savjetnici',
      signInToSave: 'Prijavi se za spremanje',
      signInForAdvisors: 'Prijavi se za savjetnike',
      authPromptTitle: 'Za ovu akciju treba račun',
      authPromptText: 'Rezultat možeš čitati kao gost, ali za spremanje projekta i AI savjetnike treba prijava.',
      authPromptCta: 'Idi na prijavu',
      nextTitle: 'Što sada?',
      nextSubtitle: 'Ako nisi siguran što kliknuti, kreni ovim redom.',
      nextSave: '1. Spremi projekt',
      nextAdvisors: '2. Pitaj AI savjetnike',
      nextNew: '3. Testiraj drugu verziju',
      moreActions: 'Više opcija',
      hideActions: 'Sakrij opcije',
      advancedActions: 'Napredne opcije',
      advancedActionsHelp: 'Za izvoz, Obsidian i tehničke kopije. Većini korisnika ovo ne treba odmah.',
      translationErrorTitle: 'Prijevod nije uspio',
      translationErrorHelp: 'Izvještaj je ostao netaknut. Pokušaj ponovno za par sekundi.',
    },
    en: {
      back: '← Back',
      reportTitle: 'Report',
      copyJson: 'Copy JSON',
      copied: '✓ Copied',
      newTest: '+ New Test',
      simulatedBuyers: 'simulated buyers',
      buy: 'Would buy',
      maybe: 'Maybe',
      reject: 'Rejects',
      loadingText: 'Loading...',
      translatingText: 'Translating report...',
      save: 'Save project',
      saving: 'Saving...',
      saved: '✓ Saved',
      localSaved: 'Saved locally',
      localSaving: 'Saving locally...',
      localUnsaved: 'Not saved locally',
      localError: 'Local save failed',
      savedAt: (value: string) => `Last saved: ${value}`,
      saveError: 'Error — try again',
      myProjects: 'My projects',
      advisors: '✨ AI Advisors',
      signInToSave: 'Sign in to save',
      signInForAdvisors: 'Sign in for advisors',
      authPromptTitle: 'This action needs an account',
      authPromptText: 'You can read the result as a guest, but saving projects and AI advisors require sign-in.',
      authPromptCta: 'Go to sign-in',
      nextTitle: 'What now?',
      nextSubtitle: 'If you are not sure what to click, start in this order.',
      nextSave: '1. Save project',
      nextAdvisors: '2. Ask AI advisors',
      nextNew: '3. Test another version',
      moreActions: 'More options',
      hideActions: 'Hide options',
      advancedActions: 'Advanced options',
      advancedActionsHelp: 'For exports, Obsidian, and technical copies. Most users do not need this immediately.',
      translationErrorTitle: 'Translation failed',
      translationErrorHelp: 'The report was left unchanged. Try again in a few seconds.',
    }
  }[language];
  const showAuthPrompt = authPrompt && !user;
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

  if (loading || !report) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">{t.loadingText}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative">
      {translating && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="w-8 h-8 border-4 border-zinc-800 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-zinc-300 text-sm font-medium">{t.translatingText}</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="border-b border-zinc-800 px-4 py-4 flex flex-col gap-3 sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={handleNewTest}
            className="text-zinc-400 hover:text-white transition-colors text-sm flex items-center gap-1.5 cursor-pointer"
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
            <span className="truncate font-semibold text-sm text-white">
              {t.reportTitle}: {report.meta.product_name}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:gap-4">
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

          {/* Language Switcher */}
          <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              onClick={() => handleLanguageChange('hr')}
              disabled={translating}
              className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                language === 'hr' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              HR
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              disabled={translating}
              className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                language === 'en' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              EN
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => user ? router.push('/advisors') : setAuthPrompt(true)}
              className="text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              {user ? t.advisors : t.signInForAdvisors}
            </button>
            <button
              onClick={() => router.push('/projects')}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer hidden sm:inline-block"
            >
              {t.myProjects}
            </button>
            <button
              onClick={() => setShowAdvancedActions((value) => !value)}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
            >
              {showAdvancedActions ? t.hideActions : t.moreActions}
            </button>
            <button
              onClick={handleSave}
              disabled={saveState === 'saving' || saveState === 'saved'}
              className={`text-xs rounded-lg px-3 py-1.5 transition-colors cursor-pointer border ${
                saveState === 'saved'
                  ? 'border-green-700/50 bg-green-950/40 text-green-400 cursor-default'
                  : saveState === 'error'
                  ? 'border-red-700/50 bg-red-950/40 text-red-300'
                  : 'border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {saveState === 'saving'
                ? t.saving
                : saveState === 'saved'
                ? t.saved
                : saveState === 'error'
                ? t.saveError
                : user ? t.save : t.signInToSave}
            </button>
            <button
              onClick={handleNewTest}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
            >
              {t.newTest}
            </button>
          </div>
        </div>
      </nav>

      {showAdvancedActions && (
        <div className="border-b border-zinc-800 bg-zinc-950/95 px-6 py-3">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t.advancedActions}</p>
              <p className="mt-1 text-xs text-zinc-600">{t.advancedActionsHelp}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ObsidianSync report={report} form={form} language={language} />
              <button
                onClick={handleCopy}
                className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
              >
                {copied ? t.copied : t.copyJson}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score header strip */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">{report.meta.product_name}</h1>
            <p className="text-sm text-zinc-400">{report.meta.personas_count} {t.simulatedBuyers}</p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center sm:flex sm:items-center sm:gap-6">
            <div>
              <div className="text-2xl font-bold" style={{
                color: report.score >= 60 ? '#22c55e' : report.score >= 35 ? '#eab308' : '#ef4444'
              }}>
                {report.score}
              </div>
              <div className="text-xs text-zinc-500">Viability Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-500">{report.intent.buy}%</div>
              <div className="text-xs text-zinc-500">{t.buy}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{report.intent.maybe}%</div>
              <div className="text-xs text-zinc-500">{t.maybe}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{report.intent.reject}%</div>
              <div className="text-xs text-zinc-500">{t.reject}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <div className="px-4 py-8">
        {showAuthPrompt && (
          <div className="mx-auto mb-6 max-w-7xl rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-200">{t.authPromptTitle}</p>
                <p className="mt-1 text-xs text-amber-100/70">{t.authPromptText}</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-zinc-950 hover:bg-amber-200"
              >
                {t.authPromptCta}
              </button>
            </div>
          </div>
        )}
        {translationError && (
          <div className="mx-auto mb-6 max-w-7xl rounded-2xl border border-red-900/60 bg-red-950/25 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-red-100">{t.translationErrorTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-red-200/80">{translationError}</p>
                <p className="mt-1 text-xs text-zinc-500">{t.translationErrorHelp}</p>
              </div>
              <button
                type="button"
                onClick={() => setTranslationError('')}
                className="rounded-xl border border-red-800/60 px-4 py-2 text-xs font-bold text-red-100 transition-colors hover:border-red-500"
              >
                OK
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto mb-6 max-w-7xl rounded-2xl border border-indigo-900/50 bg-gradient-to-r from-indigo-950/30 via-zinc-900 to-zinc-950 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-white">{t.nextTitle}</p>
              <p className="mt-1 text-xs text-zinc-500">{t.nextSubtitle}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className={`rounded-xl px-4 py-3 text-left text-xs font-bold transition-colors ${
                  saveState === 'saved'
                    ? 'border border-emerald-800/50 bg-emerald-950/30 text-emerald-300'
                    : 'border border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:border-emerald-700'
                }`}
              >
                {saveState === 'saved' ? t.saved : saveState === 'saving' ? t.saving : user ? t.nextSave : t.signInToSave}
              </button>
              <button
                type="button"
                onClick={() => user ? router.push('/advisors') : setAuthPrompt(true)}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left text-xs font-bold text-zinc-200 transition-colors hover:border-indigo-700"
              >
                {user ? t.nextAdvisors : t.signInForAdvisors}
              </button>
              <button
                type="button"
                onClick={handleNewTest}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left text-xs font-bold text-zinc-200 transition-colors hover:border-cyan-700"
              >
                {t.nextNew}
              </button>
            </div>
          </div>
        </div>
        <Dashboard 
          report={report} 
          form={form} 
          onUpdateReport={(newReport) => {
            setReport(newReport);
            sessionStorage.setItem('aivalidator_report', JSON.stringify(newReport));
            if (projectId && user && form) {
              setSaveState('saving');
              updateProject(projectId, { idea: form, report: newReport })
                .then(() => {
                  setSaveState('saved');
                  setSavedAt(new Date());
                })
                .catch((err) => {
                  console.error('Auto-save updated report error:', err);
                  setSaveState('error');
                });
            } else {
              setSaveState('idle');
            }
          }}
        />
      </div>
    </div>
  );
}
