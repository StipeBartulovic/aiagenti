'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Download, KeyRound, ServerCog, ShieldCheck, Sparkles, Settings2, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  DEFAULT_USER_SETTINGS,
  exportEnvBlock,
  loadUserSettings,
  saveUserSettings,
  clearUserSettings,
  type UserSettings,
} from '@/lib/user-settings';
import SetupStatus from '@/components/SetupStatus';
import AccountModeNotice from '@/components/AccountModeNotice';
import LocalProfileBadge from '@/components/LocalProfileBadge';

export default function SettingsPage() {
  const router = useRouter();
  const { language } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [savedNotice, setSavedNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void loadUserSettings().then(setSettings);
  }, []);

  const t = {
    hr: {
      back: 'Natrag',
      title: 'Postavke profila i API ključeva',
      subtitle: 'Sve lokalne postavke na jednom mjestu. Ako koristiš AI Validator hosted servis, API ključevi ti ne trebaju.',
      quickTitle: 'Brzi vodič',
      quickStep1: 'Odaberi hosted servis ako koristiš našu infrastrukturu i ne želiš vlastite ključeve.',
      quickStep2: 'Odaberi bring-your-own mode ako želiš vlastite API ključeve ili desktop/self-hosted setup.',
      quickStep3: 'Sve što upišeš ostaje lokalno i možeš izvesti kao .env.local.',
      localTitle: 'Lokalni profil',
      workspaceName: 'Ime workspacea',
      workspaceHelp: 'Ovo je samo lokalna oznaka na ovom uređaju.',
      modeTitle: 'Način rada',
      modeSubtitle: 'Odaberi jednu jasnu stazu rada. Ovo određuje trebaš li vlastite ključeve i kako koristiš wallet.',
      activePath: 'Aktivna staza',
      hostedBadge: 'Bez vlastitih ključeva',
      byoBadge: 'Vlastiti ključevi i lokalni setup',
      hosted: 'Koristim AI Validator hosted servis',
      hostedHelp: 'Ne trebaš vlastite API ključeve. Aplikacija koristi našu infrastrukturu i billing simulaciju.',
      hostedPoints: ['DeepSeek i web alati dolaze kroz naš servis.', 'Wallet i tokeni rade kroz hosted tok.', 'Najbrži put za testiranje bez tehničkog setupa.'],
      byo: 'Koristim svoje API ključeve',
      byoHelp: 'Upisuješ vlastite ključeve i koristiš ih za lokalni razvoj, desktop build ili self-hosting.',
      byoPoints: ['Ključevi i endpointi ostaju vezani uz tvoj uređaj.', 'Pogodno za desktop build i self-hosted rad.', 'Nakon spremanja možeš izvesti .env.local blok.'],
      apiTitle: 'API ključevi i integracije',
      apiHelp: 'Ovi podaci ostaju lokalno u browseru ili desktop aplikaciji. Ne šalju se automatski na naš server.',
      apiHostedTitle: 'Hosted servis je spreman',
      apiHostedHelp: 'Za ovu stazu nema ručnog unosa ključeva. Dovoljno je spremiti profil i krenuti raditi.',
      apiByoTitle: 'Lokalni BYO setup',
      apiByoHelp: 'Ovdje upisuješ svoje ključeve i endpointe koje želiš koristiti na ovom uređaju.',
      deepseek: 'DeepSeek API key',
      tavily: 'Tavily API key',
      github: 'GitHub token',
      upstashUrl: 'Upstash REST URL',
      upstashToken: 'Upstash REST token',
      desktopSecret: 'Desktop shared secret',
      desktopApiKey: 'Desktop API key',
      desktopApiUrl: 'Desktop AI URL',
      desktopWalletUrl: 'Desktop wallet URL',
      secretHint: 'Koristi password polje za tajne. Ako koristiš hosted servis, može ostati prazno.',
      exportTitle: 'Export / reset',
      exportHelp: 'Možeš kopirati .env.local block ili obrisati lokalne postavke.',
      exportButton: 'Kopiraj .env.local',
      saveButton: 'Spremi lokalno',
      resetButton: 'Obriši lokalno',
      saved: 'Postavke su spremljene lokalno.',
      copied: 'Kopirano u clipboard.',
      cleared: 'Lokalne postavke su obrisane.',
      noteTitle: 'Kako ovo radi',
      noteBody: 'Hosted servis ne traži ključeve. Bring-your-own mode je za lokalni desktop/self-hosted setup i tada možeš kopirati vrijednosti u .env.local.',
    },
    en: {
      back: 'Back',
      title: 'Profile and API settings',
      subtitle: 'Keep all local settings in one place. If you use the AI Validator hosted service, you do not need API keys.',
      quickTitle: 'Quick guide',
      quickStep1: 'Choose the hosted service if you use our infrastructure and do not want to manage keys.',
      quickStep2: 'Choose bring-your-own mode if you want your own API keys or a desktop/self-hosted setup.',
      quickStep3: 'Everything you enter stays local and can be exported as .env.local.',
      localTitle: 'Local profile',
      workspaceName: 'Workspace name',
      workspaceHelp: 'This is only a local label on this device.',
      modeTitle: 'Mode',
      modeSubtitle: 'Choose one clear path. This decides whether you need your own keys and how the wallet is used.',
      activePath: 'Active path',
      hostedBadge: 'No personal keys needed',
      byoBadge: 'Own keys and local setup',
      hosted: 'I use AI Validator hosted service',
      hostedHelp: 'You do not need your own API keys. The app uses our infrastructure and billing simulation.',
      hostedPoints: ['DeepSeek and web tools come through our service.', 'Wallet and tokens run through the hosted flow.', 'Fastest path for testing without technical setup.'],
      byo: 'I use my own API keys',
      byoHelp: 'Enter your own keys for local development, desktop builds, or self-hosting.',
      byoPoints: ['Keys and endpoints stay tied to this device.', 'Good for desktop builds and self-hosted work.', 'After saving, you can export a .env.local block.'],
      apiTitle: 'API keys and integrations',
      apiHelp: 'These values stay local in the browser or desktop app. They are not automatically sent to our server.',
      apiHostedTitle: 'Hosted service is ready',
      apiHostedHelp: 'This path does not need manual key entry. Save the profile and start working.',
      apiByoTitle: 'Local BYO setup',
      apiByoHelp: 'Enter the keys and endpoints you want to use on this device.',
      deepseek: 'DeepSeek API key',
      tavily: 'Tavily API key',
      github: 'GitHub token',
      upstashUrl: 'Upstash REST URL',
      upstashToken: 'Upstash REST token',
      desktopSecret: 'Desktop shared secret',
      desktopApiKey: 'Desktop API key',
      desktopApiUrl: 'Desktop AI URL',
      desktopWalletUrl: 'Desktop wallet URL',
      secretHint: 'Use password fields for secrets. If you use the hosted service, these can stay empty.',
      exportTitle: 'Export / reset',
      exportHelp: 'You can copy a .env.local block or clear the local settings.',
      exportButton: 'Copy .env.local',
      saveButton: 'Save locally',
      resetButton: 'Clear local data',
      saved: 'Settings saved locally.',
      copied: 'Copied to clipboard.',
      cleared: 'Local settings were cleared.',
      noteTitle: 'How this works',
      noteBody: 'The hosted service does not need keys. Bring-your-own mode is for local desktop/self-hosted setups and lets you copy values into .env.local.',
    },
  }[language];

  const update = (key: keyof UserSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavedNotice('');
    setCopied(false);
  };

  const handleSave = async () => {
    const next = await saveUserSettings(settings);
    setSettings(next);
    setSavedNotice(t.saved);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportEnvBlock(settings));
    setCopied(true);
    setSavedNotice(t.copied);
  };

  const handleReset = async () => {
    const next = await clearUserSettings();
    setSettings(next);
    setSavedNotice(t.cleared);
    setCopied(false);
  };

  const fieldClass = 'w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-cyan-600';
  const modeCardClass = (active: boolean) =>
    `rounded-2xl border p-4 text-left transition-colors ${
      active
        ? 'border-cyan-500 bg-cyan-950/25 shadow-[0_0_0_1px_rgba(8,145,178,0.2)]'
        : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-600'
    }`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.back}
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-300">
                <Settings2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                <p className="text-xs leading-relaxed text-zinc-500">{t.subtitle}</p>
              </div>
            </div>
          </div>
          <div className="sm:hidden">
            <LocalProfileBadge language={language} />
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <LocalProfileBadge language={language} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/20 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-100">{t.quickTitle}</h2>
              </div>
              <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
                <p>{t.quickStep1}</p>
                <p>{t.quickStep2}</p>
                <p>{t.quickStep3}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">{t.localTitle}</h2>
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.workspaceName}</span>
                  <input
                    className={fieldClass}
                    value={settings.workspaceName}
                    onChange={(e) => update('workspaceName', e.target.value)}
                    placeholder="AI Validator"
                  />
                </label>
                <p className="text-xs leading-relaxed text-zinc-500">{t.workspaceHelp}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">{t.modeTitle}</h2>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-zinc-500">{t.modeSubtitle}</p>

              <div className="mb-4 rounded-2xl border border-cyan-900/40 bg-cyan-950/15 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{t.activePath}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-700/50 bg-cyan-950/40 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                    {settings.hostingMode === 'hosted' ? t.hosted : t.byo}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-2.5 py-1 text-xs text-zinc-300">
                    {settings.hostingMode === 'hosted' ? t.hostedBadge : t.byoBadge}
                  </span>
                </div>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => update('hostingMode', 'hosted')}
                  className={modeCardClass(settings.hostingMode === 'hosted')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{t.hosted}</p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t.hostedHelp}</p>
                    </div>
                    {settings.hostingMode === 'hosted' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />}
                  </div>
                  <div className="mt-3 space-y-2">
                    {t.hostedPoints.map((point) => (
                      <div key={point} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-300">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => update('hostingMode', 'bring_your_own')}
                  className={modeCardClass(settings.hostingMode === 'bring_your_own')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{t.byo}</p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t.byoHelp}</p>
                    </div>
                    {settings.hostingMode === 'bring_your_own' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />}
                  </div>
                  <div className="mt-3 space-y-2">
                    {t.byoPoints.map((point) => (
                      <div key={point} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-300">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="mb-4 flex items-center gap-2">
                {settings.hostingMode === 'hosted' ? <ShieldCheck className="h-4 w-4 text-cyan-300" /> : <ServerCog className="h-4 w-4 text-cyan-300" />}
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">{t.apiTitle}</h2>
              </div>
              <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                <p className="text-sm font-semibold text-white">
                  {settings.hostingMode === 'hosted' ? t.apiHostedTitle : t.apiByoTitle}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {settings.hostingMode === 'hosted' ? t.apiHostedHelp : t.apiByoHelp}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{t.apiHelp}</p>
              </div>

              {settings.hostingMode === 'hosted' ? (
                <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4">
                  <p className="text-sm font-semibold text-emerald-200">{language === 'en' ? 'No API keys needed' : 'API ključevi nisu potrebni'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">
                    {language === 'en'
                      ? 'The hosted service already includes DeepSeek, web search, wallet simulation, and the desktop bridge.'
                      : 'Hosted servis već uključuje DeepSeek, web pretragu, simulaciju walleta i desktop bridge.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.deepseek}</span>
                      <input className={fieldClass} type="password" value={settings.deepseekApiKey} onChange={(e) => update('deepseekApiKey', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.tavily}</span>
                      <input className={fieldClass} type="password" value={settings.tavilyApiKey} onChange={(e) => update('tavilyApiKey', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.github}</span>
                      <input className={fieldClass} type="password" value={settings.githubToken} onChange={(e) => update('githubToken', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.upstashUrl}</span>
                      <input className={fieldClass} value={settings.upstashRedisRestUrl} onChange={(e) => update('upstashRedisRestUrl', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.upstashToken}</span>
                      <input className={fieldClass} type="password" value={settings.upstashRedisRestToken} onChange={(e) => update('upstashRedisRestToken', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.desktopSecret}</span>
                      <input className={fieldClass} type="password" value={settings.desktopSharedSecret} onChange={(e) => update('desktopSharedSecret', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.desktopApiKey}</span>
                      <input className={fieldClass} type="password" value={settings.aiValidatorDesktopApiKey} onChange={(e) => update('aiValidatorDesktopApiKey', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.desktopApiUrl}</span>
                      <input className={fieldClass} value={settings.aiValidatorDesktopApiUrl} onChange={(e) => update('aiValidatorDesktopApiUrl', e.target.value)} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-zinc-400">{t.desktopWalletUrl}</span>
                      <input className={fieldClass} value={settings.aiValidatorDesktopWalletUrl} onChange={(e) => update('aiValidatorDesktopWalletUrl', e.target.value)} />
                    </label>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-zinc-500">{t.secretHint}</p>
                </>
              )}
            </div>
          </section>

          <aside className="space-y-6 lg:sticky lg:top-[88px] lg:self-start">
            <AccountModeNotice language={language} />
            <SetupStatus language={language} compact />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">{t.exportTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{t.exportHelp}</p>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-cyan-400"
                >
                  <Download className="h-4 w-4" />
                  {t.exportButton}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
                >
                  {t.saveButton}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-900/60 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:border-red-500 hover:text-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  {t.resetButton}
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-500">
                {copied ? t.copied : savedNotice || t.secretHint}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">{t.noteTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{t.noteBody}</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
