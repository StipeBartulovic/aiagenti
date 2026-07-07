import type { PersonaAttributes, PersonaReaction, IdeaFormData, ValidationReport, AudienceSegment, OpportunityAnalysis, EmergentCluster } from './types';
import { generatePersonas, generatePersonasForSegments } from './personas';
import { buildEmergentClusters } from './clustering';
import { callDeepSeek as callDeepSeekApi, type DeepSeekMessage } from './deepseek';

/** Manji batch jer reakcija sad nosi i JTBD polja (veći JSON po pers/oni). */
const BATCH_SIZE = 8;
/** 'standard' (free) ≈ 100 agenata, 'deep' (paid) ≈ 300+. */
export type RunDepth = 'standard' | 'deep';
/** Broj persona po ciljanom segmentu po dubini (3 segmenta × N). */
const PER_SEGMENT: Record<RunDepth, number> = { standard: 33, deep: 100 };
/** Ciljani N za generičku (ne-segmentiranu) publiku po dubini. */
const GENERIC_COUNT: Record<RunDepth, number> = { standard: 100, deep: 300 };

/** Viability score iz brojača odluka — JEDNO mjesto (anti-halucinacija, brojke iz koda). */
function scoreFromCounts(buy: number, maybe: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((buy * 100 + maybe * 40) / total));
}

interface SegmentStat {
  label: string;
  count: number;
  score: number;
  intent: { buy: number; maybe: number; reject: number };
}

/** Grupira reakcije po persona.segment i računa score/intent po segmentu (u kodu). */
function buildSegmentStats(
  personas: PersonaAttributes[],
  reactions: PersonaReaction[]
): SegmentStat[] {
  const byId = new Map(reactions.map((r) => [r.persona_id, r]));
  const groups = new Map<string, PersonaReaction[]>();

  for (const p of personas) {
    if (!p.segment) continue;
    const r = byId.get(p.id);
    if (!r) continue;
    const arr = groups.get(p.segment) ?? [];
    arr.push(r);
    groups.set(p.segment, arr);
  }

  const stats: SegmentStat[] = [];
  for (const [label, rs] of groups) {
    const count = rs.length;
    if (count === 0) continue;
    const buy = rs.filter((r) => r.decision === 'buy').length;
    const maybe = rs.filter((r) => r.decision === 'maybe').length;
    const reject = count - buy - maybe;
    stats.push({
      label,
      count,
      score: scoreFromCounts(buy, maybe, count),
      intent: {
        buy: Math.round((buy / count) * 100),
        maybe: Math.round((maybe / count) * 100),
        reject: Math.round((reject / count) * 100),
      },
    });
  }
  // najjači segment prvi — odmah se vidi gdje proizvod rezonira
  return stats.sort((a, b) => b.score - a.score);
}

/** Tolerantno parsiranje LLM JSON-a: skine ograde, izvuče vanjski objekt, makne trailing zareze. */
function parseJsonLoose<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    let s = raw.replace(/```json|```/gi, '').trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
    s = s.replace(/,\s*([}\]])/g, '$1'); // trailing zarezi
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  }
}

async function callDeepSeek(
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  return callDeepSeekApi(messages as DeepSeekMessage[], { temperature, maxTokens, json: true });
}

function formatDiscoveryAnswers(form: IdeaFormData): string {
  const answers = (form.discovery_answers ?? []).filter((item) => item.answer.trim().length > 0);
  const adaptive = (form.adaptive_answers ?? []).filter((item) => item.answer.trim().length > 0);
  if (answers.length === 0 && adaptive.length === 0) return '';

  const discovery = answers
    .map((item) => `- [${item.category}] ${item.question}\n  Founder answer: ${item.answer.trim()}`)
    .join('\n');
  const adaptiveBlock = adaptive
    .map((item) => `- [adaptive:${item.category}] ${item.question}\n  Founder answer: ${item.answer.trim()}`)
    .join('\n');

  return [discovery, adaptiveBlock].filter(Boolean).join('\n');
}

