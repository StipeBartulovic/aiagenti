import { AGENTS } from '@/lib/agents';
import { callDeepSeek, type DeepSeekMessage } from '@/lib/deepseek';
import { formatResearchForLLM, tavilySearch } from '@/lib/tavily';
import type { AgentId, ResearchSource } from '@/lib/types';
import { ServerActionError } from './errors';

interface TranscriptMsg {
  role: 'user' | 'assistant';
  agentId?: AgentId;
  content: string;
}

export interface ChatRequest {
  targetAgentId: AgentId;
  context: string;
  transcript: TranscriptMsg[];
  language: 'hr' | 'en';
  intent: 'open' | 'reply' | 'join';
  participants: AgentId[];
  deepMode?: boolean;
}

interface ResearchStatus {
  attempted: boolean;
  used: boolean;
  query?: string;
  error?: string;
}

export interface ChatResponse {
  reply: string;
  sources?: ResearchSource[];
  research?: ResearchStatus;
  response_mode: 'deep' | 'fast';
}

/** Spaja uzastopne poruke iste uloge (DeepSeek voli izmjenu user/assistant). */
function collapse(messages: DeepSeekMessage[]): DeepSeekMessage[] {
  const out: DeepSeekMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content += '\n\n' + m.content;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

function lastFounderMessage(transcript: TranscriptMsg[]) {
  return [...transcript].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
}

function explicitResearchQuery(userMessage: string, context: string): string | null {
  const text = userMessage.toLowerCase();
  const asksForResearch = /istraž|istraz|pretraž|pretraz|gugl|google|web|internet|izvor|source|research|nađ|nadji|nađi|find|lookup/.test(text);
  const researchTopic = /konkur|competitor|cijen|pricing|grant|potic|fond|funding|vc|market|trži|trzis|review|recenz|demand|potraž|potraz|regulat|zakon/.test(text);
  if (!asksForResearch && !researchTopic) return null;

  const digest = context
    .split('\n')
    .filter((line) => /product|digest|target|market|price|business|known|score|summary/i.test(line))
    .slice(0, 8)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 500);

  return `${userMessage} ${digest}`.trim().slice(0, 300);
}

