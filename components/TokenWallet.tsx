'use client';

import { useEffect, useState } from 'react';
import { addSimulatedPurchase, ensureStarterTokens, formatTokens, readTokenBalance, TOKEN_COSTS } from '@/lib/tokens';
import { getDesktopWallet, topUpDesktopWallet, type DesktopWallet } from '@/lib/desktop-wallet';
import { loadUserSettings, readUserSettings, type UserSettings } from '@/lib/user-settings';

interface Props {
  language: 'hr' | 'en';
  compact?: boolean;
}

export default function TokenWallet({ language, compact = false }: Props) {
  const [balance, setBalance] = useState(0);
  const [settings, setSettings] = useState<UserSettings>(() => readUserSettings());
  const [walletMeta, setWalletMeta] = useState<DesktopWallet | null>(null);

  useEffect(() => {
    queueMicrotask(async () => {
      const localBalance = ensureStarterTokens();
      setBalance(localBalance);
      try {
        const desktopWallet = await getDesktopWallet();
        if (desktopWallet) {
          setWalletMeta(desktopWallet);
          setBalance(desktopWallet.balance);
        }
      } catch {
        setBalance(localBalance);
      }
    });
    void loadUserSettings().then(setSettings);
    const refresh = () => setBalance(readTokenBalance());
    const refreshSettings = () => {
      void loadUserSettings().then(setSettings);
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('aivalidator:tokens', refresh);
    window.addEventListener('aivalidator:settings', refreshSettings);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('aivalidator:tokens', refresh);
      window.removeEventListener('aivalidator:settings', refreshSettings);
    };
  }, []);

  const t = language === 'en'
    ? {
        label: 'Tokens',
        hostedMode: 'Hosted billing',
        byoMode: 'Local wallet',
        hostedHint: 'Balance is simulated here for testing the hosted flow.',
        byoHint: 'Balance lives in your local profile for desktop or self-hosted use.',
        store: 'Saved in this browser',
        storeDesktop: 'Synced to desktop profile',
        spendTitle: 'Typical spend',
        validationCost: '1 validation',
        advisorCost: '1 advisor reply',
        topUpHintHosted: 'Test top-up adds tokens instantly with no checkout.',
        topUpHintByo: 'Top-up adds local tokens instantly for this profile.',
        starterHint: 'Starter grant',
        starterAmount: (tokens: number) => `${formatTokens(tokens)} tokens`,
        add: 'Add €10',
        added: '+10,000 tokens instantly',
      }
    : {
        label: 'Tokeni',
        hostedMode: 'Hosted naplata',
        byoMode: 'Lokalni wallet',
        hostedHint: 'Saldo je simuliran ovdje za testiranje hosted toka.',
        byoHint: 'Saldo živi u lokalnom profilu za desktop ili self-hosted setup.',
        store: 'Spremljeno u ovom browseru',
        storeDesktop: 'Sinkronizirano s desktop profilom',
        spendTitle: 'Tipična potrošnja',
        validationCost: '1 validacija',
        advisorCost: '1 odgovor savjetnika',
        topUpHintHosted: 'Test top-up odmah dodaje tokene bez checkouta.',
        topUpHintByo: 'Top-up odmah dodaje lokalne tokene ovom profilu.',
        starterHint: 'Startni bonus',
        starterAmount: (tokens: number) => `${formatTokens(tokens)} tokena`,
        add: 'Dodaj 10€',
        added: '+10.000 tokena odmah',
      };

  const modeLabel = settings.hostingMode === 'hosted' ? t.hostedMode : t.byoMode;
  const modeHint = settings.hostingMode === 'hosted' ? t.hostedHint : t.byoHint;
  const storageLabel = settings.hostingMode === 'hosted'
    ? t.store
    : t.storeDesktop;
  const topUpHint = settings.hostingMode === 'hosted' ? t.topUpHintHosted : t.topUpHintByo;
  const starterTokens = walletMeta?.starter_tokens ?? 3600;

  return (
    <div className={`rounded-xl border border-cyan-800/50 bg-cyan-950/20 ${compact ? 'px-3 py-2' : 'p-4'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">{t.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-lg font-black text-white">{formatTokens(balance)}</p>
            <span className="rounded-full border border-cyan-700/60 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
              {modeLabel}
            </span>
          </div>
          {!compact && <p className="mt-1 text-xs text-cyan-100/55">{modeHint}</p>}
          <p className="mt-1 text-[11px] text-cyan-200/60">{storageLabel}</p>
          {!compact && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/25 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">{t.spendTitle}</p>
                <p className="mt-1 text-xs text-zinc-100">{t.validationCost}: {formatTokens(TOKEN_COSTS.validation)}</p>
                <p className="mt-1 text-xs text-zinc-400">{t.advisorCost}: {formatTokens(TOKEN_COSTS.advisor_fast)}</p>
              </div>
              <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/25 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">{t.starterHint}</p>
                <p className="mt-1 text-xs text-zinc-100">{t.starterAmount(starterTokens)}</p>
                <p className="mt-1 text-xs text-zinc-400">{topUpHint}</p>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={async () => {
            const localBalance = addSimulatedPurchase(10);
            setBalance(localBalance);
            try {
              const desktopWallet = await topUpDesktopWallet(10);
              if (desktopWallet) {
                setWalletMeta(desktopWallet);
                setBalance(desktopWallet.balance);
              }
            } catch {
              setBalance(localBalance);
            }
          }}
          className="rounded-lg border border-cyan-500/60 bg-cyan-400 px-3 py-2 text-xs font-black text-zinc-950 transition-colors hover:bg-cyan-300"
          title={t.added}
        >
          {t.add}
        </button>
      </div>
    </div>
  );
}
