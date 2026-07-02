'use client';

import { useState } from 'react';
import { consolidateKnowledge, SECTION_KEYS, SECTION_LABELS } from '@/lib/knowledge';
import type { KBSectionKey, MemoryItem, MemoryKind, ProjectKnowledge } from '@/lib/types';

interface Props {
  language: 'hr' | 'en';
  knowledge: ProjectKnowledge;
  onKnowledgeUpdate?: (knowledge: ProjectKnowledge) => void;
}

export default function KnowledgePanel({ language, knowledge, onKnowledgeUpdate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const t = {
    hr: {
      facts: 'činjenica',
      gaps: 'otvorenih',
      empty: 'Još prazno.',
      digestTitle: 'Sažetak projekta',
      memoryTitle: 'Što AI pamti',
      memorySubtitle: 'Ovo je kontekst koji savjetnici koriste prije odgovora.',
      strongest: 'Najvažnije činjenice',
      openGaps: 'Otvorene rupe',
      decisionsRisks: 'Odluke i rizici',
      commitments: 'Preferencije i obaveze',
      importance: 'važnost',
      confidence: 'sigurnost',
      source: 'izvor',
      edit: 'Ispravi',
      save: 'Spremi',
      cancel: 'Odustani',
      remove: 'Obriši',
      consolidate: 'Očisti memoriju',
      noEdit: 'Uređivanje nije dostupno.',
      kinds: {
        fact: 'Činjenica',
        gap: 'Rupa',
        decision: 'Odluka',
        risk: 'Rizik',
        preference: 'Preferencija',
        task: 'Task',
      } satisfies Record<MemoryKind, string>,
    },
    en: {
      facts: 'facts',
      gaps: 'open',
      empty: 'Still empty.',
      digestTitle: 'Project summary',
      memoryTitle: 'What AI remembers',
      memorySubtitle: 'This is the context advisors use before answering.',
      strongest: 'Strongest facts',
      openGaps: 'Open gaps',
      decisionsRisks: 'Decisions and risks',
      commitments: 'Preferences and commitments',
      importance: 'importance',
      confidence: 'confidence',
      source: 'source',
      edit: 'Edit',
      save: 'Save',
      cancel: 'Cancel',
      remove: 'Delete',
      consolidate: 'Clean memory',
      noEdit: 'Editing is unavailable.',
      kinds: {
        fact: 'Fact',
        gap: 'Gap',
        decision: 'Decision',
        risk: 'Risk',
        preference: 'Preference',
        task: 'Task',
      } satisfies Record<MemoryKind, string>,
    },
  }[language];

  const score = (item: MemoryItem) => item.importance * 0.6 + item.confidence * 0.35 + Math.min(0.05, item.mentions / 100);
  const sectionMemories = SECTION_KEYS.flatMap((key) =>
    (knowledge.sections[key].memories ?? []).map((memory) => ({ ...memory, section: key }))
  );
  const strongest = sectionMemories
    .filter((memory) => memory.kind === 'fact')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 6);
  const openGaps = sectionMemories
    .filter((memory) => memory.kind === 'gap')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
  const decisionsRisks = sectionMemories
    .filter((memory) => memory.kind === 'decision' || memory.kind === 'risk')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
  const commitments = sectionMemories
    .filter((memory) => memory.kind === 'preference' || memory.kind === 'task')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 5);
  const totalMemories = sectionMemories.length;
  const avgConfidence = totalMemories
    ? Math.round(sectionMemories.reduce((sum, item) => sum + item.confidence, 0) / totalMemories * 100)
    : 0;

  const badgeClass = (kind: MemoryKind) => ({
    fact: 'border-emerald-800/50 text-emerald-300 bg-emerald-950/20',
    gap: 'border-amber-800/50 text-amber-300 bg-amber-950/20',
    decision: 'border-cyan-800/50 text-cyan-300 bg-cyan-950/20',
    risk: 'border-red-900/50 text-red-300 bg-red-950/20',
    preference: 'border-violet-800/50 text-violet-300 bg-violet-950/20',
    task: 'border-blue-800/50 text-blue-300 bg-blue-950/20',
  })[kind];

  const updateKnowledge = (next: ProjectKnowledge) => {
    onKnowledgeUpdate?.({
      ...next,
      updated_at: new Date().toISOString(),
    });
  };

  const removeMemory = (item: MemoryItem & { section: KBSectionKey }) => {
    const section = knowledge.sections[item.section];
    const sameText = (value: string) => value.trim().toLowerCase() === item.text.trim().toLowerCase();
    updateKnowledge({
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

  const startEdit = (item: MemoryItem) => {
    if (!onKnowledgeUpdate) return;
    setEditingId(item.id);
    setDraft(item.text);
  };

  const saveEdit = (item: MemoryItem & { section: KBSectionKey }) => {
    const nextText = draft.trim();
    if (!nextText) return;
    const section = knowledge.sections[item.section];
    const sameText = (value: string) => value.trim().toLowerCase() === item.text.trim().toLowerCase();
    updateKnowledge({
      ...knowledge,
      sections: {
        ...knowledge.sections,
        [item.section]: {
          ...section,
          facts: item.kind === 'fact' ? section.facts.map((value) => sameText(value) ? nextText : value) : section.facts,
          gaps: item.kind === 'gap' ? section.gaps.map((value) => sameText(value) ? nextText : value) : section.gaps,
          memories: (section.memories ?? []).map((memory) => memory.id === item.id
            ? { ...memory, text: nextText, source: 'manual', confidence: 1, last_seen_at: new Date().toISOString() }
            : memory),
        },
      },
    });
    setEditingId(null);
    setDraft('');
  };

  const MemoryRow = ({ item }: { item: MemoryItem & { section: KBSectionKey } }) => (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${badgeClass(item.kind)}`}>
          {t.kinds[item.kind]}
        </span>
        <span className="text-[10px] text-zinc-500">{SECTION_LABELS[item.section][language]}</span>
        <span className="text-[10px] text-zinc-600">
          {t.importance} {Math.round(item.importance * 100)} · {t.confidence} {Math.round(item.confidence * 100)}
        </span>
      </div>
      {editingId === item.id ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => saveEdit(item)}
              className="rounded border border-emerald-700/50 bg-emerald-950/30 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:border-emerald-500 transition-colors"
            >
              {t.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setDraft('');
              }}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-300 leading-relaxed">{item.text}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-zinc-600">
              {t.source}: {item.source} · {item.mentions}x
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => startEdit(item)}
                disabled={!onKnowledgeUpdate}
                title={!onKnowledgeUpdate ? t.noEdit : undefined}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t.edit}
              </button>
              <button
                type="button"
                onClick={() => removeMemory(item)}
                disabled={!onKnowledgeUpdate}
                title={!onKnowledgeUpdate ? t.noEdit : undefined}
                className="rounded border border-red-900/50 bg-red-950/20 px-2 py-1 text-[10px] font-semibold text-red-300 hover:border-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t.remove}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {knowledge.digest && (
        <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">{t.digestTitle}</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{knowledge.digest}</p>
        </div>
      )}

      <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-indigo-400 mb-1">{t.memoryTitle}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{t.memorySubtitle}</p>
          </div>
          <div className="flex gap-2 text-[10px] text-zinc-400">
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1">{totalMemories} memories</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1">{avgConfidence}% confidence</span>
            <button
              type="button"
              onClick={() => updateKnowledge(consolidateKnowledge(knowledge))}
              disabled={!onKnowledgeUpdate || totalMemories === 0}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-semibold text-zinc-300 hover:border-indigo-700 hover:text-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t.consolidate}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{t.decisionsRisks}</p>
            <div className="space-y-2">
              {decisionsRisks.length ? decisionsRisks.map((item) => <MemoryRow key={item.id} item={item} />) : (
                <p className="text-xs text-zinc-600 italic">{t.empty}</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{t.commitments}</p>
            <div className="space-y-2">
              {commitments.length ? commitments.map((item) => <MemoryRow key={item.id} item={item} />) : (
                <p className="text-xs text-zinc-600 italic">{t.empty}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{t.strongest}</p>
            <div className="space-y-2">
              {strongest.length ? strongest.map((item) => <MemoryRow key={item.id} item={item} />) : (
                <p className="text-xs text-zinc-600 italic">{t.empty}</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{t.openGaps}</p>
            <div className="space-y-2">
              {openGaps.length ? openGaps.map((item) => <MemoryRow key={item.id} item={item} />) : (
                <p className="text-xs text-zinc-600 italic">{t.empty}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {SECTION_KEYS.map((key) => {
          const s = knowledge.sections[key];
          const memories = s.memories ?? [];
          const memoryFacts = memories.filter((memory) => memory.kind !== 'gap').sort((a, b) => score(b) - score(a));
          const memoryGaps = memories.filter((memory) => memory.kind === 'gap');
          const hasContent = s.facts.length > 0 || memoryFacts.length > 0 || s.summary;
          return (
            <div key={key} className="rounded-lg bg-zinc-800/30 border border-zinc-800 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-zinc-200">{SECTION_LABELS[key][language]}</p>
                <span className="text-[10px] text-zinc-500">
                  {Math.max(s.facts.length, memoryFacts.length)} {t.facts}
                  {(s.gaps.length > 0 || memoryGaps.length > 0) && ` · ${Math.max(s.gaps.length, memoryGaps.length)} ${t.gaps}`}
                </span>
              </div>
              {hasContent ? (
                <ul className="space-y-1">
                  {(memoryFacts.length ? memoryFacts.map((m) => m.text) : s.facts).slice(0, 5).map((f, i) => (
                    <li key={`${f}-${i}`} className="text-xs text-zinc-400 flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">•</span> <span>{f}</span>
                    </li>
                  ))}
                  {Math.max(s.facts.length, memoryFacts.length) > 5 && (
                    <li className="text-[10px] text-zinc-600">+{Math.max(s.facts.length, memoryFacts.length) - 5}...</li>
                  )}
                </ul>
              ) : (
                <p className="text-xs text-zinc-600 italic">{t.empty}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
