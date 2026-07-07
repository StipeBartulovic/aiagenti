'use client';

import { useEffect, useState } from 'react';
import { loadUserSettings, readUserSettings, type UserSettings } from '@/lib/user-settings';
import { isTauriRuntime } from '@/lib/tauri';

interface Props {
  language: 'hr' | 'en';
  compact?: boolean;
}

export default function AccountModeNotice({ language, compact = false }: Props) {
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

  const t = language === 'en'
    ? {
        hosted: 'Hosted service',
        byo: 'Local BYO mode',
        hostedBody: 'You are using our hosted flow, so keys are not required here.',
        byoBody: 'You are using your own local setup, so keys and wallet data stay with this device.',
        browser: 'Browser storage',
        desktop: 'Desktop profile',
      }
    : {
        hosted: 'Hosted servis',
        byo: 'Lokalni BYO mode',
        hostedBody: 'Koristiš naš hosted tok pa ti vlastiti ključevi ovdje nisu potrebni.',
        byoBody: 'Koristiš svoj lokalni setup pa ključevi i wallet podaci ostaju na ovom uređaju.',
        browser: 'Browser pohrana',
        desktop: 'Desktop profil',
      };

  const title = settings.hostingMode === 'hosted' ? t.hosted : t.byo;
  const body = settings.hostingMode === 'hosted' ? t.hostedBody : t.byoBody;
  const storage = isTauriRuntime() ? t.desktop : t.browser;

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/70 ${compact ? 'px-3 py-2' : 'p-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-200">
          {title}
        </span>
        <span className="rounded-full border border-cyan-800/50 bg-cyan-950/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
          {storage}
        </span>
      </div>
      <p className={`mt-2 max-w-full break-words leading-relaxed text-zinc-400 ${compact ? 'text-xs' : 'text-sm'}`}>{body}</p>
    </div>
  );
}
