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
  | 'advisor_setup'
  | 'discovery_question'
  | 'market_scope'
  | 'market_research'
  | 'session_digest'
  | 'advisor_debate';

export const TOKEN_STORAGE_KEY = 'aivalidator_tokens_v1';
export const TOKEN_STARTER_GRANT_KEY = 'aivalidator_tokens_starter_granted_v1';
export const TOKEN_LOG_STORAGE_KEY = 'aivalidator_tokens_log_v1';
const TOKEN_LOG_MAX_ENTRIES = 50;

export interface TokenLogEntry {
  ts: string;
  type: 'spend' | 'topup' | 'starter';
  label: string;
  amount: number;
  balance_after: number;
}

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
  discovery_question: 90,
  market_scope: 50,
  market_research: 750,
  session_digest: 220,
  advisor_debate: 950,
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

/** Lokalna potrošačka evidencija — odgovor na "kako pratimo tko je potrošio koliko" bez pravog naloga. */
export function readTokenLog(): TokenLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TOKEN_LOG_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TokenLogEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendTokenLog(entry: TokenLogEntry): void {
  if (typeof window === 'undefined') return;
  const next = [entry, ...readTokenLog()].slice(0, TOKEN_LOG_MAX_ENTRIES);
  window.localStorage.setItem(TOKEN_LOG_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('aivalidator:tokens'));
}

export function ensureStarterTokens(): number {
  if (typeof window === 'undefined') return STARTER_TOKENS;
  const alreadyGranted = window.localStorage.getItem(TOKEN_STARTER_GRANT_KEY) === '1';
  if (!alreadyGranted) {
    window.localStorage.setItem(TOKEN_STARTER_GRANT_KEY, '1');
    const balance = writeTokenBalance(readTokenBalance() + STARTER_TOKENS);
    appendTokenLog({ ts: new Date().toISOString(), type: 'starter', label: 'Startni bonus', amount: STARTER_TOKENS, balance_after: balance });
    return balance;
  }
  return readTokenBalance();
}

export function addSimulatedPurchase(euros: number, label = 'Test top-up'): number {
  const amount = euros * TOKENS_PER_EUR;
  const balance = writeTokenBalance(readTokenBalance() + amount);
  appendTokenLog({ ts: new Date().toISOString(), type: 'topup', label, amount, balance_after: balance });
  return balance;
}

export function spendTokens(
  cost: number,
  label = 'AI akcija'
): { ok: true; balance: number } | { ok: false; balance: number; missing: number } {
  const balance = readTokenBalance();
  if (balance < cost) return { ok: false, balance, missing: cost - balance };
  const nextBalance = writeTokenBalance(balance - cost);
  appendTokenLog({ ts: new Date().toISOString(), type: 'spend', label, amount: -cost, balance_after: nextBalance });
  return { ok: true, balance: nextBalance };
}

export function formatTokens(tokens: number): string {
  return new Intl.NumberFormat('hr-HR').format(Math.max(0, Math.floor(tokens)));
}
