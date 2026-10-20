/**
 * Supabase cloud layer (replaces the old Firebase/Firestore module).
 *
 * Data model: one `workspace_docs` table keyed by (user_id, collection, id) with a jsonb payload, protected
 * by row-level security so every signed-in user only ever sees their own rows. IndexedDB remains the
 * offline source of truth; this layer mirrors it to the cloud and streams remote changes back.
 */
import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { Task, Meeting, Notebook, NotebookPage, Person, Project } from '../types';
import type { GeminiSettings } from './ai/keyManager';
import { usage } from './ai/modelQueue';
import type { SharedQuota } from './ai/modelQueue';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** true when the page was opened from a "reset my password" e-mail link (read before the Supabase client clears the URL) */
export const OPENED_FROM_RECOVERY_LINK = typeof location !== 'undefined' && /type=recovery/.test(location.hash + location.search);

export const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export const WORKSPACE_ID = 'default-ws';

export type CollectionName = 'tasks' | 'meetings' | 'notebooks' | 'pages' | 'projects' | 'people';

let currentUser: User | null = null;

export function getCurrentUser(): User | null {
  return currentUser;
}

// ----------------------------------------------------------------------------- auth

export async function getInitialSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user ?? null;
  return data.session;
}

export function onAuthChange(cb: (user: User | null, event?: string) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user ?? null;
    cb(currentUser, event);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** e-mail a reset link; the link returns to this site where the person chooses a new password */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/` });
  if (error) throw error;
}

/** set a new password for the signed-in session (used after the e-mail reset link) */
export async function setNewPassword(password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) throw error;
}

/** change the password from inside the app: the current password is checked first, so a borrowed unlocked device cannot change it */
export async function changePassword(current: string, next: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const email = currentUser?.email;
  if (!email) throw new Error('Not signed in.');
  const { error: bad } = await supabase.auth.signInWithPassword({ email, password: current });
  if (bad) throw new Error('The current password is not correct.');
  await setNewPassword(next);
}

export async function signOutUser(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ----------------------------------------------------------------------------- connectivity

export async function testCloudConnection(): Promise<boolean> {
  if (!supabase || !currentUser) return false;
  try {
    const { error } = await supabase.from('workspace_docs').select('id', { head: true, count: 'exact' }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------- generic doc sync

/** Offline writes that failed are retried from this queue on the next successful write or reconnect. */
const retryQueue = new Map<string, () => Promise<void>>();

/**
 * Documents changed on this device that the cloud has not confirmed yet ("collection/id"). Kept in browser storage, so after a
 * reload they are uploaded again and never thrown away by the first merge with the cloud.
 */
const UNSYNCED_KEY = 'alkammah_unsynced_v1';
const unsynced: Set<string> = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(UNSYNCED_KEY) || '[]'));
  } catch {
    return new Set<string>();
  }
})();
const saveUnsynced = () => {
  try {
    localStorage.setItem(UNSYNCED_KEY, JSON.stringify([...unsynced]));
  } catch {
    /* ignore */
  }
};
const markUnsynced = (key: string, on: boolean) => {
  if (on === unsynced.has(key)) return;
  if (on) unsynced.add(key);
  else unsynced.delete(key);
  saveUnsynced();
};
/** ids of one collection that still wait for the cloud */
export function unsyncedIds(collection: CollectionName): Set<string> {
  const pre = `${collection}/`;
  return new Set([...unsynced].filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length)));
}

async function upsertDoc(collection: CollectionName, id: string, data: unknown): Promise<void> {
  if (!supabase || !currentUser) return;
  const key = `${collection}/${id}`;
  const op = async () => {
    const { error } = await supabase!.from('workspace_docs').upsert(
      {
        user_id: currentUser!.id,
        collection,
        id,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,collection,id' }
    );
    if (error) throw error;
  };
  markUnsynced(key, true);
  try {
    await op();
    retryQueue.delete(key);
    markUnsynced(key, false);
    void flushRetryQueue();
  } catch (err) {
    retryQueue.set(key, async () => {
      await op();
      markUnsynced(key, false);
    }); // latest write wins per document
    console.warn(`Cloud write deferred [${key}]:`, (err as Error)?.message || err);
  }
}

async function removeDoc(collection: CollectionName, id: string): Promise<void> {
  if (!supabase || !currentUser) return;
  const key = `${collection}/${id}`;
  const op = async () => {
    const { error } = await supabase!
      .from('workspace_docs')
      .delete()
      .eq('user_id', currentUser!.id)
      .eq('collection', collection)
      .eq('id', id);
    if (error) throw error;
  };
  // a pending upload of this document is pointless now
  const pend = pagePending.get(id);
  if (collection === 'pages' && pend) {
    clearTimeout(pend.timer);
    pagePending.delete(id);
  }
  markUnsynced(key, false);
  try {
    await op();
    retryQueue.delete(key);
  } catch (err) {
    retryQueue.set(key, op);
    console.warn(`Cloud delete deferred [${key}]:`, (err as Error)?.message || err);
  }
}

let flushing = false;
export async function flushRetryQueue(): Promise<void> {
  if (flushing || retryQueue.size === 0) return;
  flushing = true;
  try {
    for (const [key, op] of [...retryQueue.entries()]) {
      try {
        await op();
        retryQueue.delete(key);
      } catch {
        break; // still offline; try again later
      }
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushRetryQueue());
}

export const syncTaskToCloud = (t: Task) => upsertDoc('tasks', t.id, t);
export const deleteTaskFromCloud = (id: string) => removeDoc('tasks', id);
export const syncMeetingToCloud = (m: Meeting) => upsertDoc('meetings', m.id, m);
export const deleteMeetingFromCloud = (id: string) => removeDoc('meetings', id);
export const syncNotebookToCloud = (n: Notebook) => upsertDoc('notebooks', n.id, n);
export const deleteNotebookFromCloud = (id: string) => removeDoc('notebooks', id);
/**
 * Notebook pages are big (every pen stroke), so they are uploaded after a short quiet period instead of after every pause in
 * writing, one upload per page at a time, always the newest copy. The page is marked "unsynced" at once, so even if the app is
 * closed before the upload, the next start sends it.
 */
const PAGE_QUIET_MS = 6000;
const pagePending = new Map<string, { page: NotebookPage; timer: ReturnType<typeof setTimeout> }>();
const pageInflight = new Map<string, Promise<void>>();
async function sendPage(id: string): Promise<void> {
  const pend = pagePending.get(id);
  if (!pend) return;
  clearTimeout(pend.timer);
  pagePending.delete(id);
  const prev = pageInflight.get(id);
  if (prev) await prev.catch(() => undefined);
  const run = upsertDoc('pages', id, pend.page).finally(() => {
    if (pageInflight.get(id) === run) pageInflight.delete(id);
  });
  pageInflight.set(id, run);
  return run;
}
export function syncPageToCloud(p: NotebookPage, opts: { now?: boolean } = {}): Promise<void> {
  if (!supabase || !currentUser) return Promise.resolve();
  const old = pagePending.get(p.id);
  if (old) clearTimeout(old.timer);
  markUnsynced(`pages/${p.id}`, true);
  pagePending.set(p.id, { page: p, timer: setTimeout(() => void sendPage(p.id), opts.now ? 0 : PAGE_QUIET_MS) });
  return opts.now ? sendPage(p.id) : Promise.resolve();
}
/** Send every waiting page now (leaving a page, hiding the app). */
export function flushPendingPages(): void {
  for (const id of [...pagePending.keys()]) void sendPage(id);
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushPendingPages());
  window.addEventListener('pagehide', flushPendingPages);
}
export const deletePageFromCloud = (id: string) => removeDoc('pages', id);
export const syncProjectToCloud = (p: Project) => upsertDoc('projects', p.id, p);
export const deleteProjectFromCloud = (id: string) => removeDoc('projects', id);
export const syncPersonToCloud = (p: Person) => upsertDoc('people', p.id, p);
export const deletePersonFromCloud = (id: string) => removeDoc('people', id);

/** Bulk-upload local data (used the first time a device connects to an empty cloud workspace). */
export async function pushCollection<T extends { id: string }>(collection: CollectionName, items: T[]): Promise<void> {
  for (const item of items) await upsertDoc(collection, item.id, item);
}

export const ALL_COLLECTIONS: CollectionName[] = ['tasks', 'meetings', 'notebooks', 'pages', 'projects', 'people'];

/** What changed in one collection: `null` = a full snapshot (start), otherwise only these documents. */
export type DocChange<T> = { upserted: T[]; deleted: string[] } | null;
type WorkspaceListener = (collection: CollectionName, items: unknown[], isInitial: boolean, change: DocChange<unknown>) => void;

/**
 * The whole workspace over ONE realtime channel (instead of one per collection, which delivered every change six times).
 * - start: one download of everything, then a full snapshot per collection
 * - live: only this person's rows (other people's delete events are ignored), passed on as small changes
 * - after a dropped connection (iOS drops it in the background): a light list of ids + times is compared, and only documents that
 *   really changed are downloaded, instead of everything again
 */
/** What this device last received from the cloud: "collection/id" → server time. Lets a cold start skip unchanged documents. */
const metaKey = (uid: string) => `alkammah_doc_meta_${uid}`;
function readMeta(uid: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(metaKey(uid)) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function subscribeWorkspace(onUpdate: WorkspaceListener, localCopy?: (c: CollectionName) => { id: string }[]): () => void {
  if (!supabase || !currentUser) return () => undefined;
  const client = supabase;
  const uid = currentUser.id;
  const docs = new Map<CollectionName, Map<string, { data: unknown; at: string }>>(ALL_COLLECTIONS.map((c) => [c, new Map()]));
  let cancelled = false;
  let firstSubscribe = true;
  let ready = false;

  const list = (c: CollectionName) => [...(docs.get(c) as Map<string, { data: unknown }>).values()].map((d) => d.data);
  const isCollection = (c: unknown): c is CollectionName => ALL_COLLECTIONS.includes(c as CollectionName);

  // remember the server time of every document held, so the next cold start only downloads what changed
  let metaTimer: ReturnType<typeof setTimeout> | null = null;
  const saveMeta = () => {
    if (metaTimer) return;
    metaTimer = setTimeout(() => {
      metaTimer = null;
      if (cancelled) return;
      const m: Record<string, string> = {};
      for (const [c, map] of docs) for (const [id, d] of map) m[`${c}/${id}`] = d.at;
      try {
        localStorage.setItem(metaKey(uid), JSON.stringify(m));
      } catch {
        /* storage full or blocked: the next start simply downloads everything */
      }
    }, 2000);
  };

  async function fetchByIds(ids: string[]) {
    for (let k = 0; k < ids.length; k += 100) {
      const { data, error } = await client.from('workspace_docs').select('collection,id,data,updated_at').eq('user_id', uid).in('id', ids.slice(k, k + 100));
      if (error) throw error;
      if (cancelled) return;
      for (const row of data || []) {
        if (isCollection(row.collection)) docs.get(row.collection)!.set(row.id as string, { data: row.data, at: row.updated_at as string });
      }
    }
  }

  async function loadAll() {
    const known = readMeta(uid);
    // fast start: a light list of ids + times, then only documents this device does not already hold in that exact version
    if (localCopy && Object.keys(known).length) {
      const { data: idx, error } = await client.from('workspace_docs').select('collection,id,updated_at').eq('user_id', uid);
      if (cancelled) return;
      if (!error && idx) {
        const local = new Map(ALL_COLLECTIONS.map((c) => [c, new Map(localCopy(c).map((i) => [i.id, i]))]));
        const need: string[] = [];
        for (const r of idx) {
          if (!isCollection(r.collection)) continue;
          const l = local.get(r.collection)!.get(r.id as string);
          if (l && known[`${r.collection}/${r.id}`] === r.updated_at) docs.get(r.collection)!.set(r.id as string, { data: l, at: r.updated_at as string });
          else need.push(r.id as string);
        }
        try {
          await fetchByIds(need);
          if (cancelled) return;
          ready = true;
          saveMeta();
          for (const c of ALL_COLLECTIONS) onUpdate(c, list(c), true, null);
          return;
        } catch (e) {
          console.warn('Cloud quick start fell back to a full load:', (e as Error)?.message || e);
          for (const map of docs.values()) map.clear();
        }
      }
    }
    const { data, error } = await client.from('workspace_docs').select('collection,id,data,updated_at').eq('user_id', uid);
    if (cancelled) return;
    if (error) {
      console.warn('Cloud load notice:', error.message);
      return;
    }
    for (const row of data || []) {
      if (isCollection(row.collection)) docs.get(row.collection)!.set(row.id as string, { data: row.data, at: row.updated_at as string });
    }
    ready = true;
    saveMeta();
    for (const c of ALL_COLLECTIONS) onUpdate(c, list(c), true, null);
  }

  async function catchUp() {
    if (!ready) return loadAll();
    const { data: idx, error } = await client.from('workspace_docs').select('collection,id,updated_at').eq('user_id', uid);
    if (cancelled || error || !idx) return;
    const seen = new Map<CollectionName, Set<string>>(ALL_COLLECTIONS.map((c) => [c, new Set()]));
    const stale: string[] = [];
    for (const r of idx) {
      if (!isCollection(r.collection)) continue;
      seen.get(r.collection)!.add(r.id as string);
      if (docs.get(r.collection)!.get(r.id as string)?.at !== r.updated_at) stale.push(r.id as string);
    }
    const changes = new Map<CollectionName, { upserted: unknown[]; deleted: string[] }>();
    const bucket = (c: CollectionName) => changes.get(c) || (changes.set(c, { upserted: [], deleted: [] }), changes.get(c)!);
    for (const c of ALL_COLLECTIONS) {
      for (const id of [...docs.get(c)!.keys()]) {
        if (!seen.get(c)!.has(id)) {
          docs.get(c)!.delete(id);
          bucket(c).deleted.push(id);
        }
      }
    }
    for (let k = 0; k < stale.length; k += 100) {
      const { data } = await client.from('workspace_docs').select('collection,id,data,updated_at').eq('user_id', uid).in('id', stale.slice(k, k + 100));
      if (cancelled) return;
      for (const row of data || []) {
        if (!isCollection(row.collection)) continue;
        const cur = docs.get(row.collection)!.get(row.id as string);
        if (cur?.at === row.updated_at) continue;
        docs.get(row.collection)!.set(row.id as string, { data: row.data, at: row.updated_at as string });
        bucket(row.collection).upserted.push(row.data);
      }
    }
    if (changes.size) saveMeta();
    for (const [c, ch] of changes) if (ch.upserted.length || ch.deleted.length) onUpdate(c, list(c), false, ch);
  }

  void loadAll();

  const channel = client
    .channel(`ws-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_docs', filter: `user_id=eq.${uid}` }, (payload) => {
      const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as {
        user_id?: string;
        collection?: string;
        id?: string;
        data?: unknown;
        updated_at?: string;
      };
      // delete events are not filtered by the server: only ever act on this person's own rows
      if (!row || row.user_id !== uid || !isCollection(row.collection) || !row.id) return;
      const map = docs.get(row.collection)!;
      if (payload.eventType === 'DELETE') {
        if (!map.delete(row.id)) return;
        saveMeta();
        onUpdate(row.collection, list(row.collection), false, { upserted: [], deleted: [row.id] });
      } else if (row.data !== undefined) {
        if (map.get(row.id)?.at === row.updated_at) return;
        map.set(row.id, { data: row.data, at: row.updated_at || '' });
        saveMeta();
        onUpdate(row.collection, list(row.collection), false, { upserted: [row.data], deleted: [] });
      }
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED' || cancelled) return;
      // the first time, loadAll() already has everything; after a reconnect only the differences are fetched
      if (firstSubscribe) firstSubscribe = false;
      else void catchUp();
    });

  return () => {
    cancelled = true;
    if (metaTimer) clearTimeout(metaTimer);
    void client.removeChannel(channel);
  };
}

