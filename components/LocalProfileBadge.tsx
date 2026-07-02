'use client';

import { ShieldCheck } from 'lucide-react';

interface Props {
  language: 'hr' | 'en';
}

export default function LocalProfileBadge({ language }: Props) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-200">
      <ShieldCheck className="h-3.5 w-3.5" />
      {language === 'en' ? 'Local profile' : 'Lokalni profil'}
    </span>
  );
}
