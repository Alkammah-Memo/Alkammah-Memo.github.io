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
  /** when the block was recorded (lets other devices tell whether a later success made it stale) */
  blockedAt?: number;
  lastOkAt?: number;
  lastMs?: number;
  lastError?: string;
}

interface UsageState {
  usage: Record<string, ModelUsage>;
  /** daily request limits Google reported in quota errors, per model */
  limits: Record<string, number>;
  last?: { slotId: number; model: string; at: number };
  /** this device's id, used to keep per-device counters apart when they are shared through the cloud */
  deviceId: string;
  /** answered-request counters reported by the user's other devices (today only) */
  others: Record<string, { day: string; counts: Record<string, number> }>;
}

/** What is shared between the user's devices: real blocks and limits Google reported, plus each device's own counters. */
export interface SharedQuota {
  limits: Record<string, number>;
  blocks: Record<string, { until: number; kind: BlockKind; at: number }>;
  devices: Record<string, { day: string; counts: Record<string, number> }>;
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
      return { usage: p.usage || {}, limits: p.limits || {}, last: p.last, deviceId: p.deviceId || newDeviceId(), others: p.others || {} };
    }
  } catch {
    /* ignore */
  }
  return { usage: {}, limits: {}, deviceId: newDeviceId(), others: {} };
}

function newDeviceId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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
  private shareHook: (() => void) | null = null;
  private shareTimer: ReturnType<typeof setTimeout> | undefined;

  /** Registers what runs (after a short quiet period) when something worth sharing with the user's other devices changed. */
  setShareHook(hook: (() => void) | null) {
    this.shareHook = hook;
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** changes identity on every update, for useSyncExternalStore */
  getVersion = () => this.snap;

  private commit(shareAfterMs: number | null = 15_000) {
    this.snap = { v: this.snap.v + 1 };
    if (shareAfterMs !== null && this.shareHook) {
      clearTimeout(this.shareTimer);
      this.shareTimer = setTimeout(() => this.shareHook?.(), shareAfterMs);
    }
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

  /** Answered today across all of the user's devices (this one live, the others as of their last sync). */
  answeredAll(slotId: number, model: string): number {
    const today = pacificDay();
    const k = keyOf(slotId, model);
    let n = this.get(slotId, model).answered;
    for (const d of Object.values(this.state.others)) if (d.day === today) n += d.counts[k] || 0;
    return n;
  }

  exportShared(): SharedQuota {
    const now = Date.now();
    const today = pacificDay();
    const counts: Record<string, number> = {};
    const blocks: SharedQuota['blocks'] = {};
    for (const [k, u] of Object.entries(this.state.usage)) {
      if (u.day === today && u.answered > 0) counts[k] = u.answered;
      if (u.blockedUntil && u.blockedUntil > now && u.blockKind && u.blockKind !== 'busy') blocks[k] = { until: u.blockedUntil, kind: u.blockKind, at: u.blockedAt || 0 };
    }
    const devices: SharedQuota['devices'] = {};
    for (const [id, d] of Object.entries(this.state.others)) if (d.day === today) devices[id] = d;
    devices[this.state.deviceId] = { day: today, counts };
    return { limits: this.state.limits, blocks, devices };
  }

  /** Brings in what the user's other devices learned, so every device shows the same real status. */
  mergeShared(remote: Partial<SharedQuota> | null | undefined) {
    if (!remote) return;
    const now = Date.now();
    const today = pacificDay();
    const usageMap = { ...this.state.usage };
    for (const [k, b] of Object.entries(remote.blocks || {})) {
      const local = usageMap[k];
      if (!b || b.until <= now) continue;
      if (local?.blockedUntil && local.blockedUntil >= b.until) continue;
      if (local?.lastOkAt && local.lastOkAt > b.at) continue; // a later success here makes that block stale
      usageMap[k] = { ...(local || { day: today, answered: 0 }), blockedUntil: b.until, blockKind: b.kind, blockedAt: b.at };
    }
    const others: UsageState['others'] = {};
    for (const [id, d] of Object.entries(remote.devices || {})) if (id !== this.state.deviceId && d?.day === today) others[id] = d;
    this.state = { ...this.state, usage: usageMap, limits: { ...(remote.limits || {}), ...this.state.limits }, others };
    this.commit(null);
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
      usage: { ...this.state.usage, [keyOf(slotId, model)]: { ...u, answered: u.answered + 1, blockedUntil: undefined, blockKind: undefined, lastError: undefined, lastOkAt: Date.now(), lastMs: ms, blockedAt: undefined } },
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
    let shareSoon = false;
    const limits = { ...this.state.limits };
    const now = Date.now();
    if (c.kind === 'quota') {
      const { limit, retryMs } = parseQuotaError(raw);
      const wait = retryMs ?? 60_000;
      // a long wait means the daily allowance is gone; a short one is a per-minute limit
      next.blockKind = wait > 10 * 60_000 ? 'daily' : 'minute';
      next.blockedUntil = now + wait;
      next.blockedAt = now;
      shareSoon = true;
      if (next.blockKind === 'daily' && limit) limits[model] = limit;
    } else if (c.kind === 'overloaded') {
      next.blockKind = 'busy';
      next.blockedUntil = now + 20_000;
    } else if (c.kind === 'model') {
      next.blockKind = 'missing';
      next.blockedUntil = now + 6 * 3600_000;
      next.blockedAt = now;
      shareSoon = true;
    }
    this.state = { ...this.state, usage: { ...this.state.usage, [keyOf(slotId, model)]: next }, limits };
    this.commit(shareSoon ? 3_000 : 15_000);
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
