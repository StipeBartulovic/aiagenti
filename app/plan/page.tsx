'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { consolidateKnowledge, SECTION_KEYS, SECTION_LABELS } from '@/lib/knowledge';
import { buildRelatedIndex, type RelatedLink } from '@/lib/related';
import { getProject, listProjects, updateProjectKnowledge } from '@/lib/projects';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type {
  IdeaFormData,
  KBSectionKey,
  MemoryItem,
  MemoryKind,
  ProjectKnowledge,
  ValidationReport,
} from '@/lib/types';

type SectionedMemory = MemoryItem & { section: KBSectionKey };
const PLAN_TRANSLATION_CACHE_PREFIX = 'aivalidator_plan_translation_v1';

const KIND_STYLE: Record<MemoryKind, { color: string; hr: string; en: string }> = {
  fact: { color: 'var(--verdict-green)', hr: 'Činjenica', en: 'Fact' },
  gap: { color: 'var(--verdict-red)', hr: 'Rupa', en: 'Gap' },
  decision: { color: 'var(--ink)', hr: 'Odluka', en: 'Decision' },
  risk: { color: 'var(--verdict-red)', hr: 'Rizik', en: 'Risk' },
  preference: { color: 'var(--annotate)', hr: 'Preferencija', en: 'Preference' },
  task: { color: 'var(--ink-soft)', hr: 'Task', en: 'Task' },
};

function knowledgeVersionKey(projectId: string | null, knowledge: ProjectKnowledge): string {
  const memoryCount = SECTION_KEYS.reduce((sum, key) => sum + (knowledge.sections[key]?.memories?.length ?? 0), 0);
  const factsCount = SECTION_KEYS.reduce((sum, key) => sum + (knowledge.sections[key]?.facts?.length ?? 0), 0);
  const gapsCount = SECTION_KEYS.reduce((sum, key) => sum + (knowledge.sections[key]?.gaps?.length ?? 0), 0);
  return [
    PLAN_TRANSLATION_CACHE_PREFIX,
    projectId || 'latest',
    'hr',
    knowledge.updated_at,
    knowledge.digest.length,
    memoryCount,
    factsCount,
    gapsCount,
  ].join(':');
}

function readCachedPlanTranslation(cacheKey: string): ProjectKnowledge | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { knowledge?: ProjectKnowledge };
    return parsed.knowledge ?? null;
  } catch {
    return null;
  }
}

function writeCachedPlanTranslation(cacheKey: string, knowledge: ProjectKnowledge) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ knowledge, cached_at: new Date().toISOString() }));
  } catch {
    /* cache je opcionalan */
  }
}

