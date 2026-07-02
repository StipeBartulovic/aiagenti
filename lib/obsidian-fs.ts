'use client';

import type { ObsidianNote } from './types';

/**
 * Klijentski sloj za pisanje u korisnikov Obsidian vault preko File System Access API.
 * Radi i lokalno (localhost) i s hostane (cloud) aplikacije — sve je u pregledniku,
 * server nikad ne dira disk. Chromium-only (Chrome/Edge/Brave). Handle se pamti u IndexedDB
 * pa korisnik ne mora svaki put birati mapu (samo potvrditi dozvolu ako je istekla).
 */

// Minimalni tipovi (File System Access API nije u svim TS lib.dom verzijama)
type PermState = 'granted' | 'denied' | 'prompt';
interface DirHandle {
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermState>;
}
interface FileHandleLike {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

const IDB_NAME = 'aivalidator';
const IDB_STORE = 'handles';
const VAULT_KEY = 'obsidian_vault';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/* ── IndexedDB (pamti handle mape) ── */
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  const out = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return out;
}

/* ── Dozvole ── */
async function ensurePermission(handle: DirHandle, request: boolean): Promise<boolean> {
  if (!handle.queryPermission) return true; // stariji Chromium bez perm API-ja
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (request && handle.requestPermission && (await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** Otvori picker, zapamti odabranu mapu. Mora se zvati iz korisničke geste (klik). */
export async function connectVault(): Promise<{ name: string } | null> {
  if (!isFileSystemAccessSupported()) throw new Error('Preglednik ne podržava File System Access (koristi Chrome/Edge).');
  const handle = (await (window as unknown as { showDirectoryPicker(opts?: object): Promise<DirHandle> }).showDirectoryPicker({
    id: 'aivalidator-vault',
    mode: 'readwrite',
  })) as DirHandle;
  if (!(await ensurePermission(handle, true))) throw new Error('Pristup mapi nije odobren.');
  await idbSet(VAULT_KEY, handle);
  return { name: handle.name };
}

/** Vrati zapamćenu mapu (ako postoji i ako dozvola još vrijedi). */
export async function getSavedVault(): Promise<{ name: string } | null> {
  try {
    const handle = await idbGet<DirHandle>(VAULT_KEY);
    if (!handle) return null;
    if (!(await ensurePermission(handle, false))) return { name: handle.name }; // postoji ali treba re-grant
    return { name: handle.name };
  } catch {
    return null;
  }
}

export async function forgetVault(): Promise<void> {
  await idbSet(VAULT_KEY, undefined);
}

/** Stvori (ili dohvati) ugniježđenu mapu po segmentima putanje. */
async function ensureDir(root: DirHandle, segments: string[]): Promise<DirHandle> {
  let dir = root;
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

/** Zapiši note u zapamćeni vault. Vraća broj zapisanih fajlova. */
export async function writeNotes(notes: ObsidianNote[]): Promise<number> {
  const handle = await idbGet<DirHandle>(VAULT_KEY);
  if (!handle) throw new Error('Vault nije spojen.');
  if (!(await ensurePermission(handle, true))) throw new Error('Pristup mapi nije odobren.');

  let written = 0;
  for (const note of notes) {
    const parts = note.path.split('/').filter(Boolean);
    const file = parts.pop()!;
    const dir = parts.length ? await ensureDir(handle, parts) : handle;
    const fh = await dir.getFileHandle(file, { create: true });
    const w = await fh.createWritable();
    await w.write(note.markdown);
    await w.close();
    written++;
  }
  return written;
}
