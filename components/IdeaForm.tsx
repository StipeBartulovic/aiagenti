'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import AreaMapPicker from '@/components/AreaMapPicker';
import { aiClient } from '@/lib/ai-client';
import type { AdaptiveIntakeAnswer, DiscoveryAnswer, IdeaFormData } from '@/lib/types';

interface Props {
  /** Forma je popunjena i validirana — naslovnica preuzima (prijedlog publika → test) */
  onIdeaReady: (form: IdeaFormData) => void;
  onError: (msg: string) => void;
}

interface AdaptiveQuestion {
  id: string;
  category: string;
  question: string;
  placeholder: string;
}

interface IdeaBriefResult {
  business_model: IdeaFormData['business_model'];
  product_name: string;
  elevator_pitch: string;
  detailed_description: string;
  b2b2c_consumer_description?: string;
  b2b2c_business_description?: string;
  price_model: string;
  target_market: string;
  assumed_customer: string;
  competitors: string;
  category_label: string;
  guidance: string;
  questions: AdaptiveQuestion[];
}

export default function IdeaForm({ onIdeaReady, onError }: Props) {
  const { language } = useAuth();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOfficeHours, setShowOfficeHours] = useState(false);
  const [initialBrief, setInitialBrief] = useState('');
  const [isPreparingBrief, setIsPreparingBrief] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [aiGuidance, setAiGuidance] = useState('');
  const [inferredCategory, setInferredCategory] = useState('');
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<AdaptiveQuestion[]>([]);
  const [form, setForm] = useState<IdeaFormData>({
    business_model: 'B2C',
    product_name: '',
    elevator_pitch: '',
    detailed_description: '',
    price_model: '',
    target_market: '',
    assumed_customer: '',
    competitors: '',
    website_url: '',
    document_context: '',
    b2b2c_consumer_description: '',
    b2b2c_business_description: '',
    initial_brief: '',
    inferred_category: '',
    adaptive_answers: [],
    discovery_answers: [],
  });

  const set = (field: keyof IdeaFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const readFileText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(language === 'en' ? 'Could not read file.' : 'Ne mogu procitati datoteku.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });

  const readBinaryAsLooseText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(language === 'en' ? 'Could not read file.' : 'Ne mogu procitati datoteku.'));
    reader.onload = () => {
      const bytes = reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0);
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const cleaned = decoded
        .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      resolve(cleaned);
    };
    reader.readAsArrayBuffer(file);
  });

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDocumentError('');
    setDocumentName(file.name);

    if (file.size > 4 * 1024 * 1024) {
      setDocumentError(language === 'en' ? 'File is too large. Use up to 4 MB for now.' : 'Datoteka je prevelika. Za sada koristi do 4 MB.');
      event.target.value = '';
      return;
    }

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const textLike = ['txt', 'md', 'markdown', 'csv', 'json'].includes(extension || '') || file.type.startsWith('text/');
      const raw = textLike ? await readFileText(file) : await readBinaryAsLooseText(file);
      const extracted = raw.trim().slice(0, 8000);
      const context = extracted.length > 250
        ? `Uploaded document "${file.name}":\n${extracted}`
        : `Uploaded document "${file.name}" (${file.type || extension || 'unknown type'}). Text extraction was limited, so treat this file as supporting project context and rely on the founder's written brief for details.`;

      setForm((prev) => ({ ...prev, document_context: context }));
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : language === 'en' ? 'Could not read file.' : 'Ne mogu procitati datoteku.');
    }
  };

  const clearDocumentUpload = () => {
    setDocumentName('');
    setDocumentError('');
    setForm((prev) => ({ ...prev, document_context: '' }));
  };

  const setDiscoveryAnswer = (question: DiscoveryAnswer['question'], category: DiscoveryAnswer['category'], answer: string) => {
    setForm((prev) => {
      const existing = prev.discovery_answers ?? [];
      const withoutCurrent = existing.filter((item) => item.question !== question);
      return {
        ...prev,
        discovery_answers: [...withoutCurrent, { question, category, answer }],
      };
    });
  };

  const setAdaptiveAnswer = (question: string, category: string, answer: string) => {
    setForm((prev) => {
      const existing = prev.adaptive_answers ?? [];
      const withoutCurrent = existing.filter((item) => item.question !== question);
      return {
        ...prev,
        adaptive_answers: [...withoutCurrent, { question, category, answer }],
      };
    });
  };

  const fillExample = () => {
    const exampleBrief = language === 'en'
      ? 'We install energy-efficient windows for homeowners and small landlords in Zagreb, including measurement, delivery, installation, and warranty.'
      : 'Postavljamo energetski učinkovite prozore za vlasnike kuća i male najmodavce u Zagrebu, uključujući izmjeru, dostavu, montažu i garanciju.';
    setInitialBrief(exampleBrief);
    setInferredCategory(language === 'en' ? 'Local service' : 'Lokalna usluga');
    setAiGuidance(language === 'en'
      ? 'Example filled. Change any field so it matches your real business, then run the validation.'
      : 'Primjer je popunjen. Promijeni bilo koje polje da odgovara tvom stvarnom biznisu, pa pokreni validaciju.');
    setAdaptiveQuestions([]);
    setShowAdvanced(false);
    setForm((prev) => ({
      ...prev,
      business_model: 'B2C',
      product_name: language === 'en' ? 'Zagreb Window Installers' : 'Zagreb Prozori',
      elevator_pitch: language === 'en'
        ? 'A local window-installation service that helps homeowners reduce heating costs with measurement, installation, and warranty included.'
        : 'Lokalna usluga montaže prozora koja vlasnicima kuća smanjuje troškove grijanja kroz izmjeru, montažu i garanciju.',
      detailed_description: language === 'en'
        ? 'We visit the property, measure windows, recommend energy-efficient options, deliver materials, install the windows, remove old ones, and provide a clear warranty. Customers usually worry about price, trust, mess during installation, and whether savings justify the cost.'
        : 'Dolazimo na adresu, mjerimo prozore, predlažemo energetski učinkovite opcije, dostavljamo materijal, montiramo prozore, odvozimo stare i dajemo jasnu garanciju. Kupce najviše brinu cijena, povjerenje, nered tijekom montaže i isplati li se ušteda na grijanju.',
      price_model: language === 'en'
        ? 'Free measurement, then fixed quote per project; typical job 1,200-6,000 EUR depending on number of windows.'
        : 'Besplatna izmjera, zatim fiksna ponuda po projektu; tipičan posao 1.200-6.000 EUR ovisno o broju prozora.',
      target_market: language === 'en' ? 'Zagreb and nearby towns' : 'Zagreb i okolica',
      assumed_customer: language === 'en'
        ? 'Homeowners age 35-65 and small landlords renovating apartments.'
        : 'Vlasnici kuća 35-65 godina i mali najmodavci koji renoviraju stanove.',
      competitors: language === 'en'
        ? 'Local installers, hardware stores, referrals, large window manufacturers.'
        : 'Lokalni majstori, trgovine građevinskog materijala, preporuke, veći proizvođači prozora.',
      initial_brief: exampleBrief,
      inferred_category: language === 'en' ? 'Local service' : 'Lokalna usluga',
      adaptive_answers: [],
    }));
  };

  const prepareFromBrief = async () => {
    const brief = initialBrief.trim();
    if (brief.length < 8) {
      setBriefError(language === 'en' ? 'Write one clear sentence first.' : 'Prvo napiši jednu jasnu rečenicu.');
      return;
    }

    setIsPreparingBrief(true);
    setBriefError('');

    try {
      const result = await aiClient.createIdeaBrief<IdeaBriefResult>(
        { brief, language },
        'Brief preparation failed'
      );
      setAiGuidance(result.guidance);
      setInferredCategory(result.category_label);
      setAdaptiveQuestions(result.questions ?? []);
      setShowAdvanced(false);

      setForm((prev) => ({
        ...prev,
        business_model: result.business_model || prev.business_model,
        product_name: prev.product_name || result.product_name || '',
        elevator_pitch: result.elevator_pitch || prev.elevator_pitch || brief,
        detailed_description: prev.detailed_description || result.detailed_description || '',
        b2b2c_consumer_description: prev.b2b2c_consumer_description || result.b2b2c_consumer_description || '',
        b2b2c_business_description: prev.b2b2c_business_description || result.b2b2c_business_description || '',
        price_model: prev.price_model || result.price_model || '',
        target_market: prev.target_market || result.target_market || '',
        assumed_customer: prev.assumed_customer || result.assumed_customer || '',
        competitors: prev.competitors || result.competitors || '',
        initial_brief: brief,
        inferred_category: result.category_label,
      }));
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : language === 'en' ? 'Could not prepare the form.' : 'Nisam uspio pripremiti formu.');
    } finally {
      setIsPreparingBrief(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.business_model || !form.product_name || !form.elevator_pitch || !form.price_model) {
      onError(language === 'en' ? 'Please fill in all required fields.' : 'Popuni sva obavezna polja.');
      return;
    }

    if (form.business_model === 'B2B2C') {
      if (!form.b2b2c_consumer_description || !form.b2b2c_business_description) {
        onError(language === 'en' ? 'Please fill in both B2B and B2C description fields.' : 'Popuni oba opisa za B2B2C model.');
        return;
      }
    } else {
      if (!form.detailed_description) {
        onError(language === 'en' ? 'Please fill in the detailed description.' : 'Popuni detaljan opis.');
        return;
      }
    }

    const discovery_answers = (form.discovery_answers ?? [])
      .map((item) => ({ ...item, answer: item.answer.trim() }))
      .filter((item) => item.answer.length > 0);
    const adaptive_answers = (form.adaptive_answers ?? [])
      .map((item) => ({ ...item, answer: item.answer.trim() }))
      .filter((item) => item.answer.length > 0);

    // Naslovnica preuzima: prijedlog ciljanih publika → odabir → simulacija
    onIdeaReady({
      ...form,
      initial_brief: form.initial_brief || initialBrief.trim(),
      inferred_category: form.inferred_category || inferredCategory,
      discovery_answers,
      adaptive_answers,
      language,
    });
  };

  const placeholders = {
    B2C: {
      elevator_pitch: 'npr. Mobilna aplikacija koja pomaže ljudima da stvore naviku pijenja vode kroz gamifikaciju.',
      detailed_description: 'Opiši svakodnevni problem korisnika, kako im tvoj proizvod olakšava život, zašto je zabavan ili koristan...',
      price_model: 'npr. Besplatno s oglasima, ili 4.99€ jednokratno, ili 2.99€/mjesečno...',
      assumed_customer: 'npr. Mladi profesionalci 20-30 godina koji žele zdraviji životni stil...',
      assumed_customer_label: 'Tko misliš da je tvoj kupac?',
      website_url_label: language === 'en' ? 'Website URL (optional)' : 'Web stranica (opcionalno)',
      website_url_placeholder: 'npr. https://mojproizvod.com',
    },
    B2B: {
      elevator_pitch: 'npr. SaaS platforma za automatizaciju regrutacije koja smanjuje vrijeme zapošljavanja za 40%.',
      detailed_description: 'Opiši poslovni problem koji rješavaš, ROI/vrijednost za tvrtku (ušteda vremena, novca), tko je donositelj odluke i integracije...',
      price_model: 'npr. 299€/mjesečno po aktivnom korisniku (user seat), godišnji ugovor...',
      assumed_customer: 'npr. Voditelji IT odjela ili CTO u tvrtkama s 50-200 zaposlenika...',
      assumed_customer_label: 'Tko je tvoj idealni poslovni kupac (uloga i profil tvrtke)?',
      website_url_label: language === 'en' ? 'Company Website URL (optional)' : 'Web stranica tvrtke (opcionalno)',
      website_url_placeholder: 'npr. https://tvrtka.com/proizvod',
    },
    B2B2C: {
      elevator_pitch: 'npr. Platforma za dostavu hrane koja povezuje lokalne restorane s krajnjim gladnim kupcima.',
      detailed_description: 'Opiši vrijednost za posrednika (npr. zarada za restorane) i vrijednost za krajnjeg kupca (npr. brza i jeftina dostava)...',
      price_model: 'npr. 15% provizije od restorana + 2.50€ naknada za dostavu od kupca...',
      assumed_customer: 'npr. Restorani brze hrane s jedne strane, te zaposleni samci s druge strane...',
      assumed_customer_label: 'Tko su tvoji kupci (i poslovni partneri i krajnji korisnici)?',
      website_url_label: language === 'en' ? 'Platform Website URL (optional)' : 'Web stranica platforme (opcionalno)',
      website_url_placeholder: 'npr. https://platforma.com',
    },
  }[form.business_model];

  const officeHours = {
    hr: {
      title: 'Founder Office Hours',
      subtitle: 'Nije obavezno, ali jako poboljšava simulaciju. Ovo su pitanja koja bi ti dobar investitor ili customer-discovery coach postavio prije testa.',
      show: 'Naoštri ideju prije validacije',
      hide: 'Sakrij Office Hours',
      placeholder: 'Konkretan odgovor, bez marketinga...',
      questions: [
        {
          category: 'buyer' as const,
          question: 'Tko je jedna konkretna osoba ili firma koja bi ovo mogla trebati?',
          help: 'Ime role, tip firme, situacija, budžet ili navika. Ne "svi".',
        },
        {
          category: 'pain' as const,
          question: 'U kojem trenutku problem postaje dovoljno bolan da traže rješenje?',
          help: 'Opiši okidač: rok, trošak, stres, izgubljeno vrijeme, izgubljeni prihod.',
        },
        {
          category: 'status_quo' as const,
          question: 'Što danas koriste umjesto ovoga?',
          help: 'Status quo je prava konkurencija: Excel, WhatsApp, agencija, ručni rad, ništa.',
        },
        {
          category: 'wedge' as const,
          question: 'Koja je najmanja verzija za koju bi netko platio ili je ozbiljno koristio?',
          help: 'Pilot, concierge usluga, jedna ključna funkcija ili jedan uski segment.',
        },
        {
          category: 'proof' as const,
          question: 'Koji dokaz bi tebe uvjerio da ideja ima stvarnu potražnju?',
          help: 'Npr. 5 plaćenih pilota, 20 razgovora, landing CTR, LOI, čekanje liste s depozitom.',
        },
        {
          category: 'risk' as const,
          question: 'Što te najviše brine da bi moglo srušiti ideju?',
          help: 'Povjerenje, distribucija, cijena, regulativa, navika korisnika, premalo tržište.',
        },
      ],
    },
    en: {
      title: 'Founder Office Hours',
      subtitle: 'Optional, but it makes the simulation much sharper. These are the questions a strong investor or customer-discovery coach would ask before the test.',
      show: 'Sharpen the idea before validation',
      hide: 'Hide Office Hours',
      placeholder: 'Concrete answer, no marketing...',
      questions: [
        {
          category: 'buyer' as const,
          question: 'Who is one specific person or company that might need this?',
          help: 'Role, company type, situation, budget, or habit. Not "everyone".',
        },
        {
          category: 'pain' as const,
          question: 'When does the problem become painful enough that they look for a solution?',
          help: 'Describe the trigger: deadline, cost, stress, wasted time, lost revenue.',
        },
        {
          category: 'status_quo' as const,
          question: 'What do they use today instead?',
          help: 'The status quo is the real competitor: Excel, WhatsApp, agency, manual work, nothing.',
        },
        {
          category: 'wedge' as const,
          question: 'What is the smallest version someone would pay for or seriously use?',
          help: 'A pilot, concierge service, one core feature, or one narrow segment.',
        },
        {
          category: 'proof' as const,
          question: 'What evidence would convince you this has real demand?',
          help: 'For example: 5 paid pilots, 20 interviews, landing CTR, LOI, waitlist with deposits.',
        },
        {
          category: 'risk' as const,
          question: 'What worries you most could kill this idea?',
          help: 'Trust, distribution, pricing, regulation, user habits, market too small.',
        },
      ],
    },
  }[language];

  const discoveryByQuestion = new Map((form.discovery_answers ?? []).map((item) => [item.question, item.answer]));
  const completedDiscoveryCount = [...discoveryByQuestion.values()].filter((answer) => answer.trim().length > 0).length;
  const adaptiveByQuestion = new Map((form.adaptive_answers ?? []).map((item: AdaptiveIntakeAnswer) => [item.question, item.answer]));
  const completedAdaptiveCount = [...adaptiveByQuestion.values()].filter((answer) => answer.trim().length > 0).length;
  const ui = {
    hr: {
      basicsTitle: 'Osnovno za validaciju',
      basicsSubtitle: 'Ova polja su dovoljna za prvi test. Ako ne znaš savršeno odgovoriti, napiši najbolju trenutnu pretpostavku.',
      businessModel: 'Model poslovanja',
      productName: 'Naziv proizvoda',
      pitch: 'Elevator pitch — jedna rečenica',
      detailed: 'Detaljni opis — što rješava i kako',
      detailedHelp: 'Dovoljno je 3-5 rečenica: problem, za koga je, kako radi i zašto bi netko vjerovao.',
      price: 'Cijena i model naplate',
      priceHelp: 'Ako ne znaš točnu cijenu, napiši pretpostavku ili raspon. AI će svejedno testirati reakciju.',
      advancedShow: 'Dodaj napredne informacije (opcionalno)',
      advancedHide: 'Sakrij napredna polja',
      example: 'Popuni primjer',
      exampleHint: 'Nemaš spreman tekst? Kreni od primjera i prepravi ga.',
      targetMarket: 'Ciljano tržište / regija',
      competitors: 'Konkurencija (ako postoji)',
      submit: 'Analiziraj ideju',
      footer: 'Besplatno · 50 simuliranih kupaca · ~30 sekundi',
      readyTitle: 'Spremno za simulaciju',
      missingTitle: 'Još samo malo',
      readyHelp: 'Imaš dovoljno informacija za prvi test. Dodatna polja ispod su opcionalna.',
      missingHelp: 'Popuni obavezna polja označena zvjezdicom. Ne mora biti savršeno — treba biti dovoljno konkretno.',
      missingCount: 'obavezna polja nedostaju',
      modelLabels: { B2C: 'B2C (Kupci)', B2B: 'B2B (Tvrtke)', B2B2C: 'B2B2C (Oboje)' },
    },
    en: {
      basicsTitle: 'Basics for validation',
      basicsSubtitle: "These fields are enough for the first test. If you're not sure, write your best current assumption.",
      businessModel: 'Business model',
      productName: 'Product name',
      pitch: 'Elevator pitch — one sentence',
      detailed: 'Detailed description — what it solves and how',
      detailedHelp: '3-5 sentences are enough: problem, who it is for, how it works, and why someone would trust it.',
      price: 'Price and billing model',
      priceHelp: 'If you do not know the exact price, write an assumption or range. AI can still test the reaction.',
      advancedShow: 'Add advanced information (optional)',
      advancedHide: 'Hide advanced fields',
      example: 'Fill example',
      exampleHint: 'No text ready? Start from an example and edit it.',
      targetMarket: 'Target market / region',
      competitors: 'Competition (if any)',
      submit: 'Analyze idea',
      footer: 'Free · 50 simulated buyers · ~30 seconds',
      readyTitle: 'Ready for simulation',
      missingTitle: 'Almost there',
      readyHelp: 'You have enough information for the first test. Extra fields below are optional.',
      missingHelp: 'Fill the required fields marked with an asterisk. It does not need to be perfect, just concrete enough.',
      missingCount: 'required fields missing',
      modelLabels: { B2C: 'B2C (Consumers)', B2B: 'B2B (Businesses)', B2B2C: 'B2B2C (Both)' },
    },
  }[language];

  const requiredValues = form.business_model === 'B2B2C'
    ? [
        form.product_name,
        form.elevator_pitch,
        form.b2b2c_consumer_description,
        form.b2b2c_business_description,
        form.price_model,
      ]
    : [form.product_name, form.elevator_pitch, form.detailed_description, form.price_model];
  const filledRequiredCount = requiredValues.filter((value) => value?.trim().length).length;
  const missingRequiredCount = requiredValues.length - filledRequiredCount;
  const isReadyForValidation = missingRequiredCount === 0;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-4">
      <section className="rounded-2xl border border-cyan-900/50 bg-gradient-to-br from-cyan-950/30 via-zinc-950 to-zinc-950 p-4 shadow-[0_0_40px_rgba(8,145,178,0.08)]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              {language === 'en' ? 'AI first step' : 'AI prvi korak'}
            </p>
            <h2 className="mt-1 text-lg font-bold text-zinc-100">
              {language === 'en' ? 'Describe what you do, then the form adapts.' : 'Napiši čime se baviš, pa se forma prilagodi.'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {language === 'en'
                ? 'A fintech startup, SaaS, local shop, service business, and marketplace should not answer the same questions.'
                : 'Fintech startup, SaaS, lokalna trgovina, uslužna firma i marketplace ne trebaju ista pitanja.'}
            </p>
          </div>
          {inferredCategory && (
            <span className="shrink-0 rounded-full border border-cyan-700/60 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-100">
              {inferredCategory}
            </span>
          )}
        </div>

        <textarea
          value={initialBrief}
          onChange={(event) => setInitialBrief(event.target.value)}
          rows={3}
          placeholder={
            language === 'en'
              ? 'Example: We install energy-efficient windows for homeowners in Zagreb, including measurement, delivery, and warranty.'
              : 'npr. Postavljamo energetski učinkovite prozore za vlasnike kuća u Zagrebu, uključujući izmjeru, dostavu i garanciju.'
          }
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none resize-none"
        />

        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-200">
                {language === 'en' ? 'Project document (optional)' : 'Dokument projekta (opcionalno)'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                {language === 'en'
                  ? 'Attach a pitch, business description, notes, PDF, DOC/DOCX, TXT or MD. Text files are read cleanly; PDFs/DOCs are best-effort for now.'
                  : 'Dodaj pitch, opis poslovanja, biljeske, PDF, DOC/DOCX, TXT ili MD. Tekst datoteke se citaju cisto; PDF/DOC je zasad best-effort.'}
              </p>
            </div>
            <label className="shrink-0 cursor-pointer rounded-xl border border-cyan-800/70 bg-cyan-950/25 px-4 py-2 text-xs font-bold text-cyan-100 transition-colors hover:border-cyan-400 hover:text-white">
              {language === 'en' ? 'Attach file' : 'Dodaj file'}
              <input
                type="file"
                accept=".txt,.md,.markdown,.pdf,.doc,.docx,.csv,.json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                className="hidden"
                onChange={handleDocumentUpload}
              />
            </label>
          </div>
          {documentName && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg border border-cyan-900/40 bg-cyan-950/15 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="truncate text-xs font-semibold text-cyan-100">
                {language === 'en' ? 'Attached:' : 'Dodano:'} {documentName}
              </p>
              <button
                type="button"
                onClick={clearDocumentUpload}
                className="text-left text-xs font-bold text-zinc-400 hover:text-red-300 sm:text-right"
              >
                {language === 'en' ? 'Remove' : 'Ukloni'}
              </button>
            </div>
          )}
          {documentError && <p className="mt-2 text-xs text-red-300">{documentError}</p>}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={prepareFromBrief}
            disabled={isPreparingBrief}
            className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreparingBrief
              ? language === 'en' ? 'Preparing form...' : 'Pripremam formu...'
              : language === 'en' ? 'Prepare smart form' : 'Pripremi pametnu formu'}
          </button>
          <button
            type="button"
            onClick={fillExample}
            disabled={isPreparingBrief}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-bold text-zinc-200 transition-colors hover:border-cyan-700 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ui.example}
          </button>
          <p className="text-xs text-zinc-500">
            {language === 'en'
              ? 'You can still manually change B2B/B2C, price, market, and every answer.'
              : 'I dalje možeš ručno promijeniti B2B/B2C, cijenu, tržište i svaki odgovor.'}
          </p>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">{ui.exampleHint}</p>

        {briefError && <p className="mt-2 text-sm text-red-300">{briefError}</p>}
        {aiGuidance && (
          <div className="mt-3 rounded-xl border border-cyan-900/50 bg-cyan-950/15 p-3 text-sm leading-relaxed text-cyan-50">
            {aiGuidance}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">{ui.basicsTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{ui.basicsSubtitle}</p>
          </div>
          <div className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${
            isReadyForValidation
              ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
              : 'border-amber-700/60 bg-amber-950/30 text-amber-200'
          }`}>
            {filledRequiredCount}/{requiredValues.length}
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Model poslovanja */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            {ui.businessModel} <span className="text-indigo-400">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            {(['B2C', 'B2B', 'B2B2C'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, business_model: mode }))}
                className={`py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  form.business_model === mode
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {ui.modelLabels[mode]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            {ui.productName} <span className="text-indigo-400">*</span>
          </label>
          <input
            value={form.product_name}
            onChange={set('product_name')}
            placeholder="npr. TaskFlow, BudgetBuddy, QuickDocs..."
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            {ui.pitch} <span className="text-indigo-400">*</span>
          </label>
          <input
            value={form.elevator_pitch}
            onChange={set('elevator_pitch')}
            placeholder={placeholders.elevator_pitch}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            required
          />
        </div>

        {form.business_model === 'B2B2C' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                {language === 'en' ? 'Description for end consumers (B2C)' : 'Opis za krajnje korisnike (B2C)'} <span className="text-indigo-400">*</span>
              </label>
              <textarea
                value={form.b2b2c_consumer_description || ''}
                onChange={set('b2b2c_consumer_description')}
                rows={3}
                placeholder={language === 'en' ? 'Describe the consumer-facing app, features, convenience, and personal value...' : 'Opiši aplikaciju, značajke, jednostavnost i vrijednost za krajnjeg korisnika...'}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                {language === 'en' ? 'Description for business partners (B2B)' : 'Opis za poslovne partnere (B2B)'} <span className="text-indigo-400">*</span>
              </label>
              <textarea
                value={form.b2b2c_business_description || ''}
                onChange={set('b2b2c_business_description')}
                rows={3}
                placeholder={language === 'en' ? 'Describe the value proposition for partners, monetization, commissions, or ROI...' : 'Opiši vrijednost za poslovne partnere, zaradu, provizije ili ROI...'}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                required
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {ui.detailed} <span className="text-indigo-400">*</span>
            </label>
            <textarea
              value={form.detailed_description}
              onChange={set('detailed_description')}
              rows={4}
              placeholder={placeholders.detailed_description}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              required
            />
            <p className="mt-1 text-xs text-zinc-500">{ui.detailedHelp}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            {ui.price} <span className="text-indigo-400">*</span>
          </label>
          <input
            value={form.price_model}
            onChange={set('price_model')}
            placeholder={placeholders.price_model}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            required
          />
          <p className="mt-1 text-xs text-zinc-500">{ui.priceHelp}</p>
        </div>
      </div>

      {adaptiveQuestions.length > 0 && (
        <section className="rounded-2xl border border-cyan-900/40 bg-cyan-950/10 overflow-hidden">
          <div className="border-b border-cyan-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-cyan-200">
                  {language === 'en' ? 'Adaptive questions for this business' : 'Prilagođena pitanja za ovaj biznis'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {language === 'en'
                    ? 'These came from the first sentence, so a local service, fintech, marketplace, or store gets different context.'
                    : 'Ova pitanja dolaze iz prve rečenice, pa lokalna usluga, fintech, marketplace ili trgovina dobivaju drugačiji kontekst.'}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-700/60 px-3 py-1 text-xs font-semibold text-cyan-200">
                {completedAdaptiveCount}/{adaptiveQuestions.length}
              </span>
            </div>
          </div>
          <div className="grid gap-3 p-4">
            {adaptiveQuestions.map((item, index) => (
              <div key={`${item.id}-${item.question}`} className="rounded-xl border border-zinc-800 bg-zinc-950/45 p-3">
                <label className="block text-sm font-semibold text-zinc-100 mb-1">
                  <span className="text-cyan-400">{index + 1}.</span> {item.question}
                </label>
                <textarea
                  value={adaptiveByQuestion.get(item.question) ?? ''}
                  onChange={(event) => setAdaptiveAnswer(item.question, item.category, event.target.value)}
                  rows={2}
                  placeholder={item.placeholder}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-indigo-900/40 bg-indigo-950/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowOfficeHours((v) => !v)}
          className="w-full flex items-start justify-between gap-4 p-4 text-left cursor-pointer hover:bg-indigo-950/20 transition-colors"
        >
          <span>
            <span className="block text-sm font-bold text-indigo-200">{officeHours.title}</span>
            <span className="block text-xs text-zinc-500 leading-relaxed mt-1">{officeHours.subtitle}</span>
          </span>
          <span className="shrink-0 rounded-full border border-indigo-700/60 px-3 py-1 text-xs font-semibold text-indigo-200">
            {showOfficeHours ? officeHours.hide : officeHours.show}
            {completedDiscoveryCount > 0 ? ` · ${completedDiscoveryCount}/6` : ''}
          </span>
        </button>

        {showOfficeHours && (
          <div className="grid gap-3 border-t border-indigo-900/40 p-4">
            {officeHours.questions.map((item, index) => (
              <div key={item.question} className="rounded-xl border border-zinc-800 bg-zinc-950/45 p-3">
                <label className="block text-sm font-semibold text-zinc-100 mb-1">
                  <span className="text-indigo-400">{index + 1}.</span> {item.question}
                </label>
                <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">{item.help}</p>
                <textarea
                  value={discoveryByQuestion.get(item.question) ?? ''}
                  onChange={(event) => setDiscoveryAnswer(item.question, item.category, event.target.value)}
                  rows={2}
                  placeholder={officeHours.placeholder}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-sm text-zinc-400 hover:text-indigo-400 transition-colors flex items-center gap-1"
      >
        <span className="text-lg leading-none">{showAdvanced ? '−' : '+'}</span>
        {showAdvanced ? ui.advancedHide : ui.advancedShow}
      </button>

      {showAdvanced && (
        <div className="grid gap-4 border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {ui.targetMarket}
            </label>
            <input
              value={form.target_market}
              onChange={set('target_market')}
              placeholder="npr. freelanceri u EU, mala poduzeća u DACH regiji..."
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <AreaMapPicker
            language={language}
            value={form.geo_area}
            values={form.geo_areas}
            onChange={(geo_area, geo_areas) => {
              setForm((prev) => ({
                ...prev,
                geo_area,
                geo_areas,
                target_market: geo_areas?.map((area) => area.label).join(' + ') || geo_area?.label || prev.target_market,
              }));
            }}
          />
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {placeholders.assumed_customer_label}
            </label>
            <input
              value={form.assumed_customer}
              onChange={set('assumed_customer')}
              placeholder={placeholders.assumed_customer}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {ui.competitors}
            </label>
            <input
              value={form.competitors}
              onChange={set('competitors')}
              placeholder="npr. Notion, Trello, ručne Excel tablice..."
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {placeholders.website_url_label}
            </label>
            <input
              value={form.website_url}
              onChange={set('website_url')}
              placeholder={placeholders.website_url_placeholder}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      )}

      <div className={`rounded-2xl border p-4 ${
        isReadyForValidation
          ? 'border-emerald-800/50 bg-emerald-950/20'
          : 'border-amber-800/50 bg-amber-950/15'
      }`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={`text-sm font-bold ${isReadyForValidation ? 'text-emerald-200' : 'text-amber-200'}`}>
              {isReadyForValidation ? ui.readyTitle : ui.missingTitle}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {isReadyForValidation ? ui.readyHelp : ui.missingHelp}
            </p>
          </div>
          {!isReadyForValidation && (
            <span className="shrink-0 rounded-full border border-amber-700/60 px-3 py-1 text-xs font-bold text-amber-200">
              {missingRequiredCount} {ui.missingCount}
            </span>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={!isReadyForValidation}
        className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold text-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
      >
        <span>{isReadyForValidation ? ui.submit : `${ui.missingTitle} (${missingRequiredCount})`}</span>
        {isReadyForValidation && <span className="text-xl">→</span>}
      </button>

      <p className="text-center text-xs text-zinc-500">
        {ui.footer}
      </p>
    </form>
  );
}
