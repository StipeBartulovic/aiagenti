'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  listProjects,
  deleteProject,
  exportProject,
  importProjectFromText,
  exportWorkspace,
  restoreWorkspaceFromText,
  eraseAllLocalProjects,
} from '@/lib/projects';
import type { SavedProject } from '@/lib/types';

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedProject | null>(null);
  const [pendingEraseAll, setPendingEraseAll] = useState(false);

  const t = {
    hr: {
      back: '← Natrag',
      title: 'Moji projekti',
      subtitle: 'Tvoji spremljeni projekti i izvještaji.',
      empty: 'Još nemaš spremljenih projekata.',
      emptyHelp: 'Pokreni prvi test bez straha. Projekt možeš spremiti nakon izvještaja.',
      emptyCta: 'Validiraj svoju prvu ideju',
      open: 'Otvori izvještaj',
      noReport: 'Nema izvještaja',
      advisors: 'Savjetnici',
      advisorsHelp: 'Razgovaraj o sljedećim potezima',
      delete: 'Obriši',
      exportFile: 'Izvezi',
      importFile: 'Uvezi .ai-project',
      backupWorkspace: 'Backup workspacea',
      restoreWorkspace: 'Vrati workspace',
      eraseAll: 'Obriši sve lokalno',
      eraseAllTitle: 'Obrisati sve lokalne projekte?',
      eraseAllHelp: 'Ovo briše sve projekte spremljene u lokalnoj bazi ovog browsera. Prije toga napravi backup ako želiš zadržati kopiju.',
      confirmEraseAll: 'Da, obriši sve',
      localTitle: 'Lokalna pohrana',
      localHelp: 'Podaci su na ovom uređaju. Backup spremi sve projekte u jedan .ai-workspace file koji možeš prenijeti ili arhivirati.',
      importError: 'Ne mogu uvesti ovu datoteku.',
      restoreError: 'Ne mogu vratiti workspace iz ove datoteke.',
      restored: (count: number) => `Workspace vracen. Ucitano projekata: ${count}.`,
      erased: 'Svi lokalni projekti su obrisani.',
      deleting: 'Brišem...',
      deleteTitle: 'Obrisati projekt?',
      deleteHelp: 'Ovo će ukloniti spremljeni projekt iz tvoje liste. Ako nisi siguran, samo odustani.',
      cancel: 'Odustani',
      confirmDelete: 'Da, obriši',
      loadingText: 'Učitavam projekte...',
      errorText: 'Greška pri učitavanju projekata.',
      buyers: 'kupaca',
      draft: 'Skica',
      validated: 'Validirano',
    },
    en: {
      back: '← Back',
      title: 'My projects',
      subtitle: 'Your saved projects and reports.',
      empty: 'You have no saved projects yet.',
      emptyHelp: 'Run your first test without pressure. You can save a project after the report.',
      emptyCta: 'Validate your first idea',
      open: 'Open report',
      noReport: 'No report',
      advisors: 'Advisors',
      advisorsHelp: 'Discuss next moves',
      delete: 'Delete',
      exportFile: 'Export',
      importFile: 'Import .ai-project',
      backupWorkspace: 'Backup workspace',
      restoreWorkspace: 'Restore workspace',
      eraseAll: 'Erase all local',
      eraseAllTitle: 'Erase all local projects?',
      eraseAllHelp: 'This deletes every project saved in this browser database. Create a backup first if you want to keep a copy.',
      confirmEraseAll: 'Yes, erase all',
      localTitle: 'Local storage',
      localHelp: 'Data is on this device. Backup saves all projects into one .ai-workspace file you can move or archive.',
      importError: 'Could not import this file.',
      restoreError: 'Could not restore this workspace file.',
      restored: (count: number) => `Workspace restored. Projects loaded: ${count}.`,
      erased: 'All local projects were erased.',
      deleting: 'Deleting...',
      deleteTitle: 'Delete project?',
      deleteHelp: 'This will remove the saved project from your list. If you are not sure, cancel.',
      cancel: 'Cancel',
      confirmDelete: 'Yes, delete',
      loadingText: 'Loading projects...',
      errorText: 'Error loading projects.',
      buyers: 'buyers',
      draft: 'Draft',
      validated: 'Validated',
    },
  }[language];

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await listProjects(user.uid);
        if (active) setProjects(data);
      } catch (err) {
        console.error('List projects error:', err);
        if (active) setError(t.errorText);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, t.errorText]);

  const handleOpen = (project: SavedProject) => {
    if (!project.report) return;
    sessionStorage.setItem('aivalidator_report', JSON.stringify(project.report));
    sessionStorage.setItem('aivalidator_form', JSON.stringify(project.idea));
    sessionStorage.setItem('aivalidator_project_id', project.id);
    router.push('/results');
  };

  const handleOpenAdvisors = (project: SavedProject) => {
    sessionStorage.setItem('aivalidator_form', JSON.stringify(project.idea));
    if (project.report) {
      sessionStorage.setItem('aivalidator_report', JSON.stringify(project.report));
    } else {
      sessionStorage.removeItem('aivalidator_report');
    }
    sessionStorage.setItem('aivalidator_project_id', project.id);
    router.push('/advisors');
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setPendingDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      setError(t.errorText);
    } finally {
      setDeletingId(null);
    }
  };

  const refreshProjects = async () => {
    if (!user) return;
    setProjects(await listProjects(user.uid));
  };

  const handleExport = (project: SavedProject) => {
    const blob = exportProject(project);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = project.summary.product_name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    a.href = url;
    a.download = `${safeName}.ai-project`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      await importProjectFromText(await file.text());
      await refreshProjects();
    } catch (err) {
      console.error('Import error:', err);
      setError(t.importError);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWorkspaceBackup = async () => {
    setError('');
    setNotice('');
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(await exportWorkspace(), `aivalidator-workspace-${date}.ai-workspace`);
  };

  const handleWorkspaceRestore = async (file: File | null) => {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const count = await restoreWorkspaceFromText(await file.text());
      await refreshProjects();
      setNotice(t.restored(count));
    } catch (err) {
      console.error('Restore workspace error:', err);
      setError(t.restoreError);
    }
  };

  const handleEraseAll = async () => {
    setError('');
    setNotice('');
    await eraseAllLocalProjects();
    sessionStorage.removeItem('aivalidator_report');
    sessionStorage.removeItem('aivalidator_form');
    sessionStorage.removeItem('aivalidator_project_id');
    await refreshProjects();
    setPendingEraseAll(false);
    setNotice(t.erased);
  };

  const scoreColor = (score: number | null) => {
    if (score === null) return '#71717a';
    return score >= 60 ? '#22c55e' : score >= 35 ? '#eab308' : '#ef4444';
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">{t.loadingText}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-900/50 bg-red-950/30 text-red-300">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 7H18M10 11V17M14 11V17M9 7L10 4H14L15 7M8 7L9 20H15L16 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">{t.deleteTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.deleteHelp}</p>
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="truncate text-sm font-semibold text-zinc-100">{pendingDelete.summary.product_name}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{pendingDelete.summary.elevator_pitch}</p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId === pendingDelete.id}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(pendingDelete.id)}
                disabled={deletingId === pendingDelete.id}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === pendingDelete.id ? t.deleting : t.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingEraseAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-red-900/60 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
            <h2 className="text-xl font-bold text-white">{t.eraseAllTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t.eraseAllHelp}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingEraseAll(false)}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleEraseAll}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                {t.confirmEraseAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="border-b border-zinc-800 px-4 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
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
            <span className="font-semibold text-sm text-white">{t.title}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{t.title}</h1>
              <p className="text-zinc-400 text-sm">{t.subtitle}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-cyan-800/60 bg-cyan-950/20 px-4 py-2 text-sm font-bold text-cyan-100 transition-colors hover:border-cyan-500 hover:text-white">
              {t.importFile}
              <input
                type="file"
                accept=".ai-project,application/json"
                className="hidden"
                onChange={(event) => {
                  void handleImport(event.target.files?.[0] ?? null);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="w-8 h-8 border-4 border-zinc-800 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {notice && !loading && (
          <div className="mb-4 rounded-lg bg-emerald-950/30 border border-emerald-800/50 px-4 py-3 text-emerald-200 text-sm">
            {notice}
          </div>
        )}

        {!loading && (
          <section className="mb-6 rounded-2xl border border-cyan-900/40 bg-cyan-950/10 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-cyan-100">{t.localTitle}</h2>
                <p className="mt-1 text-xs leading-relaxed text-cyan-100/60">{t.localHelp}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleWorkspaceBackup}
                  className="rounded-xl border border-cyan-700/60 bg-cyan-950/30 px-3 py-2 text-xs font-bold text-cyan-100 transition-colors hover:border-cyan-400 hover:text-white"
                >
                  {t.backupWorkspace}
                </button>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
                  {t.restoreWorkspace}
                  <input
                    type="file"
                    accept=".ai-workspace,application/json"
                    className="hidden"
                    onChange={(event) => {
                      void handleWorkspaceRestore(event.target.files?.[0] ?? null);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPendingEraseAll(true)}
                  className="rounded-xl border border-red-900/60 px-3 py-2 text-xs font-bold text-red-300 transition-colors hover:border-red-500 hover:text-red-100"
                >
                  {t.eraseAll}
                </button>
              </div>
            </div>
          </section>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-20 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-900/50 bg-indigo-950/30 text-2xl">
              ✦
            </div>
            <div>
              <p className="font-semibold text-white">{t.empty}</p>
              <p className="mt-1 text-sm text-zinc-500">{t.emptyHelp}</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer"
            >
              {t.emptyCta}
            </button>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="grid max-w-full gap-3 overflow-hidden">
            {projects.map((project) => (
              <div
                key={project.id}
                className="grid max-w-full grid-cols-1 gap-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700 sm:grid-cols-[auto,minmax(0,1fr)] sm:items-center lg:grid-cols-[auto,minmax(0,1fr),11rem]"
              >
                {/* Score badge */}
                <div
                  className="flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center border"
                  style={{
                    borderColor: scoreColor(project.summary.score) + '55',
                    background: scoreColor(project.summary.score) + '15',
                  }}
                >
                  <span className="text-lg font-bold" style={{ color: scoreColor(project.summary.score) }}>
                    {project.summary.score ?? '—'}
                  </span>
                  <span className="text-[9px] text-zinc-500 uppercase">score</span>
                </div>

                {/* Info */}
                <div className="min-w-0 max-w-full overflow-hidden">
                  <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 max-w-full break-words font-semibold text-white">{project.summary.product_name}</h3>
                    <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {project.summary.business_model}
                    </span>
                    <span
                      className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${
                        project.status === 'validated'
                          ? 'bg-green-950/40 text-green-400 border-green-800/40'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {project.status === 'validated' ? t.validated : t.draft}
                    </span>
                  </div>
                  <p className="max-w-full break-words text-sm leading-relaxed text-zinc-400">{project.summary.elevator_pitch}</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {new Date(project.created_at).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR')}
                    {project.summary.personas_count != null && (
                      <> · {project.summary.personas_count} {t.buyers}</>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex w-full flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:w-44 lg:flex-col">
                  <button
                    onClick={() => handleOpen(project)}
                    disabled={!project.report}
                    className="min-w-[8rem] flex-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 transition-colors cursor-pointer font-bold"
                  >
                    {project.report ? t.open : t.noReport}
                  </button>
                  <button
                    onClick={() => handleOpenAdvisors(project)}
                    className="min-w-[8rem] flex-1 text-xs font-medium text-zinc-200 border border-zinc-700 hover:border-violet-600 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                    title={t.advisorsHelp}
                  >
                    ✨ {t.advisors}
                  </button>
                  <button
                    onClick={() => handleExport(project)}
                    className="min-w-[6rem] flex-1 rounded-lg px-3 py-1 text-[11px] text-cyan-500 transition-colors hover:text-cyan-300 cursor-pointer lg:flex-none"
                  >
                    {t.exportFile}
                  </button>
                  <button
                    onClick={() => setPendingDelete(project)}
                    disabled={deletingId === project.id}
                    className="min-w-[6rem] flex-1 rounded-lg px-3 py-1 text-[11px] text-zinc-600 transition-colors hover:text-red-400 cursor-pointer lg:flex-none"
                  >
                    {deletingId === project.id ? t.deleting : t.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
