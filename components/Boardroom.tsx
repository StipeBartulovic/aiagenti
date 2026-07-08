'use client';

import { AGENTS, AGENT_ORDER } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

interface Suggestion {
  agentId: AgentId;
  confidence: number;
  teaser: string;
}

interface Props {
  language: 'hr' | 'en';
  /** Tko se javlja (podignuta ruka) — dolazi iz triagea */
  suggestions: Suggestion[];
  /** Tko trenutno govori/razmišlja */
  thinkingAgent: AgentId | null;
  busy: boolean;
  triaging: boolean;
  /** Klik na savjetnika = daj mu riječ */
  onPick: (agentId: AgentId) => void;
  /** Spusti ruku bez davanja riječi */
  onDismiss: (agentId: AgentId) => void;
}

/**
 * "Boardroom" — panel savjetnika sjedi s druge strane stola.
 * Podignuta ruka = ima nešto za reći (triage). Hover = tko je ekspert za što.
 * Klik = founder mu daje riječ.
 */
export default function Boardroom({
  language,
  suggestions,
  thinkingAgent,
  busy,
  triaging,
  onPick,
  onDismiss,
}: Props) {
  const t = {
    hr: {
      wants: 'želi nešto dodati',
      speaking: 'govori...',
      giveFloor: 'Klikni — daj mu riječ',
      ask: 'Klikni — pitaj za mišljenje',
      dismiss: 'Spusti ruku',
      checking: 'provjeravam tko ima što za reći...',
    },
    en: {
      wants: 'wants to add something',
      speaking: 'speaking...',
      giveFloor: 'Click — give them the floor',
      ask: 'Click — ask for their take',
      dismiss: 'Lower hand',
      checking: 'checking who has something to say...',
    },
  }[language];

  const suggestionFor = (id: AgentId) => suggestions.find((s) => s.agentId === id);

  return (
    <div className="relative">
      {/* Sjedala — savjetnici s druge strane stola */}
      <div className="relative z-10 flex items-end justify-around px-1 sm:px-6">
        {AGENT_ORDER.map((id) => {
          const a = AGENTS[id];
          const sugg = suggestionFor(id);
          const isRaised = Boolean(sugg);
          const isSpeaking = thinkingAgent === id;

          return (
            <div key={id} className="group relative flex flex-col items-center">
              {/* Podignuta ruka */}
              {isRaised && !isSpeaking && (
                <span
                  className="boardroom-hand pointer-events-none absolute -top-6 right-0 z-20 text-xl sm:-top-7 sm:text-2xl"
                  aria-hidden
                >
                  ✋
                </span>
              )}

              {/* Indikator govora iznad glave */}
              {isSpeaking && (
                <span className="pointer-events-none absolute -top-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-zinc-800/90 px-2 py-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1 w-1 animate-bounce rounded-full bg-zinc-300"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              )}

              <button
                type="button"
                onClick={() => onPick(id)}
                disabled={busy}
                className={`relative flex cursor-pointer flex-col items-center transition-transform duration-200 disabled:cursor-default ${
                  isRaised ? '-translate-y-1.5' : ''
                } ${busy && !isSpeaking ? 'opacity-70' : ''} group-hover:-translate-y-1`}
                aria-label={`${a.name} — ${a.title[language]}`}
              >
                {/* Glava */}
                <span
                  className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full text-lg sm:h-14 sm:w-14 sm:text-2xl ${a.accent.bg} shadow-lg shadow-black/30 transition-shadow ${
                    isSpeaking
                      ? `ring-2 ${a.accent.ring} ring-offset-2 ring-offset-zinc-950`
                      : isRaised
                        ? 'ring-2 ring-white/25 ring-offset-2 ring-offset-zinc-950'
                        : ''
                  }`}
                >
                  {a.emoji}
                </span>
                {/* Ramena */}
                <span
                  className={`-mt-2.5 h-6 w-14 rounded-t-[1.6rem] sm:-mt-3 sm:h-8 sm:w-[4.6rem] ${a.accent.bg} opacity-55`}
                />
              </button>

              {/* Hover kartica: tko je ekspert za što */}
              <div className="pointer-events-none absolute top-full z-30 mt-1 w-60 -translate-x-0 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 max-sm:hidden left-1/2 -translate-x-1/2">
                <div className={`rounded-2xl border ${a.accent.border} bg-zinc-950/97 p-3 shadow-2xl shadow-black/50 backdrop-blur`}>
                  <p className="text-sm font-semibold text-white">
                    {a.name} <span className={`font-normal ${a.accent.text}`}>· {a.title[language]}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{a.tagline[language]}</p>
                  {sugg && (
                    <p className={`mt-2 border-t border-zinc-800 pt-2 text-xs leading-relaxed ${a.accent.text}`}>
                      ✋ {t.wants}
                      {sugg.teaser ? <span className="text-zinc-400"> — {sugg.teaser}</span> : null}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {isSpeaking ? t.speaking : sugg ? t.giveFloor : t.ask}
                    </span>
                    {sugg && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismiss(id);
                        }}
                        className="cursor-pointer text-[10px] text-zinc-600 hover:text-zinc-300"
                      >
                        ✕ {t.dismiss}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stol — dijeli njihovu stranu od tvoje */}
      <div className="boardroom-table relative z-20 -mt-3 h-8 rounded-[1.2rem] sm:-mt-4 sm:h-10" />

      {/* Pločice s imenima — na stolu, poravnate sa sjedalima */}
      <div className="pointer-events-none relative z-30 -mt-6 flex justify-around px-1 sm:-mt-8 sm:px-6">
        {AGENT_ORDER.map((id) => {
          const a = AGENTS[id];
          const active = Boolean(suggestionFor(id)) || thinkingAgent === id;
          return (
            <span
              key={`plate-${id}`}
              className={`max-w-[4.2rem] truncate text-center text-[10px] font-semibold tracking-wide sm:max-w-none ${
                active ? a.accent.text : 'text-zinc-500'
              }`}
            >
              {a.name}
            </span>
          );
        })}
      </div>

      {/* Triage status ispod stola */}
      {triaging && suggestions.length === 0 && (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-zinc-600">
          <span className="h-1 w-1 animate-pulse rounded-full bg-zinc-600" /> {t.checking}
        </p>
      )}
    </div>
  );
}
