import { formatTokens } from './tokens';

export function tokenShortfallMessage(
  language: 'hr' | 'en',
  label: string,
  cost: number,
  missing: number
): string {
  return language === 'en'
    ? `${label} needs ${formatTokens(cost)} tokens. You are missing ${formatTokens(missing)} tokens. Use Add €10 in the wallet to continue.`
    : `${label} treba ${formatTokens(cost)} tokena. Nedostaje ti ${formatTokens(missing)} tokena. Klikni Dodaj 10€ u walletu za nastavak.`;
}

export function desktopTokenShortfallMessage(language: 'hr' | 'en'): string {
  return language === 'en'
    ? 'Not enough desktop tokens. Use Add €10 in the wallet to continue.'
    : 'Nema dovoljno desktop tokena. Klikni Dodaj 10€ u walletu za nastavak.';
}
