import { computeConjoint, generateDesign, type ChoiceRow } from '@/lib/conjoint';
import { callDeepSeek, safeParseJson } from '@/lib/deepseek';
import { summarizePersonaContext } from '@/lib/persona-context';
import type { ConjointAnalysis, ConjointAttribute, IdeaFormData, PersonaAttributes, PersonaReaction } from '@/lib/types';
import { ServerActionError } from './errors';

const NUM_TASKS = 7;
const PROFILES_PER_TASK = 3;
const MAX_PERSONAS = 36;
const BATCH = 12;

export interface ConjointRequest {
  idea: IdeaFormData;
  personas?: PersonaAttributes[];
  reactions?: PersonaReaction[];
  language: 'hr' | 'en';
}

export interface ConjointResponse {
  conjoint: ConjointAnalysis;
}

function selectConjointPersonas(
  idea: IdeaFormData,
  personas: PersonaAttributes[],
  language: 'hr' | 'en',
  reactions?: PersonaReaction[]
): { personas: PersonaAttributes[]; sampleLabel: string } {
  const side = idea.business_model === 'B2B2C' ? 'payer' : 'any';
  const compressedIds = summarizePersonaContext(personas, reactions, { marketSide: side, maxPersonas: MAX_PERSONAS })
    ?.representativePersonas.map((persona) => persona.id);
  if (compressedIds?.length) {
    const byId = new Map(personas.map((persona) => [persona.id, persona]));
    const selected = compressedIds.map((id) => byId.get(id)).filter((persona): persona is PersonaAttributes => Boolean(persona));
    if (selected.length >= 8 || idea.business_model !== 'B2B2C') {
      return {
        personas: selected,
        sampleLabel: idea.business_model === 'B2B2C'
          ? language === 'en' ? 'representative business-side payers' : 'reprezentativni biznis platiše'
          : language === 'en' ? 'representative tested buyers' : 'reprezentativni testirani kupci',
      };
    }
  }

  if (idea.business_model !== 'B2B2C') {
    return {
      personas,
      sampleLabel: language === 'en' ? 'all tested buyers' : 'svi testirani kupci',
    };
  }

  const payers = personas.filter((p) => p.market_side === 'payer' || p.market_side === 'partner' || p.market_side === 'both');
  return {
    personas: payers.length >= 8 ? payers : personas,
    sampleLabel: language === 'en' ? 'business-side payers only' : 'samo biznis strana / platiše',
  };
}

async function proposeAttributes(idea: IdeaFormData, langName: string): Promise<ConjointAttribute[]> {
  const description = idea.business_model === 'B2B2C'
    ? `B2C demand-side description: ${idea.b2b2c_consumer_description || '(missing)'}\nB2B payer/partner description: ${idea.b2b2c_business_description || '(missing)'}`
    : `DETAILS: ${idea.detailed_description || '(missing)'}`;

  const prompt = `You are a product strategist designing a choice-based conjoint study for this product.

PRODUCT: "${idea.product_name}" — ${idea.elevator_pitch}
CURRENT PRICE: ${idea.price_model}
${description}
${idea.business_model === 'B2B2C' ? 'This conjoint is for the business-side payer/partner package. Include attributes that a paying business would actually trade off: lead quality, geographic exclusivity, commission/subscription, analytics, integrations, guarantees, onboarding, or similar if relevant.' : ''}

Define 3-4 decision ATTRIBUTES buyers trade off, each with 2-3 concrete LEVELS. One attribute MUST be price with 3 realistic levels around the current price (cheaper / current / premium). The others must be the most decision-relevant, concrete product attributes (e.g. feature tier, support, key capability, billing) — NOT vague ones.

Return ONLY this JSON (write names and levels in ${langName}):
{ "attributes": [ { "name": "attribute name", "levels": ["level a", "level b", "level c"] } ] }
Keep level texts short (max ~24 chars). Make levels genuinely different so trade-offs are meaningful.`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You design conjoint studies. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.4, maxTokens: 600, json: true }
  );

  const parsed = safeParseJson<{ attributes: ConjointAttribute[] }>(raw);
  const cleaned = (parsed?.attributes ?? [])
    .filter((a) => a && a.name && Array.isArray(a.levels))
    .map((a) => ({
      name: String(a.name).trim().slice(0, 40),
      levels: a.levels
        .map((l) => String(l).trim().slice(0, 30))
        .filter(Boolean)
        .slice(0, 3),
    }))
    .filter((a) => a.levels.length >= 2)
    .slice(0, 4);
  return cleaned;
}

