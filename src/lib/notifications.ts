/**
 * In-app notifications. They are derived from the live meetings and tasks (nothing is stored but what the user has read),
 * so they can never go stale or invent anything:
 *  - a meeting starting within the lead time (default 15 minutes), or already in progress,
 *  - a task past its due date (or due time today),
 *  - a follow-up reminder that has come due.
 */
import type { Meeting, Task } from '../types';
import { cairoDateOf, cairoTimeOf } from './cairoTime';

export type NotifKind = 'meeting' | 'overdue' | 'followup';

export interface AppNotification {
  id: string;
  kind: NotifKind;
  title: string;
  /** minutes until a meeting starts (negative once started); undefined for tasks */
  minutes?: number;
  /** YYYY-MM-DD for tasks */
  date?: string;
  refId: string;
}

export interface NotifPrefs {
  leadMinutes: number;
  meetings: boolean;
  overdue: boolean;
  followups: boolean;
  system: boolean;
}

export const DEFAULT_PREFS: NotifPrefs = { leadMinutes: 15, meetings: true, overdue: true, followups: true, system: false };
const PREFS_KEY = 'alkammah_notif_prefs';
const READ_KEY = 'alkammah_notif_read';
const SEEN_KEY = 'alkammah_notif_seen';

export function buildNotifications(meetings: Meeting[], tasks: Task[], prefs: NotifPrefs, nowMs: number): AppNotification[] {
  const out: AppNotification[] = [];
  const nowIso = new Date(nowMs).toISOString();
  const today = cairoDateOf(nowIso);
  const nowTime = cairoTimeOf(nowIso);

  if (prefs.meetings) {
    for (const m of meetings) {
      const start = new Date(m.start).getTime();
      const end = new Date(m.end).getTime();
      if (Number.isNaN(start)) continue;
      const minutes = Math.ceil((start - nowMs) / 60_000);
      const inProgress = start <= nowMs && (Number.isNaN(end) || nowMs < end);
      if (inProgress || (minutes > 0 && minutes <= prefs.leadMinutes)) {
        out.push({ id: `m:${m.id}:${m.start}`, kind: 'meeting', title: m.title, minutes: inProgress ? Math.min(0, minutes) : minutes, refId: m.id });
      }
    }
    out.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0));
  }

  const open = tasks.filter((t) => !t.isArchived && t.status !== 'Done' && t.status !== 'Closed');
  if (prefs.overdue) {
    const rows = open
      .filter((t) => {
        const d = (t.dueDate || '').slice(0, 10);
        return !!d && (d < today || (d === today && !!t.dueTime && t.dueTime < nowTime));
      })
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
      .slice(0, 25);
    for (const t of rows) out.push({ id: `o:${t.id}:${(t.dueDate || '').slice(0, 10)}`, kind: 'overdue', title: t.title, date: (t.dueDate || '').slice(0, 10), refId: t.id });
  }
  if (prefs.followups) {
    const rows = open
      .filter((t) => !!t.followUpDate && t.followUpDate.slice(0, 10) <= today)
      .sort((a, b) => (b.followUpDate || '').localeCompare(a.followUpDate || ''))
      .slice(0, 25);
    for (const t of rows) out.push({ id: `f:${t.id}:${(t.followUpDate || '').slice(0, 10)}`, kind: 'followup', title: t.title, date: (t.followUpDate || '').slice(0, 10), refId: t.id });
  }
  return out;
}

// ----- persisted preferences and read state (browser storage only; never required for anything to work)
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

let prefsCache: NotifPrefs | null = null;
const listeners = new Set<() => void>();

export const notifPrefs = {
  get(): NotifPrefs {
    if (!prefsCache) prefsCache = readJson(PREFS_KEY, DEFAULT_PREFS);
    return prefsCache;
  },
  set(patch: Partial<NotifPrefs>) {
    prefsCache = { ...notifPrefs.get(), ...patch };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, s: Set<string>) {
  try {
    // keep the list from growing forever
    localStorage.setItem(key, JSON.stringify([...s].slice(-400)));
  } catch {
    /* ignore */
  }
}
export const loadRead = () => readSet(READ_KEY);
export const saveRead = (s: Set<string>) => writeSet(READ_KEY, s);
export const loadSeen = () => readSet(SEEN_KEY);
export const saveSeen = (s: Set<string>) => writeSet(SEEN_KEY, s);
