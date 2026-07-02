'use client';

import { useAuth } from '@/context/AuthContext';

export default function AuthForm() {
  const { language } = useAuth();
  const t = language === 'en'
    ? {
        title: 'Local-first mode',
        body: 'No cloud account is required. Projects are saved locally in this browser and can be exported as .ai-project files.',
      }
    : {
        title: 'Lokalni nacin rada',
        body: 'Cloud racun nije potreban. Projekti se spremaju lokalno u ovom browseru i mogu se izvesti kao .ai-project datoteke.',
      };

  return (
    <div className="w-full max-w-md rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-6 text-center">
      <h2 className="text-xl font-bold text-white">{t.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-emerald-100/70">{t.body}</p>
    </div>
  );
}