async function validateIdeaContext(
  form: IdeaFormData
): Promise<{ valid: boolean; reason?: string }> {
  const geoAreas = form.geo_areas?.length ? form.geo_areas : form.geo_area ? [form.geo_area] : [];
  const discoveryBlock = formatDiscoveryAnswers(form);
  const prompt = `You are a business validation gatekeeper. Analyze if the following input describes a plausible, understandable business idea or product concept, or if it is garbage/insufficient/mock input (e.g., keyboard smashes like "asdf", single letters like "d", nonsensical phrases, or completely blank contexts).

INPUT:
Name: "${form.product_name}"
Pitch: "${form.elevator_pitch}"
Initial brief: "${form.initial_brief || ''}"
Inferred category: "${form.inferred_category || ''}"
Description: "${form.detailed_description}"
Price: "${form.price_model}"
Geo areas: "${geoAreas.map((area) => area.label).join(' | ')}"
${discoveryBlock ? `Founder discovery answers:\n${discoveryBlock}` : ''}

Respond in this JSON format only:
{
  "valid": true/false,
  "reason": "if valid is false, a brief explanation in the user's language (Croatian if language is 'hr', English if language is 'en') explaining why the input is invalid and what to fix."
}`;

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: 'You are a validation gatekeeper. Return JSON only.' },
        { role: 'user', content: prompt }
      ],
      0.0,
      200
    );
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return { valid: true };
  }
}

