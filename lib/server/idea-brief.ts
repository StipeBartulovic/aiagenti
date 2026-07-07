import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import type { IdeaFormData } from '@/lib/types';
import { ServerActionError } from './errors';

export interface IdeaBriefRequest {
  brief: string;
  language: 'hr' | 'en';
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

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim().slice(0, 1200) : fallback;

function normalizeModel(value: unknown): IdeaFormData['business_model'] {
  return value === 'B2B' || value === 'B2B2C' || value === 'B2C' ? value : 'B2C';
}

function fallbackResult(brief: string, language: 'hr' | 'en'): IdeaBriefResult {
  const isBusinessService = /firma|obrt|uslug|prozora|monta|servis|salon|trgovin|restoran|lokal/i.test(brief);
  const model = isBusinessService ? 'B2C' : 'B2B';

  return {
    business_model: model,
    product_name: '',
    elevator_pitch: brief,
    detailed_description: '',
    price_model: '',
    target_market: '',
    assumed_customer: '',
    competitors: '',
    category_label: isBusinessService
      ? language === 'en' ? 'Local/service business' : 'Lokalni ili usluzni biznis'
      : language === 'en' ? 'Founder SaaS' : 'Founder SaaS',
    guidance:
      language === 'en'
        ? 'I could not fully classify this automatically, so I prepared practical discovery questions. For the MVP we assume a founder testing a digital or SaaS idea unless your brief clearly points elsewhere.'
        : 'Nisam mogao potpuno klasificirati ideju, pa sam pripremio prakticna discovery pitanja. Za MVP pretpostavljamo founder-a koji testira digitalnu ili SaaS ideju, osim ako brief jasno pokazuje nesto drugo.',
    questions: [
      {
        id: 'buyer',
        category: 'buyer',
        question: language === 'en' ? 'Who is the first realistic buyer or user you want to win, and what makes them care now?' : 'Tko je prvi realan kupac ili korisnik kojeg zelis osvojiti i sto ga tjera da mu je ovo bitno bas sada?',
        placeholder: language === 'en' ? 'Example: solo SaaS founders preparing customer interviews before building...' : 'npr. solo SaaS founderi koji rade customer intervjue prije gradnje...',
      },
      {
        id: 'pain',
        category: 'pain',
        question: language === 'en' ? 'What painful workflow, uncertainty, or missed result makes them search for a solution now?' : 'Koji bolan workflow, nepoznanica ili promaseni rezultat ih tjera da sada traze rjesenje?',
        placeholder: language === 'en' ? 'Lost time, weak interviews, unclear demand, poor conversion...' : 'Izgubljeno vrijeme, slabi intervjui, nejasna potraznja, losa konverzija...',
      },
      {
        id: 'trust',
        category: 'trust',
        question: language === 'en' ? 'What proof or result would they need before they trust this enough to use or pay for it?' : 'Koji dokaz ili rezultat bi im trebao prije nego dovoljno vjeruju da ovo koriste ili plate?',
        placeholder: language === 'en' ? 'Case study, real interviews, faster workflow, ROI, saved hours...' : 'Case study, stvarni intervjui, brzi workflow, ROI, usteda sati...',
      },
    ],
  };
}

function sanitizeQuestions(value: unknown, language: 'hr' | 'en'): AdaptiveQuestion[] {
  if (!Array.isArray(value)) return fallbackResult('', language).questions;

  const questions = value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const question = asString(raw.question, '');
      if (!question) return null;
      return {
        id: asString(raw.id, `q${index + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 30) || `q${index + 1}`,
        category: asString(raw.category, 'context').slice(0, 40),
        question: question.slice(0, 180),
        placeholder: asString(raw.placeholder, language === 'en' ? 'Short concrete answer...' : 'Kratak konkretan odgovor...').slice(0, 180),
      };
    })
    .filter((item): item is AdaptiveQuestion => Boolean(item))
    .slice(0, 6);

  return questions.length >= 3 ? questions : fallbackResult('', language).questions;
}

function sanitizeResult(raw: Partial<IdeaBriefResult> | null, brief: string, language: 'hr' | 'en'): IdeaBriefResult {
  const fallback = fallbackResult(brief, language);
  if (!raw) return fallback;

  return {
    business_model: normalizeModel(raw.business_model),
    product_name: asString(raw.product_name, fallback.product_name).slice(0, 90),
    elevator_pitch: asString(raw.elevator_pitch, brief).slice(0, 220),
    detailed_description: asString(raw.detailed_description, fallback.detailed_description),
    b2b2c_consumer_description: asString(raw.b2b2c_consumer_description, ''),
    b2b2c_business_description: asString(raw.b2b2c_business_description, ''),
    price_model: asString(raw.price_model, fallback.price_model).slice(0, 160),
    target_market: asString(raw.target_market, fallback.target_market).slice(0, 160),
    assumed_customer: asString(raw.assumed_customer, fallback.assumed_customer).slice(0, 220),
    competitors: asString(raw.competitors, fallback.competitors).slice(0, 220),
    category_label: asString(raw.category_label, fallback.category_label).slice(0, 80),
    guidance: asString(raw.guidance, fallback.guidance).slice(0, 400),
    questions: sanitizeQuestions(raw.questions, language),
  };
}

export async function generateIdeaBrief(body: IdeaBriefRequest): Promise<IdeaBriefResult> {
  const brief = asString(body.brief, '').slice(0, 700);
  const language = body.language === 'en' ? 'en' : 'hr';

  if (brief.length < 8) {
    throw new ServerActionError(
      language === 'en' ? 'Write at least one clear sentence.' : 'Napiši barem jednu jasnu rečenicu.',
      400,
      'brief_too_short'
    );
  }

  const langName = language === 'en' ? 'English' : 'Croatian';
  const systemPrompt = `You are the first-step AI intake for AI Validator. A founder writes one rough sentence about what their company, startup, local service, store, platform, SaaS, fintech, IT product, or idea does.

Your job:
- Classify the likely business model: B2C, B2B, or B2B2C.
- Infer whether this is a startup/SaaS/fintech/IT product, local service, retail/store, marketplace, agency, physical product, etc.
- Prepare the rest of the validation form so it fits that business type.
- For the MVP, the default lens is a solo founder testing a digital or SaaS idea before MVP. If the brief is ambiguous, prefer that lens.
- Do not force startup language onto ordinary businesses when the brief is clearly local/service/retail. A window-installation company, hair salon, restaurant, delivery service, or local shop needs different questions than a fintech SaaS.
- Ask 4-6 specific follow-up questions that would make the validation stronger.
- If uncertain, leave fields empty rather than inventing facts.
- Return text in ${langName}.

Return ONLY this JSON:
{
  "business_model": "B2B | B2C | B2B2C",
  "product_name": "suggested short name, or empty string if unknown",
  "elevator_pitch": "clean one-sentence pitch",
  "detailed_description": "adapted description starter for non-B2B2C",
  "b2b2c_consumer_description": "only if B2B2C",
  "b2b2c_business_description": "only if B2B2C",
  "price_model": "suggested pricing model or empty string",
  "target_market": "likely market/region or empty string",
  "assumed_customer": "likely buyer/customer profile or empty string",
  "competitors": "status quo / alternatives, not necessarily named companies",
  "category_label": "short business category",
  "guidance": "short explanation of what you inferred and what the founder should clarify",
  "questions": [
    { "id": "short_id", "category": "buyer|pain|trust|pricing|operations|distribution|regulation|competition|scope", "question": "specific question", "placeholder": "example answer style" }
  ]
}`;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: brief },
  ];

  const raw = await callDeepSeek(messages, { temperature: 0.35, maxTokens: 1400, json: true });
  const parsed = safeParseJson<Partial<IdeaBriefResult>>(raw);

  return sanitizeResult(parsed, brief, language);
}
