'use client';

import { useEffect, useState } from 'react';
import {
  isFileSystemAccessSupported,
  connectVault,
  getSavedVault,
  writeNotes,
} from '@/lib/obsidian-fs';
import { aiClient } from '@/lib/ai-client';
import type { IdeaFormData, MarketIntelligence, ValidationReport } from '@/lib/types';

interface Props {
  report: ValidationReport;
  form: IdeaFormData | null;
  language: 'hr' | 'en';
  market?: MarketIntelligence | null;
}

type State = 'idle' | 'connecting' | 'syncing' | 'done' | 'error';

export default function ObsidianSync({ report, form, language, market }: Props) {
  const [supported, setSupported] = useState(true);
  const [vault, setVault] = useState<string | null>(null);
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState('');

  const t = {
    hr: {
      connect: '📝 Spoji Obsidian',
      sync: '📝 Sync u Obsidian',
      connecting: 'Otvaram...',
      syncing: 'Zapisujem...',
      reconnect: 'Spoji ponovno',
      vaultLabel: 'Vault',
      unsupported: 'Obsidian sync traži Chrome/Edge',
      doneN: (n: number) => `✓ ${n} nota u "${vault}"`,
      err: 'Greška pri syncu',
    },
    en: {
      connect: '📝 Connect Obsidian',
      sync: '📝 Sync to Obsidian',
      connecting: 'Opening...',
      syncing: 'Writing...',
      reconnect: 'Reconnect',
      vaultLabel: 'Vault',
      unsupported: 'Obsidian sync needs Chrome/Edge',
      doneN: (n: number) => `✓ ${n} notes in "${vault}"`,
      err: 'Sync error',
    },
  }[language];

  useEffect(() => {
    if (!isFileSystemAccessSupported()) {
      queueMicrotask(() => setSupported(false));
      return;
    }
    getSavedVault().then((v) => v && setVault(v.name));
  }, []);

  const handleConnect = async () => {
    setState('connecting');
    setMsg('');
    try {
      const v = await connectVault();
      if (v) setVault(v.name);
      setState('idle');
    } catch (e) {
      setState('error');
      setMsg(e instanceof Error ? e.message : t.err);
    }
  };

  const handleSync = async () => {
    setState('syncing');
    setMsg('');
    try {
      const data = await aiClient.buildObsidianVault<{ notes: Parameters<typeof writeNotes>[0] }>(
        {
          idea: form ?? ({ product_name: report.meta.product_name } as IdeaFormData),
          report,
          market: market ?? null,
          language,
        },
        t.err
      );
      const n = await writeNotes(data.notes);
      setState('done');
      setMsg(t.doneN(n));
    } catch (e) {
      setState('error');
      setMsg(e instanceof Error ? e.message : t.err);
    }
  };

  if (!supported) {
    return (
      <span className="text-[11px] text-zinc-600 hidden md:inline" title={t.unsupported}>
        {t.unsupported}
      </span>
    );
  }

  const busy = state === 'connecting' || state === 'syncing';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {msg && (
        <span className={`text-[11px] ${state === 'error' ? 'text-red-400' : 'text-violet-400'} hidden lg:inline`}>
          {msg}
        </span>
      )}
      {!vault ? (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="text-xs font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-lg px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          {state === 'connecting' ? t.connecting : t.connect}
        </button>
      ) : (
        <button
          onClick={handleSync}
          disabled={busy}
          title={`${t.vaultLabel}: ${vault}`}
          className="text-xs font-medium text-violet-200 border border-violet-600/50 bg-violet-950/40 hover:bg-violet-900/40 rounded-lg px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          {state === 'syncing' ? t.syncing : t.sync}
        </button>
      )}
    </div>
  );
}
