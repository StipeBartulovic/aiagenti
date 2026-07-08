'use client';

import { useEffect, useRef, useState } from 'react';
import { AGENTS, AGENT_ORDER } from '@/lib/agents';
import { aiClient } from '@/lib/ai-client';
import { buildAgentContext } from '@/lib/knowledge';
import Boardroom from './Boardroom';
import KnowledgePanel from './KnowledgePanel';
import { TOKEN_COSTS, spendTokens } from '@/lib/tokens';
import { tokenShortfallMessage } from '@/lib/token-messages';
import type { AgentId, ChatMessage, ProjectKnowledge, ProjectTask, ResearchSource } from '@/lib/types';

interface Suggestion {
  agentId: AgentId;
  confidence: number;
  teaser: string;
}

interface Props {
  language: 'hr' | 'en';
  knowledge: ProjectKnowledge;
  initialMessages: ChatMessage[];
  initialTasks: ProjectTask[];
  onPersistPanel: (messages: ChatMessage[]) => void;
  onKnowledgeUpdate: (knowledge: ProjectKnowledge) => void;
  onPersistTasks: (tasks: ProjectTask[]) => void;
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
  initialMessages,
  initialTasks,
  onPersistPanel,
  onKnowledgeUpdate,
  onPersistTasks,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [input, setInput] = useState('');
  const [thinkingAgent, setThinkingAgent] = useState<AgentId | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const [triaging, setTriaging] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [kbUpdating, setKbUpdating] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'chat' | 'plan'>('chat');
  const [mobileView, setMobileView] = useState<'chat' | 'plan' | 'tasks'>('chat');
  const [deepMode, setDeepMode] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const knowledgeRef = useRef(knowledge);

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
    },
  }[language];

  useEffect(() => {
    knowledgeRef.current = knowledge;
  }, [knowledge]);

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
  ): Promise<{ reply: string; sources?: ResearchSource[]; research?: ChatMessage['research']; response_mode?: ChatMessage['response_mode'] } | null> => {
    try {
      if (intent !== 'open') {
        const cost = useDeepMode ? TOKEN_COSTS.advisor_deep : TOKEN_COSTS.advisor_fast;
        const spent = spendTokens(cost, useDeepMode ? `${AGENTS[agentId].name} (dublji odgovor)` : AGENTS[agentId].name);
        if (!spent.ok) {
          setError(t.tokenError(cost, spent.missing));
          return null;
        }
      }
      const data = await aiClient.advisorChat<{
        reply: string;
        sources?: ResearchSource[];
        research?: ChatMessage['research'];
        response_mode?: ChatMessage['response_mode'];
      }>({
          targetAgentId: agentId,
          context: `${buildAgentContext(knowledgeRef.current, AGENTS[agentId].section)}${taskContext ? `\n\nOPEN TASKS THE FOUNDER HAS ALREADY AGREED TO:\n${taskContext}\nUse these as memory. Do not repeat them as new suggestions unless you are asking for progress or proposing the next step.` : ''}`,
          transcript,
          language,
          intent,
          participants: AGENT_ORDER,
          deepMode: useDeepMode,
        }, t.error);
      return {
        reply: data.reply as string,
        sources: data.sources as ResearchSource[] | undefined,
        research: data.research as ChatMessage['research'] | undefined,
        response_mode: data.response_mode as ChatMessage['response_mode'] | undefined,
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
        const msg: ChatMessage = { role: 'assistant', content: result.reply, agentId: OPENER, ts: new Date().toISOString() };
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:min-h-[calc(100vh-8rem)] lg:flex-row">
      <div className={`${showMainPanel ? 'flex' : 'hidden'} min-h-[65vh] min-w-0 flex-1 flex-col rounded-[1.8rem] border border-zinc-800/80 bg-zinc-900/35 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.18)] lg:flex lg:min-h-0`}>
      {/* Header: naslov + status + tabovi, pa savjetnici za stolom */}
      <div className="border-b border-zinc-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm leading-tight">{t.panelTitle}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t.boardroomHint}
            </p>
          </div>
          {kbUpdating && (
            <span className="text-xs text-zinc-500 items-center gap-1.5 flex-shrink-0 hidden sm:flex">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              {t.updating}
            </span>
          )}
          {creatingTask && (
            <span className="text-xs text-emerald-400 items-center gap-1.5 flex-shrink-0 hidden sm:flex">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t.tasksCreating}
            </span>
          )}
          <div className="hidden flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/80 p-0.5 lg:flex">
            <button
              onClick={activateChat}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${tab === 'chat' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.tabChat}
            </button>
            <button
              onClick={activatePlan}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${tab === 'plan' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.tabPlan}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-zinc-500">{t.primaryModesTitle}:</span>
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
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border ${agent.accent.border} bg-zinc-950/60 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="text-xs">{agent.emoji}</span>
                {title}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 bg-zinc-900/95 pb-1 pt-1 lg:hidden">
        <button
          type="button"
          onClick={activateChat}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            mobileView === 'chat'
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          {t.tabChat}
        </button>
        <button
          type="button"
          onClick={activatePlan}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            mobileView === 'plan'
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          {t.tabPlan}
        </button>
        <button
          type="button"
          onClick={() => setMobileView('tasks')}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            mobileView === 'tasks'
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
          }`}
        >
          {t.tasksTitle}
        </button>
      </div>

      {tab === 'plan' ? (
        <div className="flex-1 overflow-y-auto py-4">
          <KnowledgePanel language={language} knowledge={knowledge} onKnowledgeUpdate={onKnowledgeUpdate} />
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
          <div className="sticky bottom-0 relative mt-2 border-t border-zinc-800 bg-zinc-900/95 pt-3 backdrop-blur">
            {slashActive && slashCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl sm:right-auto sm:w-72">
                <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
                  {t.slashHint}
                </p>
                {slashCandidates.map((id) => (
                  <button
                    key={id}
                    onClick={() => handleForce(id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors cursor-pointer text-left"
                  >
                    <div className={`w-8 h-8 rounded-full ${AGENTS[id].accent.bg} flex items-center justify-center text-sm flex-shrink-0`}>
                      {AGENTS[id].emoji}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{AGENTS[id].name}</p>
                      <p className={`text-xs ${AGENTS[id].accent.text} truncate`}>{AGENTS[id].title[language]}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
            <div className="mb-2 flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/55 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-200">{t.deepMode}</p>
                <p className="text-[11px] text-zinc-500">{t.deepModeHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setDeepMode((value) => !value)}
                disabled={busy}
                className={`relative h-7 w-14 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  deepMode
                    ? 'border-indigo-500 bg-indigo-600/80'
                    : 'border-zinc-700 bg-zinc-800'
                }`}
                aria-pressed={deepMode}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
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
                className="min-h-[50px] max-h-32 flex-1 resize-none rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={busy || !input.trim()}
                className="h-[50px] rounded-2xl bg-indigo-600 px-5 text-sm font-medium text-white shadow-lg shadow-indigo-950/30 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 sm:flex-shrink-0"
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
