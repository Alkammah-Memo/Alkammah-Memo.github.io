/**
 * Gemini API key manager: three key slots, health tracking and automatic failover.
 *
 * Every Gemini call (chat, vision, transcription, fast voice and the Live voice socket) goes through
 * `runWithFailover`, so when a key hits a quota/rate limit, expires or the network blips, the next
 * key takes over immediately and the call keeps retrying instead of surfacing downtime.
 */

export const KEY_SLOT_COUNT = 3;
const STORAGE_KEY = 'alkammah_gemini_settings_v1';

export type KeyStatus = 'untested' | 'ok' | 'error' | 'limited';

export interface KeySlot {
  id: number; // 1..3
  label: string;
  key: string;
  status: KeyStatus;
  message?: string;
  testedAt?: string;
  /** epoch ms until which the slot is skipped (rate limited / overloaded) */
  cooldownUntil?: number;
}

export interface ModelSettings {
  chat: string;
  chatFallbacks: string[];
  vision: string;
  transcribe: string;
  tts: string;
  live: string;
  voiceName: string;
}

export interface GeminiSettings {
  slots: KeySlot[];
  models: ModelSettings;
  /** slot id that most recently worked (sticky, avoids needless flapping) */
  preferredSlotId?: number;
  updatedAt?: string;
}

export const DEFAULT_MODELS: ModelSettings = {
  chat: 'gemini-3.8-flash',
  chatFallbacks: ['gemini-3.1-flash-lite', 'gemini-flash-latest'],
  vision: 'gemini-3.8-flash',
  transcribe: 'gemini-3.5-transcribe',
  tts: 'gemini-3.8-flash-lite-tts',
  live: 'gemini-3.8-live',
  voiceName: 'Zephyr',
};

export interface FailoverEvent {
  id: string;
  at: string;
  slotId: number | null;
  kind: ErrorKind | 'switch' | 'recovered' | 'info';
  message: string;
}

export type ErrorKind = 'quota' | 'auth' | 'overloaded' | 'network' | 'model' | 'bad_request' | 'other';

export interface ClassifiedError {
  kind: ErrorKind;
  /** switching to another key / model may help */
  retryable: boolean;
  /** how long this key should be rested */
  cooldownMs: number;
  message: string;
}

export class NoKeysConfiguredError extends Error {
  constructor() {
    super('NO_GEMINI_KEYS: add at least one Gemini API key in Settings.');
    this.name = 'NoKeysConfiguredError';
  }
}

export class AllKeysFailedError extends Error {
  readonly causeError: unknown;
  constructor(message: string, causeError: unknown) {
    super(message);
    this.name = 'AllKeysFailedError';
    this.causeError = causeError;
  }
}

function emptySlots(): KeySlot[] {
  return Array.from({ length: KEY_SLOT_COUNT }, (_, i) => ({
    id: i + 1,
    label: `Key ${i + 1}`,
    key: '',
    status: 'untested' as KeyStatus,
  }));
}

function normalize(raw: Partial<GeminiSettings> | null | undefined): GeminiSettings {
  const base = emptySlots();
  const incoming = Array.isArray(raw?.slots) ? raw!.slots! : [];
  const slots = base.map((slot, i) => {
    const src = incoming.find((s) => s?.id === slot.id) || incoming[i];
    if (!src) return slot;
    return {
      id: slot.id,
      label: typeof src.label === 'string' && src.label.trim() ? src.label : slot.label,
      key: typeof src.key === 'string' ? src.key.trim() : '',
      status: (['untested', 'ok', 'error', 'limited'] as const).includes(src.status as KeyStatus)
        ? (src.status as KeyStatus)
        : 'untested',
      message: src.message,
      testedAt: src.testedAt,
      cooldownUntil: src.cooldownUntil,
    };
  });
  const models: ModelSettings = { ...DEFAULT_MODELS, ...(raw?.models || {}) };
  if (!Array.isArray(models.chatFallbacks)) models.chatFallbacks = DEFAULT_MODELS.chatFallbacks;
  return {
    slots,
    models,
    preferredSlotId: raw?.preferredSlotId,
    updatedAt: raw?.updatedAt,
  };
}

type Listener = () => void;

class KeyManager {
  private settings: GeminiSettings;
  private listeners = new Set<Listener>();
  private events: FailoverEvent[] = [];
  private remoteSaver: ((s: GeminiSettings) => Promise<void>) | null = null;

  constructor() {
    this.settings = this.readLocal();
  }

