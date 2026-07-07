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
      title: 'Upoznajmo tvoj projekt',
      subtitle: 'Par odgovora pomaze da Research i Positioning savjetnik krenu od tvog stvarnog konteksta, a ne od generickih pretpostavki.',
      placeholder: 'Tvoj odgovor...',
      send: 'Pošalji',
      thinking: 'Razmišljam...',
      preparing: 'Pripremam tvoje savjetnike iz razgovora...',
      host: 'Voditelj',
      skip: 'Preskoči pitanja',
      skipHint: 'Ako si u žurbi, preskoči. Savjetnici će krenuti iz izvještaja, a kasnije ih možeš dopuniti kroz chat.',
      benefitOne: 'bolji prijedlozi',
      benefitTwo: 'manje generičkih odgovora',
      benefitThree: 'jasniji sljedeći koraci',
    },
    en: {
      title: "Let's get to know your project",
      subtitle: 'A few answers help the Research and Positioning advisors start from your real context instead of generic assumptions.',
      placeholder: 'Your answer...',
      send: 'Send',
      thinking: 'Thinking...',
      preparing: 'Preparing your advisors from the conversation...',
      host: 'Host',
      skip: 'Skip questions',
      skipHint: 'If you are in a hurry, skip this. Advisors will start from the report, and you can add context later in chat.',
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
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 rounded-[1.8rem] border border-zinc-800/80 bg-zinc-900/45 p-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
        <div className="mb-4 inline-flex -space-x-2">
          {['🤝', '📣'].map((e, i) => (
            <div
              key={i}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-800 text-base"
            >
              {e}
            </div>
          ))}
        </div>
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-800/50 bg-indigo-950/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
          {language === 'en' ? 'Advisor setup' : 'Setup savjetnika'}
        </div>
        <h1 className="mb-1 mt-4 text-2xl font-bold text-white font-title">{t.title}</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">{t.subtitle}</p>
        <div className="mt-4 grid gap-2 text-left sm:grid-cols-3">
          {[t.benefitOne, t.benefitTwo, t.benefitThree].map((benefit) => (
            <div key={benefit} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
              <span className="mr-1 text-indigo-300">✓</span>
              {benefit}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">{t.skipHint}</p>
        <button
          type="button"
          onClick={() => onComplete(messages)}
          disabled={seeding}
          className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-indigo-700 hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t.skip}
        </button>
      </div>

      <div className="flex min-h-[60vh] flex-col rounded-[1.8rem] border border-zinc-800 bg-zinc-900/60 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:min-h-[58vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm flex-shrink-0 mr-2 mt-0.5">
                  ✨
                </div>
              )}
              <div
                className={`max-w-[88%] sm:max-w-[80%] rounded-[1.4rem] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {(sending || seeding) && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm flex-shrink-0 mr-2">
                ✨
              </div>
              <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                {seeding ? (
                  <span className="text-xs text-zinc-300">{t.preparing}</span>
                ) : (
                  [0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800">
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
              className="min-h-[50px] flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:outline-none max-h-32 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || finished || seeding || !input.trim()}
              className="h-[50px] rounded-xl bg-indigo-600 px-5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 sm:flex-shrink-0"
            >
              {t.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
