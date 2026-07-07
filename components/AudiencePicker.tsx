'use client';

import { useState } from 'react';
import type { SegmentSpec } from '@/lib/types';

interface Props {
  language: 'hr' | 'en';
  segments: SegmentSpec[];
  onConfirm: (selected: SegmentSpec[]) => void;
  onSkip: () => void;
  onBack: () => void;
}

export default function AudiencePicker({ language, segments, onConfirm, onSkip, onBack }: Props) {
  // Sve publike odabrane po defaultu
  const [selected, setSelected] = useState<Set<string>>(new Set(segments.map((s) => s.id)));

  const t = {
    hr: {
      title: 'Koju publiku da testiram?',
      subtitle:
        'AI je izdvojio kandidat-publike. Ako nisi siguran, ostavi sve odabrano — to je preporučeni izbor jer odmah vidiš gdje ideja najbolje rezonira.',
      recommended: 'Preporučeno: ostavi sve',
      ageLabel: 'dob',
      confirm: 'Testiraj odabrane publike',
      skip: 'Preskoči — testiraj generičku publiku',
      back: '‹ Promijeni ideju',
      noneHint: 'Odaberi barem jednu publiku ili preskoči.',
      rolesMore: 'i još',
    },
    en: {
      title: 'Which audience should I test?',
      subtitle:
        'The AI identified candidate audiences. If you are not sure, keep all selected — that is recommended because it shows where the idea resonates best.',
      recommended: 'Recommended: keep all',
      ageLabel: 'age',
      confirm: 'Test selected audiences',
      skip: 'Skip — test a generic audience',
      back: '‹ Change idea',
      noneHint: 'Select at least one audience or skip.',
      rolesMore: 'and',
    },
  }[language];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen = segments.filter((s) => selected.has(s.id));

  return (
    <div className="w-full max-w-2xl space-y-5">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white">{t.title}</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">{t.subtitle}</p>
        <div className="inline-flex rounded-full border border-emerald-800/50 bg-emerald-950/20 px-3 py-1 text-xs font-semibold text-emerald-300">
          {t.recommended}
        </div>
      </div>

      <div className="grid gap-3">
        {segments.map((s) => {
          const isOn = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                isOn
                  ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-500/5'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${
                    isOn ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-zinc-600 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <p className="font-semibold text-white text-sm">{s.label}</p>
                    <span className="text-[10px] text-zinc-500 flex-shrink-0">
                      {s.age_range[0]}–{s.age_range[1]} {t.ageLabel}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{s.description}</p>
                  {s.rationale && (
                    <p className="text-xs text-indigo-300/70 mt-1.5 italic leading-relaxed">{s.rationale}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {s.regions.map((r) => (
                      <span key={r} className="text-[10px] text-zinc-300 bg-zinc-800/70 border border-zinc-700/50 rounded-full px-2 py-0.5">
                        📍 {r}
                      </span>
                    ))}
                    {s.roles.slice(0, 3).map((r) => (
                      <span key={r} className="text-[10px] text-zinc-400 bg-zinc-800/40 border border-zinc-800 rounded-full px-2 py-0.5">
                        {r}
                      </span>
                    ))}
                    {s.roles.length > 3 && (
                      <span className="text-[10px] text-zinc-600 px-1 py-0.5">
                        {t.rolesMore} +{s.roles.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 pt-1">
        <button
          type="button"
          onClick={() => onConfirm(chosen)}
          disabled={chosen.length === 0}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span>{t.confirm}</span>
          {chosen.length > 0 && <span className="text-sm opacity-80">({chosen.length})</span>}
          <span className="text-lg">→</span>
        </button>
        {chosen.length === 0 && <p className="text-center text-xs text-zinc-500 -mt-1">{t.noneHint}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="self-start text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {t.back}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white sm:w-auto sm:py-1.5"
          >
            {t.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
