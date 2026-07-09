'use client';

import type {
  SavedProject,
  SaveProjectInput,
  IdeaFormData,
  ValidationReport,
  ProjectKnowledge,
  ChatMessage,
  ProjectTask,
  MarketIntelligence,
  SessionDigest,
  UnitEconomicsInputs,
} from './types';
import { getTauriInvoke } from './tauri';

const DB_NAME = 'aivalidator-local-db';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const LEGACY_STORAGE_KEY = 'aivalidator_local_projects_v1';
const LOCAL_OWNER_UID = 'local-profile';
const MAX_CHAT_MESSAGES = 60;

type ProjectCommand =
  | 'project_create'
  | 'project_update'
  | 'project_get'
  | 'project_list'
  | 'project_update_knowledge'
  | 'project_update_panel'
  | 'project_update_tasks'
  | 'project_update_market'
  | 'project_update_digests'
  | 'project_update_unit_economics'
  | 'project_delete'
  | 'project_import'
  | 'project_restore_workspace'
  | 'project_erase_all';

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

async function invokeProject<T>(command: ProjectCommand, payload?: unknown): Promise<{ used: true; result: T } | { used: false }> {
  const invoke = getTauriInvoke();
  if (!invoke) return { used: false };
  return { used: true, result: await invoke<T>(command, { payload }) };
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function buildSummary(idea: IdeaFormData, report: ValidationReport | null): SavedProject['summary'] {
  return {
    product_name: idea.product_name,
    business_model: idea.business_model,
    elevator_pitch: idea.elevator_pitch,
    score: report?.score ?? null,
    personas_count: report?.meta.personas_count ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ImportableProject = Record<string, unknown> & { idea: IdeaFormData };

function hasImportableIdea(value: unknown): value is ImportableProject {
  return isRecord(value) && isRecord(value.idea);
}

function importedProjectCandidates(parsed: unknown): ImportableProject[] {
  if (!isRecord(parsed)) return [];
  if (hasImportableIdea(parsed.project)) return [parsed.project];
  if (hasImportableIdea(parsed)) return [parsed];
  if (Array.isArray(parsed.projects)) return parsed.projects.filter(hasImportableIdea);
  if (Array.isArray(parsed)) return parsed.filter(hasImportableIdea);
  return [];
}

function normalizeImportedProject(rawProject: ImportableProject): SavedProject {
  const timestamp = nowIso();
  const idea = rawProject.idea;
  const report = (rawProject.report ?? null) as ValidationReport | null;
  const summary = rawProject.summary && isRecord(rawProject.summary)
    ? rawProject.summary as SavedProject['summary']
    : buildSummary(idea, report);

  return {
    ...rawProject,
    id: createId(),
    owner_uid: LOCAL_OWNER_UID,
    status: rawProject.status === 'draft' || rawProject.status === 'validated'
      ? rawProject.status
      : report
      ? 'validated'
      : 'draft',
    idea,
    report,
    knowledge: rawProject.knowledge ?? null,
    panel: Array.isArray(rawProject.panel) ? rawProject.panel as ChatMessage[] : [],
    tasks: Array.isArray(rawProject.tasks) ? rawProject.tasks as ProjectTask[] : [],
    chats: rawProject.chats && isRecord(rawProject.chats)
      ? rawProject.chats as Partial<Record<string, ChatMessage[]>>
      : {},
    market: rawProject.market ?? null,
    digests: Array.isArray(rawProject.digests) ? rawProject.digests as SessionDigest[] : [],
    summary,
    created_at: typeof rawProject.created_at === 'string' ? rawProject.created_at : timestamp,
    updated_at: timestamp,
  } as SavedProject;
}

function emitProjectChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aivalidator:projects'));
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const store = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at');
        store.createIndex('updated_at', 'updated_at');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function putProject(project: SavedProject): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(PROJECT_STORE, 'readwrite');
  const request = tx.objectStore(PROJECT_STORE).put(project);
  await Promise.all([requestToPromise(request), transactionDone(tx)]);
  emitProjectChange();
}

async function getAllProjectsRaw(): Promise<SavedProject[]> {
  const db = await openDatabase();
  const tx = db.transaction(PROJECT_STORE, 'readonly');
  const request = tx.objectStore(PROJECT_STORE).getAll();
  const projects = await requestToPromise<SavedProject[]>(request);
  await transactionDone(tx);
  return projects;
}

async function getProjectRaw(projectId: string): Promise<SavedProject | null> {
  const db = await openDatabase();
  const tx = db.transaction(PROJECT_STORE, 'readonly');
  const request = tx.objectStore(PROJECT_STORE).get(projectId);
  const project = await requestToPromise<SavedProject | undefined>(request);
  await transactionDone(tx);
  return project ?? null;
}

async function deleteProjectRaw(projectId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(PROJECT_STORE, 'readwrite');
  const request = tx.objectStore(PROJECT_STORE).delete(projectId);
  await Promise.all([requestToPromise(request), transactionDone(tx)]);
  emitProjectChange();
}

async function clearProjectsRaw(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(PROJECT_STORE, 'readwrite');
  const request = tx.objectStore(PROJECT_STORE).clear();
  await Promise.all([requestToPromise(request), transactionDone(tx)]);
  emitProjectChange();
}

async function ensureMigratedFromLocalStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    let projects: SavedProject[] = [];
    try {
      const parsed = JSON.parse(raw);
      projects = Array.isArray(parsed) ? parsed as SavedProject[] : [];
    } catch {
      projects = [];
    }
    if (!projects.length) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }

    const db = await openDatabase();
    const tx = db.transaction(PROJECT_STORE, 'readwrite');
    const store = tx.objectStore(PROJECT_STORE);
    projects.forEach((project) => store.put(project));
    await transactionDone(tx);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    emitProjectChange();
  })();

  return migrationPromise;
}

