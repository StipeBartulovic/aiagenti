'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
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
  const [formUnlocked, setFormUnlocked] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOfficeHours, setShowOfficeHours] = useState(false);
  const [initialBrief, setInitialBrief] = useState('');
  const [briefGhostText, setBriefGhostText] = useState('');
  const [exampleFieldHints, setExampleFieldHints] = useState<Partial<Record<keyof IdeaFormData, string>>>({});
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
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

  const clearExampleHint = (field: keyof IdeaFormData) => {
    setExampleFieldHints((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const set = (field: keyof IdeaFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    clearExampleHint(field);
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

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
      ? 'We are building a SaaS tool for solo founders that turns customer interviews, waitlist signups, and landing page feedback into one simple validation dashboard before they build an MVP.'
      : 'Gradimo SaaS alat za solo foundere koji spaja customer intervjue, waitlist prijave i feedback s landing pagea u jedan jednostavan validation dashboard prije gradnje MVP-a.';
    setInitialBrief('');
    setBriefGhostText(exampleBrief);
    setInferredCategory(language === 'en' ? 'Founder SaaS' : 'Founder SaaS');
    setAiGuidance(language === 'en'
      ? 'Example hints are loaded. Click any field and start typing your real version.'
      : 'Primjer je ucitan kao hint. Klikni bilo koje polje i odmah upisi svoju stvarnu verziju.');
    setAdaptiveQuestions([]);
    setShowAdvanced(false);
    setFormUnlocked(true);
    setExampleFieldHints({
      product_name: 'SignalBoard',
      elevator_pitch: language === 'en'
        ? 'A SaaS workspace for solo founders that shows which customer signals are real before they spend weeks building an MVP.'
        : 'SaaS workspace za solo foundere koji pokazuje koji su customer signali stvarni prije nego potrose tjedne na gradnju MVP-a.',
      detailed_description: language === 'en'
        ? 'The founder uploads interview notes, waitlist replies, and landing page feedback. The product clusters objections, highlights buying signals, tracks confidence by segment, and suggests the next 7-day validation experiment. Buyers care most about clarity, speed, and whether it saves them from building the wrong thing.'
        : 'Founder ubacuje interview biljeske, waitlist odgovore i feedback s landing pagea. Proizvod grupira prigovore, istice kupovne signale, prati confidence po segmentu i predlaze sljedeci 7-dnevni validation eksperiment. Kupcima su najvazniji jasnoca, brzina i to da ne grade pogresnu stvar.',
      price_model: language === 'en'
        ? 'Free for one idea, then 29 EUR per month or 79 EUR for a guided validation sprint.'
        : 'Besplatno za jednu ideju, zatim 29 EUR mjesecno ili 79 EUR za vodeni validation sprint.',
      target_market: language === 'en' ? 'English-speaking solo founders building SaaS before MVP' : 'Solo founderi koji grade SaaS prije MVP-a',
      assumed_customer: language === 'en'
        ? 'Solo founders and indie hackers who already have a rough idea, a few conversations, and need to decide what to test next.'
        : 'Solo founderi i indie hakkeri koji vec imaju sirovu ideju, nekoliko razgovora i trebaju odluciti sto dalje testirati.',
      competitors: language === 'en'
        ? 'Idea validation tools, founder communities, spreadsheets, Notion docs, ChatGPT, and manual interview notes.'
        : 'Alati za validaciju ideje, founder communityji, spreadsheeti, Notion dokumenti, ChatGPT i rucne interview biljeske.',
    });
    setForm((prev) => ({
      ...prev,
      business_model: 'B2C',
      product_name: '',
      elevator_pitch: '',
      detailed_description: '',
      price_model: '',
      target_market: '',
      assumed_customer: '',
      competitors: '',
      initial_brief: exampleBrief,
      inferred_category: language === 'en' ? 'Founder SaaS' : 'Founder SaaS',
      adaptive_answers: [],
    }));
  };

  const prepareFromBrief = async () => {
    const brief = initialBrief.trim();
    if (brief.length < 8) {
      setBriefError(language === 'en' ? 'Write one clear sentence first.' : 'Prvo napiši jednu jasnu rečenicu.');
      return;
    }

    const isNewBrief = (form.initial_brief || '').trim() !== brief;

    setIsPreparingBrief(true);
    setBriefError('');
    setBriefGhostText('');
    setFormUnlocked(true);
    setExampleFieldHints({});
    setAiGuidance('');
    setAdaptiveQuestions([]);
    setShowAdvanced(false);
    if (isNewBrief) {
      setInferredCategory('');
    }

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
        business_model: result.business_model || (isNewBrief ? 'B2C' : prev.business_model),
        product_name: isNewBrief ? (result.product_name || '') : (prev.product_name || result.product_name || ''),
        elevator_pitch: isNewBrief ? (result.elevator_pitch || brief) : (result.elevator_pitch || prev.elevator_pitch || brief),
        detailed_description: isNewBrief ? (result.detailed_description || '') : (prev.detailed_description || result.detailed_description || ''),
        b2b2c_consumer_description: isNewBrief ? (result.b2b2c_consumer_description || '') : (prev.b2b2c_consumer_description || result.b2b2c_consumer_description || ''),
        b2b2c_business_description: isNewBrief ? (result.b2b2c_business_description || '') : (prev.b2b2c_business_description || result.b2b2c_business_description || ''),
        price_model: isNewBrief ? (result.price_model || '') : (prev.price_model || result.price_model || ''),
        target_market: isNewBrief ? (result.target_market || '') : (prev.target_market || result.target_market || ''),
        assumed_customer: isNewBrief ? (result.assumed_customer || '') : (prev.assumed_customer || result.assumed_customer || ''),
        competitors: isNewBrief ? (result.competitors || '') : (prev.competitors || result.competitors || ''),
        initial_brief: brief,
        inferred_category: result.category_label,
        adaptive_answers: isNewBrief ? [] : prev.adaptive_answers,
        discovery_answers: isNewBrief ? [] : prev.discovery_answers,
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
      subtitle: 'Opcionalno. Par pitanja koja izostre ideju prije testa.',
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
      subtitle: 'Optional. A few questions that sharpen the idea before the test.',
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
      basicsSubtitle: 'Dovoljno za prvi test. Ako nisi siguran, napiši najbolju trenutnu pretpostavku.',
      businessModel: 'Model poslovanja',
      productName: 'Naziv proizvoda',
      pitch: 'Elevator pitch — jedna rečenica',
      detailed: 'Detaljni opis — što rješava i kako',
      detailedHelp: '3-5 recenica je dovoljno.',
      price: 'Cijena i model naplate',
      priceHelp: 'Ako ne znas tocno, upisi pretpostavku ili raspon.',
      advancedShow: 'Dodaj jos detalja (opcionalno)',
      advancedHide: 'Sakrij napredna polja',
      example: 'Popuni primjer',
      targetMarket: 'Ciljano tržište / regija',
      competitors: 'Konkurencija (ako postoji)',
      submit: 'Analiziraj ideju',
      footer: 'Besplatno · 50 simuliranih kupaca · ~30 sekundi',
      unlockManual: 'Kreni',
      uploadShow: 'Dodaj dokument o svojoj ideji',
      uploadHide: 'Sakrij dokument',
      readyTitle: 'Spremno za simulaciju',
      missingTitle: 'Još samo malo',
      readyHelp: 'Imas dovoljno za prvi test.',
      missingHelp: 'Popuni obavezna polja. Ne mora biti savrseno, samo dovoljno jasno.',
      missingCount: 'obavezna polja nedostaju',
      modelLabels: { B2C: 'B2C (Kupci)', B2B: 'B2B (Tvrtke)', B2B2C: 'B2B2C (Oboje)' },
    },
    en: {
      basicsTitle: 'Basics for validation',
      basicsSubtitle: "Enough for the first test. If you're unsure, write your best current assumption.",
      businessModel: 'Business model',
      productName: 'Product name',
      pitch: 'Elevator pitch — one sentence',
      detailed: 'Detailed description — what it solves and how',
      detailedHelp: '3-5 sentences are enough.',
      price: 'Price and billing model',
      priceHelp: 'If you do not know the price, enter an assumption or range.',
      advancedShow: 'Add more detail (optional)',
      advancedHide: 'Hide advanced fields',
      example: 'Fill example',
      targetMarket: 'Target market / region',
      competitors: 'Competition (if any)',
      submit: 'Analyze idea',
      footer: 'Free · 50 simulated buyers · ~30 seconds',
      unlockManual: 'Start',
      uploadShow: 'Add a document about your idea',
      uploadHide: 'Hide document',
      readyTitle: 'Ready for simulation',
      missingTitle: 'Almost there',
      readyHelp: 'You have enough for the first test.',
      missingHelp: 'Fill the required fields. It does not need to be perfect, just clear enough.',
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
    <form onSubmit={handleSubmit} className="w-full max-w-none space-y-4">
      <section className="rounded-[1.6rem] border border-zinc-800/70 bg-zinc-900/35 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">AI PRVI KORAK</p>
            <p className="mt-1 text-sm font-medium text-zinc-300">
              {language === 'en' ? 'Write the idea in one sharp sentence.' : 'Napisi ideju u jednoj ostroj recenici.'}
            </p>
          </div>
          <button
            type="button"
            onClick={fillExample}
            disabled={isPreparingBrief}
            className="self-start rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {language === 'en' ? 'Use example' : 'Primjer'}
          </button>
        </div>

        <div className="relative rounded-[1.4rem] border border-indigo-900/40 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.10),_transparent_40%),rgba(9,9,11,0.86)] p-3 sm:p-4">
          <textarea
            value={initialBrief}
            onFocus={() => {
              if (briefGhostText) setBriefGhostText('');
            }}
            onChange={(event) => {
              setInitialBrief(event.target.value);
              if (briefGhostText) setBriefGhostText('');
              if (briefError) setBriefError('');
            }}
            rows={3}
            placeholder={
              briefGhostText || (
                language === 'en'
                  ? 'Describe your idea in one sentence...'
                  : 'Opiši ideju u jednoj rečenici...'
              )
            }
            className="w-full resize-none rounded-[1.2rem] border border-zinc-800/80 bg-zinc-950/90 px-4 py-4 text-base text-zinc-100 placeholder-zinc-500 shadow-inner transition-colors focus:border-indigo-500 focus:outline-none sm:min-h-[132px] sm:pr-36"
          />
          <button
            type="button"
            onClick={prepareFromBrief}
            disabled={isPreparingBrief}
            className="mt-3 w-full rounded-[1rem] bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-950/40 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 sm:absolute sm:bottom-4 sm:right-4 sm:mt-0 sm:w-auto"
          >
            {isPreparingBrief
              ? language === 'en' ? 'Preparing...' : 'Pripremam...'
              : ui.unlockManual}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={prepareFromBrief}
            disabled={isPreparingBrief}
            className="rounded-full border border-zinc-800 bg-zinc-950/50 px-3 py-1.5 font-semibold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPreparingBrief
              ? language === 'en' ? 'Preparing...' : 'Pripremam...'
              : language === 'en' ? 'AI fill' : 'AI ispuni'}
          </button>
          <span className="text-zinc-700">•</span>
          <span className="text-zinc-500">
            {language === 'en' ? 'The rest opens after this step.' : 'Ostatak se otvara nakon ovog koraka.'}
          </span>
        </div>

        {briefError && <p className="mt-2 text-sm text-red-300">{briefError}</p>}
      </section>

      {formUnlocked && (
      <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_320px] xl:items-start">
      <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/45 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Model poslovanja */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            {ui.businessModel} <span className="text-indigo-400">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 p-1 sm:grid-cols-3">
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
            onFocus={() => clearExampleHint('product_name')}
            placeholder={exampleFieldHints.product_name || 'npr. TaskFlow, BudgetBuddy, QuickDocs...'}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
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
            onFocus={() => clearExampleHint('elevator_pitch')}
            placeholder={exampleFieldHints.elevator_pitch || placeholders.elevator_pitch}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
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
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
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
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>
          </>
        ) : (
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {ui.detailed} <span className="text-indigo-400">*</span>
            </label>
            <textarea
              value={form.detailed_description}
              onChange={set('detailed_description')}
              onFocus={() => clearExampleHint('detailed_description')}
              rows={4}
              placeholder={exampleFieldHints.detailed_description || placeholders.detailed_description}
              className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
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
            onFocus={() => clearExampleHint('price_model')}
            placeholder={exampleFieldHints.price_model || placeholders.price_model}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
            required
          />
          <p className="mt-1 text-xs text-zinc-500">{ui.priceHelp}</p>
        </div>
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
                    ? 'Generated from your first sentence.'
                    : 'Generirano iz tvoje prve recenice.'}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-cyan-700/60 px-3 py-1 text-xs font-semibold text-cyan-200">
                {completedAdaptiveCount}/{adaptiveQuestions.length}
              </span>
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {adaptiveQuestions.map((item, index) => (
              <div key={`${item.id}-${item.question}`} className="rounded-xl border border-zinc-800/80 bg-zinc-950/55 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
                <label className="block text-sm font-semibold text-zinc-100 mb-1">
                  <span className="text-cyan-400">{index + 1}.</span> {item.question}
                </label>
                <textarea
                  value={adaptiveByQuestion.get(item.question) ?? ''}
                  onChange={(event) => setAdaptiveAnswer(item.question, item.category, event.target.value)}
                  rows={2}
                  placeholder={item.placeholder}
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 transition-colors focus:border-cyan-500 focus:outline-none"
              />
            </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/35 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowOfficeHours((v) => !v)}
          className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-zinc-900/60 sm:flex-row sm:items-start sm:justify-between"
        >
          <span>
            <span className="block text-sm font-bold text-zinc-200">{officeHours.title}</span>
            <span className="block text-xs text-zinc-500 leading-relaxed mt-1">{officeHours.subtitle}</span>
          </span>
          <span className="shrink-0 self-start rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300">
            {showOfficeHours ? officeHours.hide : officeHours.show}
            {completedDiscoveryCount > 0 ? ` · ${completedDiscoveryCount}/6` : ''}
          </span>
        </button>

        {showOfficeHours && (
          <div className="grid gap-3 border-t border-zinc-800 p-4 lg:grid-cols-2">
            {officeHours.questions.map((item, index) => (
              <div key={item.question} className="rounded-xl border border-zinc-800/80 bg-zinc-950/55 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
                <label className="block text-sm font-semibold text-zinc-100 mb-1">
                  <span className="text-cyan-400">{index + 1}.</span> {item.question}
                </label>
                <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">{item.help}</p>
                <textarea
                  value={discoveryByQuestion.get(item.question) ?? ''}
                  onChange={(event) => setDiscoveryAnswer(item.question, item.category, event.target.value)}
                  rows={2}
                  placeholder={officeHours.placeholder}
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 transition-colors focus:border-indigo-500 focus:outline-none"
              />
            </div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="inline-flex items-center gap-2 self-start rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
      >
        <span className="text-lg leading-none">{showAdvanced ? '−' : '+'}</span>
        {showAdvanced ? ui.advancedHide : ui.advancedShow}
      </button>

      {showAdvanced && (
        <div className="grid gap-4 border border-zinc-800 rounded-2xl p-4 bg-zinc-900/50 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {ui.targetMarket}
            </label>
            <input
              value={form.target_market}
              onChange={set('target_market')}
              onFocus={() => clearExampleHint('target_market')}
              placeholder={exampleFieldHints.target_market || 'npr. freelanceri u EU, mala poduzeća u DACH regiji...'}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
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
              onFocus={() => clearExampleHint('assumed_customer')}
              placeholder={exampleFieldHints.assumed_customer || placeholders.assumed_customer}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              {ui.competitors}
            </label>
            <input
              value={form.competitors}
              onChange={set('competitors')}
              onFocus={() => clearExampleHint('competitors')}
              placeholder={exampleFieldHints.competitors || 'npr. Notion, Trello, ručne Excel tablice...'}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
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
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/90 px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      )}
      <aside className="xl:sticky xl:top-6">
        <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/55 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            {inferredCategory && (
              <span className="self-start rounded-full border border-cyan-700/60 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-100">
                {inferredCategory}
              </span>
            )}
            {aiGuidance && (
              <div className="rounded-xl border border-cyan-900/50 bg-cyan-950/15 p-3 text-sm leading-relaxed text-cyan-50">
                {aiGuidance}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-zinc-200">
                  {language === 'en' ? 'Supporting document' : 'Dodatni dokument'}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {language === 'en' ? 'Optional extra context.' : 'Opcionalni dodatni kontekst.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDocumentUpload((value) => !value)}
                className="inline-flex items-center gap-2 text-left text-xs font-semibold text-cyan-200 transition-colors hover:text-white"
              >
                <FileText className="h-4 w-4" />
                {showDocumentUpload ? ui.uploadHide : ui.uploadShow}
              </button>
            </div>

            {showDocumentUpload && (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {language === 'en'
                    ? 'Attach a pitch, notes, PDF, DOC/DOCX, TXT or MD.'
                    : 'Dodaj pitch, biljeske, PDF, DOC/DOCX, TXT ili MD.'}
                </p>
                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-800/70 bg-cyan-950/25 px-4 py-2 text-xs font-bold text-cyan-100 transition-colors hover:border-cyan-400 hover:text-white">
                  <FileText className="h-4 w-4" />
                  {language === 'en' ? 'Attach file' : 'Dodaj dokument'}
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.pdf,.doc,.docx,.csv,.json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                    className="hidden"
                    onChange={handleDocumentUpload}
                  />
                </label>
                {documentName && (
                  <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/15 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-cyan-100">
                      {language === 'en' ? 'Attached:' : 'Dodano:'} {documentName}
                    </p>
                    <button
                      type="button"
                      onClick={clearDocumentUpload}
                      className="mt-2 text-left text-xs font-bold text-zinc-400 hover:text-red-300"
                    >
                      {language === 'en' ? 'Remove' : 'Ukloni'}
                    </button>
                  </div>
                )}
                {documentError && <p className="text-xs text-red-300">{documentError}</p>}
              </div>
            )}
          </div>

          <div className={`rounded-2xl border p-4 ${
            isReadyForValidation
              ? 'border-emerald-800/50 bg-emerald-950/20'
              : 'border-amber-800/50 bg-amber-950/15'
          }`}>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {language === 'en' ? 'Validation status' : 'Status validacije'}
                </p>
                <p className={`text-sm font-bold ${isReadyForValidation ? 'text-emerald-200' : 'text-amber-200'}`}>
                  {isReadyForValidation ? ui.readyTitle : ui.missingTitle}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {isReadyForValidation ? ui.readyHelp : ui.missingHelp}
                </p>
              </div>
              {!isReadyForValidation && (
                <span className="self-start rounded-full border border-amber-700/60 px-3 py-1 text-xs font-bold text-amber-200">
                  {missingRequiredCount} {ui.missingCount}
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!isReadyForValidation}
            className="w-full rounded-xl bg-indigo-600 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-950/40 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            <span>{isReadyForValidation ? ui.submit : `${ui.missingTitle} (${missingRequiredCount})`}</span>
          </button>

          <p className="text-center text-xs text-zinc-500">
            {ui.footer}
          </p>
        </div>
      </aside>
      </div>
      </>
      )}
    </form>
  );
}
