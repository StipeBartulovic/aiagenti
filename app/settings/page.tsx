'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_USER_SETTINGS,
  exportEnvBlock,
  loadUserSettings,
  saveUserSettings,
  clearUserSettings,
  type UserSettings,
} from '@/lib/user-settings';
import { isTauriRuntime } from '@/lib/tauri';
import {
  formatTokens,
  readTokenBalance,
  readTokenLog,
  ensureStarterTokens,
  TOKEN_COSTS,
  type TokenLogEntry,
} from '@/lib/tokens';

export default function SettingsPage() {
  const router = useRouter();
  const { language, setLanguage } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [balance, setBalance] = useState(0);
  const [log, setLog] = useState<TokenLogEntry[]>([]);
  const [savedNotice, setSavedNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const isDesktop = isTauriRuntime();

  useEffect(() => {
    void loadUserSettings().then((s) => {
      setSettings(s);
      setNameDraft(s.workspaceName);
    });
    const refreshTokens = () => {
      setBalance(readTokenBalance());
      setLog(readTokenLog());
    };
    setBalance(ensureStarterTokens());
    setLog(readTokenLog());
    window.addEventListener('aivalidator:tokens', refreshTokens);
    return () => window.removeEventListener('aivalidator:tokens', refreshTokens);
  }, []);

  const t = {
    hr: {
      back: '← Natrag',
      kicker: 'Protokol — profil i ključevi',
      title: 'Postavke',
      subtitle:
        'Ovo je lokalni profil, ne korisnički račun. Nema prijave, nema lozinke — sve živi u ovom browseru (ili na ovom uređaju ako koristiš desktop app).',
      identityKicker: 'Identitet',
      workspaceName: 'Ime profila',
      workspaceHelp: 'Samo lokalna oznaka — vidiš je samo ti, na ovom uređaju.',
      save: 'Spremi ime',
      noLoginTitle: 'Bez prijave — namjerno',
      noLoginBody:
        'Nema emaila, lozinke ni oblaka. Ako obrišeš cache preglednika ili promijeniš uređaj, profil i saldo tokena ostaju iza — ne prenose se.',
      storageBrowser: 'Pohrana: ovaj preglednik (localStorage)',
      storageDesktop: 'Pohrana: desktop profil (sinkronizirano)',
      modeKicker: 'Način rada',
      modeSubtitle: 'Jedna staza. Određuje trebaš li vlastite API ključeve.',
      hosted: 'Hosted servis',
      hostedHelp: 'Ne trebaš ključeve. Aplikacija koristi našu infrastrukturu i billing simulaciju.',
      byo: 'Vlastiti ključevi (BYO)',
      byoHelp: 'Upisuješ vlastite API ključeve za lokalni razvoj, desktop build ili self-hosting.',
      keysKicker: 'API ključevi',
      keysHostedNote: 'Hosted staza je aktivna — ručni unos ključeva nije potreban.',
      keysByoNote: 'Ovi podaci ostaju lokalno. Ne šalju se automatski na naš server.',
      deepseek: 'DeepSeek API key',
      tavily: 'Tavily API key',
      github: 'GitHub token',
      upstashUrl: 'Upstash REST URL',
      upstashToken: 'Upstash REST token',
      desktopSecret: 'Desktop shared secret',
      desktopApiKey: 'Desktop API key',
      desktopApiUrl: 'Desktop AI URL',
      desktopWalletUrl: 'Desktop wallet URL',
      ledgerKicker: 'Potrošnja tokena — evidencija',
      ledgerSubtitle: 'Svaka AI akcija zapisuje se ovdje: što, koliko i saldo poslije. Zadnjih 50 stavki, lokalno.',
      ledgerEmpty: 'Još nema zabilježene potrošnje. Prva AI akcija će se pojaviti ovdje.',
      ledgerBalance: 'Trenutni saldo',
      typeSpend: 'Potrošeno',
      typeTopup: 'Dopuna',
      typeStarter: 'Startni bonus',
      costsKicker: 'Cjenik akcija',
      costValidation: 'Validacija (100 kupaca)',
      costAudience: 'Prijedlog publika',
      costTool: 'Report alat (lagani)',
      costToolResearch: 'Report alat (istraživanje)',
      costAdvisorFast: 'Odgovor savjetnika',
      costAdvisorDeep: 'Dublji odgovor savjetnika',
      costAdvisorTask: 'Kreiranje taska',
      costAdvisorSetup: 'Priprema savjetnika',
      exportTitle: 'Izvoz / reset',
      exportHelp: 'Kopiraj .env.local blok ili obriši lokalni profil (postavke, saldo, evidenciju).',
      exportButton: 'Kopiraj .env.local',
      resetButton: 'Obriši lokalni profil',
      resetConfirm: 'Ovo briše profil, saldo i evidenciju na ovom uređaju. Sigurno?',
      saved: 'Spremljeno lokalno.',
      copiedMsg: 'Kopirano u clipboard.',
      cleared: 'Lokalni profil je obrisan.',
    },
    en: {
      back: '← Back',
      kicker: 'Protocol — profile and keys',
      title: 'Settings',
      subtitle:
        'This is a local profile, not a user account. No login, no password — everything lives in this browser (or on this device if you use the desktop app).',
      identityKicker: 'Identity',
      workspaceName: 'Profile name',
      workspaceHelp: 'A local label only — visible to you, on this device.',
      save: 'Save name',
      noLoginTitle: 'No login — on purpose',
      noLoginBody:
        'No email, no password, no cloud. If you clear browser cache or switch devices, the profile and token balance are left behind — they do not carry over.',
      storageBrowser: 'Storage: this browser (localStorage)',
      storageDesktop: 'Storage: desktop profile (synced)',
      modeKicker: 'Mode',
      modeSubtitle: 'One clear path. Decides whether you need your own API keys.',
      hosted: 'Hosted service',
      hostedHelp: 'No keys needed. The app uses our infrastructure and billing simulation.',
      byo: 'Own keys (BYO)',
      byoHelp: 'Enter your own API keys for local development, desktop builds, or self-hosting.',
      keysKicker: 'API keys',
      keysHostedNote: 'Hosted path is active — manual key entry is not needed.',
      keysByoNote: 'These values stay local. They are not automatically sent to our server.',
      deepseek: 'DeepSeek API key',
      tavily: 'Tavily API key',
      github: 'GitHub token',
      upstashUrl: 'Upstash REST URL',
      upstashToken: 'Upstash REST token',
      desktopSecret: 'Desktop shared secret',
      desktopApiKey: 'Desktop API key',
      desktopApiUrl: 'Desktop AI URL',
      desktopWalletUrl: 'Desktop wallet URL',
      ledgerKicker: 'Token spend — ledger',
      ledgerSubtitle: 'Every AI action is logged here: what, how much, and the balance after. Last 50 entries, local.',
      ledgerEmpty: 'No spending logged yet. The first AI action will show up here.',
      ledgerBalance: 'Current balance',
      typeSpend: 'Spent',
      typeTopup: 'Top-up',
      typeStarter: 'Starter bonus',
      costsKicker: 'Action pricing',
      costValidation: 'Validation (100 buyers)',
      costAudience: 'Audience suggestions',
      costTool: 'Report tool (light)',
      costToolResearch: 'Report tool (research)',
      costAdvisorFast: 'Advisor reply',
      costAdvisorDeep: 'Advisor deep reply',
      costAdvisorTask: 'Task creation',
      costAdvisorSetup: 'Advisor setup',
      exportTitle: 'Export / reset',
      exportHelp: 'Copy a .env.local block or clear the local profile (settings, balance, ledger).',
      exportButton: 'Copy .env.local',
      resetButton: 'Clear local profile',
      resetConfirm: 'This deletes the profile, balance, and ledger on this device. Sure?',
      saved: 'Saved locally.',
      copiedMsg: 'Copied to clipboard.',
      cleared: 'Local profile was cleared.',
    },
  }[language];

  const update = (key: keyof UserSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavedNotice('');
    setCopied(false);
  };

  const handleSave = async (patch?: Partial<UserSettings>) => {
    const next = await saveUserSettings({ ...settings, ...patch });
    setSettings(next);
    setSavedNotice(t.saved);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportEnvBlock(settings));
    setCopied(true);
    setSavedNotice(t.copiedMsg);
  };

  const handleReset = async () => {
    if (!window.confirm(t.resetConfirm)) return;
    const next = await clearUserSettings();
    setSettings(next);
    setBalance(readTokenBalance());
    setLog(readTokenLog());
    setSavedNotice(t.cleared);
    setCopied(false);
  };

  const costRows: { label: string; value: number }[] = [
    { label: t.costValidation, value: TOKEN_COSTS.validation },
    { label: t.costAudience, value: TOKEN_COSTS.audience_suggest },
    { label: t.costTool, value: TOKEN_COSTS.tool_light },
    { label: t.costToolResearch, value: TOKEN_COSTS.tool_research },
    { label: t.costAdvisorFast, value: TOKEN_COSTS.advisor_fast },
    { label: t.costAdvisorDeep, value: TOKEN_COSTS.advisor_deep },
    { label: t.costAdvisorTask, value: TOKEN_COSTS.advisor_task },
    { label: t.costAdvisorSetup, value: TOKEN_COSTS.advisor_setup },
  ];

  const logTypeMeta: Record<TokenLogEntry['type'], { label: string; color: string }> = {
    spend: { label: t.typeSpend, color: 'text-[var(--verdict-red)]' },
    topup: { label: t.typeTopup, color: 'text-[var(--verdict-green)]' },
    starter: { label: t.typeStarter, color: 'text-[var(--verdict-green)]' },
  };

  const formatTs = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="paper-root min-h-screen">
      {/* ── Masthead: isti obrazac kao landing ── */}
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="link-ink flex items-baseline gap-3 text-left text-sm"
          >
            {t.back}
          </button>
          <div className="flex items-center gap-5">
            <div className="font-data flex items-center gap-1 text-xs">
              <button
                onClick={() => setLanguage('hr')}
                className={`cursor-pointer px-1 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                  language === 'hr' ? 'text-[var(--verdict-red)] underline underline-offset-4' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
                }`}
              >
                HR
              </button>
              <span className="text-[var(--hairline-strong)]">/</span>
              <button
                onClick={() => setLanguage('en')}
                className={`cursor-pointer px-1 py-0.5 font-semibold uppercase tracking-wider transition-colors ${
                  language === 'en' ? 'text-[var(--verdict-red)] underline underline-offset-4' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-8">
        <section className="pt-10 sm:pt-14">
          <p className="kicker">{t.kicker}</p>
          <h1 className="mt-3 text-4xl text-[var(--ink)] sm:text-5xl">{t.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
        </section>

        {/* ── Identitet: rješava "ne vidim profil" ── */}
        <section className="mt-10">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.identityKicker}</p>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_16rem]">
            <div className="sheet p-5">
              <label className={'kicker !text-[var(--ink-soft)] mb-1.5 block'}>{t.workspaceName}</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="paper-field flex-1"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="AI Validator"
                />
                <button type="button" onClick={() => handleSave({ workspaceName: nameDraft })} className="btn-line shrink-0 text-xs">
                  {t.save}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-faint)]">{t.workspaceHelp}</p>
              <p className="font-data mt-3 text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                {isDesktop ? t.storageDesktop : t.storageBrowser}
              </p>
            </div>
            <div className="border-2 border-[var(--ink)] p-4">
              <span className="stamp stamp--green !text-[10px]">{t.noLoginTitle}</span>
              <p className="mt-3 text-xs leading-relaxed text-[var(--ink-soft)]">{t.noLoginBody}</p>
            </div>
          </div>
        </section>

        {/* ── Ledger potrošnje: rješava "kako pratimo tko je potrošio koliko" ── */}
        <section className="mt-14">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.ledgerKicker}</p>
          </div>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_16rem]">
            <div className="sheet max-h-[26rem] overflow-y-auto p-5">
              {log.length === 0 ? (
                <p className="text-sm text-[var(--ink-faint)]">{t.ledgerEmpty}</p>
              ) : (
                <div className="space-y-3">
                  {log.map((entry, i) => {
                    const meta = logTypeMeta[entry.type];
                    return (
                      <div key={`${entry.ts}-${i}`} className="border-b border-[var(--hairline)] pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-[var(--ink)]">{entry.label}</span>
                          <span className={`font-data shrink-0 text-sm font-semibold ${meta.color}`}>
                            {entry.amount > 0 ? '+' : ''}
                            {formatTokens(entry.amount)}
                          </span>
                        </div>
                        <div className="font-data mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-[var(--ink-faint)]">
                          <span>
                            {meta.label} · {formatTs(entry.ts)}
                          </span>
                          <span>= {formatTokens(entry.balance_after)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <div className="border-2 border-[var(--ink)] p-4">
                <p className="kicker !text-[var(--ink-soft)]">{t.ledgerBalance}</p>
                <p className="font-data mt-1 text-3xl font-semibold text-[var(--ink)]">{formatTokens(balance)}</p>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-[var(--ink-faint)]">{t.ledgerSubtitle}</p>
            </div>
          </div>
        </section>

        {/* ── Cjenik akcija ── */}
        <section className="mt-14">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.costsKicker}</p>
          </div>
          <div className="mt-5 space-y-3">
            {costRows.map((row) => (
              <div key={row.label} className="leader-row text-sm">
                <span className="text-[var(--ink-soft)]">{row.label}</span>
                <span className="leader-fill" />
                <span className="font-data text-[13px] font-semibold text-[var(--ink)]">{formatTokens(row.value)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Način rada ── */}
        <section className="mt-14">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.modeKicker}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{t.modeSubtitle}</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(
              [
                { mode: 'hosted' as const, title: t.hosted, help: t.hostedHelp },
                { mode: 'bring_your_own' as const, title: t.byo, help: t.byoHelp },
              ]
            ).map(({ mode, title, help }) => {
              const active = settings.hostingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSave({ hostingMode: mode })}
                  className={`cursor-pointer rounded-[3px] border p-4 text-left transition-all ${
                    active
                      ? 'border-[var(--ink)] bg-[var(--paper-raised)] shadow-[3px_3px_0_rgba(27,23,18,0.15)]'
                      : 'border-[var(--hairline)] opacity-70 hover:opacity-100 hover:border-[var(--hairline-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-[var(--ink)]">{title}</p>
                    {active && <span className="font-data text-xs text-[var(--verdict-green)]">✓</span>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">{help}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── API ključevi ── */}
        <section className="mt-14">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.keysKicker}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {settings.hostingMode === 'hosted' ? t.keysHostedNote : t.keysByoNote}
            </p>
          </div>

          {settings.hostingMode === 'bring_your_own' && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['deepseekApiKey', t.deepseek],
                  ['tavilyApiKey', t.tavily],
                  ['githubToken', t.github],
                  ['upstashRedisRestUrl', t.upstashUrl],
                  ['upstashRedisRestToken', t.upstashToken],
                  ['desktopSharedSecret', t.desktopSecret],
                  ['aiValidatorDesktopApiKey', t.desktopApiKey],
                  ['aiValidatorDesktopApiUrl', t.desktopApiUrl],
                  ['aiValidatorDesktopWalletUrl', t.desktopWalletUrl],
                ] as [keyof UserSettings, string][]
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="kicker !text-[var(--ink-soft)] mb-1.5 block">{label}</label>
                  <input
                    className="paper-field"
                    type={key.toLowerCase().includes('url') ? 'text' : 'password'}
                    value={settings[key] as string}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <button type="button" onClick={() => handleSave()} className="btn-ink text-sm">
                  {t.save}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Izvoz / reset ── */}
        <section className="mt-14">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.exportTitle}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{t.exportHelp}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={handleCopy} className="btn-ink text-sm">
              {t.exportButton}
            </button>
            <button type="button" onClick={handleReset} className="btn-line !border-[var(--verdict-red)] !text-[var(--verdict-red)] text-sm">
              {t.resetButton}
            </button>
          </div>
          {(copied || savedNotice) && (
            <p className="font-data mt-3 text-xs uppercase tracking-wider text-[var(--verdict-green)]">
              {copied ? t.copiedMsg : savedNotice}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
