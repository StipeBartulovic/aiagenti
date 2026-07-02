'use client';

import { useEffect, useState } from 'react';

const TEXT = {
  hr: {
    title: 'AI kupci analiziraju tvoju ideju',
    subtitle: 'Ovo obično traje oko pola minute. Nemoj zatvarati tab.',
    countLabel: '/ 50',
    slowHint: 'Ako potraje duže, još uvijek skupljamo odgovore i slažemo izvještaj.',
    messages: [
      'Generiramo raznolike kupce...',
      'Entuzijasti traže što im je zanimljivo...',
      'Skeptici traže razloge za odbijanje...',
      'Pragmatičari uspoređuju s alternativama...',
      'Računamo kupovnu namjeru...',
      'Identificiramo ciljanu skupinu...',
      'Pronalazimo ključna pitanja...',
      'Sastavljamo akcijski plan...',
    ],
  },
  en: {
    title: 'AI buyers are analyzing your idea',
    subtitle: 'This usually takes about half a minute. Do not close the tab.',
    countLabel: '/ 50',
    slowHint: 'If it takes longer, we are still collecting responses and building the report.',
    messages: [
      'Generating diverse buyers...',
      'Enthusiasts look for what feels exciting...',
      'Skeptics look for reasons to reject...',
      'Pragmatists compare against alternatives...',
      'Calculating purchase intent...',
      'Identifying the target audience...',
      'Finding key customer questions...',
      'Building the action plan...',
    ],
  },
};

export default function LoadingScreen({ language = 'hr' }: { language?: 'hr' | 'en' }) {
  const [count, setCount] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const t = TEXT[language];

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((c) => {
        if (c >= 50) {
          clearInterval(interval);
          return 50;
        }
        return c + 1;
      });
    }, 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % t.messages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [t.messages.length]);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-zinc-950/95 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="text-center space-y-8 px-4">
        <div className="relative w-32 h-32 mx-auto">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="#27272a"
              strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="#6366f1"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - count / 50)}`}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">{count}</span>
            <span className="text-xs text-zinc-400">{t.countLabel}</span>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {t.title}
          </h2>
          <p className="text-zinc-500 text-xs mb-3">{t.subtitle}</p>
          <p className="text-zinc-400 text-sm min-h-[1.5rem] transition-all">
            {t.messages[msgIdx]}
          </p>
          {elapsed >= 35 && <p className="mt-3 text-xs text-amber-300">{t.slowHint}</p>}
        </div>

        <div className="flex justify-center gap-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
