/**
 * Supabase cloud layer (replaces the old Firebase/Firestore module).
 *
 * Data model: one `workspace_docs` table keyed by (user_id, collection, id) with a jsonb payload, protected
 * by row-level security so every signed-in user only ever sees their own rows. IndexedDB remains the
 * offline source of truth; this layer mirrors it to the cloud and streams remote changes back.
 */
import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { Task, Meeting, Notebook, NotebookPage, Person, Project } from '../types';
import type { GeminiSettings } from './ai/keyManager';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

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

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    cb(currentUser);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
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
  try {
    await op();
    retryQueue.delete(key);
    void flushRetryQueue();
  } catch (err) {
    retryQueue.set(key, op); // latest write wins per document
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
export const syncPageToCloud = (p: NotebookPage) => upsertDoc('pages', p.id, p);
export const deletePageFromCloud = (id: string) => removeDoc('pages', id);
export const syncProjectToCloud = (p: Project) => upsertDoc('projects', p.id, p);
export const deleteProjectFromCloud = (id: string) => removeDoc('projects', id);
export const syncPersonToCloud = (p: Person) => upsertDoc('people', p.id, p);
export const deletePersonFromCloud = (id: string) => removeDoc('people', id);

/** Bulk-upload local data (used the first time a device connects to an empty cloud workspace). */
export async function pushCollection<T extends { id: string }>(collection: CollectionName, items: T[]): Promise<void> {
  for (const item of items) await upsertDoc(collection, item.id, item);
}

/**
 * Streams a collection: emits the full list once loaded, then after every remote change.
 * `onUpdate(items, isInitial)` mirrors the old Firestore snapshot semantics.
 */
export function subscribeToWorkspaceCollection<T extends { id: string }>(
  collection: CollectionName,
  onUpdate: (items: T[], isInitial: boolean) => void
): () => void {
  if (!supabase || !currentUser) return () => undefined;
  const client = supabase;
  const uid = currentUser.id;
  const docs = new Map<string, T>();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  const emit = (initial: boolean) => onUpdate([...docs.values()], initial);

  async function load(initial: boolean) {
    const { data, error } = await client
      .from('workspace_docs')
      .select('id,data')
      .eq('collection', collection)
      .eq('user_id', uid);
    if (cancelled) return;
    if (error) {
      console.warn(`Cloud load notice [${collection}]:`, error.message);
      return;
    }
    docs.clear();
    for (const row of data || []) docs.set(row.id as string, row.data as T);
    emit(initial);
  }

  void load(true);

  channel = client
    .channel(`ws-${collection}-${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspace_docs', filter: `user_id=eq.${uid}` },
      (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as {
          collection?: string;
          id?: string;
          data?: T;
        };
        if (!row || row.collection !== collection || !row.id) return;
        if (payload.eventType === 'DELETE') docs.delete(row.id);
        else if (row.data) docs.set(row.id, row.data);
        emit(false);
      }
    )
    .subscribe((status) => {
      // after a dropped socket Supabase re-subscribes; re-sync to catch anything missed meanwhile
      if (status === 'SUBSCRIBED' && !cancelled) void load(false);
    });

  return () => {
    cancelled = true;
    if (channel) void client.removeChannel(channel);
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

export async function saveRemoteGeminiSettings(settings: GeminiSettings): Promise<void> {
  if (!supabase || !currentUser) return;
  // never persist transient health state (cooldowns); only keys, labels and models
  const sanitized: GeminiSettings = {
    ...settings,
    slots: settings.slots.map((s) => ({ ...s, cooldownUntil: undefined })),
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
