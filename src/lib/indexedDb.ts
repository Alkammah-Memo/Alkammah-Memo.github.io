import {
  INITIAL_TASKS,
  INITIAL_MEETINGS,
  INITIAL_NOTEBOOKS,
  INITIAL_PAGES,
  INITIAL_PEOPLE,
  INITIAL_PROJECTS,
} from './referenceData';
import { parseBackup, type BackupErrorCode } from './backup';
import { convertLegacyMeeting } from './legacyMeetings';
import { Task, Meeting, Notebook, NotebookPage, Person, Project, AssistantMessage } from '../types';

const DB_NAME = 'ExecutivePlannerDB';
const DB_VERSION = 1;

export interface WorkspaceState {
  tasks: Task[];
  meetings: Meeting[];
  notebooks: Notebook[];
  pages: NotebookPage[];
  people: Person[];
  projects: Project[];
  messages: AssistantMessage[];
}

const ALL_STORES = ['tasks', 'meetings', 'notebooks', 'pages', 'people', 'projects', 'messages'] as const;
const DEPARTMENTS_KEY = 'departments_v1';
const MEETING_TZ_MIGRATION_KEY = 'meeting_time_model_utc_v1';

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

class LocalDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    const p = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        for (const name of ALL_STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
      };

      request.onblocked = () => console.warn('IndexedDB open is blocked by another tab; close other tabs of this app.');
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the schema: release our connection and reopen lazily next time.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        db.onclose = () => {
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
    // never cache a failed open: the next call retries
    p.catch(() => {
      if (this.dbPromise === p) this.dbPromise = null;
    });
    this.dbPromise = p;
    return p;
  }

  async initAndSeed(): Promise<WorkspaceState> {
    await this.getDB();

    const tasks = await this.getAll<Task>('tasks');
    let meetings = await this.getAll<Meeting>('meetings');
    let notebooks = await this.getAll<Notebook>('notebooks');
    let pages = await this.getAll<NotebookPage>('pages');
    const people = await this.getAll<Person>('people');
    const projects = await this.getAll<Project>('projects');
    const messages = await this.getAll<AssistantMessage>('messages');

    if (meetings.length === 0 && INITIAL_MEETINGS.length > 0) {
      await this.bulkPut('meetings', INITIAL_MEETINGS);
      meetings = INITIAL_MEETINGS;
    }

    // Only ensure a single blank clean notebook and page exists so the user has an open canvas to write on
    if (notebooks.length === 0) {
      await this.bulkPut('notebooks', INITIAL_NOTEBOOKS);
      await this.bulkPut('pages', INITIAL_PAGES);
      notebooks = INITIAL_NOTEBOOKS;
      pages = INITIAL_PAGES;
    }

    return { tasks, meetings, notebooks, pages, people, projects, messages };
  }

  /**
   * One-time, idempotent migration: meetings saved by the old meeting form stored Cairo wall time labelled as UTC.
   * Returns the meetings that were corrected (so the caller can push them to the cloud).
   */
  async migrateLegacyMeetingTimes(): Promise<Meeting[]> {
    if ((await this.getMetadata(MEETING_TZ_MIGRATION_KEY)) === 'done') return [];
    const meetings = await this.getAll<Meeting>('meetings');
    const fixed: Meeting[] = [];
    for (const m of meetings) {
      const converted = convertLegacyMeeting(m);
      if (converted) fixed.push(converted);
    }
    if (fixed.length > 0) await this.bulkPut('meetings', fixed);
    await this.setMetadata(MEETING_TZ_MIGRATION_KEY, 'done');
    return fixed;
  }

  async clearStores(storeNames: string[]): Promise<void> {
    const db = await this.getDB();
    const names = storeNames.filter((n) => db.objectStoreNames.contains(n));
    if (names.length === 0) return;
    const tx = db.transaction(names, 'readwrite');
    const done = txDone(tx);
    for (const n of names) tx.objectStore(n).clear();
    await done;
  }

  /** Atomically replace a store's contents (used when mirroring the merged cloud snapshot). */
  async replaceAll<T>(storeName: string, items: T[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, 'readwrite');
    const done = txDone(tx);
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) store.put(item);
    await done;
  }

  async clearAll(): Promise<void> {
    await this.clearStores([...ALL_STORES]);
    await this.deleteMetadata(DEPARTMENTS_KEY);
  }

  async getMetadata(key: string): Promise<string | null> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('metadata', 'readonly');
        const req = tx.objectStore('metadata').get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async setMetadata(key: string, value: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('metadata', 'readwrite');
    const done = txDone(tx);
    tx.objectStore('metadata').put({ key, value });
    await done;
  }

  async deleteMetadata(key: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('metadata', 'readwrite');
    const done = txDone(tx);
    tx.objectStore('metadata').delete(key);
    await done;
  }

  /** Custom department list (null when the user never customised it). */
  async getDepartments(): Promise<string[] | null> {
    const raw = await this.getMetadata(DEPARTMENTS_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? (parsed as string[]) : null;
    } catch {
      return null;
    }
  }

  async setDepartments(list: string[]): Promise<void> {
    await this.setMetadata(DEPARTMENTS_KEY, JSON.stringify(list));
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async put<T>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, 'readwrite');
    const done = txDone(tx);
    tx.objectStore(storeName).put(item);
    await done;
  }

  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, 'readwrite');
    const done = txDone(tx);
    tx.objectStore(storeName).delete(key);
    await done;
  }

  async bulkPut<T>(storeName: string, items: T[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, 'readwrite');
    const done = txDone(tx);
    const store = tx.objectStore(storeName);
    for (const item of items) store.put(item);
    await done;
  }

  async exportFullBackup(): Promise<string> {
    const [tasks, meetings, notebooks, pages, people, projects, messages, departments] = await Promise.all([
      this.getAll<Task>('tasks'),
      this.getAll<Meeting>('meetings'),
      this.getAll<Notebook>('notebooks'),
      this.getAll<NotebookPage>('pages'),
      this.getAll<Person>('people'),
      this.getAll<Project>('projects'),
      this.getAll<AssistantMessage>('messages'),
      this.getDepartments(),
    ]);

    const backup = {
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      timezone: 'Africa/Cairo',
      data: { tasks, meetings, notebooks, pages, people, projects, messages, departments: departments ?? undefined },
    };

    return JSON.stringify(backup, null, 2);
  }

  /**
   * Restores a backup. The file is fully validated first (nothing is written if it is malformed) and all
   * stores are written in ONE transaction. mode 'replace' makes the file authoritative; 'merge' only upserts.
   */
  async importFullBackup(jsonString: string, mode: 'replace' | 'merge' = 'replace'): Promise<WorkspaceState> {
    const result = parseBackup(jsonString);
    if (!result.ok) throw new BackupError(result.code, result.detail);
    const { stores, messages, departments } = result.backup;

    const db = await this.getDB();
    const names: string[] = [...Object.keys(stores)];
    if (messages) names.push('messages');
    if (departments) names.push('metadata');
    const tx = db.transaction(names, 'readwrite');
    const done = txDone(tx);
    const writeStore = (name: string, items: unknown[]) => {
      const store = tx.objectStore(name);
      if (mode === 'replace') store.clear();
      for (const item of items) store.put(item);
    };
    for (const [name, items] of Object.entries(stores)) writeStore(name, items ?? []);
    if (messages) writeStore('messages', messages);
    if (departments) tx.objectStore('metadata').put({ key: DEPARTMENTS_KEY, value: JSON.stringify(departments) });
    await done;

    // Backups made before the time-model fix may hold legacy wall-clock meetings; the conversion only touches
    // that exact legacy shape, so it is safe to run again over restored data.
    await this.deleteMetadata(MEETING_TZ_MIGRATION_KEY);
    await this.migrateLegacyMeetingTimes();
    return this.initAndSeed();
  }
}

export class BackupError extends Error {
  code: BackupErrorCode;
  detail?: string;
  constructor(code: BackupErrorCode, detail?: string) {
    super(`Backup rejected: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'BackupError';
    this.code = code;
    this.detail = detail;
  }
}

export const localDB = new LocalDB();
