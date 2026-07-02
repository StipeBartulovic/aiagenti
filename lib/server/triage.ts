import { AGENT_ORDER, AGENTS } from '@/lib/agents';
import { callDeepSeek, safeParseJson, type DeepSeekMessage } from '@/lib/deepseek';
import type { AgentId } from '@/lib/types';

interface TriageMessage {
  role: 'user' | 'assistant' | 'system';
  agentId?: AgentId;
  content: string;
}

export interface TriageRequest {
  transcript: TriageMessage[];
  digest: string;
  language: 'hr' | 'en';
  lastSpeaker?: AgentId | 'user';
}

export interface Suggestion {
  agentId: AgentId;
  confidence: number;
  teaser: string;
}

export interface TriageResponse {
  suggestions: Suggestion[];
}

const substantiveHints = /\?|plan|ideja|problem|rizik|odluka|odluc|poticaj|grant|vc|fond|investic|gdpr|ugovor|porez|firma|cijena|pricing|prodaj|kupac|kanal|marketing|oglas|seo|konkurenc|tehnolog|stack|api|auth|baza|sigurn|task|sljede|next|strategy|sales|legal|market/i;

function latestFounderMessage(transcript: TriageRequest['transcript']): string {
  return [...(transcript ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';
}

function fallbackSuggestions(text: string, language: 'hr' | 'en'): Suggestion[] {
  const lower = text.toLowerCase();
  const items: Suggestion[] = [];
  const add = (agentId: AgentId, confidence: number, hr: string, en: string) => {
    if (items.some((item) => item.agentId === agentId)) return;
    items.push({ agentId, confidence, teaser: language === 'en' ? en : hr });
  };

  if (/gdpr|ugovor|privacy|terms|porez|pdv|firma|doo|d\.o\.o|obrt|prav|legal|compliance/.test(lower)) {
    add('legal', 0.9, 'Pravni rizici i koraci', 'Legal risks and steps');
  }
  if (/stack|api|auth|firebase|baza|database|server|sigurn|security|tehnolog|app|bug|mapa|integrac/.test(lower)) {
    add('tech', 0.88, 'Tehnicki put i rizici', 'Technical path and risks');
  }
  if (/vc|fond|investic|poticaj|grant|subvenc|unit economics|model|marž|marz|cijena|pricing|roi|strateg|milestone/.test(lower)) {
    add('business', 0.9, 'Biznis odluka i fokus', 'Business decision and focus');
  }
  if (/oglas|marketing|meta|google|tiktok|seo|landing|kampanj|brand|pozicion|growth/.test(lower)) {
    add('marketing', 0.86, 'Kanal i poruka', 'Channel and message');
  }
  if (/prodaj|sales|cold|demo|lead|pipeline|outreach|kupac|objection|prigovor|zatvar/.test(lower)) {
    add('sales', 0.86, 'Prodajni sljedeci korak', 'Sales next step');
  }
  if (/distribuc|community|newsletter|creator|reddit|linkedin|publik|audience|kanal|pažnj|paznj|search demand/.test(lower)) {
    add('distribution', 0.84, 'Gdje je paznja', 'Where attention lives');
  }

  if (!items.length && substantiveHints.test(text)) {
    add('business', 0.7, 'Fokus i sljedeci potez', 'Focus and next move');
  }

  return items.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

export async function triageAdvisorsAction(body: TriageRequest): Promise<TriageResponse> {
  try {
    const langName = body.language === 'en' ? 'English' : 'Croatian';
    const latestFounder = latestFounderMessage(body.transcript);

    const roster = AGENT_ORDER.map(
      (id) => `- ${id} = ${AGENTS[id].name} (${AGENTS[id].title.en}): ${AGENTS[id].focus}`
    ).join('\n');

    const convo = body.transcript
      .filter((m) => m.role !== 'system')
      .slice(-12)
      .map((m) => {
        if (m.role === 'user') return `FOUNDER: ${m.content}`;
        const name = m.agentId ? AGENTS[m.agentId]?.name : 'Advisor';
        return `${name}: ${m.content}`;
      })
      .join('\n');

    const systemPrompt = `You are the SILENT moderator of a founder's advisory panel. Five advisors are present and listening:
${roster}

The single most relevant advisor will respond FIRST (automatically). The others you list become OPTIONAL "add-on" suggestions the founder can tap for more. Your job: rank who should weigh in on the founder's LATEST message, by how much genuine, specific value they'd add.

RULES:
- Sort by value, MOST VALUABLE FIRST - the first entry is the lead responder.
- For ANY message with real content - an idea, plan, update, decision, or question - you MUST return at least the single most relevant advisor. Silence on a substantive message is a FAILURE.
- If the founder asks a question or asks for opinions/feedback ("sto mislite", "ima li tko sto reci", "what do you think"), you MUST return at least one advisor.
- Return an EMPTY list ONLY for contentless small-talk or acknowledgments ("ok", "hvala", "super", "pozdrav").
- Do NOT force everyone in - list only advisors with a genuinely DISTINCT, valuable angle (usually 1-3). Never generic encouragement or "it depends".
- Pick the advisor whose expertise best matches the message as the lead. Don't list the one who just spoke unless reacting to a genuinely NEW point.
- confidence 0.0-1.0 = how much value they'd add.

ROUTING HINTS:
- grants, incentives, VC, fundraising, business model, unit economics, pricing, ROI, focus, milestones -> business first; legal only if compliance/tax/eligibility is central.
- GDPR, company setup, contracts, tax/VAT, privacy, IP, jurisdiction -> legal first.
- stack, build plan, API, auth, database, security, integrations, bugs -> tech first.
- ads, landing page, positioning, SEO, growth campaigns, content -> marketing first.
- outreach, demos, buyer objections, pipeline, closing, B2B conversations -> sales first.
- communities, newsletters, creators, Reddit/LinkedIn groups, search demand, attention pools -> distribution first.

PROJECT CONTEXT: ${body.digest || '(little known yet)'}

LATEST FOUNDER MESSAGE:
${latestFounder || '(none)'}

CONVERSATION (most recent last):
${convo || '(empty)'}

Last speaker: ${body.lastSpeaker || 'unknown'}

Return ONLY this JSON:
{ "suggestions": [ { "agentId": "business|tech|marketing|legal|sales|distribution", "confidence": 0.0, "teaser": "<= 8 words, in ${langName}, what they'd add" } ] }
Sort by confidence descending (first = lead responder). Empty array ONLY for contentless small-talk.`;

    const messages: DeepSeekMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Who, if anyone, should speak now? Return the JSON.' },
    ];

    const raw = await callDeepSeek(messages, { temperature: 0.2, maxTokens: 300, json: true });
    const parsed = safeParseJson<{ suggestions: Suggestion[] }>(raw);

    const suggestions = (parsed?.suggestions ?? [])
      .filter((s) => AGENTS[s.agentId] && typeof s.confidence === 'number')
      .sort((a, b) => b.confidence - a.confidence);

    const fallback = suggestions.length ? [] : fallbackSuggestions(latestFounder, body.language);
    return { suggestions: suggestions.length ? suggestions : fallback };
  } catch (err) {
    console.error('Triage error:', err);
    return { suggestions: [] };
  }
}
