'use client';

import { getTauriInvoke } from './tauri';

export interface DesktopWallet {
  account_id: string;
  balance: number;
  starter_tokens?: number;
  tokens_per_eur?: number;
  added?: number;
}

export async function getDesktopWallet(): Promise<DesktopWallet | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<DesktopWallet>('billing_get_balance');
}

export async function topUpDesktopWallet(euros: number): Promise<DesktopWallet | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<DesktopWallet>('billing_top_up', { payload: { euros } });
}
