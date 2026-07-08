'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const { user, loading: authLoading, language, setLanguage } = useAuth();
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
      kicker: 'Protokol — arhiva projekata',
      title: 'Moji projekti',
      subtitle: 'Tvoji spremljeni projekti i izvještaji, na ovom uređaju.',
      empty: 'Još nemaš spremljenih projekata.',
      emptyHelp: 'Pokreni prvi test bez straha. Projekt možeš spremiti nakon izvještaja.',
      emptyCta: 'Validiraj svoju prvu ideju →',
      continueLatest: 'Nastavi zadnji projekt',
      continueLatestHelp: 'Najbrzi povratak u zadnji spremljeni tok rada.',
      open: 'Otvori izvještaj',
      noReport: 'Nema izvještaja',
      advisors: 'Next-step',
      advisorsHelp: 'Research i Positioning potezi nakon izvještaja',
      delete: 'Obriši',
      exportFile: 'Izvezi',
      importFile: 'Uvezi projekt',
      backupWorkspace: 'Izvezi sigurnosnu kopiju',
      restoreWorkspace: 'Vrati iz kopije',
      eraseAll: 'Obriši sve lokalno',
      eraseAllTitle: 'Obrisati sve lokalne projekte?',
      eraseAllHelp: 'Ovo briše sve projekte spremljene na ovom uređaju. Prije toga izvezi sigurnosnu kopiju ako želiš zadržati kopiju.',
      confirmEraseAll: 'Da, obriši sve',
      localKicker: 'Lokalna pohrana',
      localHelp: 'Podaci su spremljeni na ovom uređaju. Jedan projekt izvozi se kao .ai-project, cijeli workspace kao .ai-workspace.',
      localSaved: 'Zadnje spremanje',
      localEmpty: 'Nema lokalno spremljenih projekata',
      importError: 'Ne mogu uvesti ovu datoteku.',
      restoreError: 'Ne mogu vratiti workspace iz ove datoteke.',
      projectImported: 'Projekt je uvezen i spremljen lokalno.',
      projectExported: 'Projekt je izvezen kao .ai-project datoteka.',
      workspaceExported: 'Sigurnosna kopija workspacea je izvezena.',
      restored: (count: number) => `Workspace je vraćen. Učitano projekata: ${count}.`,
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
      willRemove: (n: number) => `${n} lokalnih zapisa projekta bit će uklonjeno s ovog uređaja.`,
    },
    en: {
      back: '← Back',
      kicker: 'Protocol — project archive',
      title: 'My projects',
      subtitle: 'Your saved projects and reports, on this device.',
      empty: 'You have no saved projects yet.',
      emptyHelp: 'Run your first test without pressure. You can save a project after the report.',
      emptyCta: 'Validate your first idea →',
      continueLatest: 'Continue latest project',
      continueLatestHelp: 'The fastest way back into your latest saved flow.',
      open: 'Open report',
      noReport: 'No report',
      advisors: 'Next-step',
      advisorsHelp: 'Research and Positioning moves after the report',
      delete: 'Delete',
      exportFile: 'Export',
      importFile: 'Import project',
      backupWorkspace: 'Export backup',
      restoreWorkspace: 'Restore backup',
      eraseAll: 'Erase all local',
      eraseAllTitle: 'Erase all local projects?',
      eraseAllHelp: 'This deletes every project saved on this device. Export a backup first if you want to keep a copy.',
      confirmEraseAll: 'Yes, erase all',
      localKicker: 'Local storage',
      localHelp: 'Data is saved on this device. One project exports as .ai-project, the whole workspace as .ai-workspace.',
      localSaved: 'Last saved',
      localEmpty: 'No local projects saved',
      importError: 'Could not import this file.',
      restoreError: 'Could not restore this workspace file.',
      projectImported: 'Project imported and saved locally.',
      projectExported: 'Project exported as an .ai-project file.',
      workspaceExported: 'Workspace backup exported.',
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
      willRemove: (n: number) => `${n} local project records will be removed from this device.`,
    },
  }[language];

  const lastSavedAt = useMemo(() => {
    const newest = projects
      .map((project) => Date.parse(project.updated_at || project.created_at))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    if (!newest) return null;
    return new Date(newest).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [projects, language]);
  const latestProject = useMemo(() => {
    return [...projects].sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))[0] ?? null;
  }, [projects]);

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
    setNotice(t.projectExported);
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      await importProjectFromText(await file.text());
      await refreshProjects();
      setNotice(t.projectImported);
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
    setNotice(t.workspaceExported);
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
    if (score === null) return 'var(--ink-faint)';
    return score >= 60 ? 'var(--verdict-green)' : score >= 35 ? 'var(--annotate)' : 'var(--verdict-red)';
  };

  if (authLoading || !user) {
    return (
      <div className="paper-root flex min-h-screen items-center justify-center">
        <span className="font-data text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">{t.loadingText}</span>
      </div>
    );
  }

  return (
    <div className="paper-root min-h-screen">
      {/* ── Modal: obriši projekt ── */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-6">
            <span className="stamp !text-[10px]">{t.deleteTitle}</span>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t.deleteHelp}</p>
            <div className="mt-4 border-l-2 border-[var(--hairline-strong)] pl-3">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">{pendingDelete.summary.product_name}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-faint)]">{pendingDelete.summary.elevator_pitch}</p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId === pendingDelete.id}
                className="btn-line text-sm disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(pendingDelete.id)}
                disabled={deletingId === pendingDelete.id}
                className="btn-ink !border-[var(--verdict-red)] !bg-[var(--verdict-red)] text-sm"
              >
                {deletingId === pendingDelete.id ? t.deleting : t.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: obriši sve ── */}
      {pendingEraseAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md border-2 border-[var(--verdict-red)] bg-[var(--paper-raised)] p-6">
            <span className="stamp !text-[10px]">{t.eraseAllTitle}</span>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t.eraseAllHelp}</p>
            <p className="font-data mt-3 text-xs leading-relaxed text-[var(--verdict-red)]">
              {t.willRemove(projects.length)}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingEraseAll(false)} className="btn-line text-sm">
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleEraseAll}
                className="btn-ink !border-[var(--verdict-red)] !bg-[var(--verdict-red)] text-sm"
              >
                {t.confirmEraseAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Masthead ── */}
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button type="button" onClick={() => router.push('/')} className="link-ink text-sm">
            {t.back}
          </button>
          <div className="flex items-center gap-5">
            <div className="font-data flex items-center gap-1 text-xs">
              <button
                onClick={() => setLanguage('hr')}
                className={`cursor-pointer px-1 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                  language === 'hr' ? 'text-[var(--verdict-red)] underline underline-offset-4' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
                }`}
              >
                HR
              </button>
              <span className="text-[var(--hairline-strong)]">/</span>
              <button
                onClick={() => setLanguage('en')}
                className={`cursor-pointer px-1 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                  language === 'en' ? 'text-[var(--verdict-red)] underline underline-offset-4' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
                }`}
              >
                EN
              </button>
            </div>
            <button type="button" onClick={() => router.push('/settings')} className="link-ink text-sm">
              {language === 'en' ? 'Settings' : 'Postavke'}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-8">
        {/* ── Naslov ── */}
        <section className="pt-10 sm:pt-14">
          <p className="kicker">{t.kicker}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl text-[var(--ink)] sm:text-5xl">{t.title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {latestProject && (
                <button
                  type="button"
                  onClick={() => (latestProject.report ? handleOpen(latestProject) : handleOpenAdvisors(latestProject))}
                  title={t.continueLatestHelp}
                  className="btn-ink text-sm"
                >
                  {t.continueLatest}
                </button>
              )}
              <label className="btn-line cursor-pointer text-sm">
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
        </section>

        {/* ── Lokalna pohrana ── */}
        <section className="mt-8">
          <div className="sheet p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="kicker !text-[var(--ink-soft)]">{t.localKicker}</p>
              <span className="font-data text-[11px] text-[var(--ink-faint)]">
                {lastSavedAt ? `${t.localSaved}: ${lastSavedAt}` : t.localEmpty}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--ink-faint)]">{t.localHelp}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleWorkspaceBackup} className="btn-line text-xs">
                {t.backupWorkspace}
              </button>
              <label className="btn-line cursor-pointer text-xs">
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
                className="btn-line !border-[var(--verdict-red)] !text-[var(--verdict-red)] text-xs"
              >
                {t.eraseAll}
              </button>
            </div>
          </div>
        </section>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
          </div>
        )}

        {error && !loading && (
          <div className="mt-6 border-l-4 border-[var(--verdict-red)] bg-[var(--paper-raised)] px-4 py-3 text-sm text-[var(--ink)]">
            {error}
          </div>
        )}

        {notice && !loading && (
          <div className="mt-6 border-l-4 border-[var(--verdict-green)] bg-[var(--paper-raised)] px-4 py-3 text-sm text-[var(--ink)]">
            {notice}
          </div>
        )}

        {/* ── Prazno stanje ── */}
        {!loading && !error && projects.length === 0 && (
          <section className="mt-10 border-2 border-dashed border-[var(--hairline-strong)] py-16 text-center">
            <p className="font-semibold text-[var(--ink)]">{t.empty}</p>
            <p className="mt-1 text-sm text-[var(--ink-faint)]">{t.emptyHelp}</p>
            <button type="button" onClick={() => router.push('/')} className="btn-ink mt-5 text-sm">
              {t.emptyCta}
            </button>
          </section>
        )}

        {/* ── Popis projekata: dosjei ── */}
        {!loading && !error && projects.length > 0 && (
          <section className="mt-10">
            <div className="border-t-2 border-[var(--ink)]" />
            <div className="divide-y divide-[var(--hairline)]">
              {projects.map((project, index) => (
                <div key={project.id} className="grid gap-4 py-6 sm:grid-cols-[3.5rem_1fr_auto] sm:items-start">
                  {/* Broj dosjea + score */}
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1">
                    <span className="font-data text-xs text-[var(--ink-faint)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div
                      className="font-data flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 text-base font-semibold"
                      style={{ borderColor: scoreColor(project.summary.score), color: scoreColor(project.summary.score) }}
                    >
                      {project.summary.score ?? '—'}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-semibold text-[var(--ink)]">{project.summary.product_name}</h3>
                      <span className="font-data rounded-full border border-[var(--hairline-strong)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
                        {project.summary.business_model}
                      </span>
                      <span
                        className={`font-data rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          project.status === 'validated'
                            ? 'border-[var(--verdict-green)] text-[var(--verdict-green)]'
                            : 'border-[var(--hairline-strong)] text-[var(--ink-faint)]'
                        }`}
                      >
                        {project.status === 'validated' ? t.validated : t.draft}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{project.summary.elevator_pitch}</p>
                    <p className="font-data mt-2 text-[11px] text-[var(--ink-faint)]">
                      {new Date(project.created_at).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR')}
                      {project.summary.personas_count != null && <> · {project.summary.personas_count} {t.buyers}</>}
                    </p>
                  </div>

                  {/* Akcije */}
                  <div className="flex flex-wrap items-start gap-2 sm:w-40 sm:flex-col sm:items-stretch">
                    <button
                      onClick={() => handleOpen(project)}
                      disabled={!project.report}
                      className="btn-ink flex-1 text-xs disabled:opacity-40 sm:flex-none"
                    >
                      {project.report ? t.open : t.noReport}
                    </button>
                    <button
                      onClick={() => handleOpenAdvisors(project)}
                      title={t.advisorsHelp}
                      className="btn-line flex-1 text-xs sm:flex-none"
                    >
                      {t.advisors}
                    </button>
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={() => handleExport(project)}
                        className="link-ink text-[11px] !text-[var(--ink-faint)] hover:!text-[var(--ink)]"
                      >
                        {t.exportFile}
                      </button>
                      <button
                        onClick={() => setPendingDelete(project)}
                        disabled={deletingId === project.id}
                        className="link-ink text-[11px] !text-[var(--ink-faint)] hover:!text-[var(--verdict-red)]"
                      >
                        {deletingId === project.id ? t.deleting : t.delete}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
