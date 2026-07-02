'use client';

type TauriWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

export function getTauriInvoke() {
  if (typeof window === 'undefined') return null;
  return (window as TauriWindow).__TAURI__?.core?.invoke ?? null;
}

export function isTauriRuntime(): boolean {
  return Boolean(getTauriInvoke());
}