// ----------------------------------------------------------------------------- Gemini key settings

export async function loadRemoteGeminiSettings(): Promise<Partial<GeminiSettings> | null> {
  if (!supabase || !currentUser) return null;
  const { data, error } = await supabase.from('user_settings').select('gemini').eq('user_id', currentUser.id).maybeSingle();
  if (error) {
    console.warn('Could not load AI settings:', error.message);
    return null;
  }
  return (data?.gemini as Partial<GeminiSettings> | undefined) ?? null;
}

/**
 * Keeps quota status the same on every device: pulls what the other devices learned (blocks and limits Google reported, per-device
 * counters), merges it, and writes the merged view back next to the keys. Never touches the keys themselves.
 */
export async function syncSharedQuota(): Promise<void> {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase.from('user_settings').select('gemini').eq('user_id', currentUser.id).maybeSingle();
  if (error || !data) return;
  const gemini = (data.gemini || {}) as Record<string, unknown>;
  usage.mergeShared(gemini.quota as Partial<SharedQuota> | undefined);
  const { error: writeError } = await supabase
    .from('user_settings')
    .update({ gemini: { ...gemini, quota: usage.exportShared() } })
    .eq('user_id', currentUser.id);
  if (writeError) console.warn('Could not share quota status:', writeError.message);
}

