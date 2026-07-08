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

const REGION_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(dalmacij[aeiu]|dalmatia|split|splita|zadar|zadra|sibenik|šibenik|dubrovnik|dubrovnika|makarska|makarske|trogir|trogira)\b/i, label: 'Dalmacija, Hrvatska' },
  { pattern: /\b(istra|istre|istria|pula|pule|rovinj|porec|poreč|umag)\b/i, label: 'Istra, Hrvatska' },
  { pattern: /\b(kvarner|rijeka|rijeci|rijeke|opatija|krk|cres|losinj|lošinj)\b/i, label: 'Kvarner, Hrvatska' },
  { pattern: /\b(slavonij[aeiu]|osijek|osijeka|vukovar|vinkovci|brod|požega|pozega)\b/i, label: 'Slavonija, Hrvatska' },
  { pattern: /\b(zagreb|zagreba|zagrebu|zagreback|zagrebačk)\b/i, label: 'Zagreb i okolica, Hrvatska' },
  { pattern: /\b(hrvatsk[aeiuoj]?|croatia|hr)\b/i, label: 'Hrvatska' },
];

function inferRegionHint(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return REGION_HINTS.find((hint) => hint.pattern.test(normalized))?.label ?? '';
}

function normalizeFormGeoContext(form: IdeaFormData): IdeaFormData {
  const answerText = [
    form.initial_brief,
    form.elevator_pitch,
    form.detailed_description,
    form.b2b2c_consumer_description,
    form.b2b2c_business_description,
    form.target_market,
    form.assumed_customer,
    ...(form.discovery_answers ?? []).map((item) => item.answer),
    ...(form.adaptive_answers ?? []).map((item) => item.answer),
  ].filter(Boolean).join('\n');
  const inferredRegion = inferRegionHint(answerText);
  if (!inferredRegion) return form;

  const existingTarget = (form.target_market || '').trim();
  const targetAlreadyMatches = existingTarget.toLowerCase().includes(inferredRegion.split(',')[0].toLowerCase());
  const targetLooksGeneric = !existingTarget || /\b(global|globalno|eu|europe|europa|croatia|hrvatska|local|lokaln)\b/i.test(existingTarget);
  if (targetAlreadyMatches) return form;

  return {
    ...form,
    target_market: targetLooksGeneric ? inferredRegion : `${existingTarget}; ${inferredRegion}`,
  };
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

    const preparedForm = normalizeFormGeoContext({
      ...form,
      initial_brief: form.initial_brief || initialBrief.trim(),
      inferred_category: form.inferred_category || inferredCategory,
      discovery_answers,
      adaptive_answers,
      language,
    });

    // Naslovnica preuzima: prijedlog ciljanih publika → odabir → simulacija
    onIdeaReady(preparedForm);
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
      show: 'Otvori',
      hide: 'Zatvori',
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
      show: 'Open',
      hide: 'Close',
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
      advancedShow: 'Dodatni detalji — tržište, konkurencija, dokument (opcionalno)',
      advancedHide: 'Sakrij dodatne detalje',
      example: 'Popuni primjer',
      targetMarket: 'Ciljano tržište / regija',
      competitors: 'Konkurencija (ako postoji)',
      submit: 'Pošalji ideju na ispitivanje',
      footer: '100 simuliranih kupaca · ~30 sekundi · brojke iz koda',
      unlockManual: 'Kreni',
      uploadShow: 'Dodaj dokument',
      uploadHide: 'Sakrij dokument',
      readyTitle: 'Spremno za ispitivanje',
      missingTitle: 'Još samo malo',
      readyHelp: 'Imas dovoljno za prvi test.',
      missingHelp: 'Popuni obavezna polja. Ne mora biti savrseno, samo dovoljno jasno.',
      missingCount: 'obavezna polja nedostaju',
      modelLabels: { B2C: 'B2C · Kupci', B2B: 'B2B · Tvrtke', B2B2C: 'B2B2C · Oboje' },
      adaptiveTitle: 'Pitanja za ovaj biznis',
      adaptiveSubtitle: 'Generirano iz tvoje prve rečenice. Svaki odgovor izoštrava simulaciju.',
      step1: 'Korak 1 — ideja u jednoj rečenici',
      step1Help: 'AI iz nje složi brief i otvori ostatak protokola.',
      example2: 'Primjer',
      aiFill: 'AI ispuni',
      restNote: 'Ostatak se otvara nakon ovog koraka.',
      briefPlaceholder: 'Opiši ideju u jednoj rečenici...',
      preparing: 'Pripremam...',
      docTitle: 'Dodatni dokument',
      docSub: 'Pitch, biljeske, PDF, DOC/DOCX, TXT ili MD — opcionalni kontekst.',
      docAttach: 'Dodaj dokument',
      docAttached: 'Dodano:',
      docRemove: 'Ukloni',
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
      advancedShow: 'Extra detail — market, competition, document (optional)',
      advancedHide: 'Hide extra detail',
      example: 'Fill example',
      targetMarket: 'Target market / region',
      competitors: 'Competition (if any)',
      submit: 'Send the idea for examination',
      footer: '100 simulated buyers · ~30 seconds · numbers from code',
      unlockManual: 'Start',
      uploadShow: 'Add document',
      uploadHide: 'Hide document',
      readyTitle: 'Ready for examination',
      missingTitle: 'Almost there',
      readyHelp: 'You have enough for the first test.',
      missingHelp: 'Fill the required fields. It does not need to be perfect, just clear enough.',
      missingCount: 'required fields missing',
      modelLabels: { B2C: 'B2C · Consumers', B2B: 'B2B · Businesses', B2B2C: 'B2B2C · Both' },
      adaptiveTitle: 'Questions for this business',
      adaptiveSubtitle: 'Generated from your first sentence. Every answer sharpens the simulation.',
      step1: 'Step 1 — the idea in one sentence',
      step1Help: 'The AI builds a brief from it and opens the rest of the protocol.',
      example2: 'Example',
      aiFill: 'AI fill',
      restNote: 'The rest opens after this step.',
      briefPlaceholder: 'Describe your idea in one sentence...',
      preparing: 'Preparing...',
      docTitle: 'Supporting document',
      docSub: 'Pitch, notes, PDF, DOC/DOCX, TXT or MD — optional context.',
      docAttach: 'Attach file',
      docAttached: 'Attached:',
      docRemove: 'Remove',
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

  const labelClass = 'kicker !text-[var(--ink-soft)] mb-1.5 block';
  const requiredMark = <span className="text-[var(--verdict-red)]"> *</span>;

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      {/* ── Korak 1: jedna rečenica ── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-2">
          <div>
            <p className="kicker !text-[var(--verdict-red)]">{ui.step1}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{ui.step1Help}</p>
          </div>
          <button
            type="button"
            onClick={fillExample}
            disabled={isPreparingBrief}
            className="link-ink font-data text-xs uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ui.example2} ↓
          </button>
        </div>

        <div className="mt-4">
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
            placeholder={briefGhostText || ui.briefPlaceholder}
            className="paper-field min-h-[110px] resize-none text-base"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={prepareFromBrief} disabled={isPreparingBrief} className="btn-ink text-sm">
              {isPreparingBrief ? ui.preparing : `${ui.unlockManual} →`}
            </button>
            <span className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
              {ui.restNote}
            </span>
          </div>
        </div>

        {briefError && <p className="mt-2 text-sm font-semibold text-[var(--verdict-red)]">{briefError}</p>}
      </section>

      {formUnlocked && (
        <>
          {/* AI vodstvo + kategorija — traka odmah ispod briefa */}
          {(aiGuidance || inferredCategory) && (
            <div className="border-l-2 border-[var(--annotate)] py-1 pl-3">
              {inferredCategory && (
                <span className="font-data text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--annotate)]">
                  {inferredCategory}
                </span>
              )}
              {aiGuidance && <p className="mt-1 text-sm italic leading-relaxed text-[var(--ink-soft)]">{aiGuidance}</p>}
            </div>
          )}

          {/* ── Korak 2: osnovna polja — jedna fokusirana kolona ── */}
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-2">
              <div>
                <p className="kicker">{ui.basicsTitle}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{ui.basicsSubtitle}</p>
              </div>
              <span
                className={`font-data text-xs font-semibold ${
                  isReadyForValidation ? 'text-[var(--verdict-green)]' : 'text-[var(--verdict-red)]'
                }`}
              >
                {filledRequiredCount}/{requiredValues.length}
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/* Model poslovanja */}
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {ui.businessModel}
                  {requiredMark}
                </label>
                <div className="grid grid-cols-3 border border-[var(--hairline-strong)] rounded-[3px] overflow-hidden">
                  {(['B2C', 'B2B', 'B2B2C'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, business_model: mode }))}
                      className={`font-data cursor-pointer border-r border-[var(--hairline-strong)] px-2 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors last:border-r-0 ${
                        form.business_model === mode
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--paper-raised)] text-[var(--ink-soft)] hover:bg-[var(--paper-dim)]'
                      }`}
                    >
                      {ui.modelLabels[mode]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  {ui.productName}
                  {requiredMark}
                </label>
                <input
                  value={form.product_name}
                  onChange={set('product_name')}
                  onFocus={() => clearExampleHint('product_name')}
                  placeholder={exampleFieldHints.product_name || 'npr. TaskFlow, BudgetBuddy, QuickDocs...'}
                  className="paper-field"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>
                  {ui.pitch}
                  {requiredMark}
                </label>
                <input
                  value={form.elevator_pitch}
                  onChange={set('elevator_pitch')}
                  onFocus={() => clearExampleHint('elevator_pitch')}
                  placeholder={exampleFieldHints.elevator_pitch || placeholders.elevator_pitch}
                  className="paper-field"
                  required
                />
              </div>

              {form.business_model === 'B2B2C' ? (
                <>
                  <div>
                    <label className={labelClass}>
                      {language === 'en' ? 'Description for end consumers (B2C)' : 'Opis za krajnje korisnike (B2C)'}
                      {requiredMark}
                    </label>
                    <textarea
                      value={form.b2b2c_consumer_description || ''}
                      onChange={set('b2b2c_consumer_description')}
                      rows={3}
                      placeholder={language === 'en' ? 'Describe the consumer-facing app, features, convenience, and personal value...' : 'Opiši aplikaciju, značajke, jednostavnost i vrijednost za krajnjeg korisnika...'}
                      className="paper-field resize-none"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {language === 'en' ? 'Description for business partners (B2B)' : 'Opis za poslovne partnere (B2B)'}
                      {requiredMark}
                    </label>
                    <textarea
                      value={form.b2b2c_business_description || ''}
                      onChange={set('b2b2c_business_description')}
                      rows={3}
                      placeholder={language === 'en' ? 'Describe the value proposition for partners, monetization, commissions, or ROI...' : 'Opiši vrijednost za poslovne partnere, zaradu, provizije ili ROI...'}
                      className="paper-field resize-none"
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    {ui.detailed}
                    {requiredMark}
                  </label>
                  <textarea
                    value={form.detailed_description}
                    onChange={set('detailed_description')}
                    onFocus={() => clearExampleHint('detailed_description')}
                    rows={4}
                    placeholder={exampleFieldHints.detailed_description || placeholders.detailed_description}
                    className="paper-field resize-none"
                    required
                  />
                  <p className="mt-1 text-xs text-[var(--ink-faint)]">{ui.detailedHelp}</p>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {ui.price}
                  {requiredMark}
                </label>
                <input
                  value={form.price_model}
                  onChange={set('price_model')}
                  onFocus={() => clearExampleHint('price_model')}
                  placeholder={exampleFieldHints.price_model || placeholders.price_model}
                  className="paper-field"
                  required
                />
                <p className="mt-1 text-xs text-[var(--ink-faint)]">{ui.priceHelp}</p>
              </div>
            </div>
          </section>

          {/* ── Prilagođena pitanja — centralno, ne sa strane ── */}
          {adaptiveQuestions.length > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-2">
                <div>
                  <p className="kicker !text-[var(--annotate)]">{ui.adaptiveTitle}</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{ui.adaptiveSubtitle}</p>
                </div>
                <span className="font-data text-xs font-semibold text-[var(--annotate)]">
                  {completedAdaptiveCount}/{adaptiveQuestions.length}
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {adaptiveQuestions.map((item, index) => (
                  <div key={`${item.id}-${item.question}`}>
                    <label className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
                      <span className="font-data text-[var(--annotate)]">{index + 1}.</span> {item.question}
                    </label>
                    <textarea
                      value={adaptiveByQuestion.get(item.question) ?? ''}
                      onChange={(event) => setAdaptiveAnswer(item.question, item.category, event.target.value)}
                      rows={2}
                      placeholder={item.placeholder}
                      className="paper-field resize-none text-sm"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Office Hours (collapsible) ── */}
          <section className="border-t border-[var(--hairline)] pt-4">
            <button
              type="button"
              onClick={() => setShowOfficeHours((v) => !v)}
              className="flex w-full cursor-pointer items-baseline justify-between gap-3 text-left"
            >
              <span>
                <span className="kicker">{officeHours.title}</span>
                <span className="mt-1 block text-sm text-[var(--ink-soft)]">{officeHours.subtitle}</span>
              </span>
              <span className="link-ink font-data shrink-0 text-xs uppercase tracking-wider">
                {showOfficeHours ? officeHours.hide : officeHours.show}
                {completedDiscoveryCount > 0 ? ` · ${completedDiscoveryCount}/6` : ''} {showOfficeHours ? '−' : '+'}
              </span>
            </button>

            {showOfficeHours && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {officeHours.questions.map((item, index) => (
                  <div key={item.question}>
                    <label className="mb-1 block text-sm font-semibold text-[var(--ink)]">
                      <span className="font-data text-[var(--verdict-red)]">{index + 1}.</span> {item.question}
                    </label>
                    <p className="mb-1.5 text-[11px] leading-relaxed text-[var(--ink-faint)]">{item.help}</p>
                    <textarea
                      value={discoveryByQuestion.get(item.question) ?? ''}
                      onChange={(event) => setDiscoveryAnswer(item.question, item.category, event.target.value)}
                      rows={2}
                      placeholder={officeHours.placeholder}
                      className="paper-field resize-none text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Dodatni detalji (collapsible): tržište, konkurencija, mapa, dokument ── */}
          <section className="border-t border-[var(--hairline)] pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full cursor-pointer items-baseline justify-between gap-3 text-left"
            >
              <span className="kicker">{showAdvanced ? ui.advancedHide : ui.advancedShow}</span>
              <span className="link-ink font-data shrink-0 text-xs">{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>{ui.targetMarket}</label>
                  <input
                    value={form.target_market}
                    onChange={set('target_market')}
                    onFocus={() => clearExampleHint('target_market')}
                    placeholder={exampleFieldHints.target_market || 'npr. freelanceri u EU, mala poduzeća u DACH regiji...'}
                    className="paper-field"
                  />
                </div>
                <div>
                  <label className={labelClass}>{placeholders.assumed_customer_label}</label>
                  <input
                    value={form.assumed_customer}
                    onChange={set('assumed_customer')}
                    onFocus={() => clearExampleHint('assumed_customer')}
                    placeholder={exampleFieldHints.assumed_customer || placeholders.assumed_customer}
                    className="paper-field"
                  />
                </div>
                <div>
                  <label className={labelClass}>{ui.competitors}</label>
                  <input
                    value={form.competitors}
                    onChange={set('competitors')}
                    onFocus={() => clearExampleHint('competitors')}
                    placeholder={exampleFieldHints.competitors || 'npr. Notion, Trello, ručne Excel tablice...'}
                    className="paper-field"
                  />
                </div>
                <div>
                  <label className={labelClass}>{placeholders.website_url_label}</label>
                  <input
                    value={form.website_url}
                    onChange={set('website_url')}
                    placeholder={placeholders.website_url_placeholder}
                    className="paper-field"
                  />
                </div>
                <div className="sm:col-span-2">
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
                </div>

                {/* Dokument */}
                <div className="sm:col-span-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="kicker !text-[var(--ink-soft)]">{ui.docTitle}</p>
                      <p className="mt-1 text-xs text-[var(--ink-faint)]">{ui.docSub}</p>
                    </div>
                    <label className="btn-line cursor-pointer !py-2 !px-4 text-xs">
                      <FileText className="h-3.5 w-3.5" />
                      {ui.docAttach}
                      <input
                        type="file"
                        accept=".txt,.md,.markdown,.pdf,.doc,.docx,.csv,.json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                        className="hidden"
                        onChange={handleDocumentUpload}
                      />
                    </label>
                  </div>
                  {documentName && (
                    <div className="mt-2 flex items-baseline gap-3 border-l-2 border-[var(--verdict-green)] pl-3">
                      <p className="font-data truncate text-xs font-semibold text-[var(--ink)]">
                        {ui.docAttached} {documentName}
                      </p>
                      <button type="button" onClick={clearDocumentUpload} className="link-ink shrink-0 text-xs">
                        {ui.docRemove}
                      </button>
                    </div>
                  )}
                  {documentError && <p className="mt-2 text-xs font-semibold text-[var(--verdict-red)]">{documentError}</p>}
                </div>
              </div>
            )}
          </section>

          {/* ── Submit traka: status + akcija, uvijek na dnu protokola ── */}
          <section className="border-t-2 border-[var(--ink)] pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p
                  className={`font-data text-xs font-semibold uppercase tracking-[0.15em] ${
                    isReadyForValidation ? 'text-[var(--verdict-green)]' : 'text-[var(--verdict-red)]'
                  }`}
                >
                  {isReadyForValidation ? `✓ ${ui.readyTitle}` : `${ui.missingTitle} — ${missingRequiredCount} ${ui.missingCount}`}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  {isReadyForValidation ? ui.readyHelp : ui.missingHelp}
                </p>
              </div>
              <button type="submit" disabled={!isReadyForValidation} className="btn-ink shrink-0 text-base">
                {ui.submit} →
              </button>
            </div>
            <p className="font-data mt-3 text-[11px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">{ui.footer}</p>
          </section>
        </>
      )}
    </form>
  );
}
