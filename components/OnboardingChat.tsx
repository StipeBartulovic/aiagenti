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
      subtitle: 'Ovo nije još jedna forma. Par odgovora pomaže savjetnicima da budu konkretniji za tvoju situaciju.',
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
      subtitle: 'This is not another form. A few answers help advisors become more specific to your situation.',
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
    <div className="max-w-2xl mx-auto w-full">
      <div className="text-center mb-6">
        <div className="inline-flex -space-x-2 mb-4">
          {['🎯', '⚙️', '📣', '⚖️'].map((e, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-base"
            >
              {e}
            </div>
          ))}
        </div>
        <h1 className="text-2xl font-bold text-white mb-1 font-title">{t.title}</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">{t.subtitle}</p>
        <div className="mt-4 grid gap-2 text-left sm:grid-cols-3">
          {[t.benefitOne, t.benefitTwo, t.benefitThree].map((benefit) => (
            <div key={benefit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
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

      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col h-[60vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm flex-shrink-0 mr-2 mt-0.5">
                  ✨
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
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
          <div className="flex gap-2">
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
              className="flex-1 resize-none rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm max-h-32 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={sending || finished || seeding || !input.trim()}
              className="px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium text-sm transition-colors cursor-pointer flex-shrink-0"
            >
              {t.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