export async function advisorChatAction(body: ChatRequest): Promise<ChatResponse> {
  const agent = AGENTS[body.targetAgentId];
  if (!agent) {
    throw new ServerActionError('Nepoznat agent.', 400, 'unknown_agent');
  }

  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const now = new Date().toISOString();
  const deepMode = Boolean(body.deepMode);

  const others = (body.participants || [])
    .filter((id) => id !== body.targetAgentId && AGENTS[id])
    .map((id) => `${AGENTS[id].name} (${AGENTS[id].title.en})`);

  const participantsNote = others.length
    ? `\nOTHER ADVISORS IN THE ROOM (the founder can hear all of you): ${others.join(', ')}. Their messages appear prefixed like "[Name]: ...". You may briefly build on or respectfully push back on their points, but speak ONLY as yourself (${agent.name}), and never repeat what another advisor already said.`
    : '';

  const systemPrompt = `${agent.persona}

YOUR FOCUS: ${agent.focus}

LANGUAGE: Always reply in ${langName}. Stay fully in character as ${agent.name}. Never prefix your own reply with your name.
CURRENT DATE/TIME: ${now}

PROJECT KNOWLEDGE (already gathered - this is your memory of the project):
${body.context}
${participantsNote}

SYNTHETIC EVIDENCE CONTRACT:
- Any validation score, buy/maybe/reject percentage, "purchase rate", rejection reason, persona quote, pricing signal, conjoint result, or market question in PROJECT KNOWLEDGE comes from simulated AI personas unless it is explicitly labeled as real customer data, paid sales, analytics, interviews, or live web research.
- Treat those numbers as directional signals, not proof. Say "simulated personas suggested..." / "AI validation signal..." instead of "customers clicked", "people bought", "you sold", or "your real conversion rate".
- Your job is to translate synthetic signals into practical next steps and real-world validation tests. Do not interrogate the founder as if the simulated metrics are actual sales metrics.
- You do NOT need to end every reply with a question. End with a question only when it genuinely unlocks missing context. It is often better to end with a concrete recommendation, next step, or short caution.

CRITICAL BEHAVIOR RULES:
1. The PROJECT KNOWLEDGE above is what you already know. NEVER ask about something already answered there. If info exists, acknowledge it ("You mentioned X...") and go deeper or challenge it - do NOT re-ask.
2. When raising a topic, check if knowledge already covers it; if partially, ask a sharper, more specific follow-up instead of a generic question.
3. If OPEN TASKS are listed in context, treat them as commitments already made. Do not suggest the same task again. Use CURRENT DATE/TIME and any task due dates to ask about progress when a task is stale, due, or overdue.
4. Be concise and conversational - usually 2-5 short paragraphs. Bullet points only for concrete options.
5. Do not behave like a courtroom cross-examiner. You may ask ONE focused question when needed, but many good replies should simply give advice and stop.
6. Be concrete and practical - real technologies, channels, numbers, steps. No generic fluff.
7. When your advice produces a concrete next action, you may briefly suggest that the founder can say "stavi to u task manager" / "put that in task manager" and the app will turn it into a task.
8. Stay in your lane (${agent.title.en}); if you spot a critical issue elsewhere, flag it briefly and suggest which other advisor to ask.

MEMORY USE CONTRACT:
- If KEY DECISIONS / CONSTRAINTS exist, treat them as the founder's current operating assumptions. Respect them unless you see a strong reason to challenge them.
- If RISKS TO WATCH exist, connect your advice to the most relevant risk instead of giving generic advice.
- If FOUNDER PREFERENCES exist, adapt your tone and recommendation shape to them.
- If TASK-LIKE COMMITMENTS or OPEN TASKS exist, avoid re-suggesting the same work; ask about progress or propose the next smaller step.
- When you disagree with existing memory, say exactly which assumption you are challenging and why.
- Prefer this answer shape when useful: "What I see" -> "Why it matters" -> "Next move". Add one sharp question only if a real decision is blocked.

WEB RESEARCHER ON CALL:
You have a researcher who can fetch LIVE data from the web. If a strong, credible answer needs CURRENT external facts you don't reliably know - real competitor names and their actual pricing, market size, what real users say about similar products (reviews/Reddit), search demand, country-specific regulations - do NOT guess or invent numbers. Instead reply with EXACTLY one line and NOTHING else:
RESEARCH_NEEDED: <a precise web search query, in English or ${langName}>
A researcher will return real results and you will then answer grounded in them, with sources. Use this sparingly - only when live facts would materially strengthen your answer, not for things you already know or for pure opinion/strategy.

${deepMode ? `DEEP ANSWER MODE IS ON:
- Spend more effort before answering, but do NOT reveal hidden chain-of-thought or private step-by-step reasoning.
- Give a stronger final answer: diagnose the situation, name the key assumptions, compare 2-3 viable options, state tradeoffs, pick the best next move, and give a short execution checklist.
- Use headings or bullets when they make the answer easier to act on.
- If you need a question, ask only one decision-critical question at the end. Otherwise end with the recommended next action.` : ''}`;

  const converted: DeepSeekMessage[] = (body.transcript || []).map((m) => {
    if (m.role === 'assistant' && m.agentId && m.agentId === body.targetAgentId) {
      return { role: 'assistant', content: m.content };
    }
    if (m.role === 'assistant' && m.agentId) {
      return { role: 'user', content: `[${AGENTS[m.agentId]?.name ?? 'Advisor'}]: ${m.content}` };
    }
    return { role: 'user', content: m.content };
  });

  const messages: DeepSeekMessage[] = [{ role: 'system', content: systemPrompt }, ...converted];

  if (body.intent === 'open') {
    messages.push({
      role: 'user',
      content:
        'Open the conversation: greet me briefly in character, reference ONE concrete thing you already know about my project to show you understand it, and give the most useful first take. If a key decision is blocked, ask one focused question; otherwise end with a concrete next step. Keep it short and warm. Remember all validation metrics are synthetic AI-persona signals unless explicitly real.',
    });
  } else if (body.intent === 'join') {
    messages.push({
      role: 'user',
      content:
        'You just joined this ongoing conversation. In 1 short sentence say hi from your angle, then give your single most valuable take on what has been discussed so far from your expertise. Ask a question only if it is truly needed; otherwise end with advice. Do NOT re-introduce basics other advisors already covered. Remember all validation metrics are synthetic AI-persona signals unless explicitly real.',
    });
  }

  const temperature = body.targetAgentId === 'business' ? 0.6 : 0.75;
  const answerTokenBudget = deepMode ? 1500 : 800;
  const groundedTokenBudget = deepMode ? 1700 : 900;
  const baseMessages = collapse(messages);
  const forcedQuery = explicitResearchQuery(lastFounderMessage(body.transcript || []), body.context);
  let reply = '';
  let sources: ResearchSource[] | undefined;
  let research: ResearchStatus | undefined;

  if (forcedQuery) {
    research = { attempted: true, used: false, query: forcedQuery };
    try {
      console.info('[web-research] forced Tavily search', { agent: body.targetAgentId, query: forcedQuery });
      const found = await tavilySearch(forcedQuery, { maxResults: 6, depth: 'basic' });
      if (found.results.length) {
        sources = found.results.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content.length > 220 ? r.content.slice(0, 220) + '...' : r.content,
        }));
        research.used = true;
        const groundingMessages: DeepSeekMessage[] = [
          ...baseMessages,
          {
            role: 'user',
            content: `The founder explicitly asked for research. Here are real web research results from Tavily for "${forcedQuery}":\n\n${formatResearchForLLM(found)}\n\nAnswer the founder as ${agent.name}, grounded in these results. Cite concrete findings (real names, prices, numbers, what people actually say) and reference sources inline like [1], [2]. Do NOT claim anything from sources that is not in the results. Reply in ${langName}.`,
          },
        ];
        reply = await callDeepSeek(collapse(groundingMessages), { temperature, maxTokens: groundedTokenBudget });
      } else {
        research.error = body.language === 'en' ? 'No web results found.' : 'Nema web rezultata.';
      }
    } catch (e) {
      console.error('Tavily research failed:', e);
      research.error = e instanceof Error ? e.message : 'Tavily failed';
    }
  }

  if (!reply) {
    reply = await callDeepSeek(baseMessages, { temperature, maxTokens: answerTokenBudget });
    const researchMatch = reply.match(/RESEARCH_NEEDED:\s*(.+)/i);
    if (researchMatch) {
      const query = researchMatch[1].trim().replace(/^["']|["']$/g, '').slice(0, 300);
      research = { attempted: true, used: false, query };
      try {
        console.info('[web-research] agent requested Tavily search', { agent: body.targetAgentId, query });
        const found = await tavilySearch(query, { maxResults: 6, depth: 'basic' });
        if (found.results.length) {
          sources = found.results.slice(0, 5).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content.length > 220 ? r.content.slice(0, 220) + '...' : r.content,
          }));
          research.used = true;
          const groundingMessages: DeepSeekMessage[] = [
            ...baseMessages,
            { role: 'assistant', content: reply },
            {
              role: 'user',
              content: `Here are the real web research results for "${query}":\n\n${formatResearchForLLM(found)}\n\nNow answer my previous message as ${agent.name}, grounded in these results. Cite concrete findings (real names, prices, numbers, what people actually say). Reference sources inline like [1], [2]. Do NOT output RESEARCH_NEEDED again. Reply in ${langName}.`,
            },
          ];
          reply = await callDeepSeek(collapse(groundingMessages), { temperature, maxTokens: groundedTokenBudget });
        } else {
          research.error = body.language === 'en' ? 'No web results found.' : 'Nema web rezultata.';
          reply = reply.replace(/RESEARCH_NEEDED:.*/i, '').trim() ||
            (body.language === 'en'
              ? "I couldn't find solid live data on that right now - let me give you my read instead."
              : 'Nisam našla čvrste podatke uživo za to - evo moje procjene.');
        }
      } catch (e) {
        console.error('Tavily research failed:', e);
        research.error = e instanceof Error ? e.message : 'Tavily failed';
        reply = reply.replace(/RESEARCH_NEEDED:.*/i, '').trim() ||
          (body.language === 'en'
            ? 'The web research failed, so here is my non-web take.'
            : 'Web istraživanje nije prošlo, pa evo moje procjene bez web izvora.');
      }
    }
  }

  return { reply, sources, research, response_mode: deepMode ? 'deep' : 'fast' };
}
