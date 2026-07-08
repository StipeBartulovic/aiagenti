'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdeaForm from '@/components/IdeaForm';
import AudiencePicker from '@/components/AudiencePicker';
import LoadingScreen from '@/components/LoadingScreen';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { TOKEN_COSTS, addSimulatedPurchase, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type { IdeaFormData, SegmentSpec } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  const { loading: authLoading, language, setLanguage } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [error, setError] = useState('');
  const [topupNotice, setTopupNotice] = useState(false);
  const [hasStoredReport, setHasStoredReport] = useState(() =>
    typeof window !== 'undefined' ? Boolean(window.sessionStorage.getItem('aivalidator_report')) : false
  );
  // Tok: forma → (prijedlog publika) → picker → simulacija
  const [pendingForm, setPendingForm] = useState<IdeaFormData | null>(null);
  const [candidates, setCandidates] = useState<SegmentSpec[] | null>(null);
  const [lastFailedForm, setLastFailedForm] = useState<IdeaFormData | null>(null);

  const handleError = (msg: string) => {
    setLoading(false);
    setLoadingAudiences(false);
    const normalized = msg.toLowerCase();
    if (normalized.includes('deepseek_api_key')) {
      setError(language === 'en'
        ? 'AI engine is not configured yet. Add DEEPSEEK_API_KEY to environment variables and redeploy/restart the app.'
        : 'AI engine još nije konfiguriran. Dodaj DEEPSEEK_API_KEY u environment variables i napravi redeploy/restart aplikacije.');
    } else if (normalized.includes('tavily_api_key')) {
      setError(language === 'en'
        ? 'Research search is not configured yet. Add TAVILY_API_KEY to environment variables and redeploy/restart the app.'
        : 'Research pretraga još nije konfigurirana. Dodaj TAVILY_API_KEY u environment variables i napravi redeploy/restart aplikacije.');
    } else if (normalized.includes('timeout') || normalized.includes('timed out')) {
      setError(language === 'en'
        ? 'The analysis took too long. Try again with a shorter description or fewer selected audiences.'
        : 'Analiza je trajala predugo. Pokušaj ponovno s kraćim opisom ili manje odabranih publika.');
    } else if (normalized.includes('prekratak') || normalized.includes('invalid idea')) {
      setError(language === 'en'
        ? 'The idea is too short or unclear. Add one concrete customer, problem, and price.'
        : 'Ideja je prekratka ili nejasna. Dodaj konkretnog kupca, problem i cijenu.');
    } else {
      setError(msg);
    }
  };

  const requireTokens = (cost: number, label: string) => {
    const result = spendTokens(cost, label);
    if (result.ok) return true;
    setError(tokenShortfallMessage(language, label, cost, result.missing));
    return false;
  };

  // Pokreni punu simulaciju (s odabranim segmentima ili bez njih = generička publika)
  const runValidate = async (form: IdeaFormData) => {
    if (!requireTokens(TOKEN_COSTS.validation, language === 'en' ? 'Validation with simulated buyers' : 'Validacija sa simuliranim kupcima')) return;
    setError('');
    setCandidates(null);
    setLoading(true);
    try {
      const data = await aiClient.validateIdea(form, language === 'en' ? 'Server error' : 'Greška na serveru');
      sessionStorage.setItem('aivalidator_form', JSON.stringify(form));
      sessionStorage.setItem('aivalidator_report', JSON.stringify(data));
      setHasStoredReport(true);
      sessionStorage.removeItem('aivalidator_project_id'); // novi test = još nespremljen projekt
      router.push('/results');
    } catch (err) {
      setLastFailedForm(form);
      handleError(err instanceof Error ? err.message : language === 'en' ? 'Error' : 'Greška');
    }
  };

  // Forma popunjena → zatraži prijedlog ciljanih publika (graceful fallback na generički test)
  const handleIdeaReady = async (form: IdeaFormData) => {
    setError('');
    setPendingForm(form);
    setLoadingAudiences(true);
    try {
      if (!requireTokens(TOKEN_COSTS.audience_suggest, language === 'en' ? 'Audience suggestions' : 'Prijedlog publika')) {
        setLoadingAudiences(false);
        return;
      }
      const data = await aiClient.suggestAudiences<{ segments?: SegmentSpec[] }>({ idea: form, language });
      const segs: SegmentSpec[] = data.segments ?? [];
      setLoadingAudiences(false);
      if (segs.length === 0) runValidate(form);
      else setCandidates(segs);
    } catch {
      setLoadingAudiences(false);
      runValidate(form);
    }
  };

  const handleConfirmAudiences = (selected: SegmentSpec[]) => {
    if (!pendingForm) return;
    runValidate({ ...pendingForm, segmentSpecs: selected });
  };
  const handleSkipAudiences = () => {
    if (pendingForm) runValidate(pendingForm);
  };
  const handleBackToForm = () => {
    setCandidates(null);
    setPendingForm(null);
  };

  const t = {
    hr: {
      wordmarkSub: 'ured za tržišnu istinu',
      navProjects: 'Projekti',
      navPlan: 'Biznis plan',
      navMarket: 'Tržište',
      navSettings: 'Postavke',
      heroKicker: 'Protokol 01 — simulirana validacija',
      heroTitle1: 'Neka ti ideja padne ovdje,',
      heroTitle2: 'a ne na tržištu.',
      heroSub:
        'Upiši ideju u jednoj rečenici. Sto simuliranih kupaca — skeptičnih, s vlastitim navikama i budžetima — ispita je kroz JTBD protokol. Dobiješ verdikt, prigovore i brojke izračunate u kodu, ne nagađane.',
      realTest: 'stvaran test iz razvoja',
      realTestLine: 'FitMeal · kupuje 8% · odbija 52% · prilika 28/100',
      continueReport: 'Vrati zadnji izvještaj →',
      findingAudiences: 'Tražim ciljane publike za tvoju ideju...',
      protocolKicker: 'Protokol — što se dogodi s tvojom idejom',
      protocolSteps: [
        {
          n: '01',
          title: 'Brief',
          desc: 'Jedna rečenica je dovoljna. AI složi brief i postavi pitanja specifična baš za tvoj biznis.',
        },
        {
          n: '02',
          title: 'Ispitivanje',
          desc: 'Sto persona s psihografijom, ulogom i budžetom reagira na ideju. Petnaest posto ih je namjerno neprijateljski — da laskanje ne prođe.',
        },
        {
          n: '03',
          title: 'Brojke',
          desc: 'Score, prilika (JTBD) i prirodne skupine kupaca računaju se u kodu. Jezični model ne smije izmisliti nijedan postotak.',
        },
        {
          n: '04',
          title: 'Verdikt',
          desc: 'Razlozi odbijanja, prava konkurencija, analiza cijene, intervju-kit za prave razgovore i plan preokreta.',
        },
      ],
      verdictKicker: 'Primjer verdikta',
      verdictNote: 'Output stvarnog testa iz razvoja. Nismo ga uljepšali — u tome je poanta.',
      verdictProduct: 'FitMeal — AI planer obroka',
      verdictMeta: 'B2C · 9,99 €/mj · 100 simuliranih kupaca',
      verdictStamp: 'Odbijeno',
      verdictRows: [
        { label: 'Kupuje', value: '8%' },
        { label: 'Možda', value: '40%' },
        { label: 'Odbija', value: '52%' },
        { label: 'Prilika (JTBD)', value: '28 / 100' },
        { label: 'Prava konkurencija', value: 'MyFitnessPal + ručno planiranje' },
        { label: 'Osvojiva skupina', value: 'Cjenovno osjetljivi pragmatici — 52%' },
        { label: 'Prvi potez', value: 'Besplatni sloj; cijenu prikaži kao dnevni trošak' },
      ],
      tokensKicker: 'Cjenik u tokenima',
      tokensSub: 'Bez pretplate. Trošiš samo kad stvarno koristiš AI.',
      tokensRows: [
        { label: 'Početni saldo', value: '3.600 tokena — besplatno' },
        { label: 'Validacija (100 kupaca)', value: '1.200' },
        { label: 'Report alati (cijena, intervjui, preokret…)', value: '250–550' },
        { label: 'Pitanje savjetniku', value: '140' },
      ],
      topupBtn: 'Dodaj 10.000 test tokena',
      topupNote: 'Simulacija naplate — bez kartice, saldo ostaje u ovom browseru.',
      topupDone: 'Dodano. Saldo je u ovom browseru.',
      honestyKicker: 'Pečat iskrenosti',
      honestyBody:
        'Ovo su simulirani kupci, ne pravi ljudi. Rezultat je smjernica za rano testiranje, ne dokaz tržišta. Zato sve postotke računamo u kodu, zato dio persona namjerno navija protiv tebe, i zato ti nikad nećemo reći samo ono što želiš čuti.',
      footerLine: 'AI Validator · protokol v2 · bez lažnih recenzija',
      errorTitle: 'Analiza nije uspjela',
      errorHelp: 'Ništa nije izgubljeno. Možeš pokušati ponovno ili promijeniti opis ideje.',
      retry: 'Pokušaj ponovno',
      editIdea: 'Uredi ideju',
      loadingText: 'Učitavam...',
    },
    en: {
      wordmarkSub: 'bureau of market truth',
      navProjects: 'Projects',
      navPlan: 'Business plan',
      navMarket: 'Market',
      navSettings: 'Settings',
      heroKicker: 'Protocol 01 — simulated validation',
      heroTitle1: 'Let your idea fail here,',
      heroTitle2: 'not on the market.',
      heroSub:
        'Type your idea in one sentence. One hundred simulated buyers — skeptical, with their own habits and budgets — examine it through a JTBD protocol. You get a verdict, objections, and numbers computed in code, not guessed.',
      realTest: 'real test from development',
      realTestLine: 'FitMeal · buys 8% · rejects 52% · opportunity 28/100',
      continueReport: 'Return to latest report →',
      findingAudiences: 'Finding target audiences for your idea...',
      protocolKicker: 'Protocol — what happens to your idea',
      protocolSteps: [
        {
          n: '01',
          title: 'Brief',
          desc: 'One sentence is enough. The AI builds a brief and asks questions specific to your business.',
        },
        {
          n: '02',
          title: 'Examination',
          desc: 'A hundred personas with psychographics, roles, and budgets react. Fifteen percent are deliberately hostile — so flattery does not pass.',
        },
        {
          n: '03',
          title: 'Numbers',
          desc: 'Score, opportunity (JTBD), and natural buyer groups are computed in code. The language model may not invent a single percentage.',
        },
        {
          n: '04',
          title: 'Verdict',
          desc: 'Rejection reasons, real competition, price analysis, an interview kit for real conversations, and a turnaround plan.',
        },
      ],
      verdictKicker: 'Sample verdict',
      verdictNote: 'Output of a real test from development. We did not polish it — that is the point.',
      verdictProduct: 'FitMeal — AI meal planner',
      verdictMeta: 'B2C · €9.99/mo · 100 simulated buyers',
      verdictStamp: 'Rejected',
      verdictRows: [
        { label: 'Buys', value: '8%' },
        { label: 'Maybe', value: '40%' },
        { label: 'Rejects', value: '52%' },
        { label: 'Opportunity (JTBD)', value: '28 / 100' },
        { label: 'Real competition', value: 'MyFitnessPal + manual planning' },
        { label: 'Winnable group', value: 'Price-sensitive pragmatists — 52%' },
        { label: 'First move', value: 'Free tier; show the price as a daily cost' },
      ],
      tokensKicker: 'Pricing in tokens',
      tokensSub: 'No subscription. You spend only when you actually use AI.',
      tokensRows: [
        { label: 'Starting balance', value: '3,600 tokens — free' },
        { label: 'Validation (100 buyers)', value: '1,200' },
        { label: 'Report tools (price, interviews, turnaround…)', value: '250–550' },
        { label: 'Advisor question', value: '140' },
      ],
      topupBtn: 'Add 10,000 test tokens',
      topupNote: 'Billing simulation — no card, the balance stays in this browser.',
      topupDone: 'Added. The balance lives in this browser.',
      honestyKicker: 'Seal of honesty',
      honestyBody:
        'These are simulated buyers, not real people. The result is a guideline for early testing, not proof of a market. That is why every percentage is computed in code, why part of the personas deliberately roots against you, and why we will never tell you only what you want to hear.',
      footerLine: 'AI Validator · protocol v2 · no fake reviews',
      errorTitle: 'Analysis failed',
      errorHelp: 'Nothing was lost. You can retry or edit the idea description.',
      retry: 'Try again',
      editIdea: 'Edit idea',
      loadingText: 'Loading...',
    },
  }[language];

  if (authLoading) {
    return (
      <div className="paper-root min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
          <span className="font-data text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">{t.loadingText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-root min-h-screen">
      {loading && <LoadingScreen language={language} />}

      {/* ── Navigacija: wordmark + tekstualni linkovi ── */}
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-baseline gap-3 text-left cursor-pointer"
          >
            <span className="font-display text-xl font-semibold tracking-tight text-[var(--ink)]">
              AI Validator<span className="text-[var(--verdict-red)]">.</span>
            </span>
            <span className="kicker hidden sm:inline">{t.wordmarkSub}</span>
          </button>

          <div className="flex items-center gap-5 text-sm">
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
            <button onClick={() => router.push('/projects')} className="link-ink text-sm">
              {t.navProjects}
            </button>
            <button onClick={() => router.push('/plan')} className="link-ink text-sm">
              {t.navPlan}
            </button>
            <button onClick={() => router.push('/market')} className="link-ink text-sm">
              {t.navMarket}
            </button>
            <button onClick={() => router.push('/settings')} className="link-ink text-sm">
              {t.navSettings}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        {/* ── Hero: lijevo poravnat naslov + protokol počinje odmah ── */}
        <section className="pt-12 sm:pt-16">
          <p className="kicker">{t.heroKicker}</p>
          <h1 className="mt-4 max-w-4xl text-4xl leading-[1.05] text-[var(--ink)] sm:text-6xl lg:text-[4.4rem]">
            {t.heroTitle1}
            <br />
            <em className="text-[var(--verdict-red)] not-italic font-display italic">{t.heroTitle2}</em>
          </h1>
          <div className="mt-6 flex max-w-3xl flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            <p className="flex-1 text-base leading-relaxed text-[var(--ink-soft)]">{t.heroSub}</p>
            <div className="shrink-0 border-l-2 border-[var(--verdict-red)] pl-3">
              <p className="kicker !text-[var(--verdict-red)]">{t.realTest}</p>
              <p className="font-data mt-1 text-xs font-medium text-[var(--ink-soft)]">{t.realTestLine}</p>
            </div>
          </div>

          {hasStoredReport && (
            <button type="button" onClick={() => router.push('/results')} className="link-ink mt-5 inline-block text-sm">
              {t.continueReport}
            </button>
          )}

          {/* ── Protokol počinje: unos ideje / odabir publika ── */}
          <div className="sheet mt-8 p-4 sm:p-6">
            {loadingAudiences ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
                <span className="font-data text-xs uppercase tracking-[0.15em] text-[var(--ink-faint)]">{t.findingAudiences}</span>
              </div>
            ) : candidates ? (
              <AudiencePicker
                language={language}
                segments={candidates}
                onConfirm={handleConfirmAudiences}
                onSkip={handleSkipAudiences}
                onBack={handleBackToForm}
              />
            ) : (
              <IdeaForm onIdeaReady={handleIdeaReady} onError={handleError} />
            )}
          </div>

          {error && (
            <div className="sheet mt-4 border-l-4 !border-l-[var(--verdict-red)] p-4">
              <p className="font-data text-xs font-semibold uppercase tracking-[0.15em] text-[var(--verdict-red)]">{t.errorTitle}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink)]">{error}</p>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">{t.errorHelp}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {lastFailedForm && (
                  <button type="button" onClick={() => runValidate(lastFailedForm)} className="btn-ink !py-2 !px-4 text-xs">
                    {t.retry}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setCandidates(null);
                  }}
                  className="btn-line !py-2 !px-4 text-xs"
                >
                  {t.editIdea}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Protokol koraci: numerirani redovi s hairline linijama ── */}
        <section className="mt-20 sm:mt-28">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.protocolKicker}</p>
          </div>
          <div className="mt-6">
            {t.protocolSteps.map((step) => (
              <div
                key={step.n}
                className="grid grid-cols-[3rem_1fr] items-baseline gap-4 border-b border-[var(--hairline)] py-5 sm:grid-cols-[5rem_14rem_1fr] sm:gap-8"
              >
                <span className="font-data text-2xl font-medium text-[var(--verdict-red)] sm:text-3xl">{step.n}</span>
                <h3 className="text-xl text-[var(--ink)] sm:text-2xl">{step.title}</h3>
                <p className="col-span-2 text-sm leading-relaxed text-[var(--ink-soft)] sm:col-span-1 sm:text-base">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Primjer verdikta: izvještajna tablica s pečatom ── */}
        <section className="mt-20 sm:mt-28">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.verdictKicker}</p>
          </div>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_18rem]">
            <div className="sheet p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--hairline)] pb-4">
                <div>
                  <h3 className="text-2xl text-[var(--ink)]">{t.verdictProduct}</h3>
                  <p className="font-data mt-1 text-xs text-[var(--ink-faint)]">{t.verdictMeta}</p>
                </div>
                <span className="stamp">{t.verdictStamp} · 52%</span>
              </div>
              <div className="mt-4 space-y-3.5">
                {t.verdictRows.map((row) => (
                  <div key={row.label} className="leader-row text-sm">
                    <span className="text-[var(--ink-soft)]">{row.label}</span>
                    <span className="leader-fill" />
                    <span className="font-data max-w-[55%] text-right text-[13px] font-semibold text-[var(--ink)]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="max-w-[22rem] self-end border-l-2 border-[var(--annotate)] pl-3 text-sm italic leading-relaxed text-[var(--ink-soft)]">
              {t.verdictNote}
            </p>
          </div>
        </section>

        {/* ── Tokeni: cjenik kao tablica, jedan testni top-up ── */}
        <section className="mt-20 sm:mt-28">
          <div className="border-t-2 border-[var(--ink)] pt-3">
            <p className="kicker">{t.tokensKicker}</p>
          </div>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_18rem]">
            <div>
              <p className="text-sm text-[var(--ink-soft)]">{t.tokensSub}</p>
              <div className="mt-5 space-y-3.5">
                {t.tokensRows.map((row) => (
                  <div key={row.label} className="leader-row text-sm">
                    <span className="text-[var(--ink-soft)]">{row.label}</span>
                    <span className="leader-fill" />
                    <span className="font-data text-[13px] font-semibold text-[var(--ink)]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="self-end">
              <button
                type="button"
                onClick={() => {
                  addSimulatedPurchase(10);
                  setTopupNotice(true);
                }}
                className="btn-ink w-full text-sm"
              >
                {t.topupBtn}
              </button>
              <p className="font-data mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
                {topupNotice ? t.topupDone : t.topupNote}
              </p>
            </div>
          </div>
        </section>

        {/* ── Pečat iskrenosti: disclaimer kao identitet, ne sitni tekst ── */}
        <section className="mt-20 sm:mt-28">
          <div className="border-2 border-[var(--ink)] p-5 sm:p-7">
            <span className="stamp stamp--green">{t.honestyKicker}</span>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--ink)]">{t.honestyBody}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline-strong)] px-4 py-6 sm:px-8">
        <p className="font-data mx-auto max-w-6xl text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {t.footerLine}
        </p>
      </footer>
    </div>
  );
}
