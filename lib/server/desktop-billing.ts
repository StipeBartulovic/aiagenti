import { ServerActionError } from './errors';
import type { ServerActionCommand } from './actions';

const STARTER_TOKENS = 3600;
const TOKENS_PER_EUR = 1000;

const COMMAND_COSTS: Record<ServerActionCommand, number | ((payload: unknown) => number)> = {
  ai_angles: 250,
  ai_audiences: 120,
  ai_chat: (payload) => {
    const body = payload && typeof payload === 'object' ? payload as { deepMode?: unknown } : {};
    return body.deepMode ? 380 : 140;
  },
  ai_conversion: 250,
  ai_conjoint: 250,
  ai_idea_brief: 0,
  ai_intake: 0,
  ai_interview: 250,
  ai_kb_update: 60,
  ai_obsidian_build: 250,
  ai_pricing: 250,
  ai_research: 550,
  ai_strategy: 250,
  ai_tasks: 120,
  ai_translate: 250,
  ai_triage: 0,
  ai_validate: 1200,
};

interface BillingAccount {
  account_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

interface TokenTransaction {
  id: string;
  account_id: string;
  type: 'starter_grant' | 'top_up' | 'charge';
  amount: number;
  balance_after: number;
  command?: ServerActionCommand;
  created_at: string;
}

interface LedgerFile {
  format: 'aivalidator.desktop-ledger.v1';
  accounts: Record<string, BillingAccount>;
  transactions: TokenTransaction[];
}

let memoryLedger: LedgerFile = {
  format: 'aivalidator.desktop-ledger.v1',
  accounts: {},
  transactions: [],
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAccountId(accountId: string | null): string {
  const cleaned = (accountId || '').trim();
  if (!cleaned) throw new ServerActionError('Missing desktop account id.', 401, 'missing_desktop_account');
  return cleaned.slice(0, 120);
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = redisConfig();
  if (!config) return null;

  const res = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new ServerActionError('Token ledger database request failed.', 500, 'token_ledger_db_failed');
  }

  const body = await res.json() as { result?: unknown; error?: string }[];
  const first = body[0];
  if (first?.error) {
    throw new ServerActionError('Token ledger database command failed.', 500, 'token_ledger_db_failed');
  }

  return (first?.result ?? null) as T | null;
}

async function redisGetJson<T>(key: string): Promise<T | null> {
  const result = await redisCommand<string | null>(['GET', key]);
  if (!result) return null;
  return JSON.parse(result) as T;
}

async function redisSetJson(key: string, value: unknown): Promise<void> {
  await redisCommand(['SET', key, JSON.stringify(value)]);
}

async function redisPushTransaction(transaction: TokenTransaction): Promise<void> {
  const config = redisConfig();
  if (!config) {
    memoryLedger.transactions.unshift(transaction);
    memoryLedger.transactions = memoryLedger.transactions.slice(0, 500);
    return;
  }

  await redisCommand(['LPUSH', `desktop:tx:${transaction.account_id}`, JSON.stringify(transaction)]);
  await redisCommand(['LTRIM', `desktop:tx:${transaction.account_id}`, 0, 99]);
}

function createTransaction(
  account: BillingAccount,
  type: TokenTransaction['type'],
  amount: number,
  command?: ServerActionCommand
): TokenTransaction {
  return {
    id: crypto.randomUUID(),
    account_id: account.account_id,
    type,
    amount,
    balance_after: account.balance,
    command,
    created_at: nowIso(),
  };
}

async function readLedger(): Promise<LedgerFile> {
  return memoryLedger;
}

async function writeLedger(ledger: LedgerFile): Promise<void> {
  memoryLedger = ledger;
}

async function getOrCreateAccount(accountId: string): Promise<BillingAccount> {
  const accountKey = `desktop:account:${accountId}`;
  const persisted = await redisGetJson<BillingAccount>(accountKey);
  if (persisted) return persisted;

  const ledger = await readLedger();
  const existing = ledger.accounts[accountId];
  if (existing) return existing;

  const timestamp = nowIso();
  const account: BillingAccount = {
    account_id: accountId,
    balance: STARTER_TOKENS,
    created_at: timestamp,
    updated_at: timestamp,
  };
  ledger.accounts[accountId] = account;
  await writeLedger(ledger);
  await redisSetJson(accountKey, account);
  await redisPushTransaction(createTransaction(account, 'starter_grant', STARTER_TOKENS));
  return account;
}

async function saveAccount(account: BillingAccount): Promise<void> {
  const ledger = await readLedger();
  ledger.accounts[account.account_id] = account;
  await writeLedger(ledger);
  await redisSetJson(`desktop:account:${account.account_id}`, account);
}

export function getDesktopCommandCost(command: ServerActionCommand, payload: unknown): number {
  const cost = COMMAND_COSTS[command];
  const value = typeof cost === 'function' ? cost(payload) : cost;
  return Math.max(0, Math.floor(value));
}

export function readDesktopAccountId(headers: Headers): string {
  return normalizeAccountId(headers.get('x-ai-validator-account-id'));
}

export function verifyDesktopSecret(headers: Headers): void {
  const required = process.env.DESKTOP_AI_SHARED_SECRET;
  if (!required) return;

  const auth = headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (token !== required) {
    throw new ServerActionError('Desktop AI authorization failed.', 401, 'desktop_auth_failed');
  }
}

export async function getDesktopWallet(accountId: string) {
  const account = await getOrCreateAccount(normalizeAccountId(accountId));
  return {
    account_id: account.account_id,
    balance: account.balance,
    starter_tokens: STARTER_TOKENS,
    tokens_per_eur: TOKENS_PER_EUR,
  };
}

export async function addDesktopWalletTokens(accountId: string, euros: number) {
  const normalized = normalizeAccountId(accountId);
  const amount = Number.isFinite(euros) ? Math.max(0, Math.floor(euros * TOKENS_PER_EUR)) : 0;
  if (amount <= 0) throw new ServerActionError('Invalid top-up amount.', 400, 'invalid_top_up');

  const ledger = await readLedger();
  const account = await getOrCreateAccount(normalized);
  account.balance += amount;
  account.updated_at = nowIso();
  ledger.accounts[normalized] = account;
  await saveAccount(account);
  await redisPushTransaction(createTransaction(account, 'top_up', amount));

  return {
    account_id: account.account_id,
    balance: account.balance,
    added: amount,
  };
}

export async function ensureDesktopTokens(accountId: string, command: ServerActionCommand, payload: unknown) {
  const account = await getOrCreateAccount(normalizeAccountId(accountId));
  const cost = getDesktopCommandCost(command, payload);
  if (account.balance < cost) {
    throw new ServerActionError(
      `Not enough desktop tokens. Needed ${cost}, available ${account.balance}.`,
      402,
      'insufficient_desktop_tokens'
    );
  }
  return { cost, balance_before: account.balance };
}

export async function chargeDesktopTokens(accountId: string, cost: number, command?: ServerActionCommand) {
  if (cost <= 0) {
    const account = await getOrCreateAccount(normalizeAccountId(accountId));
    return { balance: account.balance, charged: 0 };
  }

  const normalized = normalizeAccountId(accountId);
  const account = await getOrCreateAccount(normalized);
  account.balance = Math.max(0, account.balance - cost);
  account.updated_at = nowIso();
  await saveAccount(account);
  await redisPushTransaction(createTransaction(account, 'charge', -cost, command));

  return { balance: account.balance, charged: cost };
}