export default function PlanPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();

  const [booting, setBooting] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [idea, setIdea] = useState<IdeaFormData | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [knowledge, setKnowledge] = useState<ProjectKnowledge | null>(null);
  const [translatedKnowledge, setTranslatedKnowledge] = useState<ProjectKnowledge | null>(null);
  const [translationKey, setTranslationKey] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [openSections, setOpenSections] = useState<Set<KBSectionKey>>(new Set(SECTION_KEYS));
  const bootedRef = useRef(false);

  const t = {
    hr: {
      kicker: 'Protokol — dosje',
      title: 'Biznis plan',
      subtitle: 'Sve što je AI zaključio o projektu — iz testova, razgovora sa savjetnicima i ispitivanja. Ovo je kontekst koji persone i savjetnici čitaju prije svakog odgovora.',
      loading: 'Otvaram dosje...',
      noProjectTitle: 'Još nema dosjea',
      noProjectText: 'Biznis plan se gradi iz validirane ideje. Najprije pokreni test.',
      goValidate: 'Validiraj ideju',
      seedTitle: 'Dosje još nije otvoren',
      seedText: 'Projekt postoji, ali AI još nije izvukao strukturirano znanje iz ideje i izvještaja. Otvaranje dosjea traje pola minute.',
      seedButton: `Otvori dosje (${TOKEN_COSTS.advisor_setup} tokena)`,
      seedRunning: 'Otvaram dosje...',
      updated: 'Ažurirano',
      completeness: 'Popunjenost',
      digest: 'Sažetak projekta',
      keyBlocks: 'Ključni zapisi',
      decisions: 'Odluke',
      risks: 'Rizici',
      preferences: 'Preferencije i obaveze',
      empty: 'Još prazno.',
      facts: 'činjenica',
      gaps: 'rupa',
      openGaps: 'Otvorene rupe',
      related: 'Povezano',
      edit: 'Ispravi',
      save: 'Spremi',
      cancel: 'Odustani',
      remove: 'Obriši',
      consolidate: 'Očisti memoriju',
      askQuestions: 'Odgovori na otvorena pitanja',
      market: 'Tržište',
      askQuestionsHint: 'Ispitivanje pitanje-po-pitanje puni ovaj dosje i priprema jači sljedeći test.',
      backResults: 'Izvještaj',
      advisors: 'Savjetnici',
      projects: 'Moji projekti',
      home: '← Početna',
      sectionToggleOpen: 'Sakrij',
      sectionToggleClosed: 'Otvori',
      confidence: 'sigurnost',
      source: 'izvor',
      errorGeneric: 'Nešto je puklo. Pokušaj ponovno.',
      translating: 'Prevodi dosje za prikaz...',
      translatedNotice: 'Prikazuje se hrvatski prijevod za čitanje. Glavna baza ostaje na engleskom za AI savjetnike.',
      translationError: 'Prijevod prikaza nije uspio; prikazujem originalnu englesku bazu.',
    },
    en: {
      kicker: 'Protocol — dossier',
      title: 'Business plan',
      subtitle: 'Everything the AI has concluded about the project — from tests, advisor conversations, and discovery interviews. This is the context personas and advisors read before every answer.',
      loading: 'Opening the dossier...',
      noProjectTitle: 'No dossier yet',
      noProjectText: 'The business plan is built from a validated idea. Run a test first.',
      goValidate: 'Validate an idea',
      seedTitle: 'Dossier not opened yet',
      seedText: 'The project exists, but the AI has not extracted structured knowledge from the idea and report yet. Opening takes half a minute.',
      seedButton: `Open dossier (${TOKEN_COSTS.advisor_setup} tokens)`,
      seedRunning: 'Opening dossier...',
      updated: 'Updated',
      completeness: 'Completeness',
      digest: 'Project digest',
      keyBlocks: 'Key records',
      decisions: 'Decisions',
      risks: 'Risks',
      preferences: 'Preferences and commitments',
      empty: 'Still empty.',
      facts: 'facts',
      gaps: 'gaps',
      openGaps: 'Open gaps',
      related: 'Related',
      edit: 'Edit',
      save: 'Save',
      cancel: 'Cancel',
      remove: 'Delete',
      consolidate: 'Clean memory',
      askQuestions: 'Answer the open questions',
      market: 'Market',
      askQuestionsHint: 'The question-by-question interview fills this dossier and prepares a stronger next test.',
      backResults: 'Report',
      advisors: 'Advisors',
      projects: 'My projects',
      home: '← Home',
      sectionToggleOpen: 'Hide',
      sectionToggleClosed: 'Open',
      confidence: 'confidence',
      source: 'source',
      errorGeneric: 'Something broke. Try again.',
      translating: 'Translating dossier for display...',
      translatedNotice: 'Showing the original English dossier used by the advisors.',
      translationError: 'Display translation failed; showing the original English dossier.',
    },
  }[language];

  // ── Boot: nađi projekt (session → najnoviji) ──
  useEffect(() => {
    if (authLoading || !user || bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      try {
        const savedId = sessionStorage.getItem('aivalidator_project_id');
        if (savedId) {
          const proj = await getProject(savedId, user.uid);
          if (proj) {
            setProjectId(proj.id);
            setIdea(proj.idea);
            setReport(proj.report);
            setKnowledge(proj.knowledge);
            setBooting(false);
            return;
          }
        }
        // fallback: najnoviji spremljeni projekt
        const projects = await listProjects(user.uid);
        const latest = projects[0];
        if (latest) {
          sessionStorage.setItem('aivalidator_project_id', latest.id);
          setProjectId(latest.id);
          setIdea(latest.idea);
          setReport(latest.report);
          setKnowledge(latest.knowledge);
        }
      } catch (err) {
        console.error('Plan boot error:', err);
      } finally {
        setBooting(false);
      }
    })();
  }, [authLoading, user]);

  const persistKnowledge = (next: ProjectKnowledge) => {
    const stamped = { ...next, updated_at: new Date().toISOString() };
    setKnowledge(stamped);
    setTranslatedKnowledge(null);
    setTranslationKey('');
    if (projectId) {
      void updateProjectKnowledge(projectId, stamped).catch((err) => console.error('KB persist error:', err));
    }
  };

  useEffect(() => {
    if (!knowledge || language !== 'hr') return;

    const key = knowledgeVersionKey(projectId, knowledge);
    if (translatedKnowledge && translationKey === key) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const cached = readCachedPlanTranslation(key);
      if (cached) {
        setTranslatedKnowledge(cached);
        setTranslationKey(key);
        setTranslating(false);
        setTranslationError('');
        return;
      }
      setTranslating(true);
      setTranslationError('');
      aiClient.translateKnowledge<{ knowledge?: ProjectKnowledge }>(
        { knowledge, targetLanguage: 'hr' },
        t.translationError
      )
        .then((data) => {
          if (!active) return;
          const translated = data.knowledge ?? null;
          if (translated) writeCachedPlanTranslation(key, translated);
          setTranslatedKnowledge(translated);
          setTranslationKey(key);
        })
        .catch((err) => {
          if (!active) return;
          console.error('Plan display translation error:', err);
          setTranslationError(t.translationError);
          setTranslatedKnowledge(null);
          setTranslationKey('');
        })
        .finally(() => {
          if (active) setTranslating(false);
        });
    });

    return () => {
      active = false;
    };
  }, [knowledge, language, projectId, t.translationError, translatedKnowledge, translationKey]);

  const handleSeed = async () => {
    if (!idea || !projectId || seeding) return;
    setSeeding(true);
    setErrorMsg('');
    try {
      const spent = spendTokens(TOKEN_COSTS.advisor_setup, language === 'en' ? 'Dossier setup' : 'Priprema dosjea');
      if (!spent.ok) {
        throw new Error(tokenShortfallMessage(language, language === 'en' ? 'Dossier setup' : 'Priprema dosjea', TOKEN_COSTS.advisor_setup, spent.missing));
      }
      const data = await aiClient.updateKnowledge<{ knowledge?: ProjectKnowledge }>(
        { mode: 'seed', idea, report, intakeTranscript: [] },
        t.errorGeneric
      );
      if (!data.knowledge) throw new Error(t.errorGeneric);
      setKnowledge(data.knowledge);
      await updateProjectKnowledge(projectId, data.knowledge);
    } catch (err) {
      console.error('Seed error:', err);
      setErrorMsg(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSeeding(false);
    }
  };

  // ── Svi zapisi + vektorske veze ──
  const displayKnowledge = language === 'hr' && translatedKnowledge ? translatedKnowledge : knowledge;
  const isTranslatedView = language === 'hr' && Boolean(translatedKnowledge);

  const allMemories: SectionedMemory[] = useMemo(() => {
    if (!displayKnowledge) return [];
    return SECTION_KEYS.flatMap((key) =>
      (displayKnowledge.sections[key]?.memories ?? []).map((memory) => ({ ...memory, section: key }))
    );
  }, [displayKnowledge]);

  const memoryById = useMemo(() => new Map(allMemories.map((m) => [m.id, m])), [allMemories]);

  const relatedIndex = useMemo(() => {
    if (allMemories.length < 2) return new Map<string, RelatedLink[]>();
    return buildRelatedIndex(allMemories.map((m) => ({ id: m.id, text: m.text })));
  }, [allMemories]);

  const rank = (item: MemoryItem) => item.importance * 0.6 + item.confidence * 0.35 + Math.min(0.05, item.mentions / 100);

  const decisions = allMemories.filter((m) => m.kind === 'decision').sort((a, b) => rank(b) - rank(a)).slice(0, 6);
  const risks = allMemories.filter((m) => m.kind === 'risk').sort((a, b) => rank(b) - rank(a)).slice(0, 6);
  const preferences = allMemories.filter((m) => m.kind === 'preference' || m.kind === 'task').sort((a, b) => rank(b) - rank(a)).slice(0, 6);

  const totalFacts = allMemories.filter((m) => m.kind !== 'gap').length;
  const totalGaps = allMemories.filter((m) => m.kind === 'gap').length;
  const completeness = totalFacts + totalGaps > 0 ? Math.round((totalFacts / (totalFacts + totalGaps)) * 100) : 0;

  // ── Uređivanje ──
  const removeMemory = (item: SectionedMemory) => {
    if (!knowledge) return;
    const section = knowledge.sections[item.section];
    const sameText = (value: string) => value.trim().toLowerCase() === item.text.trim().toLowerCase();
    persistKnowledge({
      ...knowledge,
      sections: {
        ...knowledge.sections,
        [item.section]: {
          ...section,
          facts: item.kind === 'fact' ? section.facts.filter((value) => !sameText(value)) : section.facts,
          gaps: item.kind === 'gap' ? section.gaps.filter((value) => !sameText(value)) : section.gaps,
          memories: (section.memories ?? []).filter((memory) => memory.id !== item.id),
        },
      },
    });
  };

  const saveEdit = (item: SectionedMemory) => {
    if (!knowledge) return;
    const nextText = draft.trim();
    if (!nextText) return;
    const section = knowledge.sections[item.section];
    const sameText = (value: string) => value.trim().toLowerCase() === item.text.trim().toLowerCase();
    persistKnowledge({
      ...knowledge,
      sections: {
        ...knowledge.sections,
        [item.section]: {
          ...section,
          facts: item.kind === 'fact' ? section.facts.map((value) => (sameText(value) ? nextText : value)) : section.facts,
          gaps: item.kind === 'gap' ? section.gaps.map((value) => (sameText(value) ? nextText : value)) : section.gaps,
          memories: (section.memories ?? []).map((memory) =>
            memory.id === item.id
              ? { ...memory, text: nextText, source: 'manual' as const, confidence: 1, last_seen_at: new Date().toISOString() }
              : memory
          ),
        },
      },
    });
    setEditingId(null);
    setDraft('');
  };

  const toggleSection = (key: KBSectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const RelatedRefs = ({ id }: { id: string }) => {
    const links = relatedIndex.get(id) ?? [];
    if (!links.length) return null;
    return (
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-faint)]">
        <span className="font-data uppercase tracking-wider">{t.related}:</span>{' '}
        {links.map((link, index) => {
          const target = memoryById.get(link.id);
          if (!target) return null;
          return (
            <span key={link.id}>
              {index > 0 && ' · '}
              <span className="font-data text-[9px] uppercase">[{SECTION_LABELS[target.section][language]}]</span>{' '}
              {target.text.length > 70 ? `${target.text.slice(0, 70)}…` : target.text}
            </span>
          );
        })}
      </p>
    );
  };

  const MemoryRow = ({ item, showSection = false }: { item: SectionedMemory; showSection?: boolean }) => {
    const style = KIND_STYLE[item.kind];
    return (
      <div className="border-b border-[var(--hairline)] py-2.5 last:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="font-data border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: style.color, borderColor: style.color }}
          >
            {style[language]}
          </span>
          {showSection && (
            <span className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              {SECTION_LABELS[item.section][language]}
            </span>
          )}
          <span className="font-data ml-auto text-[10px] text-[var(--ink-faint)]">
            {t.confidence} {Math.round(item.confidence * 100)} · {item.source}
          </span>
        </div>
        {editingId === item.id ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              className="paper-field w-full resize-none text-sm"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => saveEdit(item)} className="btn-ink !px-3 !py-1 text-xs">
                {t.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft('');
                }}
                className="btn-line !px-3 !py-1 text-xs"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink)]">{item.text}</p>
            <RelatedRefs id={item.id} />
            {!isTranslatedView && (
              <div className="mt-1.5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setDraft(item.text);
                  }}
                  className="link-ink text-[11px]"
                >
                  {t.edit}
                </button>
                <button
                  type="button"
                  onClick={() => removeMemory(item)}
                  className="link-ink text-[11px]"
                  style={{ color: 'var(--verdict-red)' }}
                >
                  {t.remove}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

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

  const updatedLabel = displayKnowledge
    ? new Date(displayKnowledge.updated_at).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

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
            <button type="button" onClick={() => router.push('/market')} className="link-ink text-sm">
              {t.market}
            </button>
            <button type="button" onClick={() => router.push('/advisors')} className="link-ink text-sm">
              {t.advisors}
            </button>
            <button type="button" onClick={() => router.push('/projects')} className="link-ink text-sm">
              {t.projects}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <section className="pt-10 sm:pt-12">
          <p className="kicker">{t.kicker}</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl text-[var(--ink)] sm:text-4xl">
                {t.title} — {idea.product_name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
              {updatedLabel && (
                <p className="font-data mt-2 text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {t.updated}: {updatedLabel}
                </p>
              )}
            </div>
            {displayKnowledge && (
              <span
                className="stamp !text-sm"
                style={{
                  color: completeness >= 70 ? 'var(--verdict-green)' : completeness >= 40 ? 'var(--annotate)' : 'var(--verdict-red)',
                  borderColor: completeness >= 70 ? 'var(--verdict-green)' : completeness >= 40 ? 'var(--annotate)' : 'var(--verdict-red)',
                }}
              >
                {t.completeness} {completeness}%
              </span>
            )}
          </div>
        </section>

        {!displayKnowledge ? (
          <section className="sheet mt-8 max-w-xl p-6 sm:p-8">
            <h2 className="text-xl text-[var(--ink)]">{t.seedTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t.seedText}</p>
            {errorMsg && <p className="mt-3 text-sm text-[var(--verdict-red)]">{errorMsg}</p>}
            <button type="button" onClick={() => void handleSeed()} disabled={seeding} className="btn-ink mt-5 text-sm disabled:opacity-60">
              {seeding ? t.seedRunning : t.seedButton}
            </button>
          </section>
        ) : (
          <>
            {/* Poziv na ispitivanje — najbrži način da se dosje popuni */}
            {totalGaps > 0 && (
              <section className="mt-8 border-l-4 border-[var(--verdict-red)] bg-[var(--paper-raised)] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {totalGaps} {t.gaps} · {t.askQuestionsHint}
                    </p>
                  </div>
                  <button type="button" onClick={() => router.push('/discovery')} className="btn-ink text-sm">
                    {t.askQuestions}
                  </button>
                </div>
              </section>
            )}

            {/* Digest */}
            {displayKnowledge.digest && (
              <section className="mt-8">
                <p className="kicker">{t.digest}</p>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--ink)]">{displayKnowledge.digest}</p>
                {language === 'hr' && (
                  <p className="font-data mt-3 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                    {translating ? t.translating : translationError || (isTranslatedView ? t.translatedNotice : t.translationError)}
                  </p>
                )}
              </section>
            )}

            {/* Ključni zapisi: odluke / rizici / preferencije */}
            <section className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--ink)] pb-2">
                <h2 className="text-2xl text-[var(--ink)]">{t.keyBlocks}</h2>
                <button
                  type="button"
                  onClick={() => knowledge && persistKnowledge(consolidateKnowledge(knowledge))}
                  className="link-ink text-sm"
                >
                  {t.consolidate}
                </button>
              </div>
              <div className="mt-4 grid gap-6 md:grid-cols-3">
                {[
                  { label: t.decisions, items: decisions },
                  { label: t.risks, items: risks },
                  { label: t.preferences, items: preferences },
                ].map((group) => (
                  <div key={group.label}>
                    <p className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">{group.label}</p>
                    {group.items.length === 0 ? (
                      <p className="mt-2 text-xs italic text-[var(--ink-faint)]">{t.empty}</p>
                    ) : (
                      <div className="mt-1">
                        {group.items.map((item) => (
                          <MemoryRow key={item.id} item={item} showSection />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Sekcije dosjea */}
            <section className="mt-12 space-y-6">
              {SECTION_KEYS.map((key) => {
                const section = displayKnowledge.sections[key];
                const memories = (section?.memories ?? []) as MemoryItem[];
                const sectionMemories: SectionedMemory[] = memories.map((memory) => ({ ...memory, section: key }));
                const factItems = sectionMemories.filter((m) => m.kind !== 'gap').sort((a, b) => rank(b) - rank(a));
                const gapItems = sectionMemories.filter((m) => m.kind === 'gap').sort((a, b) => rank(b) - rank(a));
                const isOpen = openSections.has(key);
                return (
                  <div key={key} className="border-2 border-[var(--ink)] bg-[var(--paper-raised)]">
                    <button
                      type="button"
                      onClick={() => toggleSection(key)}
                      className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
                    >
                      <div>
                        <h3 className="text-xl text-[var(--ink)]">{SECTION_LABELS[key][language]}</h3>
                        {section?.summary && (
                          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--ink-soft)]">{section.summary}</p>
                        )}
                      </div>
                      <span className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                        {factItems.length} {t.facts}
                        {gapItems.length > 0 && (
                          <span style={{ color: 'var(--verdict-red)' }}> · {gapItems.length} {t.gaps}</span>
                        )}
                        <span className="ml-3 underline underline-offset-2">
                          {isOpen ? t.sectionToggleOpen : t.sectionToggleClosed}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-[var(--hairline-strong)] px-5 pb-5">
                        {factItems.length === 0 && gapItems.length === 0 ? (
                          <p className="pt-4 text-xs italic text-[var(--ink-faint)]">{t.empty}</p>
                        ) : (
                          <div className="grid gap-x-8 md:grid-cols-2">
                            <div className="pt-1">
                              {factItems.map((item) => (
                                <MemoryRow key={item.id} item={item} />
                              ))}
                            </div>
                            <div className="pt-1">
                              {gapItems.length > 0 && (
                                <p className="font-data pt-2 text-[10px] uppercase tracking-wider" style={{ color: 'var(--verdict-red)' }}>
                                  {t.openGaps}
                                </p>
                              )}
                              {gapItems.map((item) => (
                                <MemoryRow key={item.id} item={item} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
