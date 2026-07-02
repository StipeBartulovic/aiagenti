'use client';

import { getTauriInvoke, isTauriRuntime } from './tauri';

export type HostingMode = 'hosted' | 'bring_your_own';

export interface UserSettings {
  hostingMode: HostingMode;
  workspaceName: string;
  deepseekApiKey: string;
  tavilyApiKey: string;
  githubToken: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  desktopSharedSecret: string;
  aiValidatorDesktopApiKey: string;
  aiValidatorDesktopApiUrl: string;
  aiValidatorDesktopWalletUrl: string;
}

export const USER_SETTINGS_STORAGE_KEY = 'aivalidator_user_settings_v1';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  hostingMode: 'hosted',
  workspaceName: 'AI Validator',
  deepseekApiKey: '',
  tavilyApiKey: '',
  githubToken: '',
  upstashRedisRestUrl: '',
  upstashRedisRestToken: '',
  desktopSharedSecret: '',
  aiValidatorDesktopApiKey: '',
  aiValidatorDesktopApiUrl: '',
  aiValidatorDesktopWalletUrl: '',
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function normalizeSettings(settings: Partial<UserSettings> | null | undefined): UserSettings {
  const merged = { ...DEFAULT_USER_SETTINGS, ...(settings ?? {}) };
  return {
    ...merged,
    hostingMode: merged.hostingMode === 'bring_your_own' ? 'bring_your_own' : 'hosted',
    workspaceName: typeof merged.workspaceName === 'string' && merged.workspaceName.trim()
      ? merged.workspaceName.trim()
      : DEFAULT_USER_SETTINGS.workspaceName,
  };
}

export function readUserSettings(): UserSettings {
  const storage = getStorage();
  if (!storage) return DEFAULT_USER_SETTINGS;

  const raw = storage.getItem(USER_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_USER_SETTINGS;

  try {
    return normalizeSettings(JSON.parse(raw) as Partial<UserSettings>);
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export async function loadUserSettings(): Promise<UserSettings> {
  const local = readUserSettings();
  if (!isTauriRuntime()) return local;

  const invoke = getTauriInvoke();
  if (!invoke) return local;

  try {
    const remote = await invoke<Partial<UserSettings>>('settings_get');
    return normalizeSettings({ ...local, ...remote });
  } catch {
    return local;
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const normalized = normalizeSettings(settings);
  const storage = getStorage();
  if (storage) {
    storage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('aivalidator:settings'));
  }

  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('settings_save', { payload: normalized });
    } catch {
      // Browser localStorage stays the source of truth if the desktop sync fails.
    }
  }

  return normalized;
}

export async function clearUserSettings(): Promise<UserSettings> {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(USER_SETTINGS_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('aivalidator:settings'));
  }

  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('settings_reset');
    } catch {
      // Best effort only.
    }
  }

  return DEFAULT_USER_SETTINGS;
}

function envLine(key: string, value: string): string {
  return value ? `${key}=${value}` : `${key}=`;
}

export function exportEnvBlock(settings: UserSettings): string {
  return [
    '# AI Validator local settings export',
    envLine('DEEPSEEK_API_KEY', settings.deepseekApiKey),
    envLine('TAVILY_API_KEY', settings.tavilyApiKey),
    envLine('GITHUB_TOKEN', settings.githubToken),
    envLine('UPSTASH_REDIS_REST_URL', settings.upstashRedisRestUrl),
    envLine('UPSTASH_REDIS_REST_TOKEN', settings.upstashRedisRestToken),
    envLine('DESKTOP_AI_SHARED_SECRET', settings.desktopSharedSecret),
    envLine('AI_VALIDATOR_DESKTOP_API_KEY', settings.aiValidatorDesktopApiKey),
    envLine('AI_VALIDATOR_DESKTOP_API_URL', settings.aiValidatorDesktopApiUrl),
    envLine('AI_VALIDATOR_DESKTOP_WALLET_URL', settings.aiValidatorDesktopWalletUrl),
  ].join('\n');
}