async function patchProject(projectId: string, patch: (project: SavedProject) => SavedProject): Promise<void> {
  await ensureMigratedFromLocalStorage();
  const existing = await getProjectRaw(projectId);
  if (!existing) return;
  await putProject(patch(existing));
}

export async function createProject(
  ownerUid: string,
  input: SaveProjectInput
): Promise<string> {
  const tauriResult = await invokeProject<string>('project_create', { ownerUid, input });
  if (tauriResult.used) return tauriResult.result;

  await ensureMigratedFromLocalStorage();
  const timestamp = nowIso();
  const project: SavedProject = {
    id: createId(),
    owner_uid: LOCAL_OWNER_UID,
    status: input.report ? 'validated' : 'draft',
    idea: input.idea,
    report: input.report ?? null,
    knowledge: null,
    panel: [],
    market: null,
    tasks: [],
    digests: [],
    unit_economics: null,
    chats: {},
    summary: buildSummary(input.idea, input.report),
    created_at: timestamp,
    updated_at: timestamp,
  };
  await putProject(project);
  return project.id;
}

export async function updateProject(
  projectId: string,
  input: SaveProjectInput
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update', { projectId, input });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  await patchProject(projectId, (project) => ({
    ...project,
    status: input.report ? 'validated' : 'draft',
    idea: input.idea,
    report: input.report ?? null,
    summary: buildSummary(input.idea, input.report),
    updated_at: timestamp,
  }));
}

export async function getProject(
  projectId: string,
  ownerUid: string
): Promise<SavedProject | null> {
  const tauriResult = await invokeProject<SavedProject | null>('project_get', { projectId, ownerUid });
  if (tauriResult.used) return tauriResult.result;

  await ensureMigratedFromLocalStorage();
  return getProjectRaw(projectId);
}

export async function listProjects(ownerUid: string): Promise<SavedProject[]> {
  const tauriResult = await invokeProject<SavedProject[]>('project_list', { ownerUid });
  if (tauriResult.used) return tauriResult.result;

  await ensureMigratedFromLocalStorage();
  return (await getAllProjectsRaw()).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function updateProjectKnowledge(
  projectId: string,
  knowledge: ProjectKnowledge
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update_knowledge', { projectId, knowledge });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  await patchProject(projectId, (project) => ({ ...project, knowledge, updated_at: timestamp }));
}

export async function updateProjectPanel(
  projectId: string,
  messages: ChatMessage[]
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update_panel', { projectId, messages });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  const capped = messages.slice(-MAX_CHAT_MESSAGES);
  await patchProject(projectId, (project) => ({ ...project, panel: capped, updated_at: timestamp }));
}

const MARKET_HISTORY_CAP = 5;

export async function updateProjectMarket(
  projectId: string,
  market: MarketIntelligence
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update_market', { projectId, market });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  await patchProject(projectId, (project) => {
    // stari "trenutni" market prelazi u povijest prije nego ga novi zamijeni
    const market_history = project.market
      ? [project.market, ...(project.market_history ?? [])].slice(0, MARKET_HISTORY_CAP)
      : (project.market_history ?? []);
    return { ...project, market, market_history, updated_at: timestamp };
  });
}

