'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdeaForm from '@/components/IdeaForm';
import AudiencePicker from '@/components/AudiencePicker';
import LoadingScreen from '@/components/LoadingScreen';
import AuthForm from '@/components/AuthForm';
import TokenWallet from '@/components/TokenWallet';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { TOKEN_COSTS, addSimulatedPurchase, formatTokens, spendTokens } from '@/lib/tokens';
import type { IdeaFormData, SegmentSpec } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout, language, setLanguage } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [error, setError] = useState('');
  const [mockTab, setMockTab] = useState<'summary' | 'objections' | 'questions'>('summary');
  const [guestMode, setGuestMode] = useState(false);
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
        ? 'AI engine is not configured yet. Add DEEPSEEK_API_KEY in .env.local and restart the app.'
        : 'AI engine još nije konfiguriran. Dodaj DEEPSEEK_API_KEY u .env.local i restartaj aplikaciju.');
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
    const result = spendTokens(cost);
    if (result.ok) return true;
    setError(language === 'en'
      ? `${label} needs ${formatTokens(cost)} tokens. You are missing ${formatTokens(result.missing)} tokens. Use Add €10 in the token wallet to continue testing.`
      : `${label} treba ${formatTokens(cost)} tokena. Nedostaje ti ${formatTokens(result.missing)} tokena. Klikni Dodaj 10€ u token walletu za nastavak testiranja.`);
    return false;
  };

  // Pokreni punu simulaciju (s odabranim segmentima ili bez njih = generička publika)
  const runValidate = async (form: IdeaFormData) => {
    if (!requireTokens(TOKEN_COSTS.validation, language === 'en' ? 'Validation with 50 personas' : 'Validacija s 50 persona')) return;
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
      badge: '50 AI persona analizira tvoju ideju',
      title1: 'Validiraj svoju ideju ',
      title2: 'za 30 sekundi',
      description: 'Simuliramo 50 raznolikih kupaca koji reagiraju na tvoju ideju — tko bi kupio, tko odbija i zašto. Pronađi rupe u prezentaciji prije nego potrošiš tjedne i novac.',
      features: ['Kupovna namjera', 'Ciljna skupina', 'Razlozi odbijanja', 'Pitanja kupaca', 'Akcijski plan'],
      howItWorks: 'Kako funkcionira',
      steps: [
        { title: 'Opiši ideju', desc: 'Unesi naziv, opis i cijenu svog proizvoda.' },
        { title: 'AI simulira tržište', desc: '50 raznolikih persona reagira na tvoju ideju paralelno.' },
        { title: 'Dobij izvještaj', desc: 'Score, ciljna skupina, prigovori, pitanja i akcijski plan.' },
      ],
      disclaimer: 'Disclaimer: AI Validator simulira tržišne reakcije koristeći AI persone, ne prave korisnike. Koristi rezultate kao smjernicu za rano testiranje ideja, ne kao garanciju tržišnog uspjeha.',
      loadingText: 'Učitavam...',
      findingAudiences: 'Tražim ciljane publike za tvoju ideju...',
      logoutBtn: 'Odjavi se',
      myProjectsBtn: 'Moji projekti',
      freePill: 'Beta · besplatno',
      stats: [
        { value: '50+', label: 'AI persona po testu' },
        { value: '5', label: 'AI savjetnika u panelu' },
        { value: '~30s', label: 'do punog izvještaja' },
      ],
      previewTitle: 'Pogledaj kako izgleda izvještaj',
      previewSubtitle: 'Isprobaj interaktivnu simulaciju primjera izvještaja prije prijave.',
      pricingTitle: 'Pay as you go tokeni',
      pricingSubtitle: 'Kupi tokene kad ti trebaju. Svaka validacija, alat ili savjetnicki odgovor trosi samo ono sto stvarno pokrenes.',
      pricingPlans: [
        { name: 'Startni bonus', price: '3.600', period: ' tokena', desc: 'Dobijes ga automatski pri prvom ulasku ili prijavi.', features: ['1 validacija s 50 persona', 'Prijedlog ciljanih publika', 'Nekoliko report alata', 'Oko 10 brzih upita savjetnicima', 'Bez kartice i bez pretplate'], btn: 'Kreni besplatno', active: false },
        { name: 'Test top-up', price: '10€', period: ' = 10.000 tokena', desc: 'Simulirana kupnja za testiranje UX-a naplate.', features: ['Klik i tokeni se odmah dodaju', 'Nema checkouta ni stvarne naplate', 'Tokeni se trose po akciji', 'Saldo ostaje u ovom browseru', 'Kasnije se spaja na pravi payment'], btn: 'Dodaj 10€ tokena', active: true },
        { name: 'Pay as you go', price: '0€', period: ' mjesecno', desc: 'Nema mjesecne obveze. Placas samo kad koristis AI.', features: ['Validacija: 1.200 tokena', 'Report alati: 250-550 tokena', 'Savjetnik: 140 tokena', 'Dublji savjetnik: 380 tokena', 'Memorija i taskovi: mali dodatni trosak'], btn: 'Pogledaj wallet', active: false },
      ],
      testimonialsTitle: 'Što kažu founderi',
      testimonialsSubtitle: 'Kako je AI Validator pomogao u ranom testiranju tržišta.',
      testimonials: [
        { quote: 'AI nam je ukazao na 3 ključna pitanja o privatnosti podataka koja su nam investitori postavili tjedan dana kasnije na pitchu. Spasilo nas je od nepripremljenosti.', author: 'Stjepan M., FinTech Founder' },
        { quote: 'Umjesto tjedana i tisuća eura za prve ankete, testirao sam SaaS ideju za 30 sekundi i odmah uočio zašto bi je HR menadžeri odbili. Zlata vrijedi.', author: 'Ana K., SaaS Developer' },
      ],
      mockupHeader: 'Primjer: FoodExpress (B2B2C Dostava)',
      mockupScore: 'Viability Score: 82/100',
      mockupStats: 'Kupio bi: 64% | Možda: 24% | Odbija: 12%',
      mockTabs: { summary: 'Rezime', objections: 'Zid odbijanja', questions: 'Pitanja iz mase' },
      mockSummary: 'FoodExpress pokazuje visoku održivost (82/100). Krajnji kupci (B2C) jako cijene brzinu dostave, no restorani (B2B) izražavaju visoku zabrinutost oko visokih provizija (15%+) i nedostatka integracija s blagajnama.',
      mockObjection: 'Prevelika konkurencija s Woltom i Glovom na našem području.',
      mockObjection2: 'Ne vidim kako možemo ostvariti profit uz ovolike provizije restorana.',
      mockQuestion: 'Kako točno planirate riješiti problem logistike tijekom najveće gužve?',
      mockQuestion2: 'Koje analitičke alate nudite restoranima unutar platforme?',
      mockAnswerPlaceholder: 'Upiši odgovor i pojasni ideju...',
      mockButton: 'Isprobaj re-analizu (Odgovori)',
      guestStart: 'Preskoči prijavu i testiraj ideju',
      guestHint: 'Račun ti treba tek ako želiš spremiti projekt i otvoriti AI savjetnike.',
      guestNotice: 'Guest test: rezultat će ostati u ovom browseru. Za spremanje se prijavi nakon analize.',
      signInInstead: 'Vrati me na prijavu',
      continueReport: 'Vrati se na zadnji izvještaj',
      errorTitle: 'Analiza nije uspjela',
      errorHelp: 'Ništa nije izgubljeno. Možeš pokušati ponovno ili promijeniti opis ideje.',
      retry: 'Pokušaj ponovno',
      editIdea: 'Uredi ideju',
    },
    en: {
      badge: '50 AI personas analyze your idea',
      title1: 'Validate your business idea ',
      title2: 'in 30 seconds',
      description: 'We simulate 50 diverse customer personas reacting to your idea — who buys, who rejects, and why. Find weaknesses in your pitch before spending weeks and money.',
      features: ['Purchase Intent', 'Target Audience', 'Rejection Reasons', 'Customer Questions', 'Action Plan'],
      howItWorks: 'How it works',
      steps: [
        { title: 'Describe your idea', desc: 'Enter name, pitch, description, and price model.' },
        { title: 'AI simulates market', desc: '50 unique buyer personas react to your idea in parallel.' },
        { title: 'Get report', desc: 'Score, target profile, objections, questions, and action plan.' },
      ],
      disclaimer: 'Disclaimer: AI Validator simulates market reactions using AI personas, not real customers. Use results as a guideline for early testing, not as a guarantee of market success.',
      loadingText: 'Loading...',
      findingAudiences: 'Finding target audiences for your idea...',
      logoutBtn: 'Log out',
      myProjectsBtn: 'My projects',
      freePill: 'Beta · free',
      stats: [
        { value: '50+', label: 'AI personas per test' },
        { value: '5', label: 'AI advisors on the panel' },
        { value: '~30s', label: 'to a full report' },
      ],
      previewTitle: 'See Report in Action',
      previewSubtitle: 'Interact with a live demo report preview before creating an account.',
      pricingTitle: 'Pay as you go tokens',
      pricingSubtitle: 'Buy tokens when you need them. Every validation, tool, or advisor answer spends only what you actually run.',
      pricingPlans: [
        { name: 'Starter bonus', price: '3,600', period: ' tokens', desc: 'Granted automatically on first visit or sign-in.', features: ['1 validation with 50 personas', 'Target audience suggestions', 'A few report tools', 'Around 10 quick advisor questions', 'No card and no subscription'], btn: 'Start free', active: false },
        { name: 'Test top-up', price: '€10', period: ' = 10,000 tokens', desc: 'Simulated purchase for testing the billing UX.', features: ['Click and tokens are added instantly', 'No checkout or real charge', 'Tokens are spent per action', 'Balance stays in this browser', 'Ready for real payment later'], btn: 'Add €10 tokens', active: true },
        { name: 'Pay as you go', price: '€0', period: ' monthly', desc: 'No monthly commitment. Pay only when you use AI.', features: ['Validation: 1,200 tokens', 'Report tools: 250-550 tokens', 'Advisor: 140 tokens', 'Deep advisor: 380 tokens', 'Memory and tasks: small extra cost'], btn: 'Open wallet', active: false },
      ],
      testimonialsTitle: 'Loved by Founders',
      testimonialsSubtitle: 'How AI Validator helped shape concepts before launch.',
      testimonials: [
        { quote: 'The AI highlighted 3 critical security concerns that investors literally asked us about during our pitch deck review a week later. Saved our round.', author: 'Steve M., FinTech Founder' },
        { quote: 'Instead of spending weeks and thousands on validation surveys, I ran my SaaS concept in 30 seconds and saw exactly why HR buyers would reject it.', author: 'Ann K., SaaS Developer' },
      ],
      mockupHeader: 'Demo: FoodExpress (B2B2C Delivery)',
      mockupScore: 'Viability Score: 82/100',
      mockupStats: 'Would buy: 64% | Maybe: 24% | Rejects: 12%',
      mockTabs: { summary: 'Summary', objections: 'Rejections', questions: 'Crowd Questions' },
      mockSummary: 'FoodExpress shows high viability (82/100). End consumers (B2C) highly value delivery speed, while restaurant owners (B2B) express severe concern regarding commission rates (15%+) and lack of POS integrations.',
      mockObjection: 'Too much competition with local delivery giants in our cities.',
      mockObjection2: 'I do not see how we can make a profit with such high commissions.',
      mockQuestion: 'How exactly do you plan to handle rider logistics during peak lunch hours?',
      mockQuestion2: 'What analytical tools do you provide for restaurant partners?',
      mockAnswerPlaceholder: 'Type clarification or answer...',
      mockButton: 'Try Re-analysis (Answer)',
      guestStart: 'Skip sign-up and test an idea',
      guestHint: 'You only need an account when you want to save the project and open AI advisors.',
      guestNotice: 'Guest test: the result stays in this browser. Sign in after the analysis to save it.',
      signInInstead: 'Back to sign-in',
      continueReport: 'Return to latest report',
      errorTitle: 'Analysis failed',
      errorHelp: 'Nothing was lost. You can retry or edit the idea description.',
      retry: 'Try again',
      editIdea: 'Edit idea',
    }
  }[language];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 border-4 border-zinc-800 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-zinc-500 text-sm">{language === 'en' ? 'Loading...' : 'Učitavam...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative">
      {loading && <LoadingScreen language={language} />}

      {/* Background glow effects */}
      <div className="absolute top-0 left-0 w-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[20%] w-[80%] aspect-square rounded-full bg-indigo-600/10 blur-[130px] animate-float-slow" />
        <div className="absolute -top-[5%] -right-[15%] w-[70%] aspect-square rounded-full bg-purple-500/10 blur-[120px] animate-float-reverse-slow" />
      </div>

      {/* Navbar */}
      <nav className="border-b border-zinc-900 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 relative z-10 bg-zinc-950/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="font-semibold text-white tracking-wide text-lg font-title">AI Validator</span>
        </div>
        
          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
          <TokenWallet language={language} compact />

          {/* Language Switcher */}
          <div className="flex bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
            <button
              onClick={() => setLanguage('hr')}
              className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                language === 'hr' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              HR
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                language === 'en' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              EN
            </button>
          </div>

          {user ? (
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <span className="max-w-[180px] truncate text-xs text-zinc-400 hidden sm:inline">{user.email}</span>
              <button
                onClick={() => router.push('/projects')}
                className="text-xs text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
              >
                {t.myProjectsBtn}
              </button>
              <button
                onClick={logout}
                className="text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
              >
                {t.logoutBtn}
              </button>
            </div>
          ) : (
            <span className="text-xs text-zinc-500 border border-zinc-800 rounded-full px-3 py-1 bg-zinc-900/30">
              {t.freePill}
            </span>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="flex flex-col items-center px-4 pt-16 pb-12 relative z-10">
        <div className="mb-8 w-full max-w-2xl">
          <TokenWallet language={language} />
        </div>
        <div className="text-center space-y-5 mb-12 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-950/30 px-4.5 py-1.5 text-sm text-indigo-300 backdrop-blur-sm shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {t.badge}
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight tracking-tight">
            {t.title1}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-indigo-200 to-purple-400">{t.title2}</span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            {t.description}
          </p>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-zinc-400 pt-2">
            {t.features.map((f) => (
              <span key={f} className="flex items-center gap-1.5 bg-zinc-900/60 border border-zinc-800 rounded-full px-4 py-1.5 text-xs text-zinc-300">
                <span className="text-green-500">✓</span> {f}
              </span>
            ))}
          </div>
        </div>

        {/* Tok: AuthForm → IdeaForm → (traženje publika) → AudiencePicker */}
        <div id="start" className="w-full max-w-2xl flex justify-center scroll-mt-24">
          <div className="w-full space-y-3">
          {hasStoredReport && (
            <button
              type="button"
              onClick={() => router.push('/results')}
              className="w-full rounded-2xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm font-bold text-emerald-200 transition-colors hover:border-emerald-500 hover:text-white"
            >
              {t.continueReport}
            </button>
          )}
          {!user && !guestMode ? (
            <div className="w-full max-w-md space-y-3">
              <AuthForm />
              <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/10 p-4 text-center">
                <p className="text-sm font-semibold text-cyan-100">{t.guestStart}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t.guestHint}</p>
                <button
                  type="button"
                  onClick={() => setGuestMode(true)}
                  className="mt-3 w-full rounded-xl border border-cyan-700/60 bg-cyan-950/30 px-4 py-2.5 text-sm font-bold text-cyan-100 transition-colors hover:border-cyan-400 hover:text-white"
                >
                  {t.guestStart}
                </button>
              </div>
            </div>
          ) : loadingAudiences ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <span className="w-8 h-8 border-4 border-zinc-800 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-zinc-400 text-sm">{t.findingAudiences}</span>
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
            <div className="w-full space-y-3">
              {!user && guestMode && (
                <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/15 p-4 text-sm text-cyan-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="leading-relaxed">{t.guestNotice}</p>
                    <button
                      type="button"
                      onClick={() => setGuestMode(false)}
                      className="shrink-0 rounded-lg border border-cyan-800 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:border-cyan-500"
                    >
                      {t.signInInstead}
                    </button>
                  </div>
                </div>
              )}
              <IdeaForm onIdeaReady={handleIdeaReady} onError={handleError} />
            </div>
          )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-red-950/30 border border-red-800/50 px-4 py-4 text-red-200 text-sm max-w-2xl w-full">
            <p className="font-bold text-red-100">{t.errorTitle}</p>
            <p className="mt-1 text-red-200/80">{error}</p>
            <p className="mt-2 text-xs text-zinc-400">{t.errorHelp}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lastFailedForm && (
                <button
                  type="button"
                  onClick={() => runValidate(lastFailedForm)}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-400"
                >
                  {t.retry}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setCandidates(null);
                }}
                className="rounded-lg border border-red-800/60 px-3 py-1.5 text-xs font-bold text-red-100 hover:border-red-500"
              >
                {t.editIdea}
              </button>
            </div>
          </div>
        )}

        {/* Stats Counter Section */}
        <section className="mt-20 max-w-4xl w-full border border-zinc-900 bg-zinc-950/40 rounded-2xl p-8 backdrop-blur-sm">
          <div className="grid md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-zinc-800/50">
            {t.stats.map(({ value, label }) => (
              <div key={label} className="pt-4 md:pt-0">
                <div className="text-4xl font-extrabold text-white font-title tracking-tight">{value}</div>
                <div className="text-sm text-zinc-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Live Preview Mockup Dashboard */}
        <section className="mt-20 max-w-3xl w-full">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white tracking-wide">{t.previewTitle}</h2>
            <p className="text-sm text-zinc-500 mt-1">{t.previewSubtitle}</p>
          </div>
          
          <div className="w-full rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-2xl p-6 relative overflow-hidden backdrop-blur-md">
            {/* Glossy top strip */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-800 pb-4 mb-4 gap-2">
              <div>
                <h4 className="font-bold text-white text-sm">{t.mockupHeader}</h4>
                <p className="text-xs text-zinc-500">{t.mockupStats}</p>
              </div>
              <div className="text-xs text-green-500 bg-green-950/30 border border-green-800/40 rounded-full px-3 py-1 font-semibold">
                {t.mockupScore}
              </div>
            </div>

            {/* Mock Tabs */}
            <div className="flex border-b border-zinc-800 gap-4 mb-4 text-xs font-semibold">
              {(['summary', 'objections', 'questions'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMockTab(tab)}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    mockTab === tab ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t.mockTabs[tab]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="min-h-[120px] text-xs text-zinc-300 leading-relaxed">
              {mockTab === 'summary' && (
                <p className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-xl">{t.mockSummary}</p>
              )}
              {mockTab === 'objections' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between font-semibold text-zinc-400">
                      <span>1. Competition</span>
                      <span>45%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full rounded-full" style={{ width: '45%' }} />
                    </div>
                  </div>
                  <blockquote className="border border-red-950/30 bg-red-950/10 px-3 py-2 rounded-lg italic text-zinc-400">
                    &ldquo;{t.mockObjection}&rdquo;
                  </blockquote>
                  <blockquote className="border border-red-950/30 bg-red-950/10 px-3 py-2 rounded-lg italic text-zinc-400">
                    &ldquo;{t.mockObjection2}&rdquo;
                  </blockquote>
                </div>
              )}
              {mockTab === 'questions' && (
                <div className="space-y-3.5">
                  <div className="space-y-2">
                    <p className="font-medium text-white">? {t.mockQuestion}</p>
                    <input
                      type="text"
                      disabled
                      placeholder={t.mockAnswerPlaceholder}
                      className="w-full rounded bg-zinc-950/80 border border-zinc-800 px-3 py-1.5 text-zinc-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-white">? {t.mockQuestion2}</p>
                    <input
                      type="text"
                      disabled
                      placeholder={t.mockAnswerPlaceholder}
                      className="w-full rounded bg-zinc-950/80 border border-zinc-800 px-3 py-1.5 text-zinc-500"
                    />
                  </div>
                  <button className="w-full py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded font-semibold text-xs transition-colors cursor-pointer">
                    {t.mockButton}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Pricing Plans Grid Section */}
        <section className="mt-24 max-w-4xl w-full">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-white font-title tracking-tight">{t.pricingTitle}</h2>
            <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto">{t.pricingSubtitle}</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {t.pricingPlans.map((plan) => (
              <div 
                key={plan.name} 
                className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-300 relative ${
                  plan.active 
                    ? 'border-indigo-500 bg-indigo-950/10 shadow-lg shadow-indigo-500/5' 
                    : 'border-zinc-800 bg-zinc-900/30'
                }`}
              >
                {plan.active && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-[10px] uppercase font-bold rounded-full tracking-wider">
                    {language === 'en' ? 'Most Popular' : 'Najpopularnije'}
                  </span>
                )}
                
                <div>
                  <h4 className="text-base font-bold text-white tracking-wide">{plan.name}</h4>
                  <p className="text-xs text-zinc-500 mt-1 min-h-[32px]">{plan.desc}</p>
                  
                  <div className="my-5 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white tracking-tight">{plan.price}</span>
                    <span className="text-xs text-zinc-500">{plan.period}</span>
                  </div>
                  
                  <ul className="space-y-2 border-t border-zinc-800/80 pt-4 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                        <span className="text-indigo-400 text-[10px] mt-0.5">✔</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <button 
                  type="button"
                  onClick={() => {
                    if (plan.active) addSimulatedPurchase(10);
                    document.getElementById('start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`w-full py-2.5 rounded-lg font-semibold text-xs transition-colors cursor-pointer text-center ${
                    plan.active 
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                      : 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'
                  }`}
                >
                  {plan.btn}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Founder Testimonials */}
        <section className="mt-24 max-w-3xl w-full">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-extrabold text-white font-title tracking-tight">{t.testimonialsTitle}</h2>
            <p className="text-sm text-zinc-500 mt-2">{t.testimonialsSubtitle}</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {t.testimonials.map(({ quote, author }) => (
              <div key={author} className="rounded-xl border border-zinc-800 bg-zinc-900/10 p-6 flex flex-col justify-between backdrop-blur-sm relative">
                <span className="absolute top-4 right-4 text-4xl text-zinc-800 font-serif leading-none pointer-events-none">&ldquo;</span>
                <p className="text-sm text-zinc-300 leading-relaxed italic z-10">
                  &ldquo;{quote}&rdquo;
                </p>
                <div className="text-xs font-semibold text-indigo-400 mt-4 border-t border-zinc-800/60 pt-3">
                  — {author}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Social proof / How it works */}
        <div className="mt-24 max-w-2xl w-full">
          <p className="text-center text-xs text-zinc-500 uppercase tracking-widest mb-8">{t.howItWorks}</p>
          <div className="grid md:grid-cols-3 gap-6">
            {t.steps.map(({ title, desc }, index) => (
              <div key={title} className="text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 font-bold mx-auto shadow-inner">
                  {index + 1}
                </div>
                <h3 className="font-semibold text-zinc-200 text-sm">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-16 text-xs text-zinc-600 text-center max-w-lg">
          {t.disclaimer}
        </p>
      </main>
    </div>
  );
}
