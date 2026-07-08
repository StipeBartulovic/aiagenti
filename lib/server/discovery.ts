import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { ServerActionError } from './errors';

/**
 * Ispitivač (moderator dubinskog ispitivanja): iz preostalih kandidat-pitanja
 * bira ono koje sada najviše vrijedi, prilagodi formulaciju razgovoru i
 * objasni zašto je bitno. Sinteza odgovora u biznis plan ide kroz /api/kb-update.
 */

export interface DiscoveryCandidate {
  question: string;
  context?: string;
  source: string;
  side?: string;
  section?: string;
}

export interface DiscoveryNextRequest {
  language: 'hr' | 'en';
  idea: { product_name: string; elevator_pitch: string; business_model: string };
  digest?: string;
  candidates: DiscoveryCandidate[];
  answered: { question: string; answer: string }[];
  skipped: string[];
}

export interface DiscoveryNextResponse {
  /** true kad ispitivač procijeni da preostala pitanja više ne donose novu vrijednost */
  done: boolean;
  /** Indeks odabranog kandidata (u poslanom nizu); null kad je done */
  index: number | null;
  /** Pitanje kako ga ispitivač postavlja (kontekstualizirano, jezik korisnika) */
  question: string;
  /** 1 rečenica: zašto ovo pitanje sada (jezik korisnika) */
  why: string;
}

export async function pickNextDiscoveryQuestion(body: DiscoveryNextRequest): Promise<DiscoveryNextResponse> {
  const candidates = (body.candidates ?? []).filter((c) => c?.question?.trim());
  if (!body.idea?.product_name) throw new ServerActionError('Nedostaje idea.', 400, 'missing_idea');
  if (candidates.length === 0) {
    return { done: true, index: null, question: '', why: '' };
  }

  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const answered = (body.answered ?? []).slice(-14);
  const skipped = (body.skipped ?? []).slice(-14);

  const candidatesBlock = candidates
    .map((c, i) => `${i}. [${c.source}${c.section ? `:${c.section}` : ''}${c.side && c.side !== 'general' ? `/${c.side}` : ''}] ${c.question}${c.context ? ` (context: ${c.context})` : ''}`)
    .join('\n');
  const answeredBlock = answered.length
    ? `ALREADY ANSWERED (do NOT re-ask anything these answers already cover):\n${answered
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join('\n')}`
    : 'Nothing answered yet — start with the question whose answer would most change the validation picture.';
  const skippedBlock = skipped.length
    ? `SKIPPED BY FOUNDER (avoid near-duplicates of these):\n${skipped.map((q) => `- ${q}`).join('\n')}`
    : '';

  const prompt = `You are the interviewer helping a startup founder fill the biggest holes in their business plan. Simulated customer personas rejected or doubted the product mostly because information was missing — your job is to extract that information one question at a time.

PRODUCT: "${body.idea.product_name}" (${body.idea.business_model}) — ${body.idea.elevator_pitch}
${body.digest ? `PROJECT DIGEST:\n${body.digest}\n` : ''}
CANDIDATE QUESTIONS (numbered; sources: question/doubt/objection come from simulated buyers, gap comes from the business plan's open holes):
${candidatesBlock}

${answeredBlock}
${skippedBlock}

Pick the ONE candidate whose answer would most improve the business plan and the next validation run RIGHT NOW. Prefer: (1) questions answering why buyers rejected, (2) open business-plan gaps in weak sections, (3) avoid anything already covered by given answers. Rephrase the chosen question conversationally in ${langName}, addressing the founder directly ("ti" form in Croatian), keeping its substance. If EVERY remaining candidate is already effectively answered or redundant, set done=true.

Return ONLY this JSON:
{ "done": false, "index": <number of the chosen candidate>, "question": "the conversational question in ${langName}, max 200 chars", "why": "one sentence in ${langName}: why this matters now, max 140 chars" }`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You are a precise interviewer. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.4, maxTokens: 300, json: true }
  );

  const parsed = safeParseJson<{ done?: boolean; index?: number; question?: string; why?: string }>(raw);

  if (parsed?.done === true) {
    return { done: true, index: null, question: '', why: (parsed.why || '').trim() };
  }

  const index =
    typeof parsed?.index === 'number' && Number.isInteger(parsed.index) && parsed.index >= 0 && parsed.index < candidates.length
      ? parsed.index
      : 0;
  const fallbackQuestion = candidates[index].question;

  return {
    done: false,
    index,
    question: (parsed?.question || '').trim() || fallbackQuestion,
    why: (parsed?.why || '').trim(),
  };
}