function formatTasks(attributes: ConjointAttribute[], tasks: number[][][]): string {
  return tasks
    .map((profiles, t) => {
      const lines = profiles.map(
        (prof, pi) => `  [${pi}] ${prof.map((lvl, ai) => `${attributes[ai].name}: ${attributes[ai].levels[lvl]}`).join(' | ')}`
      );
      return `TASK ${t + 1}:\n${lines.join('\n')}`;
    })
    .join('\n');
}

async function getBatchChoices(
  personas: PersonaAttributes[],
  attributes: ConjointAttribute[],
  tasks: number[][][],
  tasksText: string,
  langName: string
): Promise<ChoiceRow[]> {
  const slim = personas.map((p) => ({
    id: p.id,
    age: p.age,
    role: p.role,
    income: p.income,
    type: p.buyer_type,
    market_side: p.market_side ?? 'both',
    disposition: p.disposition ?? 'open',
    values: p.values ?? [],
  }));

  const prompt = `Choice-based conjoint simulation. Each persona must CHOOSE one option per task — a forced trade-off, like a real buyer comparing packages. Choose based on their income, values, and disposition. They may pick "-1" (none) ONLY if every option is genuinely unacceptable to them.

ATTRIBUTES & THE ${tasks.length} TASKS (same for every persona):
${tasksText}

PERSONAS:
${JSON.stringify(slim)}

For each persona, return their chosen option index (0..${PROFILES_PER_TASK - 1}, or -1) for each of the ${tasks.length} tasks IN ORDER.
Return ONLY this JSON (${langName} not needed, just numbers):
{ "choices": [ { "id": number, "picks": [${tasks.map(() => 'n').join(', ')}] } ] }`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: 'You simulate realistic buyer choices. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.7, maxTokens: 2000, json: true }
  );

  const parsed = safeParseJson<{ choices: { id: number; picks: number[] }[] }>(raw);
  return (parsed?.choices ?? [])
    .filter((c) => Array.isArray(c.picks))
    .map((c) => ({ picks: c.picks.map((n) => (typeof n === 'number' ? n : -1)).slice(0, tasks.length) }));
}

function buildVerdict(conjoint: ConjointAnalysis, language: 'hr' | 'en'): string {
  const sorted = [...conjoint.attributes].sort((a, b) => b.importance - a.importance);
  const top = sorted[0];
  const price = conjoint.attributes.find((a) => /cijen|price|cost|€|\$/i.test(a.name));
  const combo = conjoint.winning_combo.map((c) => `${c.attribute}: ${c.level}`).join(', ');

  if (language === 'en') {
    const priceNote = price
      ? ` Price weighs ${price.importance}% — ${price.importance >= 35 ? 'buyers are price-led, lead with value-for-money' : 'buyers care more about the offering than the exact price'}.`
      : '';
    return `Buyers care most about "${top.name}" (${top.importance}% of the decision).${priceNote} Best-received package: ${combo}.`;
  }
  const priceNote = price
    ? ` Cijena nosi ${price.importance}% — ${price.importance >= 35 ? 'kupci su vođeni cijenom, naglasi vrijednost za novac' : 'kupcima je ponuda važnija od točne cijene'}.`
    : '';
  return `Kupcima je najvažniji "${top.name}" (${top.importance}% odluke).${priceNote} Najbolje primljen paket: ${combo}.`;
}

export async function analyzeConjoint(body: ConjointRequest): Promise<ConjointResponse> {
  const { idea } = body;
  if (!idea) {
    throw new ServerActionError('Nedostaje idea.', 400, 'missing_idea');
  }
  const langName = body.language === 'en' ? 'English' : 'Croatian';

  const attributes = await proposeAttributes(idea, langName);
  if (attributes.length < 2) {
    throw new ServerActionError('Nije moguće definirati atribute za conjoint.', 422, 'conjoint_attributes_failed');
  }

  const tasks = generateDesign(attributes, NUM_TASKS, PROFILES_PER_TASK);
  const tasksText = formatTasks(attributes, tasks);

  const selected = selectConjointPersonas(idea, body.personas ?? [], body.language === 'en' ? 'en' : 'hr', body.reactions);
  const personas = selected.personas.slice(0, MAX_PERSONAS);
  if (personas.length < 8) {
    throw new ServerActionError('Premalo persona za conjoint (pokreni test ponovno).', 422, 'insufficient_conjoint_personas');
  }

  const batches: PersonaAttributes[][] = [];
  for (let i = 0; i < personas.length; i += BATCH) batches.push(personas.slice(i, i + BATCH));

  const results = await Promise.all(
    batches.map((b) => getBatchChoices(b, attributes, tasks, tasksText, langName))
  );
  const choices = results.flat();

  const conjoint = computeConjoint(attributes, tasks, choices, choices.length);
  conjoint.sample_label = selected.sampleLabel;
  conjoint.verdict = buildVerdict(conjoint, body.language === 'en' ? 'en' : 'hr');

  return { conjoint };
}
