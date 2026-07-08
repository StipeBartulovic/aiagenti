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
      kicker: 'Korak 2 — odabir publike',
      title: 'Koju publiku da ispitam?',
      subtitle:
        'AI je izdvojio kandidat-publike. Ako nisi siguran, ostavi sve odabrano — odmah vidiš gdje ideja najbolje rezonira.',
      recommended: 'Preporučeno: ostavi sve',
      ageLabel: 'dob',
      confirm: 'Ispitaj odabrane publike',
      skip: 'Preskoči — generička publika',
      back: '← Promijeni ideju',
      noneHint: 'Odaberi barem jednu publiku ili preskoči.',
      rolesMore: 'i još',
    },
    en: {
      kicker: 'Step 2 — audience selection',
      title: 'Which audience should I examine?',
      subtitle:
        'The AI identified candidate audiences. If unsure, keep all selected — you immediately see where the idea resonates best.',
      recommended: 'Recommended: keep all',
      ageLabel: 'age',
      confirm: 'Examine selected audiences',
      skip: 'Skip — generic audience',
      back: '← Change idea',
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
    <div className="w-full space-y-5">
      <div className="border-b border-[var(--hairline)] pb-3">
        <p className="kicker !text-[var(--verdict-red)]">{t.kicker}</p>
        <h2 className="mt-2 text-2xl text-[var(--ink)]">{t.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
        <span className="font-data mt-2 inline-block text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--verdict-green)]">
          ✓ {t.recommended}
        </span>
      </div>

      <div className="grid gap-3">
        {segments.map((s, index) => {
          const isOn = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className={`cursor-pointer rounded-[3px] border p-4 text-left transition-all ${
                isOn
                  ? 'border-[var(--ink)] bg-[var(--paper-raised)] shadow-[3px_3px_0_rgba(27,23,18,0.15)]'
                  : 'border-[var(--hairline)] bg-transparent opacity-70 hover:opacity-100 hover:border-[var(--hairline-strong)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`font-data mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[2px] border text-xs font-bold ${
                    isOn
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--hairline-strong)] text-transparent'
                  }`}
                >
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                    <p className="font-semibold text-[var(--ink)]">
                      <span className="font-data text-xs text-[var(--verdict-red)]">{String(index + 1).padStart(2, '0')}</span>{' '}
                      {s.label}
                    </p>
                    <span className="font-data flex-shrink-0 text-[11px] text-[var(--ink-faint)]">
                      {s.age_range[0]}–{s.age_range[1]} {t.ageLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{s.description}</p>
                  {s.rationale && (
                    <p className="mt-1.5 border-l-2 border-[var(--annotate)] pl-2 text-xs italic leading-relaxed text-[var(--ink-soft)]">
                      {s.rationale}
                    </p>
                  )}
                  <p className="font-data mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
                    {s.regions.join(' · ')}
                    {s.roles.length > 0 && (
                      <>
                        {' — '}
                        {s.roles.slice(0, 3).join(', ')}
                        {s.roles.length > 3 ? ` ${t.rolesMore} +${s.roles.length - 3}` : ''}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="border-t border-[var(--hairline)] pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onBack} className="link-ink self-start text-xs">
            {t.back}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={onSkip} className="btn-line text-xs">
              {t.skip}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(chosen)}
              disabled={chosen.length === 0}
              className="btn-ink text-sm"
            >
              {t.confirm}
              {chosen.length > 0 && <span className="font-data text-xs opacity-80">({chosen.length})</span>} →
            </button>
          </div>
        </div>
        {chosen.length === 0 && (
          <p className="font-data mt-2 text-right text-[11px] uppercase tracking-wider text-[var(--verdict-red)]">
            {t.noneHint}
          </p>
        )}
      </div>
    </div>
  );
}
