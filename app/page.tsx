'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import IdeaForm from '@/components/IdeaForm';
import AudiencePicker from '@/components/AudiencePicker';
import LoadingScreen from '@/components/LoadingScreen';
import TokenWallet from '@/components/TokenWallet';
import SetupStatus from '@/components/SetupStatus';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { TOKEN_COSTS, addSimulatedPurchase, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import type { IdeaFormData, SegmentSpec } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  const { loading: authLoading, language, setLanguage } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingAudiences, setLoadingAudiences] = useState(false);
  const [error, setError] = useState('');
  const [mockTab, setMockTab] = useState<'summary' | 'objections' | 'questions'>('summary');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    stats: false,
    preview: false,
    steps: false,
    workspace: false,
    pricing: false,
    testimonials: false,
  });
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
    const result = spendTokens(cost);
    if (result.ok) return true;
    setError(tokenShortfallMessage(language, label, cost, result.missing));
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

  const toggleSection = (sectionId: string) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

  const isSectionExpanded = (sectionId: string) => expandedSections[sectionId] ?? false;

  const t = {
    hr: {
      title1: 'Testiraj ideju ',
      title2: 'prije gradnje',
      heroSubtitle: 'Upisi ideju i odmah vidi kupuje li pricu itko osim tebe.',
      heroProof: ['50 AI persona', 'glavni prigovori', 'prvi test'],
      howItWorks: 'Kako funkcionira',
      steps: [
        { title: 'Napiši ideju', desc: 'Dovoljna je jedna recenica.' },
        { title: 'Dobij signal', desc: 'Vidis sto prolazi, a sto zapinje.' },
        { title: 'Pokreni test', desc: 'Dobij prvi potez za van.' },
      ],
      disclaimer: 'Disclaimer: AI Validator simulira tržišne reakcije koristeći AI persone, ne prave korisnike. Koristi rezultate kao smjernicu za rano testiranje ideja, ne kao garanciju tržišnog uspjeha.',
      loadingText: 'Učitavam...',
      findingAudiences: 'Tražim ciljane publike za tvoju ideju...',
      logoutBtn: 'Odjavi se',
      myProjectsBtn: 'Moji projekti',
      workspaceTitle: 'Lokalni profil i tokeni',
      workspaceSubtitle: 'Otvori tek kad krenes spremati rad i trositi tokene.',
      stats: [
        { value: '50+', label: 'AI persona po testu' },
        { value: '2', label: 'glavna next-step smjera' },
        { value: '~30s', label: 'do prvog izvjestaja' },
      ],
      previewTitle: 'Primjer izvjestaja',
      previewSubtitle: 'Brzi pregled izlaza nakon prve validacije.',
      pricingTitle: 'Tokeni kad ti zatrebaju',
      pricingSubtitle: 'Bez pretplate. Trosis samo kad stvarno koristis AI.',
      pricingPlans: [
        { name: 'Startni bonus', price: '3.600', period: ' tokena', desc: 'Dobijes ga automatski pri prvom otvaranju lokalnog profila.', features: ['1 validacija s 50 persona', 'Prijedlog ciljanih publika', 'Nekoliko report alata', 'Oko 10 brzih upita savjetnicima', 'Bez kartice i bez pretplate'], btn: 'Kreni besplatno', active: false },
        { name: 'Test top-up', price: '10€', period: ' = 10.000 tokena', desc: 'Simulirana kupnja za testiranje UX-a naplate.', features: ['Klik i tokeni se odmah dodaju', 'Nema checkouta ni stvarne naplate', 'Tokeni se trose po akciji', 'Saldo ostaje u ovom browseru', 'Kasnije se spaja na pravi payment'], btn: 'Dodaj 10€ tokena', active: true },
        { name: 'Pay as you go', price: '0€', period: ' mjesecno', desc: 'Nema mjesecne obveze. Placas samo kad koristis AI.', features: ['Validacija: 1.200 tokena', 'Report alati: 250-550 tokena', 'Savjetnik: 140 tokena', 'Dublji savjetnik: 380 tokena', 'Memorija i taskovi: mali dodatni trosak'], btn: 'Pogledaj wallet', active: false },
      ],
      testimonialsTitle: 'Rani feedback',
      testimonialsSubtitle: 'Kratki dojmovi ranih korisnika.',
      testimonials: [
        { quote: 'AI nam je ukazao na 3 ključna pitanja o privatnosti podataka koja su nam investitori postavili tjedan dana kasnije na pitchu. Spasilo nas je od nepripremljenosti.', author: 'Stjepan M., FinTech Founder' },
        { quote: 'Umjesto tjedana i tisuća eura za prve ankete, testirao sam SaaS ideju za 30 sekundi i odmah uočio zašto bi je HR menadžeri odbili. Zlata vrijedi.', author: 'Ana K., SaaS Developer' },
      ],
      mockupHeader: 'Primjer: SignalBoard (Founder SaaS)',
      mockupScore: 'Idea Score: 68/100',
      mockupStats: 'Kupio bi: 38% | Mozda: 34% | Odbija: 28%',
      mockTabs: { summary: 'Rezime', objections: 'Zid odbijanja', questions: 'Pitanja iz mase' },
      mockSummary: 'SignalBoard izgleda obecavajuce za solo SaaS foundere koji vec rade intervjue, ali signal je jos mekan. Najveci problem nije interes nego dokaz da alat stvarno stedi vrijeme i da nije samo jos jedan ChatGPT wrapper.',
      mockObjection: 'Ovo mi zvuci korisno, ali ne vidim zasto to ne bih slozio u Notionu i ChatGPT-u.',
      mockObjection2: 'Nemam dovoljno stvarnih intervjua da bi mi dashboard sada imao smisla.',
      mockQuestion: 'Koji tocno rezultat founder dobije nakon prvih 5 customer intervjua?',
      mockQuestion2: 'Sto bi me uvjerilo da ovo skracuje put do prve placene validacije?',
      mockAnswerPlaceholder: 'Upisi odgovor ili dodatni kontekst...',
      mockButton: 'Simuliraj odgovor',
      continueReport: 'Vrati zadnji izvjestaj',
      errorTitle: 'Analiza nije uspjela',
      errorHelp: 'Ništa nije izgubljeno. Možeš pokušati ponovno ili promijeniti opis ideje.',
      retry: 'Pokušaj ponovno',
      editIdea: 'Uredi ideju',
    },
    en: {
      title1: 'Test your idea ',
      title2: 'before you build',
      heroSubtitle: 'Type the idea and quickly see whether anyone buys the story besides you.',
      heroProof: ['50 AI personas', 'top objections', 'first test'],
      howItWorks: 'How it works',
      steps: [
        { title: 'Write the idea', desc: 'One sentence is enough.' },
        { title: 'Get the signal', desc: 'See what lands and what breaks.' },
        { title: 'Run the test', desc: 'Get the first move to take outside.' },
      ],
      disclaimer: 'Disclaimer: AI Validator simulates market reactions using AI personas, not real customers. Use results as a guideline for early testing, not as a guarantee of market success.',
      loadingText: 'Loading...',
      findingAudiences: 'Finding target audiences for your idea...',
      logoutBtn: 'Log out',
      myProjectsBtn: 'My projects',
      workspaceTitle: 'Local profile and tokens',
      workspaceSubtitle: 'Open it once you want to save work and spend tokens.',
      stats: [
        { value: '50+', label: 'AI personas per test' },
        { value: '2', label: 'main next-step paths' },
        { value: '~30s', label: 'to the first report' },
      ],
      previewTitle: 'Sample report',
      previewSubtitle: 'Quick look at the output after the first validation.',
      pricingTitle: 'Tokens when you need them',
      pricingSubtitle: 'No subscription. You spend only when you actually use AI.',
      pricingPlans: [
        { name: 'Starter bonus', price: '3,600', period: ' tokens', desc: 'Granted automatically when your local profile opens for the first time.', features: ['1 validation with 50 personas', 'Target audience suggestions', 'A few report tools', 'Around 10 quick advisor questions', 'No card and no subscription'], btn: 'Start free', active: false },
        { name: 'Test top-up', price: '€10', period: ' = 10,000 tokens', desc: 'Simulated purchase for testing the billing UX.', features: ['Click and tokens are added instantly', 'No checkout or real charge', 'Tokens are spent per action', 'Balance stays in this browser', 'Ready for real payment later'], btn: 'Add €10 tokens', active: true },
        { name: 'Pay as you go', price: '€0', period: ' monthly', desc: 'No monthly commitment. Pay only when you use AI.', features: ['Validation: 1,200 tokens', 'Report tools: 250-550 tokens', 'Advisor: 140 tokens', 'Deep advisor: 380 tokens', 'Memory and tasks: small extra cost'], btn: 'Open wallet', active: false },
      ],
      testimonialsTitle: 'Early feedback',
      testimonialsSubtitle: 'Short reactions from early users.',
      testimonials: [
        { quote: 'The AI highlighted 3 critical security concerns that investors literally asked us about during our pitch deck review a week later. Saved our round.', author: 'Steve M., FinTech Founder' },
        { quote: 'Instead of spending weeks and thousands on validation surveys, I ran my SaaS concept in 30 seconds and saw exactly why HR buyers would reject it.', author: 'Ann K., SaaS Developer' },
      ],
      mockupHeader: 'Demo: SignalBoard (Founder SaaS)',
      mockupScore: 'Idea Score: 68/100',
      mockupStats: 'Would buy: 38% | Maybe: 34% | Rejects: 28%',
      mockTabs: { summary: 'Summary', objections: 'Rejections', questions: 'Crowd Questions' },
      mockSummary: 'SignalBoard looks promising for solo SaaS founders already doing interviews, but the signal is still soft. The biggest issue is not interest, it is proof that the tool saves time and is not just another ChatGPT wrapper.',
      mockObjection: 'This sounds useful, but I do not see why I would not do this in Notion and ChatGPT.',
      mockObjection2: 'I do not have enough real interviews yet for a dashboard like this to matter.',
      mockQuestion: 'What exact result does a founder get after the first 5 customer interviews?',
      mockQuestion2: 'What would convince me this shortens the path to first paid validation?',
      mockAnswerPlaceholder: 'Type an answer or extra context...',
      mockButton: 'Simulate answer',
      continueReport: 'Return to latest report',
      errorTitle: 'Analysis failed',
      errorHelp: 'Nothing was lost. You can retry or edit the idea description.',
      retry: 'Try again',
      editIdea: 'Edit idea',
    }
  }[language];

  const showLabel = language === 'en' ? 'Show' : 'Prikaži';
  const hideLabel = language === 'en' ? 'Hide' : 'Sakrij';

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
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <button
              onClick={() => router.push('/projects')}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              {t.myProjectsBtn}
            </button>
            <button
              onClick={() => router.push('/settings')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
              title={language === 'en' ? 'Open settings' : 'Otvori postavke'}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{language === 'en' ? 'Settings' : 'Postavke'}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-4 pb-12 pt-4 sm:pt-6">
        <section id="start" className="flex min-h-[calc(100vh-4.5rem)] w-full max-w-6xl scroll-mt-24 items-center">
          <div className="w-full">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-800/50 bg-indigo-950/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
                {language === 'en' ? 'AI first validation' : 'AI prva validacija'}
              </div>
              <h1 className="mt-5 text-[2.7rem] font-extrabold leading-[0.96] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[5.5rem]">
                {t.title1}
                <span className="bg-gradient-to-r from-indigo-400 via-indigo-200 to-purple-400 bg-clip-text text-transparent">{t.title2}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                {t.heroSubtitle}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                {t.heroProof.map((item) => (
                  <span key={item} className="rounded-full border border-zinc-800/80 bg-zinc-900/70 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-200 shadow-lg shadow-black/10">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="mx-auto mt-8 max-w-6xl rounded-[2rem] border border-zinc-800/80 bg-zinc-950/75 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl sm:mt-10 sm:p-3">
              <div className="rounded-[1.65rem] border border-white/5 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.96),rgba(10,10,12,0.94))] p-3 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-zinc-800/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    {language === 'en' ? 'Start with one sentence' : 'Kreni s jednom recenicom'}
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {language === 'en'
                      ? 'AI shapes the brief first, then opens the rest only when it helps.'
                      : 'AI prvo slozi brief, pa otvara ostatak tek kad stvarno pomaze.'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-400 lg:min-w-[290px]">
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                    <div className="font-bold text-white">50</div>
                    <div>persona</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                    <div className="font-bold text-white">~30s</div>
                    <div>{language === 'en' ? 'signal' : 'signal'}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                    <div className="font-bold text-white">7d</div>
                    <div>{language === 'en' ? 'test' : 'test'}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {hasStoredReport && (
                  <button
                    type="button"
                    onClick={() => router.push('/results')}
                    className="w-full rounded-2xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm font-bold text-emerald-200 transition-colors hover:border-emerald-500 hover:text-white"
                  >
                    {t.continueReport}
                  </button>
                )}
                {loadingAudiences ? (
                  <div className="flex flex-col items-center gap-3 py-16">
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-800 border-t-indigo-600" />
                    <span className="text-sm text-zinc-400">{t.findingAudiences}</span>
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
              </div>
            </div>
          </div>
        </section>

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

        <section className="mt-10 w-full max-w-4xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">{t.workspaceTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">{t.workspaceSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('workspace')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {isSectionExpanded('workspace') ? hideLabel : showLabel}
              {isSectionExpanded('workspace') ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className={`${isSectionExpanded('workspace') ? 'grid' : 'hidden'} gap-4 lg:grid-cols-[1.05fr_0.95fr]`}>
            <TokenWallet language={language} />
            <SetupStatus language={language} onOpenSettings={() => router.push('/settings')} />
          </div>
        </section>

        {/* Stats Counter Section */}
        <section className="mt-20 w-full max-w-4xl rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 backdrop-blur-sm sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">{t.howItWorks}</h2>
              <p className="mt-1 text-sm text-zinc-500">{language === 'en' ? 'The shortest path from rough idea to the first real test.' : 'Najkraci put od sirove ideje do prvog stvarnog testa.'}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('stats')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {isSectionExpanded('stats') ? hideLabel : showLabel}
              {isSectionExpanded('stats') ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className={`${isSectionExpanded('stats') ? 'grid' : 'hidden'} mt-5 gap-6 text-center sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:gap-8 sm:divide-zinc-800/50`}>
            {t.stats.map(({ value, label }) => (
              <div key={label} className="border-b border-zinc-800/50 pb-5 last:border-b-0 last:pb-0 sm:border-b-0 sm:pb-0">
                <div className="font-title text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{value}</div>
                <div className="text-sm text-zinc-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Live Preview Mockup Dashboard */}
        <section className="mt-20 max-w-3xl w-full">
          <div className="mb-6 flex items-start justify-between gap-3 text-left sm:block sm:text-center">
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">{t.previewTitle}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t.previewSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('preview')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {isSectionExpanded('preview') ? hideLabel : showLabel}
              {isSectionExpanded('preview') ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          
          <div className={`${isSectionExpanded('preview') ? 'block' : 'hidden'} relative w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-2xl backdrop-blur-md sm:p-6`}>
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
                      <span>{language === 'en' ? '1. No proof yet' : '1. Jos nema dokaza'}</span>
                      <span>41%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full rounded-full" style={{ width: '41%' }} />
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
          <div className="mb-8 flex items-start justify-between gap-3 text-left sm:mb-10 sm:block sm:text-center">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white md:text-3xl">{t.pricingTitle}</h2>
              <p className="mt-2 max-w-md text-sm text-zinc-500 sm:mx-auto">{t.pricingSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('pricing')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {isSectionExpanded('pricing') ? hideLabel : showLabel}
              {isSectionExpanded('pricing') ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          
          <div className={`${isSectionExpanded('pricing') ? 'grid' : 'hidden'} gap-6 items-stretch md:grid-cols-3`}>
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
          <div className="mb-8 flex items-start justify-between gap-3 text-left sm:mb-10 sm:block sm:text-center">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white">{t.testimonialsTitle}</h2>
              <p className="mt-2 text-sm text-zinc-500">{t.testimonialsSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('testimonials')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {isSectionExpanded('testimonials') ? hideLabel : showLabel}
              {isSectionExpanded('testimonials') ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          
          <div className={`${isSectionExpanded('testimonials') ? 'grid' : 'hidden'} gap-6 md:grid-cols-2`}>
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
          <div className="mb-8 flex items-start justify-between gap-3 text-left sm:block sm:text-center">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500">{t.howItWorks}</p>
              <p className="mt-2 text-sm text-zinc-500">{language === 'en' ? 'A simple path from idea to action.' : 'Jednostavan put od ideje do konkretnog poteza.'}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleSection('steps')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              {isSectionExpanded('steps') ? hideLabel : showLabel}
              {isSectionExpanded('steps') ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className={`${isSectionExpanded('steps') ? 'grid' : 'hidden'} gap-6 md:grid-cols-3`}>
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
