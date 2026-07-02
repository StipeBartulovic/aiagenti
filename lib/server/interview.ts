import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import type { IdeaFormData, InterviewKit, InterviewQuestion } from '@/lib/types';
import { ServerActionError } from './errors';

interface InterviewContext {
  summary?: string;
  audience?: string;
  assumption?: string;
  rejection_reasons?: string[];
  top_questions?: string[];
  segments?: { label: string; score: number }[];
}

export interface InterviewRequest {
  idea: IdeaFormData;
  context: InterviewContext;
  language: 'hr' | 'en';
}

export interface InterviewResponse {
  interview: InterviewKit;
}

const asStr = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const asStrArray = (v: unknown, cap: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim()).slice(0, cap) : [];

export async function generateInterviewKit({ idea, context, language }: InterviewRequest): Promise<InterviewResponse> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }

  if (!idea) {
    throw new ServerActionError('Nedostaje idea.', 400, 'missing_idea');
  }

  const langName = language === 'en' ? 'English' : 'Croatian';
  const c = context || {};

  const descBlock =
    idea.business_model === 'B2B2C'
      ? `${idea.b2b2c_consumer_description || ''} ${idea.b2b2c_business_description || ''}`
      : idea.detailed_description || '';

  const findings = [
    c.summary ? `Overall: ${c.summary}` : '',
    c.audience ? `Primary audience found: ${c.audience}` : '',
    c.assumption ? `Assumption vs reality: ${c.assumption}` : '',
    c.rejection_reasons?.length ? `Top rejection reasons: ${c.rejection_reasons.join('; ')}` : '',
    c.top_questions?.length ? `Questions the market raised: ${c.top_questions.join('; ')}` : '',
    c.segments?.length ? `Segment scores: ${c.segments.map((s) => `${s.label} ${s.score}/100`).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `You are a customer-discovery coach trained on "The Mom Test". You turn a synthetic AI market test into a kit for talking to REAL people - because synthetic personas are only a first filter, real interviews are the actual validation.

PRODUCT:
- ${idea.business_model} · "${idea.product_name}" - ${idea.elevator_pitch}
- What it is: ${descBlock}
- Price: ${idea.price_model}

WHAT THE SYNTHETIC TEST SURFACED (use this to target the riskiest assumptions):
${findings || '(little detail - focus on the core problem and who has it)'}

Design a real-world interview kit. STRICT rules for the questions (Mom Test):
- Ask about the person's PAST and SPECIFICS ("tell me about the last time you...", "walk me through how you currently..."), never about the future or hypotheticals.
- NEVER pitch the idea and NEVER ask "would you buy/use this?" or "do you think this is a good idea?" - those answers are worthless.
- Dig into the real problem, their current workaround, what it costs them (time/money/frustration), and whether they've already tried to solve it.
- Each question must tie to a real risk/assumption from the findings above.

Write everything in ${langName}. Return ONLY this JSON:
{
  "who_to_interview": "1-2 sentences: exactly who to recruit (the people most likely to have this problem)",
  "where_to_find": ["3-5 concrete places/channels to find and recruit them"],
  "questions": [
    { "question": "the exact question to ask", "why": "which assumption/risk it tests (short)", "listen_for": "what a revealing answer sounds like - the signal that confirms or kills the assumption" }
  ],
  "avoid": "one sentence: the single biggest leading/pitching trap to avoid in these interviews"
}
Exactly 8 questions. Make them specific to THIS product and these findings, not generic.`;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Generate the interview kit. Return the JSON.' },
  ];

  const raw = await callDeepSeek(messages, { temperature: 0.6, maxTokens: 1600, json: true });
  const parsed = safeParseJson<{
    who_to_interview?: string;
    where_to_find?: string[];
    questions?: InterviewQuestion[];
    avoid?: string;
  }>(raw);

  if (!parsed) {
    throw new ServerActionError('Neuspjelo generiranje pitanja.', 422, 'interview_generation_failed');
  }

  const questions: InterviewQuestion[] = (parsed.questions ?? [])
    .filter((q) => q && typeof q.question === 'string' && q.question.trim())
    .map((q) => ({
      question: asStr(q.question, 300),
      why: asStr(q.why, 200),
      listen_for: asStr(q.listen_for, 250),
    }))
    .slice(0, 10);

  if (questions.length === 0) {
    throw new ServerActionError('Neuspjelo generiranje pitanja.', 422, 'interview_generation_failed');
  }

  const interview: InterviewKit = {
    who_to_interview: asStr(parsed.who_to_interview, 400),
    where_to_find: asStrArray(parsed.where_to_find, 6),
    questions,
    avoid: asStr(parsed.avoid, 300),
  };

  return { interview };
}
