import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';

export interface IntakeRequest {
  ideaSummary: string;
  transcript: { role: 'user' | 'assistant'; content: string }[];
  language: 'hr' | 'en';
}

interface IntakeResult {
  message: string;
  done: boolean;
}

const GENERIC_FALLBACKS = [
  'mozes li mi reci malo vise',
  'možeš li mi reći malo više',
  'could you tell me a bit more',
  'tell me a bit more',
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericFallback(message: string) {
  const normalized = normalizeText(message);
  return GENERIC_FALLBACKS.some((item) => normalized.includes(normalizeText(item)));
}

function deterministicIntakeStep(
  transcript: IntakeRequest['transcript'],
  language: 'hr' | 'en'
): IntakeResult {
  const userAnswers = transcript.filter((m) => m.role === 'user').length;
  const allUserText = normalizeText(transcript.filter((m) => m.role === 'user').map((m) => m.content).join(' '));

  const hrSteps = [
    'Bok! Krenimo jednostavno: u kojoj državi i regiji planiraš raditi ovaj posao?',
    'Super, imam lokaciju. U kojoj si fazi trenutno: samo ideja, dogovaraš prve klijente, već radiš uslugu ili već imaš prihod?',
    'Kako trenutno planiraš izvoditi posao: radiš sam, imaš tim/partnere ili bi dio posla outsourceao?',
    'Koliki okvirni mjesečni budžet možeš odvojiti za marketing, obilazak terena ili prve prodajne pokušaje?',
    'Koji ti je glavni cilj u idućih 6 mjeseci: prvi klijenti, širenje na nove gradove, veća cijena, bolja operativa ili nešto drugo?',
    'Što ti je trenutno najveća nepoznanica ili strah oko ove ideje?',
  ];

  const enSteps = [
    'Hi! Let us start simple: which country and region are you building this in?',
    'Great, I have the location. What stage are you in right now: just an idea, talking to first customers, already delivering the service, or already making revenue?',
    'How do you plan to deliver this operationally: solo, with a team/partners, or by outsourcing part of the work?',
    'What rough monthly budget can you put toward marketing, field visits, or first sales attempts?',
    'What is your main goal for the next 6 months: first customers, expansion, higher pricing, smoother operations, or something else?',
    'What is the biggest unknown or worry you still have about this idea?',
  ];

  const wrap = language === 'en'
    ? 'That is enough context for now. I will prepare your AI advisors so they can focus on concrete next steps instead of generic advice.'
    : 'To je dovoljno konteksta za sada. Pripremam tvoje AI savjetnike da krenu s konkretnim sljedećim koracima, a ne generičkim savjetima.';

  if (userAnswers >= 5) return { message: wrap, done: true };

  const steps = language === 'en' ? enSteps : hrSteps;

  const hasStage = /idej|mvp|lans|launch|klijent|customer|prihod|revenue|radim|delivering/.test(allUserText);
  const hasOps = /sam|solo|tim|team|partner|outsourc|majstor|radnik|agency|agenc/.test(allUserText);
  const hasBudget = /budzet|budget|eur|€|\d+\s*(e|eur|€)/.test(allUserText);
  const hasGoal = /cilj|goal|siren|širen|rast|growth|klijent|prodaj|sales|cijena|operativ/.test(allUserText);
  const knownSignals = [hasStage, hasOps, hasBudget, hasGoal].filter(Boolean).length;
  if (userAnswers >= 3 && knownSignals >= 3) return { message: wrap, done: true };

  return { message: steps[Math.min(userAnswers, steps.length - 1)], done: false };
}

export async function runIntake(body: IntakeRequest): Promise<IntakeResult> {
  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const userAnswers = body.transcript.filter((m) => m.role === 'user').length;

  const systemPrompt = `You are the warm, sharp intake host for "AI Validator". Before the founder meets their 4 AI advisors (a business mentor, a CTO, a growth marketer, and a legal/accounting expert), you run a short, natural CONVERSATION to gather context. You are NOT a form — you talk like a smart friend, drawing conclusions from what they say.

WHAT THE ADVISORS NEED TO KNOW (cover these, but conversationally — skip anything already answered):
- Country / jurisdiction they're building in
- Their technical situation (solo dev / has a team / outsourcing / nothing built)
- Stage (idea / building MVP / launched / has users or revenue)
- Rough monthly budget for marketing/ads
- Main goal for the next 6 months
- Any gap in the core idea itself that's still fuzzy

WHAT YOU ALREADY KNOW ABOUT THE PROJECT (do NOT ask about these):
${body.ideaSummary}

RULES:
- Reply in ${langName}.
- Ask exactly ONE question at a time. Keep it to 1–3 short sentences. Be friendly and concrete.
- Build on their previous answers ("Got it — since you're solo, ..."). Infer and confirm rather than interrogate.
- Do NOT ask things already known from the project info or earlier answers.
- After you have a reasonable picture (typically 4–6 answers), STOP asking and set done=true with a short warm wrap-up telling them their advisors are ready. Quality over completeness — don't drag it out.
${userAnswers >= 5 ? '- You already have enough answers. Unless something critical is still totally unknown, set done=true now.' : ''}

Return ONLY this JSON:
{ "message": "your next question, OR the wrap-up if done", "done": true|false }`;

  const messages: DeepSeekMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const m of body.transcript) {
    messages.push({ role: m.role, content: m.content });
  }
  if (body.transcript.length === 0) {
    messages.push({ role: 'user', content: 'Start the intake with your first question.' });
  }

  const raw = await callDeepSeek(messages, { temperature: 0.6, maxTokens: 300, json: true });
  const fallback = deterministicIntakeStep(body.transcript, body.language);
  const parsed = safeParseJson<IntakeResult>(raw) ?? fallback;
  const lastAssistant = [...body.transcript].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const repeated = lastAssistant && normalizeText(parsed.message) === normalizeText(lastAssistant);

  if (!parsed.message?.trim() || isGenericFallback(parsed.message) || repeated) {
    parsed.message = fallback.message;
    parsed.done = fallback.done;
  }

  if (userAnswers >= 5) {
    const forced = deterministicIntakeStep(body.transcript, body.language);
    parsed.message = forced.message;
    parsed.done = true;
  }

  return parsed;
}
