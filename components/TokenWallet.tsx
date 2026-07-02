'use client';

import { useEffect, useState } from 'react';
import { addSimulatedPurchase, ensureStarterTokens, formatTokens, readTokenBalance } from '@/lib/tokens';
import { getDesktopWallet, topUpDesktopWallet } from '@/lib/desktop-wallet';

interface Props {
  language: 'hr' | 'en';
  compact?: boolean;
}

export default function TokenWallet({ language, compact = false }: Props) {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    queueMicrotask(async () => {
      const localBalance = ensureStarterTokens();
      setBalance(localBalance);
      try {
        const desktopWallet = await getDesktopWallet();
        if (desktopWallet) setBalance(desktopWallet.balance);
      } catch {
        setBalance(localBalance);
      }
    });
    const refresh = () => setBalance(readTokenBalance());
    window.addEventListener('storage', refresh);
    window.addEventListener('aivalidator:tokens', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('aivalidator:tokens', refresh);
    };
  }, []);

  const t = language === 'en'
    ? {
        label: 'Tokens',
        hint: 'Test billing simulation',
        add: 'Add €10',
        added: '+10,000 tokens instantly',
      }
    : {
        label: 'Tokeni',
        hint: 'Simulacija naplate',
        add: 'Dodaj 10€',
        added: '+10.000 tokena odmah',
      };

  return (
    <div className={`rounded-xl border border-cyan-800/50 bg-cyan-950/20 ${compact ? 'px-3 py-2' : 'p-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">{t.label}</p>
          <p className="mt-0.5 text-lg font-black text-white">{formatTokens(balance)}</p>
          {!compact && <p className="mt-1 text-xs text-cyan-100/55">{t.hint}</p>}
        </div>
        <button
          type="button"
          onClick={async () => {
            const localBalance = addSimulatedPurchase(10);
            setBalance(localBalance);
            try {
              const desktopWallet = await topUpDesktopWallet(10);
              if (desktopWallet) setBalance(desktopWallet.balance);
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
