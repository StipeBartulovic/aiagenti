'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, CircleHelp, ShieldCheck } from 'lucide-react';
import { loadUserSettings, readUserSettings, type UserSettings } from '@/lib/user-settings';
import { isTauriRuntime } from '@/lib/tauri';

interface Props {
  language: 'hr' | 'en';
  compact?: boolean;
  onOpenSettings?: () => void;
}

type StatusLine = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

function lineFromValue(label: string, value: string, okLabel: string, missingLabel: string): StatusLine {
  return {
    key: label,
    label,
    ok: Boolean(value.trim()),
    detail: value.trim() ? okLabel : missingLabel,
  };
}

export default function SetupStatus({ language, compact = false, onOpenSettings }: Props) {
  const [settings, setSettings] = useState<UserSettings>(() => readUserSettings());

  useEffect(() => {
    const refresh = () => {
      void loadUserSettings().then(setSettings);
    };
    refresh();
    window.addEventListener('aivalidator:settings', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('aivalidator:settings', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const t = {
    hr: {
      title: 'Setup status',
      subtitle: 'Brzi pregled lokalnih postavki, hosted servisa i desktop synca.',
      hosted: 'Hosted servis',
      byo: 'Bring-your-own keys',
      browser: 'Browser pohrana',
      desktop: 'Desktop profil',
      deepseek: 'DeepSeek',
      tavily: 'Tavily',
      github: 'GitHub',
      upstash: 'Upstash',
      hostedOk: 'Ne trebaju vanjski ključevi.',
      byoOk: 'Ključevi su spremni lokalno.',
      byoMissing: 'Neki lokalni ključevi još nedostaju.',
      localSettings: 'Lokalno spremljeno',
      openSettings: 'Otvori postavke',
      ok: 'Spremno',
      missing: 'Nedostaje',
      optional: 'Opcionalno',
      required: 'Potrebno',
      hostedNote: 'Ako koristiš naš hosted servis, dovoljno je da ostaneš u ovom modu.',
      byoNote: 'Za desktop/self-hosted način treba popuniti ključeve i izvesti .env.local.',
    },
    en: {
      title: 'Setup status',
      subtitle: 'Quick check of local settings, hosted service, and desktop sync.',
      hosted: 'Hosted service',
      byo: 'Bring-your-own keys',
      browser: 'Browser storage',
      desktop: 'Desktop profile',
      deepseek: 'DeepSeek',
      tavily: 'Tavily',
      github: 'GitHub',
      upstash: 'Upstash',
      hostedOk: 'No external keys needed.',
      byoOk: 'Keys are ready locally.',
      byoMissing: 'Some local keys are still missing.',
      localSettings: 'Saved locally',
      openSettings: 'Open settings',
      ok: 'Ready',
      missing: 'Missing',
      optional: 'Optional',
      required: 'Required',
      hostedNote: 'If you use our hosted service, this mode is enough.',
      byoNote: 'For desktop/self-hosted mode, fill the keys and export .env.local.',
    },
  }[language];

  const lines: StatusLine[] = settings.hostingMode === 'hosted'
    ? [
        { key: 'mode', label: t.hosted, ok: true, detail: t.hostedOk },
        {
          key: 'runtime',
          label: isTauriRuntime() ? t.desktop : t.browser,
          ok: true,
          detail: t.hostedNote,
        },
      ]
    : [
        lineFromValue(t.deepseek, settings.deepseekApiKey, t.byoOk, t.byoMissing),
        lineFromValue(t.tavily, settings.tavilyApiKey, t.byoOk, t.byoMissing),
        lineFromValue(t.github, settings.githubToken, t.byoOk, t.byoMissing),
        {
          key: 'upstash',
          label: t.upstash,
          ok: Boolean(settings.upstashRedisRestUrl.trim() && settings.upstashRedisRestToken.trim()),
          detail: settings.upstashRedisRestUrl.trim() && settings.upstashRedisRestToken.trim() ? t.byoOk : t.byoMissing,
        },
      ];

  const icon = settings.hostingMode === 'hosted' ? ShieldCheck : settings.deepseekApiKey ? CheckCircle2 : CircleAlert;
  const Icon = icon;

  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-300">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">{t.title}</h2>
              <p className="text-xs text-zinc-500">{t.subtitle}</p>
            </div>
          </div>
        </div>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            <CircleHelp className="h-3.5 w-3.5" />
            {t.openSettings}
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        {lines.map((line) => (
          <div key={line.key} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{line.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{line.detail}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              line.ok ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-200' : 'border-amber-800/60 bg-amber-950/30 text-amber-200'
            }`}>
              {line.ok ? t.ok : t.missing}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        {settings.hostingMode === 'hosted'
          ? (isTauriRuntime() ? t.hostedNote : t.hostedOk)
          : t.byoNote}
      </p>
    </section>
  );
}
