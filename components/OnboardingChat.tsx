'use client';

import { useEffect, useRef, useState } from 'react';
import { aiClient } from '@/lib/ai-client';

type Msg = { role: 'user' | 'assistant'; content: string };

interface Props {
  language: 'hr' | 'en';
  ideaSummary: string;
  seeding: boolean;
  onComplete: (transcript: Msg[]) => void;
}

export default function OnboardingChat({ language, ideaSummary, seeding, onComplete }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const t = {
    hr: {
      kicker: 'Setup savjetnika',
      title: 'Upoznajmo tvoj projekt',
      subtitle: 'Par odgovora pomaze da Research i Positioning savjetnik krenu od tvog stvarnog konteksta, a ne od generickih pretpostavki.',
      placeholder: 'Tvoj odgovor...',
      send: 'Pošalji',
      thinking: 'Razmišljam...',
      preparing: 'Pripremam tvoje savjetnike iz razgovora...',
      host: 'Voditelj',
      skip: 'Preskoči pitanja',
      skipHint: 'Ako si u žurbi, preskoči — savjetnici će krenuti iz izvještaja, a kasnije ih možeš dopuniti kroz chat.',
      benefitOne: 'bolji prijedlozi',
      benefitTwo: 'manje generičkih odgovora',
      benefitThree: 'jasniji sljedeći koraci',
    },
    en: {
      kicker: 'Advisor setup',
      title: "Let's get to know your project",
      subtitle: 'A few answers help the Research and Positioning advisors start from your real context instead of generic assumptions.',
      placeholder: 'Your answer...',
      send: 'Send',
      thinking: 'Thinking...',
      preparing: 'Preparing your advisors from the conversation...',
      host: 'Host',
      skip: 'Skip questions',
      skipHint: 'If you are in a hurry, skip this — advisors will start from the report, and you can add context later in chat.',
      benefitOne: 'better recommendations',
      benefitTwo: 'fewer generic answers',
      benefitThree: 'clearer next steps',
    },
  }[language];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const callIntake = async (transcript: Msg[]) => {
    return aiClient.intake<{ message: string; done: boolean }>(
      { ideaSummary, transcript, language },
      'Greška'
    );
  };

  // Prvo pitanje
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      setSending(true);
      try {
        const data = await callIntake([]);
        setMessages([{ role: 'assistant', content: data.message }]);
      } catch {
        setMessages([
          {
            role: 'assistant',
            content:
              language === 'en'
                ? "Hi! Let's start simple — which country are you building this in?"
                : 'Bok! Krenimo jednostavno — u kojoj državi gradiš ovaj proizvod?',
          },
        ]);
      } finally {
        setSending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || finished) return;

    const withUser: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(withUser);
    setInput('');
    setSending(true);
    try {
      const data = await callIntake(withUser);
      const withAsst: Msg[] = [...withUser, { role: 'assistant', content: data.message }];
      setMessages(withAsst);
      if (data.done) {
        setFinished(true);
        onComplete(withAsst);
      }
    } catch {
      setMessages(withUser);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl border-2 border-[var(--ink)] bg-[var(--paper-raised)]">
      {/* Intro: tema + benefiti + skip, sve u jednom kompaktnom retku */}
      <div className="border-b-2 border-[var(--ink)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker !mb-0">{t.kicker}</p>
            <h1 className="mt-1 text-xl text-[var(--ink)] sm:text-2xl">{t.title}</h1>
          </div>
          <button
            type="button"
            onClick={() => onComplete(messages)}
            disabled={seeding}
            className="btn-line flex-shrink-0 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.skip}
          </button>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)]">{t.subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[t.benefitOne, t.benefitTwo, t.benefitThree].map((benefit) => (
            <span
              key={benefit}
              className="border border-[var(--hairline-strong)] bg-[var(--paper-dim)] px-2.5 py-1 text-[11px] text-[var(--ink-soft)]"
            >
              <span className="mr-1" style={{ color: 'var(--verdict-green)' }}>✓</span>
              {benefit}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">{t.skipHint}</p>
      </div>

      {/* Chat: raste sa sadrzajem, ne forsira ogroman prazan prostor */}
      <div className="flex min-h-[280px] max-h-[55vh] flex-col">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="mr-2 mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--verdict-green)] text-sm">
                  ✨
                </div>
              )}
              <div
                className={`max-w-[88%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[80%] ${
                  m.role === 'user'
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'bg-[var(--paper-dim)] text-[var(--ink)]'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {(sending || seeding) && (
            <div className="flex justify-start">
              <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--verdict-green)] text-sm">
                ✨
              </div>
              <div className="flex items-center gap-2 bg-[var(--paper-dim)] px-4 py-3">
                {seeding ? (
                  <span className="text-xs text-[var(--ink-soft)]">{t.preparing}</span>
                ) : (
                  [0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--ink-faint)]"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t-2 border-[var(--ink)] p-3">
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
              disabled={finished || seeding}
              placeholder={t.placeholder}
              className="paper-field min-h-[50px] max-h-32 flex-1 resize-none text-sm disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || finished || seeding || !input.trim()}
              className="btn-ink h-[50px] flex-shrink-0 text-sm disabled:opacity-60"
            >
              {t.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