export async function updateProjectTasks(
  projectId: string,
  tasks: ProjectTask[]
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update_tasks', { projectId, tasks });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  await patchProject(projectId, (project) => ({ ...project, tasks, updated_at: timestamp }));
}

const DIGEST_CAP = 25;

export async function updateProjectDigests(
  projectId: string,
  digests: SessionDigest[]
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update_digests', { projectId, digests });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  const capped = digests.slice(0, DIGEST_CAP);
  await patchProject(projectId, (project) => ({ ...project, digests: capped, updated_at: timestamp }));
}

export async function updateProjectUnitEconomics(
  projectId: string,
  unitEconomics: UnitEconomicsInputs
): Promise<void> {
  const tauriResult = await invokeProject<void>('project_update_unit_economics', { projectId, unitEconomics });
  if (tauriResult.used) return;

  const timestamp = nowIso();
  await patchProject(projectId, (project) => ({ ...project, unit_economics: unitEconomics, updated_at: timestamp }));
}

export async function deleteProject(projectId: string): Promise<void> {
  const tauriResult = await invokeProject<void>('project_delete', { projectId });
  if (tauriResult.used) return;

  await ensureMigratedFromLocalStorage();
  await deleteProjectRaw(projectId);
}

export function exportProject(project: SavedProject): Blob {
  return new Blob([JSON.stringify({ format: 'aivalidator.project.v1', project }, null, 2)], {
    type: 'application/json',
  });
}

export async function exportWorkspace(): Promise<Blob> {
  const projects = await listProjects(LOCAL_OWNER_UID);
  return new Blob([
    JSON.stringify({
      format: 'aivalidator.workspace.v1',
      exported_at: nowIso(),
      projects,
    }, null, 2),
  ], { type: 'application/json' });
}

export async function importProjectFromText(text: string): Promise<string> {
  const tauriResult = await invokeProject<string>('project_import', { text });
  if (tauriResult.used) return tauriResult.result;

  await ensureMigratedFromLocalStorage();
  const parsed = JSON.parse(text.trim().replace(/^\uFEFF/, ''));
  const rawProjects = importedProjectCandidates(parsed);
  if (!rawProjects.length) throw new Error('Invalid AI Validator project file.');

  let firstId = '';
  for (const rawProject of rawProjects) {
    const project = normalizeImportedProject(rawProject);
    await putProject(project);
    firstId ||= project.id;
  }
  return firstId;
}

export async function restoreWorkspaceFromText(text: string): Promise<number> {
  const tauriResult = await invokeProject<number>('project_restore_workspace', { text });
  if (tauriResult.used) return tauriResult.result;

  await ensureMigratedFromLocalStorage();
  const parsed = JSON.parse(text);
  const projects = parsed?.format === 'aivalidator.workspace.v1' && Array.isArray(parsed.projects)
    ? parsed.projects as SavedProject[]
    : null;
  if (!projects) throw new Error('Invalid AI Validator workspace file.');

  await clearProjectsRaw();
  const timestamp = nowIso();
  const db = await openDatabase();
  const tx = db.transaction(PROJECT_STORE, 'readwrite');
  const store = tx.objectStore(PROJECT_STORE);
  projects.forEach((project) => {
    store.put({
      ...project,
      owner_uid: LOCAL_OWNER_UID,
      updated_at: project.updated_at ?? timestamp,
    });
  });
  await transactionDone(tx);
  emitProjectChange();
  return projects.length;
}

export async function eraseAllLocalProjects(): Promise<void> {
  const tauriResult = await invokeProject<void>('project_erase_all');
  if (tauriResult.used) return;

  await ensureMigratedFromLocalStorage();
  await clearProjectsRaw();
}