/**
 * Account-level preferences (one row per setting in `user_prefs`), so every device the same login opens shows the same links and choices.
 * One row per setting means two devices can never overwrite each other's settings.
 */
export async function loadAllPrefs(): Promise<Record<string, unknown>> {
  if (!supabase || !currentUser) return {};
  const { data, error } = await supabase.from('user_prefs').select('key,value').eq('user_id', currentUser.id);
  if (error) {
    console.warn('Could not load account preferences:', error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((r) => [r.key as string, r.value as unknown]));
}

export async function savePref(key: string, value: unknown): Promise<void> {
  if (!supabase || !currentUser) return;
  const { error } = await supabase.from('user_prefs').upsert({ user_id: currentUser.id, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  if (error) console.warn(`Could not save ${key}:`, error.message);
}

export const saveWorkEmailRemote = (email: string) => savePref('workCalendarEmail', email);
export const saveFeedUrlRemote = (url: string) => savePref('outlookFeedUrl', url);

export async function saveRemoteGeminiSettings(settings: GeminiSettings): Promise<void> {
  if (!supabase || !currentUser) return;
  // never persist transient health state (cooldowns); only keys, labels and models
  const sanitized = {
    ...settings,
    slots: settings.slots.map((s) => ({ ...s, cooldownUntil: undefined })),
    quota: usage.exportShared(),
  };
  const { error } = await supabase.from('user_settings').upsert(
    { user_id: currentUser.id, gemini: sanitized, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

/** Deletes every cloud document in the given collections for the current user. */
export async function clearCloudCollections(collections: CollectionName[]): Promise<void> {
  if (!supabase || !currentUser) return;
  const { error } = await supabase
    .from('workspace_docs')
    .delete()
    .eq('user_id', currentUser.id)
    .in('collection', collections);
  if (error) throw error;
}
