'use client';

import { useEffect, useRef, useState } from 'react';
import { AGENTS, AGENT_ORDER } from '@/lib/agents';
import { aiClient } from '@/lib/ai-client';
import { buildAgentContext } from '@/lib/knowledge';
import { buildMarketDigest } from '@/lib/market-digest';
import Boardroom from './Boardroom';
import KnowledgePanel from './KnowledgePanel';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type { AgentId, ChatMessage, MarketIntelligence, ProjectKnowledge, ProjectTask, ResearchSource, SessionDigest } from '@/lib/types';

interface Suggestion {
  agentId: AgentId;
  confidence: number;
  teaser: string;
}

interface Props {
  language: 'hr' | 'en';
  knowledge: ProjectKnowledge;
  market?: MarketIntelligence | null;
  initialMessages: ChatMessage[];
  initialTasks: ProjectTask[];
  initialDigests: SessionDigest[];
  initialInput?: string;
  onPersistPanel: (messages: ChatMessage[]) => void;
  onKnowledgeUpdate: (knowledge: ProjectKnowledge) => void;
  onPersistTasks: (tasks: ProjectTask[]) => void;
  onPersistDigests: (digests: SessionDigest[]) => void;
}

const CHIP_THRESHOLD = 0.45; // donji prag da se "ostali" prikažu kao opcionalni chipovi
const MAX_SUGGESTIONS = 2;
const OPENER: AgentId = 'business';
const PRIMARY_ADVISOR_MODES = [
  { key: 'research', agentId: 'sales' as AgentId },
  { key: 'positioning', agentId: 'marketing' as AgentId },
] as const;

// Poruka koja TRAŽI odgovor (pitanje/zahtjev za mišljenjem) ili je očito sadržajna
const REQUEST_HINTS = /\?|što misli|sto misli|što kaže|sto kaze|ima li (t)?ko|recite|reci |mišljenj|misljenj|savjet|predlož|predloz|what do you|thoughts|advice|feedback|should i|helo|hello|hej|tu si|dal smo tu|are you there|ping/i;
const looksSubstantive = (text: string) => text.trim().length > 140 || REQUEST_HINTS.test(text);
const TASK_HINTS = /task manager|task menad|task maker|trello|stavi (to|ovo)|dodaj (to|ovo)|napravi task|zapiši task|zapisi task|add (that|this).*task|put (that|this).*task|make (that|this).*task/i;

const DIRECT_AGENT_ALIASES: Record<AgentId, string[]> = {
  business: ['viktor', 'biznis', 'mentor'],
  tech: ['marko', 'cto', 'tehnicki', 'tehnički', 'developer'],
  marketing: ['lana', 'marketing', 'growth', 'marketer'],
  legal: ['ivana', 'pravnik', 'pravnica', 'legal'],
  sales: ['zvonko', 'sales', 'prodaja'],
  distribution: ['mare', 'distribucija', 'distribution'],
};