async function getBatchReactions(
  personas: PersonaAttributes[],
  form: IdeaFormData
): Promise<PersonaReaction[]> {
  const geoAreas = form.geo_areas?.length ? form.geo_areas : form.geo_area ? [form.geo_area] : [];
  const discoveryBlock = formatDiscoveryAnswers(form);
  const geoAreasBlock = geoAreas.length
    ? `\nGEOGRAPHIC AREAS SELECTED BY FOUNDER:
${geoAreas.map((area, index) => `- ${index + 1}. ${area.label}
  Center: ${area.center.lat.toFixed(5)}, ${area.center.lng.toFixed(5)}
  Bounds: north ${area.bounds.north.toFixed(5)}, south ${area.bounds.south.toFixed(5)}, east ${area.bounds.east.toFixed(5)}, west ${area.bounds.west.toFixed(5)}`).join('\n')}
Use these areas as the local market context. For location-sensitive products, compare convenience, competition, density, budget, logistics, and trust across these geographies.`
    : '';
  const slim = personas.map((p) => ({
    id: p.id,
    age: p.age,
    role: p.role,
    industry: p.industry,
    tech: `${p.tech_literacy}/10`,
    income: p.income,
    type: p.buyer_type,
    region: p.region,
    market_side: p.market_side ?? 'both',
    personality: p.personality,
    disposition: p.disposition ?? 'open',
    values: p.values ?? [],
    decision_style: p.decision_style ?? 'analytical',
    core_needs: p.core_needs ?? [],
    buying_triggers: p.buying_triggers ?? [],
    adoption_barriers: p.adoption_barriers ?? [],
    current_alternatives: p.current_alternatives ?? [],
    evidence_required: p.evidence_required ?? [],
  }));

  const languageDirective = form.language === 'en'
    ? 'IMPORTANT: Write problem_to_solve, current_alternative, doubts, main_reason, objections, questions, quote, and willingness_to_pay in English.'
    : 'IMPORTANT: Write problem_to_solve, current_alternative, doubts, main_reason, objections, questions, quote, and willingness_to_pay in Croatian.';

  let clarificationsPrompt = '';
  if (form.clarifications && form.clarifications.length > 0) {
    clarificationsPrompt = `\n\nTHE FOUNDER HAS CLARIFIED THE FOLLOWING PREVIOUS OBJECTIONS OR QUESTIONS:
${form.clarifications.map((c) => `- PREVIOUS QUESTION/OBJECTION: "${c.question}"\n  FOUNDER'S RESPONSE/CLARIFICATION: "${c.answer}"`).join('\n')}

Please evaluate this product with these corrections/clarifications in mind. The personas should adjust their skepticism, buying decisions, quotes, and questions accordingly. Some skeptics might be convinced, or they might raise new specific questions based on the answers.`;
  }

  let descriptionText = `Description: "${form.detailed_description}"`;
  let b2b2cDirective = '';
  if (form.business_model === 'B2B2C') {
    descriptionText = `B2C Consumer Description: "${form.b2b2c_consumer_description}"\nB2B Partner Description: "${form.b2b2c_business_description}"`;
    b2b2cDirective = `\n\nThis is a B2B2C product with two different market sides. Each persona has market_side:
- "payer" or "partner": business-side participant who may pay, judge ROI, budget, commissions, operational value, and partner risk. Use ONLY the B2B Partner Description for them.
- "user": end consumer / demand-side participant. They judge usefulness, convenience, trust, and adoption. Use ONLY the B2C Consumer Description for them, and do NOT evaluate business partner pricing/commissions as if they personally pay them.
For user-side personas, willingness_to_pay should reflect only consumer-facing fees or premium features if explicitly present; otherwise write "nothing directly" / "ne placa direktno".`;
  }

  const prompt = `You are a market research simulation. Simulate authentic, diverse reactions.

BUSINESS MODEL: ${form.business_model}
PRODUCT:
Name: "${form.product_name}"
Pitch: "${form.elevator_pitch}"
${form.initial_brief ? `Initial founder brief: "${form.initial_brief}"\n` : ''}${form.inferred_category ? `Inferred business category: "${form.inferred_category}"\n` : ''}
${descriptionText}
Price: "${form.price_model}"${form.target_market ? `\nTarget market: "${form.target_market}"` : ''}${form.competitors ? `\nCompetitors: "${form.competitors}"` : ''}${form.website_context ? `\nWebsite Context: "${form.website_context}"` : ''}${form.document_context ? `\nUploaded Project Document Context: "${form.document_context}"` : ''}${clarificationsPrompt}
${geoAreasBlock}
${discoveryBlock ? `\nFOUNDER OFFICE HOURS CONTEXT:
${discoveryBlock}
Use these answers as the founder's current assumptions. Do not blindly trust them: if an answer is vague, overbroad, or unsupported, personas should surface that as a trust, demand, or adoption risk.` : ''}

Simulate reactions for these ${personas.length} personas. Be realistic. Since this is a ${form.business_model} product, evaluate their willingness to pay, objections, and buying intent from the perspective of ${form.business_model === 'B2B' ? 'a business buyer (ROI, budget, business efficiency)' : form.business_model === 'B2C' ? 'a consumer (personal budget, convenience, emotional appeal)' : 'a B2B2C player (both the business intermediary value and the end-consumer experience)'}.${b2b2cDirective}

REALISM & ANTI-SYCOPHANCY (critical — avoid the "AI survey illusion"):
- Most new products fail. Default to skepticism. Do NOT be polite, agreeable, or generous to please anyone.
- Choose "buy" ONLY if this persona would realistically pay with their OWN money given their income, priorities, and current alternative. When unsure, it's "maybe" or "reject", not "buy".
- Respect each persona's "disposition": "hostile" personas reject unless the value is undeniable FOR THEM specifically; "indifferent" personas need a strong, specific reason to even consider; "open" personas are fair but still critical.
- Reality check: across a realistic market, clear "buy" is usually a MINORITY (~10–25%). If most of your personas buy, you are being unrealistic — recalibrate downward.

JOBS-TO-BE-DONE: for each persona, reason about the JOB, not just "do you like it":
- problem_to_solve: the core problem they'd "hire" this product for (or "" if none resonates)
- current_alternative: what they use TODAY instead — a named competitor, a manual workaround, or "nothing"
- doubts: concrete doubts they'd have BEFORE paying (0–3)
- importance (1–10): how important solving this problem is to them
- satisfaction (1–10): how satisfied they already are with their current_alternative

PERSONA-SPECIFIC CONTEXT:
- core_needs = what this persona is actually trying to improve.
- buying_triggers = why they might look for a solution now.
- adoption_barriers = why they hesitate, delay, or reject.
- current_alternatives = what they likely use today; use these when filling current_alternative unless the product context gives a better specific competitor.
- evidence_required = what proof they need before buying.
Use these fields heavily. Two personas with the same role should still react differently if their barriers/triggers/evidence differ.

${languageDirective}

PERSONAS:
${JSON.stringify(slim)}

Return JSON with "reactions" array (${personas.length} items, same order):
{ "reactions": [{ "persona_id": number, "decision": "buy"|"maybe"|"reject", "problem_to_solve": "max 80 chars or empty", "current_alternative": "max 60 chars", "doubts": ["max 50 chars each, 0-3 items"], "importance": 1-10, "satisfaction": 1-10, "main_reason": "string max 60 chars", "objections": ["max 50 chars each, 0-3 items"], "questions": ["0-2 items"], "quote": "first-person quote max 100 chars", "willingness_to_pay": "e.g. up to €10/month or nothing" }] }`;

  const messages = [
    { role: 'system', content: 'You are a rigorous, skeptical market research simulation. Return valid, strictly-parseable JSON only.' },
    { role: 'user', content: prompt },
  ];

  // Do 2 pokušaja; tolerantno parsiranje. Ako batch padne, vrati prazno (run preživi).
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callDeepSeek(messages, 0.85, 6000);
    const parsed = parseJsonLoose<{ reactions: PersonaReaction[] }>(raw);
    if (parsed?.reactions?.length) return parsed.reactions;
  }
  console.error(`Batch parse failed after retry; dropping batch of ${personas.length} personas.`);
  return [];
}

interface SegmentVerdict {
  label: string;
  verdict: string;
  top_reason: string;
}

type SynthesisResult = Omit<ValidationReport, 'meta' | 'score' | 'intent' | 'segments'> & {
  segment_verdicts?: SegmentVerdict[];
};

function normalizeConfidence(confidence: SynthesisResult['confidence']): ValidationReport['confidence'] {
  if (!confidence) return undefined;
  const score = Math.max(0, Math.min(100, Math.round(Number(confidence.score) || 0)));
  const label = (['low', 'medium', 'high'] as const).includes(confidence.label)
    ? confidence.label
    : score >= 70
      ? 'high'
      : score >= 45
        ? 'medium'
        : 'low';
  const reasons = Array.isArray(confidence.reasons)
    ? confidence.reasons.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
    : [];
  const missing_evidence = Array.isArray(confidence.missing_evidence)
    ? confidence.missing_evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
    : [];

  return { score, label, reasons, missing_evidence };
}

function normalizeNextExperiment(nextExperiment: SynthesisResult['next_experiment']): ValidationReport['next_experiment'] {
  if (!nextExperiment || typeof nextExperiment !== 'object') return undefined;

  const hypothesis = typeof nextExperiment.hypothesis === 'string' ? nextExperiment.hypothesis.trim().slice(0, 220) : '';
  const who_to_test = typeof nextExperiment.who_to_test === 'string' ? nextExperiment.who_to_test.trim().slice(0, 220) : '';
  const where_to_find = Array.isArray(nextExperiment.where_to_find)
    ? nextExperiment.where_to_find
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 120))
        .slice(0, 5)
    : [];
  const outreach_message =
    typeof nextExperiment.outreach_message === 'string'
      ? nextExperiment.outreach_message.trim().slice(0, 500)
      : '';
  const duration = typeof nextExperiment.duration === 'string' ? nextExperiment.duration.trim().slice(0, 80) : '';
  const success_criteria = Array.isArray(nextExperiment.success_criteria)
    ? nextExperiment.success_criteria
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 180))
        .slice(0, 4)
    : [];

  if (!hypothesis || !who_to_test || !outreach_message) return undefined;

  return {
    hypothesis,
    who_to_test,
    where_to_find,
    outreach_message,
    duration: duration || '7 days',
    success_criteria,
  };
}

async function synthesize(
  form: IdeaFormData,
  reactions: PersonaReaction[],
  personas: PersonaAttributes[],
  segmentStats: SegmentStat[] = []
): Promise<SynthesisResult> {
  const count = reactions.length;
  const buyR = reactions.filter((r) => r.decision === 'buy');
  const rejectR = reactions.filter((r) => r.decision === 'reject');

  const buyPct = Math.round((buyR.length / count) * 100);
  const maybePct = Math.round(
    (reactions.filter((r) => r.decision === 'maybe').length / count) * 100
  );
  const rejectPct = 100 - buyPct - maybePct;

  const allObjections = reactions.flatMap((r) => r.objections).slice(0, 40);
  const allQuestions = reactions.flatMap((r) => r.questions).slice(0, 25);
  const buyQuotes = buyR.slice(0, 4).map((r) => r.quote);
  const rejectQuotes = rejectR.slice(0, 4).map((r) => r.quote);

  const buyerProfiles = buyR
    .slice(0, 6)
    .map((r) => {
      const p = personas.find((x) => x.id === r.persona_id);
      return p ? `${p.role}, ${p.age}y, ${p.region}, side:${p.market_side ?? 'both'}, income:${p.income}` : '';
    })
    .filter(Boolean)
    .join(' | ');

  // Kontekst + shema za rezultate po segmentu (samo ako je test rađen po publikama)
  const segmentsContext = segmentStats.length
    ? `\n\nSEGMENT RESULTS (already computed from the data — buy/maybe/reject % and score per audience):\n${segmentStats
        .map((s) => `- "${s.label}": score ${s.score}/100, buy ${s.intent.buy}% / maybe ${s.intent.maybe}% / reject ${s.intent.reject}% (${s.count} personas)`)
        .join('\n')}\nUse these to sharpen the assumption_vs_reality (which audience actually responded best vs the founder's assumption).`
    : '';
  const segmentsSchema = segmentStats.length
    ? `,\n  "segment_verdicts": [\n${segmentStats
        .map((s) => `    { "label": "${s.label}", "verdict": "1 sentence: how this audience received it", "top_reason": "their single biggest reason (buy or reject), max 60 chars" }`)
        .join(',\n')}\n  ]`
    : '';

  const languageDirective = form.language === 'en'
    ? 'IMPORTANT: You must write all output text values (summary, profile, assumption_vs_reality, top_reasons_to_buy, reasons labels, quotes, action_plan) in English.'
    : 'IMPORTANT: You must write all output text values (summary, profile, assumption_vs_reality, top_reasons_to_buy, reasons labels, quotes, action_plan) in Croatian.';

  let clarificationsPrompt = '';
  if (form.clarifications && form.clarifications.length > 0) {
    clarificationsPrompt = `\n\nTHE FOUNDER HAS CLARIFIED THE FOLLOWING PREVIOUS OBJECTIONS OR QUESTIONS:
${form.clarifications.map((c) => `- PREVIOUS: "${c.question}"\n  FOUNDER'S ANSWER: "${c.answer}"`).join('\n')}`;
  }

  let descriptionBlock = `DESCRIPTION: "${form.detailed_description}"`;
  if (form.business_model === 'B2B2C') {
    descriptionBlock = `B2C CONSUMER DESCRIPTION: "${form.b2b2c_consumer_description}"\nB2B PARTNER DESCRIPTION: "${form.b2b2c_business_description}"`;
  }
  const geoAreas = form.geo_areas?.length ? form.geo_areas : form.geo_area ? [form.geo_area] : [];
  const geoAreaSummary = geoAreas.length
    ? `\nSELECTED GEO AREAS: ${geoAreas.map((area) => `"${area.label}" (center ${area.center.lat.toFixed(5)}, ${area.center.lng.toFixed(5)})`).join(' | ')}`
    : '';
  const discoveryBlock = formatDiscoveryAnswers(form);

  const prompt = `You are a senior market research analyst. Analyze simulated customer data and provide strategic insights.

PRODUCT: "${form.product_name}"
${descriptionBlock}
PRICE: "${form.price_model}"
${form.assumed_customer ? `FOUNDER ASSUMED CUSTOMER: "${form.assumed_customer}"` : ''}${geoAreaSummary}${form.website_context ? `\nPRODUCT WEBSITE CONTEXT: "${form.website_context}"` : ''}${form.document_context ? `\nUPLOADED PROJECT DOCUMENT CONTEXT: "${form.document_context}"` : ''}${clarificationsPrompt}
${discoveryBlock ? `\nFOUNDER OFFICE HOURS ANSWERS:
${discoveryBlock}
Use these to judge whether the founder's assumed buyer, pain, status quo, wedge, proof, and risk match the simulated market response. If there is a mismatch, call it out in the summary and action plan.` : ''}

COMPUTED STATS (${count} simulated customers):
Buy: ${buyPct}% | Maybe: ${maybePct}% | Reject: ${rejectPct}%

OBJECTIONS (sample):
${allObjections.map((o, i) => `${i + 1}. ${o}`).join('\n')}

CUSTOMER QUESTIONS:
${allQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

BUY QUOTES: ${buyQuotes.map((q) => `"${q}"`).join(' | ')}
REJECT QUOTES: ${rejectQuotes.map((q) => `"${q}"`).join(' | ')}
TOP BUYER PROFILES: ${buyerProfiles}${segmentsContext}

${languageDirective}

Return ONLY this JSON (no extra text):
{
  "summary": "2-3 sentence overall assessment",
  "confidence": {
    "score": 0-100,
    "label": "low" | "medium" | "high",
    "reasons": ["2-4 concrete reasons why this confidence level is justified"],
    "missing_evidence": ["2-5 real-world evidence items that would increase confidence"]
  },
  "target_audience": {
    "profile": "1-2 sentence description of primary buyer segment",
    "assumption_vs_reality": "compare founder assumption vs actual, or write 'No assumption provided'",
    "top_reasons_to_buy": ["reason1", "reason2", "reason3"],
    "radar_data": { "tech": 1-10, "budget": 1-10, "time_saving": 1-10, "risk": 1-10 }
  },
  "rejection": {
    "reasons": [
      {"reason": "clustered reason label", "percentage": integer},
      {"reason": "...", "percentage": integer},
      {"reason": "...", "percentage": integer},
      {"reason": "...", "percentage": integer}
    ],
    "quotes": ["impactful quote 1", "impactful quote 2", "impactful quote 3"]
  },
  "top_questions": ["q1", "q2", "q3", "q4"],
  "action_plan": {
    "product": "specific actionable product recommendation",
    "marketing": "specific actionable marketing recommendation",
    "pricing": "specific actionable pricing recommendation"
  },
  "next_experiment": {
    "hypothesis": "one concrete hypothesis to test in the next 7 days",
    "who_to_test": "specific first segment to contact",
    "where_to_find": ["3-5 concrete places/channels to find them"],
    "outreach_message": "one short outreach or DM message the founder can copy-paste",
    "duration": "default to 7 days unless a shorter test is clearly better",
    "success_criteria": ["0-4 concrete pass/fail checkpoints"]
  }${segmentsSchema}
}
RULES: rejection.reasons percentages must sum to 100. radar_data reflects primary buyers. Be specific and direct.
Confidence is NOT product score. It measures how much the founder should trust this synthetic analysis. Penalize missing real-world proof, vague founder Office Hours answers, unclear buyer, thin target market, weak pricing info, or lack of website/competitor context.
The next_experiment must be specific enough that the founder could run it today without extra planning. Prefer outbound interviews, DM outreach, small landing page tests, or waitlist tests over vague advice.${segmentStats.length ? ' Include exactly one entry in segment_verdicts for each labeled audience above, keeping the labels identical.' : ''}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You are a market research analyst. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    0.35,
    2000
  );

  const parsed = parseJsonLoose<SynthesisResult>(raw);
  if (!parsed) throw new Error('Sinteza nije vratila valjan JSON.');
  return parsed;
}

/** Opportunity Score (Ulwick ODI) iz reakcija — SVE iz koda, ne iz LLM-a. */
function buildOpportunity(
  reactions: PersonaReaction[],
  language: 'hr' | 'en'
): OpportunityAnalysis | undefined {
  const clamp = (n: number) => Math.max(1, Math.min(10, n));
  const scored = reactions
    .filter((r) => typeof r.importance === 'number' && typeof r.satisfaction === 'number')
    .map((r) => {
      const imp = clamp(r.importance!);
      const sat = clamp(r.satisfaction!);
      const oppRaw = imp + Math.max(imp - sat, 0); // 1..20
      return { r, imp, sat, opp: Math.round((oppRaw / 20) * 100) };
    });
  if (scored.length === 0) return undefined;

  const n = scored.length;
  const avgImp = scored.reduce((s, x) => s + x.imp, 0) / n;
  const avgSat = scored.reduce((s, x) => s + x.sat, 0) / n;
  const score = Math.round(scored.reduce((s, x) => s + x.opp, 0) / n);

  // Najveće neispunjene potrebe: dedupe po problemu, zadrži najviši opportunity
  const byProblem = new Map<string, { problem: string; importance: number; satisfaction: number; opportunity: number }>();
  for (const x of [...scored].sort((a, b) => b.opp - a.opp)) {
    const prob = (x.r.problem_to_solve || '').trim();
    if (!prob) continue;
    const key = prob.toLowerCase();
    if (!byProblem.has(key)) byProblem.set(key, { problem: prob, importance: x.imp, satisfaction: x.sat, opportunity: x.opp });
  }
  const top_problems = [...byProblem.values()].slice(0, 5);

  // Stvarne alternative koje kupci danas koriste = prava konkurencija
  const altCount = new Map<string, number>();
  const NOTHING = new Set(['nothing', 'none', 'ništa', 'nista', 'n/a', '']);
  for (const r of reactions) {
    const alt = (r.current_alternative || '').trim();
    if (!alt || NOTHING.has(alt.toLowerCase())) continue;
    altCount.set(alt, (altCount.get(alt) ?? 0) + 1);
  }
  const top_alternatives = [...altCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const i = avgImp.toFixed(1);
  const s = avgSat.toFixed(1);
  const verdict =
    language === 'en'
      ? score >= 65
        ? `Strong opportunity: the problem is important (${i}/10) and poorly served (satisfaction ${s}/10). Worth building here.`
        : score >= 45
          ? `Moderate opportunity: the problem exists but is either not critical or partly solved by alternatives (importance ${i}, satisfaction ${s}).`
          : `Weak opportunity: either the problem isn't important enough or buyers are already satisfied with existing options (importance ${i}, satisfaction ${s}).`
      : score >= 65
        ? `Jaka prilika: problem je važan (${i}/10) a tržište ga loše rješava (zadovoljstvo ${s}/10). Tu se isplati graditi.`
        : score >= 45
          ? `Umjerena prilika: problem postoji, ali ili nije presudan ili ga alternative dijelom rješavaju (važnost ${i}, zadovoljstvo ${s}).`
          : `Slaba prilika: ili problem nije dovoljno važan ili su kupci već zadovoljni postojećim (važnost ${i}, zadovoljstvo ${s}).`;

  return {
    score,
    avg_importance: Math.round(avgImp * 10) / 10,
    avg_satisfaction: Math.round(avgSat * 10) / 10,
    verdict,
    top_problems,
    top_alternatives,
  };
}

/** LLM samo LABELIRA klastere koje je kod već izračunao (brojke ostaju iz koda). */
async function labelClusters(
  bare: Omit<EmergentCluster, 'label' | 'descriptor'>[],
  form: IdeaFormData
): Promise<EmergentCluster[]> {
  if (bare.length === 0) return [];
  const langName = form.language === 'en' ? 'English' : 'Croatian';

  const desc = bare
    .map(
      (c, i) =>
        `Cluster ${i} (${c.size_pct}% of buyers): buy ${c.intent.buy}% / maybe ${c.intent.maybe}% / reject ${c.intent.reject}%, opportunity ${c.avg_opportunity}/100, importance ${c.avg_importance}/10, satisfaction ${c.avg_satisfaction}/10. Top problem: "${c.top_problem || '—'}". Top objection: "${c.top_objection || '—'}".`
    )
    .join('\n');

  const prompt = `You are a market segmentation analyst. Below are ${bare.length} customer clusters that EMERGED from the data (computed statistically — do NOT change the numbers). Give each a sharp, human label and a one-sentence descriptor.

CLUSTERS:
${desc}

Return ONLY this JSON (write label and descriptor in ${langName}):
{ "clusters": [ ${bare.map((_, i) => `{ "id": ${i}, "label": "2-4 word name capturing what defines them", "descriptor": "1 sentence: what they care about and how they decide" }`).join(', ')} ] }
Make labels distinct and concrete (e.g. "Cjenovno osjetljivi pragmatici", "Spremni platiti, mrze kompleksnost").`;

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: 'You label customer segments. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      0.4,
      700
    );
    const parsed = parseJsonLoose<{ clusters: { id: number; label: string; descriptor: string }[] }>(raw);
    const byId = new Map((parsed?.clusters ?? []).map((c) => [c.id, c]));
    return bare.map((c, i) => ({
      ...c,
      label: byId.get(i)?.label?.trim() || (form.language === 'en' ? `Group ${i + 1}` : `Skupina ${i + 1}`),
      descriptor: byId.get(i)?.descriptor?.trim() || '',
    }));
  } catch (e) {
    console.error('Cluster labeling failed:', e);
    return bare.map((c, i) => ({
      ...c,
      label: form.language === 'en' ? `Group ${i + 1}` : `Skupina ${i + 1}`,
      descriptor: '',
    }));
  }
}

export async function runEngine(
  form: IdeaFormData,
  depth: RunDepth = 'standard',
  existingPersonas?: PersonaAttributes[]
): Promise<ValidationReport> {
  const validation = await validateIdeaContext(form);
  if (!validation.valid) {
    throw new Error(validation.reason || (form.language === 'en' ? 'Invalid idea description. Please provide more context.' : 'Opis ideje je prekratak ili nerazumljiv.'));
  }

  let personas = existingPersonas && existingPersonas.length > 0
    ? existingPersonas
    : form.segmentSpecs && form.segmentSpecs.length > 0
      ? generatePersonasForSegments(form.segmentSpecs, PER_SEGMENT[depth])
      : generatePersonas(GENERIC_COUNT[depth], form.business_model, {
          inferredCategory: form.inferred_category,
          pitch: form.elevator_pitch,
          description: `${form.detailed_description || ''} ${form.b2b2c_consumer_description || ''} ${form.b2b2c_business_description || ''}`,
          targetMarket: form.target_market,
        });

  const personaGeoAreas = form.geo_areas?.length ? form.geo_areas : form.geo_area ? [form.geo_area] : [];
  if (!existingPersonas?.length && personaGeoAreas.length > 0) {
    const geoLabels = personaGeoAreas.map((area) => area.label);
    personas = personas.map((persona, index) => ({
      ...persona,
      region: index % 5 === 0 ? `Near ${geoLabels[index % geoLabels.length]}` : geoLabels[index % geoLabels.length],
    }));
  }

  const batches: PersonaAttributes[][] = [];
  for (let i = 0; i < personas.length; i += BATCH_SIZE) {
    batches.push(personas.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(batches.map((b) => getBatchReactions(b, form)));
  const reactions = batchResults.flat();

  const count = reactions.length;
  const buyCount = reactions.filter((r) => r.decision === 'buy').length;
  const maybeCount = reactions.filter((r) => r.decision === 'maybe').length;
  const rejectCount = count - buyCount - maybeCount;

  const score = scoreFromCounts(buyCount, maybeCount, count);

  // Per-segment razrada (ako su persone taggirane segmentom)
  const segmentStats = buildSegmentStats(personas, reactions);

  // Opportunity Score (JTBD) — sve iz koda
  const opportunity = buildOpportunity(reactions, form.language === 'en' ? 'en' : 'hr');

  // Emergentni klasteri (k-means u kodu) + labeliranje LLM-om — paralelno sa sintezom
  const bareClusters = buildEmergentClusters(personas, reactions);
  const [synthesis, clusters] = await Promise.all([
    synthesize(form, reactions, personas, segmentStats),
    labelClusters(bareClusters, form),
  ]);

  let segments: AudienceSegment[] | undefined;
  if (segmentStats.length > 0) {
    const descByLabel = new Map((form.segmentSpecs ?? []).map((s) => [s.label, s.description]));
    segments = segmentStats.map((st) => {
      const v = synthesis.segment_verdicts?.find((sv) => sv.label === st.label);
      return {
        label: st.label,
        description: descByLabel.get(st.label) ?? '',
        personas_count: st.count,
        score: st.score,
        intent: st.intent,
        top_reason: v?.top_reason ?? '',
        verdict: v?.verdict ?? '',
      };
    });
  }

  return {
    meta: {
      product_name: form.product_name,
      personas_count: count,
      generated_at: new Date().toISOString(),
      disclaimer:
        'Simulirani odgovori AI persona, ne pravi korisnici. Koristi kao smjernicu, ne kao dokaz.',
    },
    score,
    summary: synthesis.summary,
    intent: {
      buy: Math.round((buyCount / count) * 100),
      maybe: Math.round((maybeCount / count) * 100),
      reject: Math.round((rejectCount / count) * 100),
    },
    confidence: normalizeConfidence(synthesis.confidence),
    target_audience: synthesis.target_audience,
    rejection: synthesis.rejection,
    top_questions: synthesis.top_questions,
    action_plan: synthesis.action_plan,
    next_experiment: normalizeNextExperiment(synthesis.next_experiment),
    segments,
    opportunity,
    clusters: clusters.length ? clusters : undefined,
    personas,
    reactions,
  };
}
