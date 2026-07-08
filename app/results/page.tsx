'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import ObsidianSync from '@/components/ObsidianSync';
import { useAuth } from '@/context/AuthContext';
import { aiClient } from '@/lib/ai-client';
import { createProject, getProject, updateProject } from '@/lib/projects';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type { ValidationReport, IdeaFormData, MarketIntelligence, SegmentSpec } from '@/lib/types';

type RerunAudienceMode = 'ai' | 'custom' | 'random';
type RerunFocus = 'all' | 'users' | 'businesses' | 'split';
type ReportVariantKey = 'all' | 'users' | 'businesses';

interface RerunSettings {
  sampleSize: 50 | 100 | 200;
  audienceMode: RerunAudienceMode;
  customAudience: string;
  focus: RerunFocus;
}

type ReportVariants = Partial<Record<ReportVariantKey, ValidationReport>>;

export default function ResultsPage() {
  const router = useRouter();
  const { user, loading, language, setLanguage } = useAuth();
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [form, setForm] = useState<IdeaFormData | null>(null);
  const [copied, setCopied] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketIntelligence | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showAdvancedActions, setShowAdvancedActions] = useState(false);
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [rerunState, setRerunState] = useState<'idle' | 'running' | 'error'>('idle');
  const [rerunError, setRerunError] = useState('');
  const [rerunPhase, setRerunPhase] = useState('');
  const [activeVariant, setActiveVariant] = useState<ReportVariantKey>('all');
  const [reportVariants, setReportVariants] = useState<ReportVariants>({});
  const [rerunSettings, setRerunSettings] = useState<RerunSettings>({
    sampleSize: 100,
    audienceMode: 'ai',
    customAudience: '',
    focus: 'all',
  });

  useEffect(() => {
    let active = true;
    const rawReport = sessionStorage.getItem('aivalidator_report');
    if (!rawReport) {
      router.replace('/');
      return () => {
        active = false;
      };
    }
    let parsedReport: ValidationReport;
    try {
      parsedReport = JSON.parse(rawReport);
    } catch {
      router.replace('/');
      return () => {
        active = false;
      };
    }

    let parsedForm: IdeaFormData | null = null;
    const rawForm = sessionStorage.getItem('aivalidator_form');
    if (rawForm) {
      try {
        parsedForm = JSON.parse(rawForm);
      } catch {}
    }

    const savedId = sessionStorage.getItem('aivalidator_project_id');
    const rawVariants = sessionStorage.getItem('aivalidator_report_variants');
    let parsedVariants: ReportVariants = {};
    if (rawVariants) {
      try {
        parsedVariants = JSON.parse(rawVariants) as ReportVariants;
      } catch {}
    }
    queueMicrotask(() => {
      if (!active) return;
      setReport(parsedReport);
      setReportVariants(Object.keys(parsedVariants).length ? parsedVariants : { all: parsedReport });
      if (parsedForm) setForm(parsedForm);
      if (savedId) {
        setProjectId(savedId);
        setSaveState('saved');
        setSavedAt(new Date());
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  // Dohvati market istraživanje s projekta (za Obsidian izvoz) — best-effort, ne blokira renderiranje
  useEffect(() => {
    if (!projectId || !user) return;
    let active = true;
    getProject(projectId, user.uid)
      .then((proj) => {
        if (active && proj?.market) setMarket(proj.market);
      })
      .catch((err) => console.error('Market fetch error:', err));
    return () => {
      active = false;
    };
  }, [projectId, user]);

  const handleSave = async () => {
    if (!report || !form || saveState === 'saving') return;
    const ownerUid = user?.uid ?? 'local-profile';
    setSaveState('saving');
    try {
      const input = { idea: form, report };
      if (projectId) {
        await updateProject(projectId, input);
      } else {
        const newId = await createProject(ownerUid, input);
        setProjectId(newId);
        sessionStorage.setItem('aivalidator_project_id', newId);
      }
      setSaveState('saved');
      setSavedAt(new Date());
    } catch (err) {
      console.error('Save error:', err);
      setSaveState('error');
    }
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewTest = () => {
    if (form && report) {
      setRerunSettings((current) => ({
        ...current,
        sampleSize: report.meta.personas_count === 50 || report.meta.personas_count === 200 ? report.meta.personas_count : 100,
        focus: form.business_model === 'B2B2C' ? current.focus : 'all',
      }));
      setRerunError('');
      setRerunPhase('');
      setShowRerunModal(true);
      return;
    }
    sessionStorage.removeItem('aivalidator_report');
    sessionStorage.removeItem('aivalidator_form');
    sessionStorage.removeItem('aivalidator_project_id');
    sessionStorage.removeItem('aivalidator_report_variants');
    router.push('/');
  };

  const makeCustomSegment = (text: string): SegmentSpec => ({
    id: `custom-${Date.now()}`,
    label: text.trim().slice(0, 60) || (language === 'en' ? 'Custom audience' : 'Ručna publika'),
    description: text.trim().slice(0, 200),
    roles: text
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6),
    age_range: [20, 65],
    regions: form?.target_market ? [form.target_market] : ['Global'],
    income_skew: 'mixed',
    tech_range: [2, 9],
    rationale: text.trim().slice(0, 240),
  });

  const prepareRerunForm = async (
    baseForm: IdeaFormData,
    settings: RerunSettings,
    focus: Exclude<RerunFocus, 'split'>,
    phaseText: string
  ): Promise<IdeaFormData> => {
    const nextForm: IdeaFormData = {
      ...baseForm,
      sample_size: settings.sampleSize,
      validation_focus: focus,
      language,
      depth: settings.sampleSize >= 200 ? 'deep' : 'standard',
    };

    if (settings.audienceMode === 'random') {
      const { segmentSpecs, ...withoutSegments } = nextForm;
      void segmentSpecs;
      return withoutSegments;
    }

    if (settings.audienceMode === 'custom') {
      return { ...nextForm, segmentSpecs: [makeCustomSegment(settings.customAudience)] };
    }

    setRerunPhase(phaseText);
    const suggested = await aiClient.suggestAudiences<{ segments?: SegmentSpec[] }>({ idea: nextForm, language });
    return { ...nextForm, segmentSpecs: suggested.segments ?? nextForm.segmentSpecs };
  };

  const rerunCost = (sampleSize: 50 | 100 | 200, runs: number) => Math.max(1, Math.round(TOKEN_COSTS.validation * (sampleSize / 100) * runs));

  const handleRunNewTest = async () => {
    if (!form) return;
    if (rerunSettings.focus === 'split' && rerunSettings.sampleSize === 200) {
      setRerunError(language === 'en'
        ? 'Separate B2B2C reports are limited to 100 per side for now. Use 100, or run users and businesses separately.'
        : 'Odvojeni B2B2C reporti su za sada ograničeni na 100 po strani. Odaberi 100 ili pokreni korisnike i biznise odvojeno.');
      return;
    }
    const runs = rerunSettings.focus === 'split' ? 2 : 1;
    const cost = rerunCost(rerunSettings.sampleSize, runs);
    const label = language === 'en' ? 'Retest validation' : 'Ponovni test validacije';
    const tokenResult = spendTokens(cost, label);
    if (!tokenResult.ok) {
      setRerunError(tokenShortfallMessage(language, label, cost, tokenResult.missing));
      return;
    }

    setRerunState('running');
    setRerunError('');
    setRerunPhase(language === 'en' ? 'Preparing the retest...' : 'Pripremam ponovni test...');
    try {
      if (rerunSettings.focus === 'split') {
        const usersForm = await prepareRerunForm(
          form,
          rerunSettings,
          'users',
          language === 'en' ? 'Choosing target audiences for users...' : 'Biramo ciljane publike za korisnike...'
        );
        setRerunPhase(language === 'en' ? 'Testing user-side demand...' : 'Testiram korisničku potražnju...');
        const usersReport = await aiClient.validateIdea<ValidationReport>(usersForm, language === 'en' ? 'Retest failed' : 'Ponovni test nije uspio');
        const businessForm = await prepareRerunForm(
          form,
          rerunSettings,
          'businesses',
          language === 'en' ? 'Choosing target audiences for businesses...' : 'Biramo ciljane publike za biznise...'
        );
        setRerunPhase(language === 'en' ? 'Testing business-side willingness to pay...' : 'Testiram spremnost biznisa na plaćanje...');
        const businessReport = await aiClient.validateIdea<ValidationReport>(businessForm, language === 'en' ? 'Retest failed' : 'Ponovni test nije uspio');
        setRerunPhase(language === 'en' ? 'Building separate reports...' : 'Slažem odvojene izvještaje...');
        const variants: ReportVariants = { users: usersReport, businesses: businessReport };
        setReportVariants(variants);
        setActiveVariant('users');
        setReport(usersReport);
        sessionStorage.setItem('aivalidator_report_variants', JSON.stringify(variants));
        sessionStorage.setItem('aivalidator_report', JSON.stringify(usersReport));
        sessionStorage.setItem('aivalidator_form', JSON.stringify(usersForm));
        setForm(usersForm);
      } else {
        const nextForm = await prepareRerunForm(
          form,
          rerunSettings,
          rerunSettings.focus,
          language === 'en' ? 'Choosing target audiences...' : 'Biramo ciljane publike...'
        );
        setRerunPhase(language === 'en' ? `Testing ${rerunSettings.sampleSize} simulated buyers...` : `Testiram ${rerunSettings.sampleSize} simuliranih kupaca...`);
        const nextReport = await aiClient.validateIdea<ValidationReport>(nextForm, language === 'en' ? 'Retest failed' : 'Ponovni test nije uspio');
        setRerunPhase(language === 'en' ? 'Building the report...' : 'Slažem izvještaj...');
        const key = rerunSettings.focus as ReportVariantKey;
        const variants: ReportVariants = { [key]: nextReport };
        setReportVariants(variants);
        setActiveVariant(key);
        setReport(nextReport);
        setForm(nextForm);
        sessionStorage.setItem('aivalidator_report_variants', JSON.stringify(variants));
        sessionStorage.setItem('aivalidator_report', JSON.stringify(nextReport));
        sessionStorage.setItem('aivalidator_form', JSON.stringify(nextForm));
      }
      sessionStorage.removeItem('aivalidator_project_id');
      setProjectId(null);
      setSaveState('idle');
      setShowRerunModal(false);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : language === 'en' ? 'Retest failed.' : 'Ponovni test nije uspio.');
      setRerunState('error');
    } finally {
      setRerunState((state) => state === 'running' ? 'idle' : state);
      setRerunPhase('');
    }
  };

  const showReportVariant = (key: ReportVariantKey) => {
    const nextReport = reportVariants[key];
    if (!nextReport) return;
    setActiveVariant(key);
    setReport(nextReport);
    sessionStorage.setItem('aivalidator_report', JSON.stringify(nextReport));
  };

  const handleLanguageChange = async (targetLang: 'hr' | 'en') => {
    if (targetLang === language) return;
    if (!report) return;

    setTranslating(true);
    setTranslationError('');
    try {
      // Izdvoji teške/brojčano-kritične strukture iz prijevoda da ih LLM ne pomrsi ni ispusti.
      // Prevode se samo osnovni narativni dijelovi; ostalo se vraća netaknuto.
      const {
        personas,
        reactions,
        opportunity,
        clusters,
        conjoint,
        pricing,
        segments,
        ...restReport
      } = report;

      const data = await aiClient.translateReport<Partial<ValidationReport>>(
        { report: restReport, targetLanguage: targetLang },
        'Greška pri prijevodu'
      );

      const updatedReport = {
        ...data,
        personas,
        reactions,
        opportunity,
        clusters,
        conjoint,
        pricing,
        segments,
      } as ValidationReport;

      setReport(updatedReport);
      sessionStorage.setItem('aivalidator_report', JSON.stringify(updatedReport));
      setLanguage(targetLang);
    } catch (err: unknown) {
      setTranslationError(err instanceof Error ? err.message : language === 'en' ? 'Translation failed.' : 'Greška kod prevođenja.');
    } finally {
      setTranslating(false);
    }
  };

  const t = {
    hr: {
      back: '← Natrag',
      kicker: 'Protokol — verdikt',
      copyJson: 'Kopiraj JSON',
      copied: '✓ Kopirano',
      newTest: 'Novi test',
      simulatedBuyers: 'simuliranih kupaca',
      buy: 'Kupuje',
      maybe: 'Možda',
      reject: 'Odbija',
      loadingText: 'Učitavam...',
      translatingText: 'Prevodim izvještaj...',
      save: 'Spremi projekt',
      saving: 'Spremam...',
      saved: '✓ Spremljeno',
      saveError: 'Greška — pokušaj ponovno',
      myProjects: 'Moji projekti',
      advisors: 'Next-step savjetnici',
      discovery: 'Dubinsko ispitivanje',
      plan: 'Biznis plan',
      market: 'Tržište',
      settings: 'Postavke',
      localProfileTitle: 'Lokalni profil aktivan',
      localProfileText: 'Izvještaj možeš spremiti, otvoriti Research ili Positioning savjetnika i nastaviti rad bez cloud prijave.',
      nextTitle: 'Što sada?',
      nextSubtitle: 'Ako nisi siguran što kliknuti, kreni ovim redom.',
      nextSave: 'Spremi projekt',
      nextAdvisors: 'Otvori savjetnike',
      nextNew: 'Testiraj drugu verziju',
      nextStatusSaved: 'Projekt je spremljen. Sad ima smisla otvoriti savjetnike ili se vratiti kasnije iz Mojih projekata.',
      nextStatusUnsaved: 'Prvo spremi projekt da zadržiš izvještaj, savjetnike i taskove na jednom mjestu.',
      moreActions: 'Napredne opcije',
      hideActions: 'Sakrij napredne opcije',
      advancedActionsHelp: 'Za izvoz, Obsidian i tehničke kopije.',
      translationErrorTitle: 'Prijevod nije uspio',
      translationErrorHelp: 'Izvještaj je ostao netaknut. Pokušaj ponovno za par sekundi.',
      rerunTitle: 'Ponovni test iste ideje',
      rerunHelp: 'Odaberi veličinu uzorka i publiku. Stari izvještaj ostaje dok novi ne završi.',
      sampleTitle: 'Koliko simuliranih kupaca?',
      audienceTitle: 'Koju publiku testiramo?',
      audienceAi: 'AI predloži ciljane publike',
      audienceCustom: 'Sam upisujem publiku',
      audienceRandom: 'Random ljudi',
      customAudiencePlaceholder: 'npr. mali apartmani u Dalmaciji, vlasnici restorana, turisti 25-45...',
      focusTitle: 'B2B2C izvještaj',
      focusAll: 'Jedan zajednički report',
      focusUsers: 'Samo korisnici',
      focusBusinesses: 'Samo biznisi',
      focusSplit: 'Odvojeno: korisnici + biznisi',
      cancel: 'Odustani',
      runRetest: 'Pokreni test',
      runningRetest: 'Testiram...',
      rerunWorkingTitle: 'Test je u tijeku',
      rerunWorkingHelp: 'Ovo može potrajati dulje kod ciljanih publika i odvojenih B2B2C izvještaja. Ne zatvaraj ovaj prozor.',
      splitLimitHelp: 'Odvojeni B2B2C reporti trenutno rade do 100 po strani.',
      variantAll: 'Zajednički report',
      variantUsers: 'Korisnici',
      variantBusinesses: 'Biznisi',
    },
    en: {
      back: '← Back',
      kicker: 'Protocol — verdict',
      copyJson: 'Copy JSON',
      copied: '✓ Copied',
      newTest: 'New test',
      simulatedBuyers: 'simulated buyers',
      buy: 'Buys',
      maybe: 'Maybe',
      reject: 'Rejects',
      loadingText: 'Loading...',
      translatingText: 'Translating report...',
      save: 'Save project',
      saving: 'Saving...',
      saved: '✓ Saved',
      saveError: 'Error — try again',
      myProjects: 'My projects',
      advisors: 'Next-step advisors',
      discovery: 'Deep discovery',
      plan: 'Business plan',
      market: 'Market',
      settings: 'Settings',
      localProfileTitle: 'Local profile is active',
      localProfileText: 'You can save this report, open the Research or Positioning advisor, and keep working without any cloud sign-in.',
      nextTitle: 'What now?',
      nextSubtitle: 'If you are not sure what to click, start in this order.',
      nextSave: 'Save project',
      nextAdvisors: 'Open advisors',
      nextNew: 'Test another version',
      nextStatusSaved: 'Your project is saved. Now it makes sense to open advisors or come back later from My projects.',
      nextStatusUnsaved: 'Save the project first so the report, advisors, and tasks stay in one place.',
      moreActions: 'Advanced options',
      hideActions: 'Hide advanced options',
      advancedActionsHelp: 'For exports, Obsidian, and technical copies.',
      translationErrorTitle: 'Translation failed',
      translationErrorHelp: 'The report was left unchanged. Try again in a few seconds.',
      rerunTitle: 'Retest the same idea',
      rerunHelp: 'Choose sample size and audience. The old report stays until the new one finishes.',
      sampleTitle: 'How many simulated buyers?',
      audienceTitle: 'Which audience?',
      audienceAi: 'Let AI suggest target audiences',
      audienceCustom: 'I will write the audience',
      audienceRandom: 'Random people',
      customAudiencePlaceholder: 'e.g. small rentals in Dalmatia, restaurant owners, tourists 25-45...',
      focusTitle: 'B2B2C report',
      focusAll: 'One combined report',
      focusUsers: 'Users only',
      focusBusinesses: 'Businesses only',
      focusSplit: 'Separate: users + businesses',
      cancel: 'Cancel',
      runRetest: 'Run test',
      runningRetest: 'Testing...',
      rerunWorkingTitle: 'Test in progress',
      rerunWorkingHelp: 'This can take longer with targeted audiences and separate B2B2C reports. Keep this window open.',
      splitLimitHelp: 'Separate B2B2C reports currently run up to 100 per side.',
      variantAll: 'Combined report',
      variantUsers: 'Users',
      variantBusinesses: 'Businesses',
    }
  }[language];

  const isSaved = saveState === 'saved';

  if (loading || !report) {
    return (
      <div className="paper-root flex min-h-screen items-center justify-center">
        <span className="font-data text-xs uppercase tracking-[0.2em] text-[var(--ink-faint)]">{t.loadingText}</span>
      </div>
    );
  }

  const verdictColor = report.score >= 60 ? 'var(--verdict-green)' : report.score >= 35 ? 'var(--annotate)' : 'var(--verdict-red)';
  const verdictWord =
    report.score >= 60
      ? (language === 'en' ? 'Promising' : 'Obećavajuće')
      : report.score >= 35
        ? (language === 'en' ? 'Mixed' : 'Miješano')
        : (language === 'en' ? 'Rejected' : 'Odbijeno');

  return (
    <div className="paper-root min-h-screen">
      {translating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
            <span className="font-data text-xs uppercase tracking-[0.15em] text-[var(--ink-soft)]">{t.translatingText}</span>
          </div>
        </div>
      )}

      {showRerunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--ink)]/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kicker">{t.rerunTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{t.rerunHelp}</p>
              </div>
              <button type="button" onClick={() => setShowRerunModal(false)} className="link-ink text-xs" disabled={rerunState === 'running'}>
                {t.cancel}
              </button>
            </div>

            <div className="mt-5 grid gap-5">
              {rerunState === 'running' && (
                <div className="border-2 border-[var(--ink)] bg-[var(--paper)] p-4">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-4 border-[var(--hairline)] border-t-[var(--verdict-red)]" />
                    <div>
                      <p className="font-data text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)]">{t.rerunWorkingTitle}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{rerunPhase || t.runningRetest}</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden border border-[var(--hairline-strong)] bg-[var(--paper-raised)]">
                    <div className="h-full w-2/3 animate-pulse bg-[var(--verdict-red)]" />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--ink-faint)]">{t.rerunWorkingHelp}</p>
                </div>
              )}

              <div>
                <p className="font-data mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">{t.sampleTitle}</p>
                <div className="grid grid-cols-3 gap-2">
                  {([50, 100, 200] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setRerunSettings((current) => ({ ...current, sampleSize: size }))}
                      disabled={rerunState === 'running' || (size === 200 && rerunSettings.focus === 'split')}
                      className={`border px-3 py-3 text-center font-data text-sm font-semibold ${
                        rerunSettings.sampleSize === size
                          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                          : 'border-[var(--hairline-strong)] text-[var(--ink)] hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                {form?.business_model === 'B2B2C' && rerunSettings.focus === 'split' && (
                  <p className="mt-2 text-xs font-semibold text-[var(--ink-faint)]">{t.splitLimitHelp}</p>
                )}
              </div>

              <div>
                <p className="font-data mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">{t.audienceTitle}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ['ai', t.audienceAi],
                    ['custom', t.audienceCustom],
                    ['random', t.audienceRandom],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRerunSettings((current) => ({ ...current, audienceMode: mode }))}
                      disabled={rerunState === 'running'}
                      className={`border px-3 py-3 text-left text-sm font-semibold ${
                        rerunSettings.audienceMode === mode
                          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                          : 'border-[var(--hairline-strong)] text-[var(--ink)] hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {rerunSettings.audienceMode === 'custom' && (
                  <textarea
                    value={rerunSettings.customAudience}
                    onChange={(event) => setRerunSettings((current) => ({ ...current, customAudience: event.target.value }))}
                    disabled={rerunState === 'running'}
                    rows={3}
                    placeholder={t.customAudiencePlaceholder}
                    className="paper-field mt-3 resize-none text-sm"
                  />
                )}
              </div>

              {form?.business_model === 'B2B2C' && (
                <div>
                  <p className="font-data mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">{t.focusTitle}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ['all', t.focusAll],
                      ['users', t.focusUsers],
                      ['businesses', t.focusBusinesses],
                      ['split', t.focusSplit],
                    ] as const).map(([focus, label]) => (
                      <button
                        key={focus}
                        type="button"
                        onClick={() => setRerunSettings((current) => ({
                          ...current,
                          focus,
                          sampleSize: focus === 'split' && current.sampleSize === 200 ? 100 : current.sampleSize,
                        }))}
                        disabled={rerunState === 'running'}
                        className={`border px-3 py-3 text-left text-sm font-semibold ${
                          rerunSettings.focus === focus
                            ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                            : 'border-[var(--hairline-strong)] text-[var(--ink)] hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-35'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {rerunError && (
              <p className="mt-4 border-l-4 border-[var(--verdict-red)] pl-3 text-sm font-semibold text-[var(--verdict-red)]">{rerunError}</p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowRerunModal(false)} className="btn-line text-sm" disabled={rerunState === 'running'}>
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleRunNewTest}
                disabled={rerunState === 'running' || (rerunSettings.audienceMode === 'custom' && !rerunSettings.customAudience.trim())}
                className="btn-ink text-sm disabled:opacity-50"
              >
                {rerunState === 'running' ? t.runningRetest : t.runRetest}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Masthead ── */}
      <nav className="border-b-2 border-[var(--ink)] px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
          <button type="button" onClick={handleNewTest} className="link-ink text-sm">
            {t.back}
          </button>
          <div className="flex items-center gap-5">
            <div className="font-data flex items-center gap-1 text-xs">
              <button
                onClick={() => handleLanguageChange('hr')}
                disabled={translating}
                className={`cursor-pointer px-1 py-0.5 font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${
                  language === 'hr' ? 'text-[var(--verdict-red)] underline underline-offset-4' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
                }`}
              >
                HR
              </button>
              <span className="text-[var(--hairline-strong)]">/</span>
              <button
                onClick={() => handleLanguageChange('en')}
                disabled={translating}
                className={`cursor-pointer px-1 py-0.5 font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${
                  language === 'en' ? 'text-[var(--verdict-red)] underline underline-offset-4' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
                }`}
              >
                EN
              </button>
            </div>
            <button type="button" onClick={() => router.push('/plan')} className="link-ink text-sm">
              {t.plan}
            </button>
            <button type="button" onClick={() => router.push('/market')} className="link-ink text-sm">
              {t.market}
            </button>
            <button type="button" onClick={() => router.push('/projects')} className="link-ink text-sm">
              {t.myProjects}
            </button>
            <button type="button" onClick={() => router.push('/settings')} className="link-ink text-sm">
              {t.settings}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        {/* ── Verdikt: naslov + pečat + score/intent tablica ── */}
        <section className="pt-10 sm:pt-14">
          <p className="kicker">{t.kicker}</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl text-[var(--ink)] sm:text-5xl">{report.meta.product_name}</h1>
              <p className="mt-2 text-sm text-[var(--ink-faint)]">
                {report.meta.personas_count} {t.simulatedBuyers}
              </p>
            </div>
            <span className="stamp !text-sm" style={{ color: verdictColor, borderColor: verdictColor }}>
              {verdictWord} · {report.score}/100
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
            <div className="border border-[var(--hairline-strong)] px-3 py-2.5 text-center">
              <div className="font-data text-xl font-semibold" style={{ color: 'var(--verdict-green)' }}>{report.intent.buy}%</div>
              <div className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.buy}</div>
            </div>
            <div className="border border-[var(--hairline-strong)] px-3 py-2.5 text-center">
              <div className="font-data text-xl font-semibold" style={{ color: 'var(--annotate)' }}>{report.intent.maybe}%</div>
              <div className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.maybe}</div>
            </div>
            <div className="border border-[var(--hairline-strong)] px-3 py-2.5 text-center">
              <div className="font-data text-xl font-semibold" style={{ color: 'var(--verdict-red)' }}>{report.intent.reject}%</div>
              <div className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.reject}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => router.push('/advisors')} className="btn-ink text-sm">
              {t.advisors}
            </button>
            <button type="button" onClick={() => router.push('/discovery')} className="btn-line text-sm">
              {t.discovery}
            </button>
            <button
              onClick={handleSave}
              disabled={saveState === 'saving' || saveState === 'saved'}
              className="btn-line text-sm disabled:opacity-60"
            >
              {saveState === 'saving' ? t.saving : saveState === 'saved' ? t.saved : saveState === 'error' ? t.saveError : t.save}
            </button>
            <button type="button" onClick={handleNewTest} className="btn-line text-sm">
              {t.newTest}
            </button>
            <button type="button" onClick={() => setShowAdvancedActions((v) => !v)} className="link-ink ml-auto text-sm">
              {showAdvancedActions ? t.hideActions : t.moreActions}
            </button>
          </div>

          {Object.keys(reportVariants).length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-4">
              {([
                ['all', t.variantAll],
                ['users', t.variantUsers],
                ['businesses', t.variantBusinesses],
              ] as const).map(([key, label]) => reportVariants[key] ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => showReportVariant(key)}
                  className={`font-data border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                    activeVariant === key
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--hairline-strong)] text-[var(--ink-soft)] hover:border-[var(--ink)]'
                  }`}
                >
                  {label}
                </button>
              ) : null)}
            </div>
          )}

          {showAdvancedActions && (
            <div className="mt-4 border-t border-[var(--hairline)] pt-4">
              <p className="text-xs text-[var(--ink-faint)]">{t.advancedActionsHelp}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <ObsidianSync report={report} form={form} language={language} market={market} />
                <button type="button" onClick={handleCopy} className="link-ink text-xs">
                  {copied ? t.copied : t.copyJson}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Lokalni profil napomena ── */}
        <section className="mt-8">
          <div className="sheet flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">{t.localProfileTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-faint)]">{t.localProfileText}</p>
            </div>
            <button type="button" onClick={() => router.push('/projects')} className="btn-line shrink-0 text-xs">
              {t.myProjects}
            </button>
          </div>
        </section>

        {translationError && (
          <div className="mt-6 border-l-4 border-[var(--verdict-red)] bg-[var(--paper-raised)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--ink)]">{t.translationErrorTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-faint)]">{translationError}</p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">{t.translationErrorHelp}</p>
          </div>
        )}

        {/* ── Sto sada ── */}
        <section className="mt-8">
          <div className="border-2 border-[var(--ink)] p-5">
            <p className="kicker">{t.nextTitle}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{t.nextSubtitle}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">
              {isSaved ? t.nextStatusSaved : t.nextStatusUnsaved}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="btn-line text-left text-xs disabled:opacity-60"
              >
                {saveState === 'saved' ? `✓ ${t.saved}` : saveState === 'saving' ? t.saving : t.nextSave}
              </button>
              <button type="button" onClick={() => router.push('/advisors')} className="btn-line text-left text-xs">
                {t.nextAdvisors}
              </button>
              <button type="button" onClick={handleNewTest} className="btn-line text-left text-xs">
                {t.nextNew}
              </button>
            </div>
          </div>
        </section>

        {/* ── Dashboard (radni ekran — tamna instrument ploča) ── */}
        <div className="mt-10">
          <Dashboard
            report={report}
            form={form}
            onUpdateReport={(newReport) => {
              setReport(newReport);
              sessionStorage.setItem('aivalidator_report', JSON.stringify(newReport));
              if (projectId && user && form) {
                setSaveState('saving');
                updateProject(projectId, { idea: form, report: newReport })
                  .then(() => {
                    setSaveState('saved');
                    setSavedAt(new Date());
                  })
                  .catch((err) => {
                    console.error('Auto-save updated report error:', err);
                    setSaveState('error');
                  });
              } else {
                setSaveState('idle');
              }
            }}
          />
        </div>
      </main>
    </div>
  );
}
