import { AGENTS } from '@/lib/agents';
import { callDeepSeek, type DeepSeekMessage } from '@/lib/deepseek';
import type { AgentId } from '@/lib/types';
import { ServerActionError } from './errors';

export interface DebateRequest {
  topic: string;
  agentAId: AgentId;
  agentBId: AgentId;
  judgeAgentId: AgentId;
  /** Zajednički kontekst projekta (KB + market digest), izgrađen na klijentu preko buildAgentContext */
  context: string;
  language: 'hr' | 'en';
}

export interface DebateResponse {
  topic: string;
  agentAId: AgentId;
  argumentA: string;
  agentBId: AgentId;
  argumentB: string;
  judgeAgentId: AgentId;
  verdict: string;
}

function personaSystemPrompt(agentId: AgentId, context: string, langName: string): string {
  const agent = AGENTS[agentId];
  return `${agent.persona}

YOUR FOCUS: ${agent.focus}

LANGUAGE: Always reply in ${langName}. Stay fully in character as ${agent.name}. Never prefix your reply with your name or a label.

PROJECT KNOWLEDGE (context on the founder's project):
${context}

SYNTHETIC EVIDENCE NOTE: Any validation score, buy/maybe/reject percentage, or persona quote in PROJECT KNOWLEDGE is a simulated AI-persona signal unless explicitly labeled as real customer data or live research. Treat it as directional, not proof.`;
}

async function askAgent(agentId: AgentId, context: string, langName: string, instruction: string, maxTokens: number, temperature: number): Promise<string> {
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: personaSystemPrompt(agentId, context, langName) },
    { role: 'user', content: instruction },
  ];
  const reply = await callDeepSeek(messages, { temperature, maxTokens });
  return reply.trim();
}

/**
 * Boardroom debata: dva savjetnika brane suprotstavljene pozicije o istoj temi
 * (svaki u svom glasu, iz svoje ekspertize), treći presuđuje. Tri uzastopna
 * DeepSeek poziva — namjerno skuplje/sporije, ovo je "deep mode" showpiece.
 */
export async function runAdvisorDebate(body: DebateRequest): Promise<DebateResponse> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new ServerActionError('DEEPSEEK_API_KEY nije postavljen.', 500, 'missing_api_key');
  }

  const agentA = AGENTS[body.agentAId];
  const agentB = AGENTS[body.agentBId];
  const judge = AGENTS[body.judgeAgentId];
  if (!agentA || !agentB || !judge) {
    throw new ServerActionError('Nepoznat savjetnik.', 400, 'unknown_agent');
  }
  if (body.agentAId === body.agentBId) {
    throw new ServerActionError('Za debatu trebaju dva različita savjetnika.', 400, 'invalid_request_body');
  }

  const topic = (body.topic || '').trim().slice(0, 400);
  if (!topic) {
    throw new ServerActionError('Nedostaje tema debate.', 400, 'invalid_request_body');
  }

  const langName = body.language === 'en' ? 'English' : 'Croatian';
  const context = body.context || '';

  const argumentA = await askAgent(
    body.agentAId,
    context,
    langName,
    `DEBATE MODE: The founder wants a real debate on this topic: "${topic}". Give YOUR strongest, most concrete recommendation or position from your own expertise. Take a clear stance — do not hedge, do not list generic pros/cons, do not ask a question. 3-5 sentences.`,
    450,
    0.7
  );

  const argumentB = await askAgent(
    body.agentBId,
    context,
    langName,
    `DEBATE MODE: The founder wants a real debate on this topic: "${topic}".\n\n${agentA.name} (${agentA.title.en}) just said:\n"""${argumentA}"""\n\nRespond as YOURSELF (${agentB.name}) with your own strongest position from YOUR expertise. Directly engage with at least one specific point ${agentA.name} made — agree where it is genuinely right, but push back hard where your expertise says otherwise. Take a clear stance, do not hedge, do not ask a question. 3-5 sentences.`,
    450,
    0.7
  );

  const verdict = await askAgent(
    body.judgeAgentId,
    context,
    langName,
    `DEBATE MODE — YOU ARE THE JUDGE, not a debater. The founder asked for a debate on: "${topic}".\n\n${agentA.name} (${agentA.title.en}) argued:\n"""${argumentA}"""\n\n${agentB.name} (${agentB.title.en}) argued:\n"""${argumentB}"""\n\nAs ${judge.name}, weigh both arguments using your own judgment and expertise. Do not just summarize both sides — make an actual call: which position (or which blend / middle path) is right for THIS founder right now, and why. End with ONE concrete next action. 4-6 sentences.`,
    600,
    0.5
  );

  return {
    topic,
    agentAId: body.agentAId,
    argumentA,
    agentBId: body.agentBId,
    argumentB,
    judgeAgentId: body.judgeAgentId,
    verdict,
  };
}