export default function PanelChat({
  language,
  knowledge,
  market,
  initialMessages,
  initialTasks,
  initialDigests,
  initialInput,
  onPersistPanel,
  onKnowledgeUpdate,
  onPersistTasks,
  onPersistDigests,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [digests, setDigests] = useState<SessionDigest[]>(initialDigests);
  const [input, setInput] = useState(initialInput ?? '');
  const [thinkingAgent, setThinkingAgent] = useState<AgentId | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [kbUpdating, setKbUpdating] = useState(false);
  const [buildingDigest, setBuildingDigest] = useState(false);
  const [debateOpen, setDebateOpen] = useState(false);
  const [debateTopic, setDebateTopic] = useState('');
  const [debateAgentA, setDebateAgentA] = useState<AgentId>('sales');
  const [debateAgentB, setDebateAgentB] = useState<AgentId>('marketing');
  const [debating, setDebating] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'chat' | 'plan' | 'digests'>('chat');
  const [mobileView, setMobileView] = useState<'chat' | 'plan' | 'tasks' | 'digests'>('chat');
  const [deepMode, setDeepMode] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const knowledgeRef = useRef(knowledge);
  const marketRef = useRef(market);

  const t = {
    hr: {
      placeholder: 'Napiši što razmišljaš...  ( / da pozoveš određenog savjetnika )',
      slashHint: 'Pozovi savjetnika da se javi',
      primaryModesTitle: 'Kreni od ovoga',
      primaryModesHelp: 'Za MVP koristi ova 2 smjera. Ostale savjetnike pozovi samo ako zapnes na pravnom, tehnickom ili sirem biznis pitanju.',
      primaryResearch: 'Research savjetnik',
      primaryResearchHint: 'Interview pitanja, koga pitati i kako doci do prvog stvarnog signala.',
      primaryPositioning: 'Positioning savjetnik',
      primaryPositioningHint: 'Pitch, headline, prva poruka i koji kanal prvo testirati.',
      rosterHint: 'Ostali specijalisti su i dalje dostupni po potrebi.',
      send: 'Pošalji',
      updating: 'Ažuriram biznis plan...',
      listening: 'slušaju te',
      checking: 'provjeravam tko ima što za reći...',
      wantsToSpeak: 'se javlja',
      tabChat: '💬 Razgovor',
      tabPlan: '📋 Biznis plan',
      tasksTitle: 'Task manager',
      tasksEmpty: 'Nema otvorenih taskova.',
      tasksDone: 'Gotovo',
      tasksOpen: 'Otvori',
      tasksCreating: 'Radim task iz razgovora...',
      priority: 'Prioritet',
      due: 'Rok',
      source: 'Iz razgovora',
      error: 'Greška u komunikaciji. Pokušaj ponovno.',
      tokenError: (cost: number, missing: number) => tokenShortfallMessage('hr', 'Odgovor savjetnika', cost, missing),
      panelTitle: 'Tvoj savjetnički panel',
      boardroomHint: 'Panel te sluša. Podignuta ruka = netko ima što reći — klikni ga i daj mu riječ.',
      deepMode: 'Dublji odgovor',
      deepModeHint: 'Skuplje, sporije, ali detaljnije',
      deepBadge: 'Dublji odgovor',
      marketGroundedBadge: 'Iz tvog istraživanja tržišta',
      marketGroundedHint: 'Ovaj odgovor spominje stvarnog konkurenta iz tvog spremljenog istraživanja tržišta, ne izmišljenu procjenu.',
      tabDigests: '🗂️ Zapisnici',
      buildDigest: 'Zaključi sesiju',
      buildingDigest: 'Pravim zapisnik...',
      digestNothingNew: 'Nema novih poruka od zadnjeg zapisnika.',
      digestsEmpty: 'Još nema zapisnika. Klikni "Zaključi sesiju" iznad razgovora kad želiš sažeti dosadašnji dogovor u trajni zapis.',
      digestsHint: 'Svaki zapisnik sažima razgovor od prošlog zapisnika: što je odlučeno, što je otvoreno i koje su akcije otišle u task manager.',
      digestDecisions: 'Odluke',
      digestQuestions: 'Otvorena pitanja',
      digestActions: 'Akcije → task manager',
      digestActionsAdded: (n: number) => `${n} ${n === 1 ? 'akcija dodana' : 'akcije dodano'} u task manager.`,
      digestNoActions: 'Nema konkretnih akcija iz ove sesije.',
      digestMessageCount: (n: number) => `${n} poruka`,
      debateButton: 'Debata',
      debateTitle: 'Pokreni boardroom debatu',
      debateHelp: 'Dva savjetnika brane suprotstavljene pozicije o istoj temi, treći presuđuje. Sporije i skuplje — pravi showpiece kad ti treba stvarna odluka, ne još jedno mišljenje.',
      debateTopicLabel: 'Tema debate',
      debateTopicPlaceholder: 'npr. Trebamo li dizati cijenu na 39€?',
      debateAgentALabel: 'Prvi savjetnik',
      debateAgentBLabel: 'Drugi savjetnik',
      debateJudgeLabel: (name: string) => `Sudac: ${name}`,
      debateStart: (cost: number) => `Pokreni debatu (${cost} tokena)`,
      debateRunning: 'Debata u tijeku...',
      debateCancel: 'Odustani',
      debateSameAgentError: 'Odaberi dva različita savjetnika.',
      debateHeader: (topic: string) => `🎭 Debata: ${topic}`,
      debateVerdictBadge: '⚖️ Verdikt',
    },
    en: {
      placeholder: "Type what you're thinking...  ( / to call a specific advisor )",
      slashHint: 'Call an advisor to weigh in',
      primaryModesTitle: 'Start here',
      primaryModesHelp: 'For the MVP, start with these 2 paths. Bring in the other specialists only when you hit a legal, technical, or broader business blocker.',
      primaryResearch: 'Research advisor',
      primaryResearchHint: 'Interview questions, who to ask, and how to get a first real-world signal.',
      primaryPositioning: 'Positioning advisor',
      primaryPositioningHint: 'Pitch, headline, first outreach message, and which channel to test first.',
      rosterHint: 'Other specialists are still available when needed.',
      send: 'Send',
      updating: 'Updating business plan...',
      listening: 'listening',
      checking: 'checking who has something to say...',
      wantsToSpeak: 'wants to add',
      tabChat: '💬 Chat',
      tabPlan: '📋 Business plan',
      tasksTitle: 'Task manager',
      tasksEmpty: 'No open tasks.',
      tasksDone: 'Done',
      tasksOpen: 'Reopen',
      tasksCreating: 'Creating task from chat...',
      priority: 'Priority',
      due: 'Due',
      source: 'From chat',
      error: 'Communication error. Try again.',
      tokenError: (cost: number, missing: number) => tokenShortfallMessage('en', 'Advisor answer', cost, missing),
      panelTitle: 'Your advisory panel',
      boardroomHint: 'The panel is listening. A raised hand means someone has something to say — click them to give the floor.',
      deepMode: 'Deep answer',
      deepModeHint: 'More tokens, slower, more detailed',
      deepBadge: 'Deep answer',
      marketGroundedBadge: 'From your market research',
      marketGroundedHint: 'This answer references a real competitor from your saved market research, not an invented guess.',
      tabDigests: '🗂️ Session logs',
      buildDigest: 'Wrap up session',
      buildingDigest: 'Building session log...',
      digestNothingNew: 'No new messages since the last session log.',
      digestsEmpty: 'No session logs yet. Click "Wrap up session" above the chat to pin a summary of what has been agreed so far.',
      digestsHint: 'Each log summarizes the conversation since the previous log: what was decided, what is still open, and which actions went to the task manager.',
      digestDecisions: 'Decisions',
      digestQuestions: 'Open questions',
      digestActions: 'Actions → task manager',
      digestActionsAdded: (n: number) => `${n} ${n === 1 ? 'action' : 'actions'} added to the task manager.`,
      digestNoActions: 'No concrete actions came out of this session.',
      digestMessageCount: (n: number) => `${n} messages`,
      debateButton: 'Debate',
      debateTitle: 'Start a boardroom debate',
      debateHelp: 'Two advisors defend opposing positions on the same topic, a third one judges. Slower and pricier — a real showpiece for when you need an actual decision, not one more opinion.',
      debateTopicLabel: 'Debate topic',
      debateTopicPlaceholder: 'e.g. Should we raise the price to €39?',
      debateAgentALabel: 'First advisor',
      debateAgentBLabel: 'Second advisor',
      debateJudgeLabel: (name: string) => `Judge: ${name}`,
      debateStart: (cost: number) => `Start debate (${cost} tokens)`,
      debateRunning: 'Debate in progress...',
      debateCancel: 'Cancel',
      debateSameAgentError: 'Pick two different advisors.',
      debateHeader: (topic: string) => `🎭 Debate: ${topic}`,
      debateVerdictBadge: '⚖️ Verdict',
    },
  }[language];

  useEffect(() => {
    knowledgeRef.current = knowledge;
  }, [knowledge]);

  useEffect(() => {
    marketRef.current = market;
  }, [market]);

  const taskContext = tasks
    .filter((task) => task.status === 'open')
    .slice(0, 12)
    .map((task) => {
      const owner = task.owner_agent ? AGENTS[task.owner_agent]?.name : '';
      const due = task.due_at ? ` due ${task.due_at}` : '';
      return `- ${task.title}${owner ? ` (${owner})` : ''}${due}: ${task.details}`;
    })
    .join('\n');

  useEffect(() => {
    if (tab === 'chat') {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, thinkingAgent, tab]);

  const buildTranscript = (msgs: ChatMessage[]) =>
    msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', agentId: m.agentId, content: m.content }));

  const findDirectAgentMention = (text: string): AgentId | null => {
    const normalized = text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    for (const id of AGENT_ORDER) {
      const aliases = DIRECT_AGENT_ALIASES[id].map((alias) =>
        alias
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      );
      if (aliases.some((alias) => new RegExp(`^@?${alias}(\\b|[,.:;\\-\\s])`).test(normalized))) {
        return id;
      }
    }
    return null;
  };

  const callAgent = async (
    agentId: AgentId,
    transcript: ReturnType<typeof buildTranscript>,
    intent: 'open' | 'reply' | 'join',
    useDeepMode = false
  ): Promise<{ reply: string; sources?: ResearchSource[]; research?: ChatMessage['research']; response_mode?: ChatMessage['response_mode']; market_grounded?: string[] } | null> => {
    try {
      if (intent !== 'open') {
        const cost = useDeepMode ? TOKEN_COSTS.advisor_deep : TOKEN_COSTS.advisor_fast;
        const spent = spendTokens(cost, useDeepMode ? `${AGENTS[agentId].name} (dublji odgovor)` : AGENTS[agentId].name);
        if (!spent.ok) {
          setError(t.tokenError(cost, spent.missing));
          return null;
        }
      }
      const currentMarket = marketRef.current;
      const marketDigest = currentMarket ? buildMarketDigest(currentMarket) : undefined;
      const marketCompetitorNames = currentMarket?.competitors.slice(0, 12).map((c) => c.name);
      const data = await aiClient.advisorChat<{
        reply: string;
        sources?: ResearchSource[];
        research?: ChatMessage['research'];
        response_mode?: ChatMessage['response_mode'];
        market_grounded?: string[];
      }>({
          targetAgentId: agentId,
          context: `${buildAgentContext(knowledgeRef.current, AGENTS[agentId].section, marketDigest)}${taskContext ? `\n\nOPEN TASKS THE FOUNDER HAS ALREADY AGREED TO:\n${taskContext}\nUse these as memory. Do not repeat them as new suggestions unless you are asking for progress or proposing the next step.` : ''}`,
          transcript,
          language,
          intent,
          participants: AGENT_ORDER,
          deepMode: useDeepMode,
          marketCompetitorNames,
        }, t.error);
      return {
        reply: data.reply as string,
        sources: data.sources as ResearchSource[] | undefined,
        research: data.research as ChatMessage['research'] | undefined,
        response_mode: data.response_mode as ChatMessage['response_mode'] | undefined,
        market_grounded: data.market_grounded as string[] | undefined,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
      return null;
    }
  };

  // Vrati rangiranu listu savjetnika (najvrjedniji prvi); ne dira chipove, samo 'triaging' indikator
  const fetchTriage = async (
    msgs: ChatMessage[],
    lastSpeaker: AgentId | 'user'
  ): Promise<Suggestion[]> => {
    setTriaging(true);
    try {
      const data = await aiClient.triageAdvisors<{ suggestions?: Suggestion[] }>({
          transcript: buildTranscript(msgs),
          digest: knowledgeRef.current.digest,
          language,
          lastSpeaker,
        });
      return ((data.suggestions ?? []) as Suggestion[])
        .filter((s) => s.agentId !== lastSpeaker)
        .sort((a, b) => b.confidence - a.confidence);
    } catch {
      return [];
    } finally {
      setTriaging(false);
    }
  };

  // Nakon što netko progovori: ostali se mogu OPCIONALNO nadovezati (chipovi)
  const showAddOnChips = async (msgs: ChatMessage[], lastSpeaker: AgentId) => {
    const sugg = await fetchTriage(msgs, lastSpeaker);
    setSuggestions(sugg.filter((s) => s.confidence >= CHIP_THRESHOLD).slice(0, MAX_SUGGESTIONS));
  };

  // Na korisnikovu poruku: NAJVRJEDNIJI savjetnik odgovara ODMAH; ostali postaju opcija.
  // Tišina samo na čisti small-talk (triage prazan I poruka nije sadržajna/pitanje).
  const respondToUser = async (msgs: ChatMessage[]) => {
    const sugg = await fetchTriage(msgs, 'user');
    if (sugg.length > 0) {
      void speak(sugg[0].agentId, msgs);
    } else if (looksSubstantive(msgs[msgs.length - 1]?.content || '')) {
      void speak(OPENER, msgs); // nikad mrtva tišina na konkretnu poruku/pitanje
    } else {
      setSuggestions([]);
    }
  };

  const runBackgroundExtract = async (userMessage: string, assistantMessage = '', agentId?: AgentId) => {
    const spent = spendTokens(TOKEN_COSTS.advisor_memory, 'Memorija projekta');
    if (!spent.ok) return;
    setKbUpdating(true);
    try {
      const data = await aiClient.updateKnowledge<{ knowledge?: ProjectKnowledge; changed?: boolean }>(
        { mode: 'extract', knowledge: knowledgeRef.current, userMessage, assistantMessage, agentId }
      );
      if (data.knowledge && data.changed) onKnowledgeUpdate(data.knowledge);
    } catch {
      /* tiho */
    } finally {
      setKbUpdating(false);
    }
  };

  const persistTasks = (nextTasks: ProjectTask[]) => {
    setTasks(nextTasks);
    onPersistTasks(nextTasks);
  };

  const createTaskFromConversation = async (userRequest: string, baseMessages: ChatMessage[]) => {
    const spent = spendTokens(TOKEN_COSTS.advisor_task, 'Novi task');
    if (!spent.ok) {
      setError(t.tokenError(TOKEN_COSTS.advisor_task, spent.missing));
      return;
    }
    setCreatingTask(true);
    try {
      const data = await aiClient.createTask<{ task: ProjectTask }>({
          transcript: baseMessages,
          userRequest,
          language,
          existingTasks: tasks,
        }, t.error);
      const task = data.task as ProjectTask;
      persistTasks([task, ...tasks]);
      const systemMsg: ChatMessage = {
        role: 'system',
        content: language === 'en' ? `Added task: ${task.title}` : `Dodan task: ${task.title}`,
        ts: new Date().toISOString(),
      };
      const next = [...baseMessages, systemMsg];
      setMessages(next);
      onPersistPanel(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setCreatingTask(false);
    }
  };

  const toggleTask = (taskId: string) => {
    const next = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: task.status === 'done' ? 'open' as const : 'done' as const,
            updated_at: new Date().toISOString(),
          }
        : task
    );
    persistTasks(next);
  };

  const persistDigests = (nextDigests: SessionDigest[]) => {
    setDigests(nextDigests);
    onPersistDigests(nextDigests);
  };

  const lastDigestAt = digests[0]?.created_at ?? null;
  const messagesSinceDigest = messages.filter((m) => m.role !== 'system' && (!lastDigestAt || m.ts > lastDigestAt));
  const hasNewSinceDigest = messagesSinceDigest.length >= 2;

  const handleBuildDigest = async () => {
    if (buildingDigest || busy || !hasNewSinceDigest) return;
    setError('');
    const spent = spendTokens(TOKEN_COSTS.session_digest, 'Zapisnik sesije');
    if (!spent.ok) {
      setError(t.tokenError(TOKEN_COSTS.session_digest, spent.missing));
      return;
    }
    setBuildingDigest(true);
    try {
      const data = await aiClient.buildSessionDigest<{ digest: SessionDigest }>(
        {
          transcript: buildTranscript(messagesSinceDigest),
          language,
          existingTasks: tasks,
        },
        t.error
      );
      const digest = data.digest as SessionDigest;
      persistDigests([digest, ...digests]);

      if (digest.actions.length > 0) {
        const ts = new Date().toISOString();
        const newTasks: ProjectTask[] = digest.actions.map((action, i) => ({
          id: `task_digest_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          title: action.title,
          details: action.details,
          owner_agent: action.owner_agent,
          source_summary: digest.summary,
          status: 'open',
          priority: action.priority,
          due_at: null,
          created_at: ts,
          updated_at: ts,
        }));
        persistTasks([...newTasks, ...tasks]);
      }

      const systemMsg: ChatMessage = {
        role: 'system',
        content: language === 'en'
          ? `Session log saved. ${t.digestActionsAdded(digest.actions.length)}`
          : `Zapisnik sesije spremljen. ${t.digestActionsAdded(digest.actions.length)}`,
        ts: new Date().toISOString(),
      };
      const nextMsgs = [...messages, systemMsg];
      setMessages(nextMsgs);
      onPersistPanel(nextMsgs);

      setTab('digests');
      setMobileView('digests');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBuildingDigest(false);
    }
  };

  const debateJudge: AgentId = AGENT_ORDER.find((id) => id !== debateAgentA && id !== debateAgentB) ?? OPENER;

  const openDebatePicker = () => {
    if (!debateTopic.trim()) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      if (lastUser) setDebateTopic(lastUser.slice(0, 300));
    }
    setDebateOpen(true);
  };

  const handleRunDebate = async () => {
    const topic = debateTopic.trim();
    if (!topic || debating || busy) return;
    if (debateAgentA === debateAgentB) {
      setError(t.debateSameAgentError);
      return;
    }
    setError('');
    const spent = spendTokens(TOKEN_COSTS.advisor_debate, language === 'en' ? 'Advisor debate' : 'Debata savjetnika');
    if (!spent.ok) {
      setError(t.tokenError(TOKEN_COSTS.advisor_debate, spent.missing));
      return;
    }
    setDebating(true);
    try {
      const currentMarket = marketRef.current;
      const marketDigest = currentMarket ? buildMarketDigest(currentMarket) : undefined;
      const context = buildAgentContext(knowledgeRef.current, 'business', marketDigest);
      const data = await aiClient.runDebate<{
        topic: string;
        agentAId: AgentId;
        argumentA: string;
        agentBId: AgentId;
        argumentB: string;
        judgeAgentId: AgentId;
        verdict: string;
      }>(
        { topic, agentAId: debateAgentA, agentBId: debateAgentB, judgeAgentId: debateJudge, context, language },
        t.error
      );

      const base = Date.now();
      const nextMsgs: ChatMessage[] = [
        ...messages,
        { role: 'system', content: t.debateHeader(data.topic), ts: new Date(base).toISOString() },
        { role: 'assistant', agentId: data.agentAId, content: data.argumentA, ts: new Date(base + 1).toISOString() },
        { role: 'assistant', agentId: data.agentBId, content: data.argumentB, ts: new Date(base + 2).toISOString() },
        { role: 'assistant', agentId: data.judgeAgentId, content: data.verdict, ts: new Date(base + 3).toISOString(), debate_verdict: true },
      ];
      setMessages(nextMsgs);
      onPersistPanel(nextMsgs);
      void runBackgroundExtract(`[Debata] ${data.topic}`, data.verdict, data.judgeAgentId);

      setDebateOpen(false);
      setDebateTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setDebating(false);
    }
  };

  // Uvodna poruka (mentor otvara) kad je panel prazan
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    if (initialMessages.length > 0) return;
    (async () => {
      setBusy(true);
      setThinkingAgent(OPENER);
    const result = await callAgent(OPENER, [], 'open', false);
      if (result) {
        const msg: ChatMessage = {
          role: 'assistant',
          content: result.reply,
          agentId: OPENER,
          ts: new Date().toISOString(),
          ...(result.sources?.length ? { sources: result.sources } : {}),
          ...(result.research ? { research: result.research } : {}),
          ...(result.market_grounded?.length ? { market_grounded: result.market_grounded } : {}),
        };
        setMessages([msg]);
        onPersistPanel([msg]);
      }
      setThinkingAgent(null);
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Slash: forsiraj određenog savjetnika ──
  const slashActive = input.startsWith('/');
  const slashFilter = slashActive ? input.slice(1).toLowerCase().trim() : '';
  const slashCandidates = slashActive
    ? AGENT_ORDER.filter((id) => {
        if (!slashFilter) return true;
        const a = AGENTS[id];
        return `${a.name} ${a.title.en} ${a.title.hr} ${id}`.toLowerCase().includes(slashFilter);
      })
    : [];

  const speak = async (agentId: AgentId, baseMessages: ChatMessage[]) => {
    setSuggestions([]);
    setBusy(true);
    setThinkingAgent(agentId);
    const lastIsUser = baseMessages[baseMessages.length - 1]?.role === 'user';
    const useDeepMode = deepMode;
    const result = await callAgent(agentId, buildTranscript(baseMessages), lastIsUser ? 'reply' : 'join', useDeepMode);
    setThinkingAgent(null);
    let next = baseMessages;
    if (result) {
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: result.reply,
        agentId,
        ts: new Date().toISOString(),
        ...(result.sources?.length ? { sources: result.sources } : {}),
        ...(result.research ? { research: result.research } : {}),
        ...(result.market_grounded?.length ? { market_grounded: result.market_grounded } : {}),
        response_mode: result.response_mode ?? (useDeepMode ? 'deep' : 'fast'),
      };
      next = [...baseMessages, aiMsg];
      setMessages(next);
      onPersistPanel(next);
      if (lastIsUser) {
        void runBackgroundExtract(baseMessages[baseMessages.length - 1]?.content || '', result.reply, agentId);
      }
    }
    setBusy(false);
    void showAddOnChips(next, agentId);
  };

  // Klik na savjetnika za stolom: ako se javio → daj mu riječ; inače ga pitaj za mišljenje
  const handleSeatPick = (agentId: AgentId) => {
    if (busy) return;
    void speak(agentId, messages);
  };

  const dismissChip = (agentId: AgentId) =>
    setSuggestions((prev) => prev.filter((s) => s.agentId !== agentId));

  const handleForce = (agentId: AgentId) => {
    setInput('');
    if (busy) return;
    void speak(agentId, messages);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy) return;

    if (slashActive) {
      if (slashCandidates.length) handleForce(slashCandidates[0]);
      return;
    }

    setError('');
    setSuggestions([]);
    const userMsg: ChatMessage = { role: 'user', content: text, ts: new Date().toISOString() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    onPersistPanel(withUser);

    void runBackgroundExtract(text);
    if (TASK_HINTS.test(text)) {
      void createTaskFromConversation(text, withUser);
      return;
    }
    const directAgent = findDirectAgentMention(text);
    if (directAgent) {
      void speak(directAgent, withUser);
      return;
    }
    void respondToUser(withUser);
  };

  const openTasks = tasks.filter((task) => task.status === 'open');
  const doneTasks = tasks.filter((task) => task.status === 'done');
  const sortedTasks = [...openTasks, ...doneTasks];
  const showMainPanel = mobileView !== 'tasks';
  const showTasksPanel = mobileView === 'tasks';

  const activateChat = () => {
    setTab('chat');
    setMobileView('chat');
  };

  const activatePlan = () => {
    setTab('plan');
    setMobileView('plan');
  };

  const activateDigests = () => {
    setTab('digests');
    setMobileView('digests');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:min-h-[calc(100vh-8rem)] lg:flex-row">
      <div className={`${showMainPanel ? 'flex' : 'hidden'} min-h-[65vh] min-w-0 flex-1 flex-col border-2 border-[var(--ink)] bg-[var(--paper-raised)] p-4 lg:flex lg:min-h-0`}>
      {/* Header: naslov + status + tabovi, pa savjetnici za stolom */}
      <div className="border-b-2 border-[var(--ink)] pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="kicker !mb-0">{t.panelTitle}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-faint)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--verdict-green)]" />
              {t.boardroomHint}
            </p>
          </div>
          {kbUpdating && (
            <span className="hidden flex-shrink-0 items-center gap-1.5 text-xs text-[var(--ink-faint)] sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--annotate)]" />
              {t.updating}
            </span>
          )}
          {creatingTask && (
            <span className="hidden flex-shrink-0 items-center gap-1.5 text-xs sm:flex" style={{ color: 'var(--verdict-green)' }}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--verdict-green)]" />
              {t.tasksCreating}
            </span>
          )}
          <div className="hidden flex-shrink-0 border border-[var(--hairline-strong)] bg-[var(--paper-dim)] p-0.5 lg:flex">
            <button
              onClick={activateChat}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${tab === 'chat' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}`}
            >
              {t.tabChat}
            </button>
            <button
              onClick={activatePlan}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${tab === 'plan' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}`}
            >
              {t.tabPlan}
            </button>
            <button
              onClick={activateDigests}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${tab === 'digests' ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}`}
            >
              {t.tabDigests}{digests.length > 0 ? ` (${digests.length})` : ''}
            </button>
          </div>
        </div>

        {/* Savjetnici s druge strane stola: ✋ = ima što reći, hover = ekspertiza, klik = riječ */}
        <div className="mt-8">
          <Boardroom
            language={language}
            suggestions={suggestions}
            thinkingAgent={thinkingAgent}
            busy={busy}
            triaging={triaging}
            onPick={handleSeatPick}
            onDismiss={dismissChip}
          />
        </div>

        {/* Kreni od ovoga — kompaktni prečaci (hint u title) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">{t.primaryModesTitle}:</span>
            {PRIMARY_ADVISOR_MODES.map((mode) => {
              const agent = AGENTS[mode.agentId];
              const title = mode.key === 'research' ? t.primaryResearch : t.primaryPositioning;
              const hint = mode.key === 'research' ? t.primaryResearchHint : t.primaryPositioningHint;
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => handleForce(mode.agentId)}
                  disabled={busy}
                  title={hint}
                  className={`inline-flex cursor-pointer items-center gap-1.5 border ${agent.accent.border} bg-[var(--paper-dim)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="text-xs">{agent.emoji}</span>
                  {title}
                </button>
              );
            })}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => (debateOpen ? setDebateOpen(false) : openDebatePicker())}
              disabled={busy || debating}
              title={t.debateHelp}
              className="btn-line inline-flex cursor-pointer items-center gap-1.5 !px-2.5 !py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              🎭 {t.debateButton}
            </button>
            <button
              type="button"
              onClick={handleBuildDigest}
              disabled={buildingDigest || busy || !hasNewSinceDigest}
              title={hasNewSinceDigest ? undefined : t.digestNothingNew}
              className="btn-line inline-flex cursor-pointer items-center gap-1.5 !px-2.5 !py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              📌 {buildingDigest ? t.buildingDigest : t.buildDigest}
            </button>
          </div>
        </div>

        {debateOpen && (
          <div className="mt-3 border border-[var(--hairline-strong)] bg-[var(--paper-dim)] p-3">
            <p className="text-xs font-semibold text-[var(--ink)]">{t.debateTitle}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-faint)]">{t.debateHelp}</p>
            <label className="mt-3 block">
              <span className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.debateTopicLabel}</span>
              <textarea
                value={debateTopic}
                onChange={(e) => setDebateTopic(e.target.value)}
                rows={2}
                placeholder={t.debateTopicPlaceholder}
                className="paper-field mt-1 w-full resize-none text-sm"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.debateAgentALabel}</span>
                <select
                  value={debateAgentA}
                  onChange={(e) => setDebateAgentA(e.target.value as AgentId)}
                  className="paper-field mt-1 w-full text-sm"
                >
                  {AGENT_ORDER.map((id) => (
                    <option key={id} value={id}>{AGENTS[id].name} — {AGENTS[id].title[language]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.debateAgentBLabel}</span>
                <select
                  value={debateAgentB}
                  onChange={(e) => setDebateAgentB(e.target.value as AgentId)}
                  className="paper-field mt-1 w-full text-sm"
                >
                  {AGENT_ORDER.map((id) => (
                    <option key={id} value={id}>{AGENTS[id].name} — {AGENTS[id].title[language]}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-[var(--ink-faint)]">{t.debateJudgeLabel(AGENTS[debateJudge].name)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRunDebate}
                disabled={debating || busy || !debateTopic.trim() || debateAgentA === debateAgentB}
                className="btn-ink text-xs disabled:opacity-60"
              >
                {debating ? t.debateRunning : t.debateStart(TOKEN_COSTS.advisor_debate)}
              </button>
              <button
                type="button"
                onClick={() => setDebateOpen(false)}
                disabled={debating}
                className="btn-line text-xs disabled:opacity-50"
              >
                {t.debateCancel}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 pb-1 pt-1 lg:hidden">
        <button
          type="button"
          onClick={activateChat}
          className={`border px-2 py-2 text-[11px] font-semibold transition-colors ${
            mobileView === 'chat'
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-[var(--hairline-strong)] bg-[var(--paper-dim)] text-[var(--ink-faint)]'
          }`}
        >
          {t.tabChat}
        </button>
        <button
          type="button"
          onClick={activatePlan}
          className={`border px-2 py-2 text-[11px] font-semibold transition-colors ${
            mobileView === 'plan'
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-[var(--hairline-strong)] bg-[var(--paper-dim)] text-[var(--ink-faint)]'
          }`}
        >
          {t.tabPlan}
        </button>
        <button
          type="button"
          onClick={activateDigests}
          className={`border px-2 py-2 text-[11px] font-semibold transition-colors ${
            mobileView === 'digests'
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-[var(--hairline-strong)] bg-[var(--paper-dim)] text-[var(--ink-faint)]'
          }`}
        >
          {t.tabDigests}
        </button>
        <button
          type="button"
          onClick={() => setMobileView('tasks')}
          className={`border px-2 py-2 text-[11px] font-semibold transition-colors ${
            mobileView === 'tasks'
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-[var(--hairline-strong)] bg-[var(--paper-dim)] text-[var(--ink-faint)]'
          }`}
        >
          {t.tasksTitle}
        </button>
      </div>

      {tab === 'plan' ? (
        <div className="flex-1 overflow-y-auto py-4">
          <KnowledgePanel language={language} knowledge={knowledge} onKnowledgeUpdate={onKnowledgeUpdate} />
        </div>
      ) : tab === 'digests' ? (
        <div className="flex-1 overflow-y-auto py-4">
          <p className="mb-4 text-xs leading-relaxed text-[var(--ink-faint)]">{t.digestsHint}</p>
          {digests.length === 0 ? (
            <div className="sheet p-6 text-center">
              <p className="text-sm leading-relaxed text-[var(--ink-soft)]">{t.digestsEmpty}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {digests.map((digest) => (
                <div key={digest.id} className="sheet p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--hairline-strong)] pb-2">
                    <p className="font-data text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                      {new Date(digest.created_at).toLocaleString(language === 'en' ? 'en-US' : 'hr-HR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    <span className="text-[11px] text-[var(--ink-faint)]">{t.digestMessageCount(digest.message_count)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">{digest.summary}</p>

                  {digest.decisions.length > 0 && (
                    <div className="mt-3">
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.digestDecisions}</p>
                      <ul className="mt-1.5 space-y-1">
                        {digest.decisions.map((d, i) => (
                          <li key={i} className="flex gap-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                            <span style={{ color: 'var(--verdict-green)' }}>✓</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {digest.open_questions.length > 0 && (
                    <div className="mt-3">
                      <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.digestQuestions}</p>
                      <ul className="mt-1.5 space-y-1">
                        {digest.open_questions.map((q, i) => (
                          <li key={i} className="flex gap-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                            <span style={{ color: 'var(--annotate)' }}>?</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3">
                    <p className="font-data text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{t.digestActions}</p>
                    {digest.actions.length === 0 ? (
                      <p className="mt-1.5 text-xs italic text-[var(--ink-faint)]">{t.digestNoActions}</p>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {digest.actions.map((a, i) => (
                          <span
                            key={i}
                            className="border border-[var(--hairline-strong)] bg-[var(--paper-dim)] px-2 py-1 text-[11px] text-[var(--ink-soft)]"
                            title={a.details}
                          >
                            {a.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
            {messages.map((m, i) => {
              if (m.role === 'system') {
                return (
                  <div key={i} className="flex justify-center">
                    <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1">
                      {m.content}
                    </span>
                  </div>
                );
              }
              const speaker = m.role === 'assistant' ? AGENTS[m.agentId ?? OPENER] : null;
              return (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {speaker && (
                    <div
                      className={`mr-2 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${speaker.accent.bg} text-sm shadow-lg shadow-black/10`}
                      title={speaker.name}
                    >
                      {speaker.emoji}
                    </div>
                  )}
                  <div className="max-w-[92%] sm:max-w-[82%]">
                    {speaker && (
                      <p className={`text-xs font-medium ${speaker.accent.text} mb-1 ml-1`}>
                        {speaker.name} <span className="text-zinc-600 font-normal">· {speaker.title[language]}</span>
                      </p>
                    )}
                    <div
                      className={`rounded-[1.4rem] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${
                        m.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.role === 'assistant' && m.response_mode === 'deep' && (
                      <div className="mt-1.5 ml-1 inline-flex rounded-full border border-indigo-800/60 bg-indigo-950/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                        {t.deepBadge}
                      </div>
                    )}
                    {m.role === 'assistant' && m.debate_verdict && (
                      <div className="mt-1.5 ml-1 inline-flex rounded-full border border-amber-700/60 bg-amber-950/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                        {t.debateVerdictBadge}
                      </div>
                    )}
                    {m.role === 'assistant' && m.market_grounded && m.market_grounded.length > 0 && (
                      <div
                        className="mt-1.5 ml-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/20 px-2.5 py-1 text-[11px] text-emerald-200"
                        title={t.marketGroundedHint}
                      >
                        📊 {t.marketGroundedBadge}: {m.market_grounded.join(', ')}
                      </div>
                    )}
                    {m.research && (
                      <div className={`mt-1.5 ml-1 rounded-2xl border px-3 py-2 ${
                        m.research.used
                          ? 'border-emerald-900/60 bg-emerald-950/20'
                          : 'border-amber-900/60 bg-amber-950/20'
                      }`}>
                        <p className={`text-[11px] uppercase tracking-wider ${
                          m.research.used ? 'text-emerald-300' : 'text-amber-300'
                        }`}>
                          {m.research.used
                            ? m.research.toolLabel || (language === 'en' ? 'External tool used' : 'Vanjski alat korišten')
                            : language === 'en' ? 'External tool attempted' : 'Pokušaj vanjskog alata'}
                        </p>
                        {m.research.query && (
                          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                            {language === 'en' ? 'Query' : 'Upit'}: {m.research.query}
                          </p>
                        )}
                        {m.research.error && (
                          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/70">
                            {m.research.error}
                          </p>
                        )}
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-1.5 ml-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                          🔍 {language === 'en' ? 'Researched on the web' : 'Istraženo na webu'}
                        </p>
                        <ul className="space-y-1">
                          {m.sources.map((s, si) => (
                            <li key={si} className="text-xs leading-snug">
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-300 hover:underline"
                                title={s.snippet || s.url}
                              >
                                [{si + 1}] {s.title || s.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {thinkingAgent && (
              <div className="flex justify-start">
                <div className={`w-8 h-8 rounded-full ${AGENTS[thinkingAgent].accent.bg} flex items-center justify-center text-sm flex-shrink-0 mr-2`}>
                  {AGENTS[thinkingAgent].emoji}
                </div>
                <div className="flex items-center gap-1 rounded-[1.4rem] rounded-bl-sm bg-zinc-800 px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input + slash */}
          <div className="sticky bottom-0 relative mt-2 border-t-2 border-[var(--ink)] bg-[var(--paper-raised)] pt-3">
            {slashActive && slashCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden border-2 border-[var(--ink)] bg-[var(--paper-raised)] shadow-[3px_3px_0_rgba(27,23,18,0.25)] sm:right-auto sm:w-72">
                <p className="font-data border-b border-[var(--hairline-strong)] px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">
                  {t.slashHint}
                </p>
                {slashCandidates.map((id) => (
                  <button
                    key={id}
                    onClick={() => handleForce(id)}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--paper-dim)]"
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${AGENTS[id].accent.bg} text-sm`}>
                      {AGENTS[id].emoji}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)]">{AGENTS[id].name}</p>
                      <p className={`text-xs ${AGENTS[id].accent.text} truncate`}>{AGENTS[id].title[language]}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mb-2 text-xs" style={{ color: 'var(--verdict-red)' }}>{error}</p>}
            <div className="mb-2 flex flex-col gap-2 border border-[var(--hairline-strong)] bg-[var(--paper-dim)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--ink)]">{t.deepMode}</p>
                <p className="text-[11px] text-[var(--ink-faint)]">{t.deepModeHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setDeepMode((value) => !value)}
                disabled={busy}
                className={`relative h-7 w-14 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  deepMode
                    ? 'border-[var(--verdict-red)] bg-[var(--verdict-red)]/80'
                    : 'border-[var(--hairline-strong)] bg-[var(--paper)]'
                }`}
                aria-pressed={deepMode}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-[var(--paper-raised)] shadow transition-transform ${
                    deepMode ? 'translate-x-0.5' : 'translate-x-7'
                  }`}
                />
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder={t.placeholder}
                className="paper-field min-h-[50px] max-h-32 flex-1 resize-none text-sm"
              />
              <button
                onClick={handleSend}
                disabled={busy || !input.trim()}
                className="btn-ink h-[50px] flex-shrink-0 text-sm disabled:opacity-60"
              >
                {t.send}
              </button>
            </div>
          </div>
        </>
      )}
      </div>

      <aside className={`${showTasksPanel ? 'flex' : 'hidden'} min-h-[65vh] flex-shrink-0 flex-col overflow-hidden rounded-[1.8rem] border border-zinc-800 bg-zinc-900/60 shadow-[0_24px_60px_rgba(0,0,0,0.18)] lg:flex lg:w-80 lg:min-h-0 lg:self-stretch`}>
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">{t.tasksTitle}</p>
            <p className="text-xs text-zinc-500">{openTasks.length} open · {doneTasks.length} done</p>
          </div>
          {creatingTask && <span className="w-4 h-4 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {sortedTasks.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">{t.tasksEmpty}</p>
          ) : (
            sortedTasks.map((task) => {
              const owner = task.owner_agent ? AGENTS[task.owner_agent] : null;
              const priorityCls =
                task.priority === 'high'
                  ? 'text-red-300 border-red-800/50 bg-red-950/25'
                  : task.priority === 'medium'
                  ? 'text-yellow-300 border-yellow-800/50 bg-yellow-950/20'
                  : 'text-zinc-300 border-zinc-700 bg-zinc-800/70';
              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border p-3 space-y-2 shadow-[0_10px_24px_rgba(0,0,0,0.10)] ${task.status === 'done' ? 'border-zinc-800 bg-zinc-950/40 opacity-65' : 'border-zinc-700 bg-zinc-950/60'}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 cursor-pointer ${task.status === 'done' ? 'bg-emerald-600 border-emerald-500' : 'border-zinc-600 hover:border-emerald-500'}`}
                      title={task.status === 'done' ? t.tasksOpen : t.tasksDone}
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium leading-snug ${task.status === 'done' ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-zinc-400 leading-relaxed mt-1 whitespace-pre-wrap">{task.details}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    <span className={`text-[10px] border rounded-full px-2 py-0.5 ${priorityCls}`}>
                      {t.priority}: {task.priority}
                    </span>
                    {owner && (
                      <span className={`text-[10px] border rounded-full px-2 py-0.5 ${owner.accent.border} ${owner.accent.text} bg-zinc-900`}>
                        {owner.name}
                      </span>
                    )}
                    {task.due_at && (
                      <span className="text-[10px] border border-zinc-700 rounded-full px-2 py-0.5 text-zinc-300 bg-zinc-800/70">
                        {t.due}: {new Date(task.due_at).toLocaleDateString(language === 'en' ? 'en-US' : 'hr-HR')}
                      </span>
                    )}
                  </div>
                  {task.source_summary && (
                    <p className="pl-6 text-[11px] text-zinc-600 leading-relaxed">
                      {t.source}: {task.source_summary}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
