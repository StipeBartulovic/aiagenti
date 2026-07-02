'use client';

export type TokenAction =
  | 'validation'
  | 'audience_suggest'
  | 'tool_light'
  | 'tool_research'
  | 'advisor_fast'
  | 'advisor_deep'
  | 'advisor_task'
  | 'advisor_memory'
  | 'advisor_setup';

export const TOKEN_STORAGE_KEY = 'aivalidator_tokens_v1';
export const TOKEN_STARTER_GRANT_KEY = 'aivalidator_tokens_starter_granted_v1';

export const TOKENS_PER_EUR = 1000;
export const STARTER_TOKENS = 3600;

export const TOKEN_COSTS: Record<TokenAction, number> = {
  validation: 1200,
  audience_suggest: 120,
  tool_light: 250,
  tool_research: 550,
  advisor_fast: 140,
  advisor_deep: 380,
  advisor_task: 120,
  advisor_memory: 60,
  advisor_setup: 300,
};

export function readTokenBalance(): number {
  if (typeof window === 'undefined') return STARTER_TOKENS;
  const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function writeTokenBalance(nextBalance: number): number {
  const normalized = Math.max(0, Math.floor(nextBalance));
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, String(normalized));
    window.dispatchEvent(new CustomEvent('aivalidator:tokens'));
  }
  return normalized;
}

export function ensureStarterTokens(): number {
  if (typeof window === 'undefined') return STARTER_TOKENS;
  const alreadyGranted = window.localStorage.getItem(TOKEN_STARTER_GRANT_KEY) === '1';
  if (!alreadyGranted) {
    window.localStorage.setItem(TOKEN_STARTER_GRANT_KEY, '1');
    return writeTokenBalance(readTokenBalance() + STARTER_TOKENS);
  }
  return readTokenBalance();
}

export function addSimulatedPurchase(euros: number): number {
  return writeTokenBalance(readTokenBalance() + euros * TOKENS_PER_EUR);
}

export function spendTokens(cost: number): { ok: true; balance: number } | { ok: false; balance: number; missing: number } {
  const balance = readTokenBalance();
  if (balance < cost) return { ok: false, balance, missing: cost - balance };
  return { ok: true, balance: writeTokenBalance(balance - cost) };
}

export function formatTokens(tokens: number): string {
  return new Intl.NumberFormat('hr-HR').format(Math.max(0, Math.floor(tokens)));
}
