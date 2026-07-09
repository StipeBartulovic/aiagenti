'use client';

import { useRouter } from 'next/navigation';
import { computeReadiness, readinessColor, type ReadinessInput } from '@/lib/readiness';

interface Props {
  language: 'hr' | 'en';
  input: ReadinessInput;
  variant?: 'compact' | 'full';
  className?: string;
}

const T = {
  hr: { readiness: 'Spremnost ideje', nextStep: 'Sljedeći korak' },
  en: { readiness: 'Idea readiness', nextStep: 'Next step' },
};

export default function ReadinessMeter({ language, input, variant = 'full', className = '' }: Props) {
  const router = useRouter();
  const { overall, segments, nextStep } = computeReadiness(input);
  const t = T[language];

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex h-1.5 w-24 overflow-hidden border border-[var(--hairline-strong)] bg-[var(--paper-dim)]">
          {segments.map((s) => (
            <span
              key={s.key}
              style={{ width: `${s.weight * 100}%`, backgroundColor: s.value > 0 ? readinessColor(s.value) : 'transparent' }}
              title={`${s.label[language]}: ${s.value}%`}
            />
          ))}
        </div>
        <span className="font-data text-[11px] font-semibold" style={{ color: readinessColor(overall) }}>
          {overall}%
        </span>
      </div>
    );
  }

  return (
    <div className={`sheet p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="kicker !mb-0">{t.readiness}</p>
        <span className="font-data text-lg font-semibold" style={{ color: readinessColor(overall) }}>
          {overall}%
        </span>
      </div>
      <div className="mt-3 flex h-2.5 w-full overflow-hidden border border-[var(--hairline-strong)] bg-[var(--paper-dim)]">
        {segments.map((s) => (
          <span
            key={s.key}
            style={{ width: `${s.weight * 100}%`, backgroundColor: s.value > 0 ? readinessColor(s.value) : 'transparent' }}
            title={`${s.label[language]}: ${s.value}%`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: s.value > 0 ? readinessColor(s.value) : 'var(--hairline-strong)' }} />
            <span className="text-[11px] leading-tight text-[var(--ink-faint)]">
              {s.label[language]} <span className="font-data">{s.value}%</span>
            </span>
          </div>
        ))}
      </div>
      {overall < 100 && (
        <button
          type="button"
          onClick={() => router.push(nextStep.href)}
          className="link-ink mt-3 text-xs"
        >
          {t.nextStep}: {nextStep.label[language]} →
        </button>
      )}
    </div>
  );
}