  private readLocal(): GeminiSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch {
      return normalize(null);
    }
  }

  private writeLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage may be unavailable (private mode); keys then live in memory only */
    }
  }

  private emit() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.warn('KeyManager listener error', e);
      }
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Registers the cloud persistence hook (Supabase) so keys follow the user across devices. */
  setRemoteSaver(saver: ((s: GeminiSettings) => Promise<void>) | null) {
    this.remoteSaver = saver;
  }

  getSettings(): GeminiSettings {
    return this.settings;
  }

  getEvents(): FailoverEvent[] {
    return this.events;
  }

  hasAnyKey(): boolean {
    return this.settings.slots.some((s) => s.key);
  }

  /** Replace settings (used by Settings page "Save" and by cloud hydration). */
  async save(next: GeminiSettings, opts: { persistRemote?: boolean } = { persistRemote: true }): Promise<void> {
    this.settings = normalize({ ...next, updatedAt: new Date().toISOString() });
    this.writeLocal();
    this.emit();
    if (opts.persistRemote !== false && this.remoteSaver) {
      await this.remoteSaver(this.settings);
    }
  }

  /** Apply settings fetched from the cloud when newer than the local copy. */
  hydrateFromRemote(remote: Partial<GeminiSettings> | null) {
    if (!remote) return;
    const incoming = normalize(remote);
    const localTs = this.settings.updatedAt ? Date.parse(this.settings.updatedAt) : 0;
    const remoteTs = incoming.updatedAt ? Date.parse(incoming.updatedAt) : 0;
    if (remoteTs > localTs || !this.hasAnyKey()) {
      this.settings = incoming;
      this.writeLocal();
      this.emit();
    }
  }

  logEvent(slotId: number | null, kind: FailoverEvent['kind'], message: string) {
    const ev: FailoverEvent = {
      id: `fo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      slotId,
      kind,
      message,
    };
    this.events = [ev, ...this.events].slice(0, 40);
    this.emit();
  }

  private patchSlot(slotId: number, patch: Partial<KeySlot>) {
    this.settings = {
      ...this.settings,
      slots: this.settings.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    };
    this.writeLocal();
    this.emit();
  }

  /** Slots that hold a key, ordered: sticky-preferred first, then slot order; cooled-down ones last. */
  getCandidateSlots(now = Date.now()): KeySlot[] {
    const withKey = this.settings.slots.filter((s) => s.key);
    const pref = this.settings.preferredSlotId;
    const ordered = [...withKey].sort((a, b) => {
      if (a.id === pref) return -1;
      if (b.id === pref) return 1;
      return a.id - b.id;
    });
    const ready = ordered.filter((s) => !s.cooldownUntil || s.cooldownUntil <= now);
    const resting = ordered
      .filter((s) => s.cooldownUntil && s.cooldownUntil > now)
      .sort((a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0));
    return [...ready, ...resting];
  }

  /** The slot currently in front of the line (for UI display). */
  getActiveSlot(): KeySlot | null {
    const [first] = this.getCandidateSlots();
    return first && (!first.cooldownUntil || first.cooldownUntil <= Date.now()) ? first : null;
  }

  reportSuccess(slotId: number) {
    const slot = this.settings.slots.find((s) => s.id === slotId);
    const wasDegraded = slot && (slot.status === 'error' || slot.status === 'limited' || !!slot.cooldownUntil);
    const switched = this.settings.preferredSlotId !== undefined && this.settings.preferredSlotId !== slotId;
    this.settings = { ...this.settings, preferredSlotId: slotId };
    this.patchSlot(slotId, { status: 'ok', message: undefined, cooldownUntil: undefined });
    if (switched) this.logEvent(slotId, 'switch', `Now serving requests with ${slot?.label || `Key ${slotId}`}`);
    else if (wasDegraded) this.logEvent(slotId, 'recovered', `${slot?.label || `Key ${slotId}`} recovered`);
  }

  reportFailure(slotId: number, classified: ClassifiedError) {
    const slot = this.settings.slots.find((s) => s.id === slotId);
    const label = slot?.label || `Key ${slotId}`;
    const status: KeyStatus = classified.kind === 'quota' || classified.kind === 'overloaded' ? 'limited' : 'error';
    // Network problems are not the key's fault; never mark the key itself bad for them.
    if (classified.kind === 'network') {
      this.logEvent(slotId, 'network', `${label}: network issue, retrying (${classified.message})`);
      return;
    }
    this.patchSlot(slotId, {
      status,
      message: classified.message,
      cooldownUntil: Date.now() + classified.cooldownMs,
    });
    this.logEvent(slotId, classified.kind, `${label}: ${classified.message}. Switching to next key.`);
  }

  /** Reset a slot's health after the user edits or re-tests it. */
  clearCooldowns() {
    this.settings = {
      ...this.settings,
      slots: this.settings.slots.map((s) => ({ ...s, cooldownUntil: undefined })),
    };
    this.writeLocal();
    this.emit();
  }

  /** Used by the Settings "Test" button to record a result without touching sticky routing. */
  recordTestResult(slotId: number, ok: boolean, message: string) {
    this.patchSlot(slotId, {
      status: ok ? 'ok' : 'error',
      message: ok ? undefined : message,
      testedAt: new Date().toISOString(),
      cooldownUntil: ok ? undefined : this.settings.slots.find((s) => s.id === slotId)?.cooldownUntil,
    });
    if (ok) this.patchSlot(slotId, { cooldownUntil: undefined });
  }
}

export const keyManager = new KeyManager();

/** The SDK embeds the API's JSON error in the message; pull out the human sentence. */
function readableApiMessage(raw: string): string {
  const match = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const text = match ? match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ') : raw;
  return text.replace(/\s+/g, ' ').trim();
}

/** Turns any thrown value from the SDK / fetch / WebSocket into a routing decision. */
export function classifyError(err: unknown): ClassifiedError {
  const anyErr = err as { status?: number; code?: number | string; message?: string; error?: { message?: string; code?: number; status?: string } };
  const rawMessage = String(anyErr?.error?.message || anyErr?.message || err || 'Unknown error');
  const text = rawMessage.toLowerCase();
  const status = Number(anyErr?.status ?? anyErr?.error?.code ?? (typeof anyErr?.code === 'number' ? anyErr.code : NaN));
  const short = readableApiMessage(rawMessage).slice(0, 180);

  if (
    status === 429 ||
    text.includes('resource_exhausted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('429')
  ) {
    return { kind: 'quota', retryable: true, cooldownMs: 60_000, message: `Quota or rate limit reached (${short})` };
  }
  if (
    status === 401 ||
    status === 403 ||
    text.includes('api key not valid') ||
    text.includes('api_key_invalid') ||
    text.includes('api key expired') ||
    text.includes('permission_denied') ||
    text.includes('unauthenticated') ||
    text.includes('billing') ||
    text.includes('has been suspended')
  ) {
    return { kind: 'auth', retryable: true, cooldownMs: 10 * 60_000, message: `Key rejected (${short})` };
  }
  if (status === 404 || text.includes('is not found') || text.includes('not supported for')) {
    return { kind: 'model', retryable: true, cooldownMs: 0, message: `Model unavailable (${short})` };
  }
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    text.includes('unavailable') ||
    text.includes('overloaded') ||
    text.includes('high demand') ||
    text.includes('deadline') ||
    text.includes('internal error')
  ) {
    return { kind: 'overloaded', retryable: true, cooldownMs: 15_000, message: `Service busy (${short})` };
  }
  if (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network error') ||
    text.includes('load failed') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('websocket') ||
    text.includes('offline')
  ) {
    return { kind: 'network', retryable: true, cooldownMs: 0, message: short };
  }
  if (status === 400 || text.includes('invalid_argument') || text.includes('invalid argument')) {
    return { kind: 'bad_request', retryable: false, cooldownMs: 0, message: short };
  }
  return { kind: 'other', retryable: true, cooldownMs: 5_000, message: short };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface FailoverOptions {
  /** full passes over all keys before giving up (the last pass ignores cooldowns) */
  maxRounds?: number;
  signal?: AbortSignal;
}

/**
 * Runs `op` with the best available key. On a retryable failure the next key is tried at once; after
 * every key has failed the whole set is retried with growing back-off, so a transient incident on
 * all keys still self-heals instead of dropping the request.
 */
export async function runWithFailover<T>(
  op: (apiKey: string, slot: KeySlot) => Promise<T>,
  opts: FailoverOptions = {}
): Promise<T> {
  const maxRounds = opts.maxRounds ?? 3;
  if (!keyManager.hasAnyKey()) throw new NoKeysConfiguredError();

  let lastError: unknown = new Error('No attempt made');
  for (let round = 0; round < maxRounds; round++) {
    const finalRound = round === maxRounds - 1;
    let candidates = keyManager.getCandidateSlots();
    if (!finalRound) {
      const ready = candidates.filter((s) => !s.cooldownUntil || s.cooldownUntil <= Date.now());
      if (ready.length > 0) candidates = ready;
    }
    for (const slot of candidates) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const result = await op(slot.key, slot);
        keyManager.reportSuccess(slot.id);
        return result;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err;
        lastError = err;
        const classified = classifyError(err);
        if (!classified.retryable) throw err;
        keyManager.reportFailure(slot.id, classified);
      }
    }
    if (!finalRound) await sleep(700 * (round + 1));
  }
  throw new AllKeysFailedError(
    'All Gemini keys failed. Check Settings → Gemini keys to test each key.',
    lastError
  );
}
