/**
 * Model queue and honest usage tracking.
 *
 * Order of use: Key 1 (High models, then Mid models), then Key 2 the same way, then Key 3. When every model on every key is
 * used up, the app falls to the device voice (it can hear and speak but cannot think, so it only says when Gemini returns).
 *
 * Google does not publish remaining quota through its API, so nothing here is guessed. We keep:
 *  - how many requests Google actually answered for each key and model today (counted on this device),
 *  - the daily limit and the exact "retry in" time, but only once Google itself reports them in a quota error,
 *  - real status (ready, busy, used up, not available) from real responses.
 */
import { classifyError, keyManager } from './keyManager';
import type { KeySlot } from './keyManager';

export type Tier = 'high' | 'mid';

export const MODEL_TIERS: { id: Tier; models: string[] }[] = [
  { id: 'high', models: ['gemini-3.8-flash', 'gemini-3.6-flash'] },
  { id: 'mid', models: ['gemini-3.5-flash', 'gemini-3.1-flash-lite'] },
];

export const QUEUE_MODELS: { model: string; tier: Tier }[] = MODEL_TIERS.flatMap((t) => t.models.map((model) => ({ model, tier: t.id })));

export type BlockKind = 'daily' | 'minute' | 'busy' | 'missing';

export interface ModelUsage {
  /** Pacific-time day the counter belongs to (Google's daily quota resets at midnight Pacific) */
  day: string;
  answered: number;
  blockedUntil?: number;
  blockKind?: BlockKind;
  lastOkAt?: number;
  lastMs?: number;
  lastError?: string;
}

interface UsageState {
  usage: Record<string, ModelUsage>;
  /** daily request limits Google reported in quota errors, per model */
  limits: Record<string, number>;
  last?: { slotId: number; model: string; at: number };
}

const STORAGE_KEY = 'alkammah_model_usage_v1';

export const pacificDay = (at = Date.now()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(at));

/** Epoch ms of the next midnight in Pacific time (when Google's daily free quota resets). */
export function nextDailyReset(at = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return at + (86400 - (get('hour') * 3600 + get('minute') * 60 + get('second'))) * 1000;
}

const keyOf = (slotId: number, model: string) => `${slotId}|${model}`;

function read(): UsageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as UsageState;
      return { usage: p.usage || {}, limits: p.limits || {}, last: p.last };
    }
  } catch {
    /* ignore */
  }
  return { usage: {}, limits: {} };
}

/** Pulls Google's own numbers out of a quota error: "limit: 20 ... retry in 15h30m10s". */
function parseQuotaError(raw: string): { limit?: number; retryMs?: number } {
  const limit = raw.match(/limit:\s*(\d+)/i);
  const retry = raw.match(/retry in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i);
  let retryMs: number | undefined;
  if (retry && (retry[1] || retry[2] || retry[3])) {
    retryMs = (Number(retry[1] || 0) * 3600 + Number(retry[2] || 0) * 60 + Number(retry[3] || 0)) * 1000;
  }
  return { limit: limit ? Number(limit[1]) : undefined, retryMs };
}

type Listener = () => void;

class UsageTracker {
  private state: UsageState = read();
  private listeners = new Set<Listener>();
  private snap = { v: 0 };

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** changes identity on every update, for useSyncExternalStore */
  getVersion = () => this.snap;

