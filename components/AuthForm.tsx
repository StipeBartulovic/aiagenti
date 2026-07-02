'use client';

import { useAuth } from '@/context/AuthContext';

export default function AuthForm() {
  const { language } = useAuth();
  const t = language === 'en'
    ? {
        title: 'Local profile is active',
        body: 'No cloud sign-in is required. Your tests and projects stay on this device and can be exported as .ai-project files whenever you want.',
      }
    : {
        title: 'Lokalni profil je aktivan',
        body: 'Cloud prijava nije potrebna. Tvoji testovi i projekti ostaju na ovom uređaju i možeš ih izvesti kao .ai-project datoteke kad god želiš.',
      };

  return (
    <div className="w-full max-w-md rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-6 text-center">
      <h2 className="text-xl font-bold text-white">{t.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-emerald-100/70">{t.body}</p>
    </div>
  );
}