  private commit() {
    this.snap = { v: this.snap.v + 1 };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode: counters live in memory only */
    }
    this.listeners.forEach((l) => l());
  }

  get(slotId: number, model: string): ModelUsage {
    const u = this.state.usage[keyOf(slotId, model)];
    const today = pacificDay();
    if (!u) return { day: today, answered: 0 };
    return u.day === today ? u : { ...u, day: today, answered: 0 };
  }

  limitFor(model: string): number | undefined {
    return this.state.limits[model];
  }

  last() {
    return this.state.last;
  }

  isBlocked(slotId: number, model: string, now = Date.now()): boolean {
    const u = this.state.usage[keyOf(slotId, model)];
    return !!u?.blockedUntil && u.blockedUntil > now;
  }

  recordSuccess(slotId: number, model: string, ms: number) {
    const u = this.get(slotId, model);
    this.state = {
      ...this.state,
      usage: { ...this.state.usage, [keyOf(slotId, model)]: { ...u, answered: u.answered + 1, blockedUntil: undefined, blockKind: undefined, lastError: undefined, lastOkAt: Date.now(), lastMs: ms } },
      last: { slotId, model, at: Date.now() },
    };
    this.commit();
  }

  recordFailure(slotId: number, model: string, err: unknown) {
    const anyErr = err as { error?: { message?: string }; message?: string };
    const raw = String(anyErr?.error?.message || anyErr?.message || err || '');
    const c = classifyError(err);
    const u = this.get(slotId, model);
    const next: ModelUsage = { ...u, lastError: c.message };
    const limits = { ...this.state.limits };
    const now = Date.now();
    if (c.kind === 'quota') {
      const { limit, retryMs } = parseQuotaError(raw);
      const wait = retryMs ?? 60_000;
      // a long wait means the daily allowance is gone; a short one is a per-minute limit
      next.blockKind = wait > 10 * 60_000 ? 'daily' : 'minute';
      next.blockedUntil = now + wait;
      if (next.blockKind === 'daily' && limit) limits[model] = limit;
    } else if (c.kind === 'overloaded') {
      next.blockKind = 'busy';
      next.blockedUntil = now + 20_000;
    } else if (c.kind === 'model') {
      next.blockKind = 'missing';
      next.blockedUntil = now + 6 * 3600_000;
    }
    this.state = { ...this.state, usage: { ...this.state.usage, [keyOf(slotId, model)]: next }, limits };
    this.commit();
  }

  /** A request that stalled and was given up on: skip that model briefly instead of waiting on it again. */
  recordStall(slotId: number, model: string) {
    const u = this.get(slotId, model);
    this.state = {
      ...this.state,
      usage: { ...this.state.usage, [keyOf(slotId, model)]: { ...u, blockKind: 'busy', blockedUntil: Date.now() + 30_000, lastError: 'No answer in time' } },
    };
    this.commit();
  }
}

export const usage = new UsageTracker();

export interface QueueEntry {
  slot: KeySlot;
  model: string;
  tier: Tier;
}

/** Every (key, model) pair in the order they are used: key by key, High then Mid inside each key. */
export function fullQueue(now = Date.now()): QueueEntry[] {
  const slots = keyManager
    .getSettings()
    .slots.filter((s) => s.key && !(s.status === 'error' && s.cooldownUntil && s.cooldownUntil > now))
    .sort((a, b) => a.id - b.id);
  return slots.flatMap((slot) => QUEUE_MODELS.map((m) => ({ slot, model: m.model, tier: m.tier })));
}

/** The pairs that can be tried right now. */
export function runnableQueue(now = Date.now()): QueueEntry[] {
  return fullQueue(now).filter((e) => !usage.isBlocked(e.slot.id, e.model, now));
}

/** When the soonest blocked model comes back (null when nothing is waiting on quota). */
export function earliestResume(now = Date.now()): number | null {
  let best: number | null = null;
  for (const e of fullQueue(now)) {
    const u = usage.get(e.slot.id, e.model);
    if (u.blockedUntil && u.blockedUntil > now && u.blockKind !== 'missing' && (best === null || u.blockedUntil < best)) best = u.blockedUntil;
  }
  return best;
}

export function formatWait(ms: number, ar: boolean): string {
  const total = Math.max(1, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return ar ? `${h} ساعة${m ? ` و${m} دقيقة` : ''}` : `${h}h${m ? ` ${m}m` : ''}`;
  if (m > 0) return ar ? `${m} دقيقة${s && m < 5 ? ` و${s} ثانية` : ''}` : `${m}m${s && m < 5 ? ` ${s}s` : ''}`;
  return ar ? `${s} ثانية` : `${s}s`;
}
