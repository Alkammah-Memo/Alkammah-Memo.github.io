/** Team: profiles, roles and chat, on top of Supabase (row-level security decides who sees what). */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './cloud';
import type { Attachment } from './drive';

export type Role = 'admin' | 'manager' | 'member';

export interface Profile {
  user_id: string;
  email: string;
  display_name: string;
  phone: string;
  birthday: string; // YYYY-MM-DD or ''
  avatar_url: string;
  role: Role;
  active: boolean;
  created_at: string;
  lastSignIn?: string | null;
}

export interface ChatThread {
  id: string;
  kind: 'direct' | 'group';
  title: string;
  created_by: string;
  last_message_at: string;
}
export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  attachments: Attachment[];
  created_at: string;
}
interface Member {
  thread_id: string;
  user_id: string;
  last_read_at: string;
}

export const nameOf = (p: Pick<Profile, 'display_name' | 'email'> | undefined): string => (p ? p.display_name.trim() || p.email.split('@')[0] : '—');

// ------------------------------------------------------------------ small reactive store (useSyncExternalStore friendly)
export interface TeamState {
  ready: boolean;
  meId: string;
  profiles: Profile[];
  threads: ChatThread[];
  members: Member[];
  messages: Record<string, ChatMessage[]>; // oldest first
  hasMore: Record<string, boolean>;
  unread: Record<string, number>;
  unreadTotal: number;
}
const EMPTY: TeamState = { ready: false, meId: '', profiles: [], threads: [], members: [], messages: {}, hasMore: {}, unread: {}, unreadTotal: 0 };
let state: TeamState = EMPTY;
const listeners = new Set<() => void>();
const set = (patch: Partial<TeamState>) => {
  const next = { ...state, ...patch };
  const unread: Record<string, number> = {};
  let total = 0;
  for (const t of next.threads) {
    const mine = next.members.find((m) => m.thread_id === t.id && m.user_id === next.meId);
    const since = mine ? new Date(mine.last_read_at).getTime() : 0;
    const n = (next.messages[t.id] || []).filter((m) => m.sender_id !== next.meId && new Date(m.created_at).getTime() > since).length;
    if (n) unread[t.id] = n;
    total += n;
  }
  state = { ...next, unread, unreadTotal: total };
  listeners.forEach((l) => l());
};
export const subscribeTeam = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getTeam = () => state;

const PAGE = 40;
let channel: RealtimeChannel | null = null;
let startedFor = '';

async function loadProfiles() {
  if (!supabase) return;
  const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  if (data) set({ profiles: data as Profile[] });
}
async function loadThreads() {
  if (!supabase) return;
  const [t, m] = await Promise.all([
    supabase.from('chat_threads').select('*').order('last_message_at', { ascending: false }),
    supabase.from('chat_members').select('*'),
  ]);
  if (t.data && m.data) {
    set({ threads: t.data as ChatThread[], members: m.data as Member[] });
    // newest messages of every chat (for the list preview and the unread counter)
    await Promise.all((t.data as ChatThread[]).map((th) => (state.messages[th.id] ? Promise.resolve() : loadMessages(th.id))));
  }
}

export async function loadMessages(threadId: string, older = false): Promise<void> {
  if (!supabase) return;
  const cur = state.messages[threadId] || [];
  let q = supabase.from('chat_messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(PAGE);
  if (older && cur[0]) q = q.lt('created_at', cur[0].created_at);
  const { data } = await q;
  if (!data) return;
  const got = (data as ChatMessage[]).reverse();
  const byId = new Map<string, ChatMessage>();
  [...got, ...cur].forEach((m) => byId.set(m.id, m));
  const merged = [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  set({ messages: { ...state.messages, [threadId]: merged }, hasMore: { ...state.hasMore, [threadId]: data.length === PAGE } });
}

function addMessage(m: ChatMessage) {
  const cur = state.messages[m.thread_id] || [];
  if (cur.some((x) => x.id === m.id)) return;
  const threads = state.threads.map((t) => (t.id === m.thread_id ? { ...t, last_message_at: m.created_at } : t)).sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  set({ messages: { ...state.messages, [m.thread_id]: [...cur, m] }, threads });
}

export async function startTeam(userId: string): Promise<void> {
  if (!supabase || startedFor === userId) return;
  stopTeam();
  startedFor = userId;
  set({ meId: userId });
  await Promise.all([loadProfiles(), loadThreads()]);
  set({ ready: true });
  channel = supabase
    .channel(`team-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (p) => {
      const m = p.new as ChatMessage;
      if (!state.threads.some((t) => t.id === m.thread_id)) await loadThreads(); // a brand new chat started by someone else
      addMessage(m);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => {
      const id = (p.old as { id?: string }).id;
      if (!id) return;
      const next: Record<string, ChatMessage[]> = {};
      for (const [k, v] of Object.entries(state.messages)) next[k] = v.filter((x) => x.id !== id);
      set({ messages: next });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, () => void loadThreads())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void loadProfiles())
    .subscribe();
}

export function stopTeam(): void {
  if (channel && supabase) void supabase.removeChannel(channel);
  channel = null;
  startedFor = '';
  state = EMPTY;
  listeners.forEach((l) => l());
}

/** re-read everything (called when the app comes back to the screen) */
export async function refreshTeam(): Promise<void> {
  if (!startedFor) return;
  await Promise.all([loadProfiles(), loadThreads()]);
  await Promise.all(state.threads.map((t) => loadMessages(t.id)));
}

// ------------------------------------------------------------------ profile
export async function saveMyProfile(patch: Partial<Pick<Profile, 'display_name' | 'phone' | 'birthday' | 'avatar_url'>>): Promise<void> {
  if (!supabase || !state.meId) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', state.meId);
  if (error) throw new Error(error.message);
  await loadProfiles();
}

// ------------------------------------------------------------------ chat actions
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export async function openDirect(other: string): Promise<string> {
  if (!supabase) throw new Error('No cloud');
  const { data, error } = await supabase.rpc('chat_open_direct', { other });
  fail(error);
  await loadThreads();
  return data as string;
}
export async function createGroup(title: string, members: string[]): Promise<string> {
  if (!supabase) throw new Error('No cloud');
  const { data, error } = await supabase.rpc('chat_create_group', { title, members });
  fail(error);
  await loadThreads();
  return data as string;
}
export async function broadcast(recipients: string[], body: string, attachments: Attachment[] = []): Promise<number> {
  if (!supabase) throw new Error('No cloud');
  const { data, error } = await supabase.rpc('chat_broadcast', { recipients, body, attachments });
  fail(error);
  await loadThreads();
  return data as number;
}
export async function sendMessage(threadId: string, body: string, attachments: Attachment[] = []): Promise<void> {
  if (!supabase) throw new Error('No cloud');
  const { data, error } = await supabase.from('chat_messages').insert({ thread_id: threadId, body, attachments }).select('*').single();
  fail(error);
  if (data) addMessage(data as ChatMessage);
}
export async function deleteMessage(m: ChatMessage): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_messages').delete().eq('id', m.id);
  fail(error);
  set({ messages: { ...state.messages, [m.thread_id]: (state.messages[m.thread_id] || []).filter((x) => x.id !== m.id) } });
}
export async function markRead(threadId: string): Promise<void> {
  if (!supabase || !state.meId) return;
  const now = new Date().toISOString();
  set({ members: state.members.map((m) => (m.thread_id === threadId && m.user_id === state.meId ? { ...m, last_read_at: now } : m)) });
  await supabase.from('chat_members').update({ last_read_at: now }).eq('thread_id', threadId).eq('user_id', state.meId);
}

// ------------------------------------------------------------------ administrator functions (server side)
export type AdminError = string;
async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('no_cloud');
  const { data, error } = await supabase.functions.invoke('team-admin', { body });
  if (error) {
    let code = error.message || 'failed';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = String((await ctx.json())?.error || code);
    } catch {
      /* keep message */
    }
    throw new Error(code);
  }
  return data as T;
}
export const adminList = () => adminCall<{ people: Profile[] }>({ action: 'list' }).then((r) => r.people);
export const adminCreate = (v: { email: string; password: string; displayName: string; role: Role }) => adminCall<{ ok: true }>({ action: 'create', ...v });
export const adminSetRole = (userId: string, role: Role) => adminCall({ action: 'setRole', userId, role });
export const adminSetActive = (userId: string, active: boolean) => adminCall({ action: 'setActive', userId, active });
export const adminResetPassword = (userId: string, password: string) => adminCall({ action: 'resetPassword', userId, password });

export function adminMessage(code: string, ar: boolean): string {
  const m: Record<string, [string, string]> = {
    not_signed_in: ['Please sign in again.', 'الرجاء تسجيل الدخول مرة أخرى.'],
    admins_only: ['Only an administrator can do this.', 'هذا الإجراء للمدير فقط.'],
    bad_email: ['That e-mail address does not look right.', 'عنوان البريد الإلكتروني غير صحيح.'],
    bad_role: ['Unknown role.', 'دور غير معروف.'],
    email_exists: ['This e-mail already has a login.', 'هذا البريد لديه حساب بالفعل.'],
    last_admin: ['There must always be at least one active administrator.', 'يجب أن يبقى مدير واحد فعّال على الأقل.'],
    password_too_short: ['The password needs at least 10 characters.', 'كلمة المرور تحتاج 10 أحرف على الأقل.'],
    password_needs_letters_and_numbers: ['Mix letters and numbers in the password.', 'اجمع الحروف والأرقام في كلمة المرور.'],
    password_too_simple: ['That password is too simple.', 'كلمة المرور بسيطة جداً.'],
    unknown_user: ['Unknown person.', 'شخص غير معروف.'],
  };
  const hit = m[code];
  if (hit) return ar ? hit[1] : hit[0];
  if (/non-2xx|Failed to send|FunctionsFetch|not found|404/i.test(code))
    return ar ? 'الجزء الخاص بالإدارة غير مفعّل على الخادم بعد (دالة team-admin).' : 'The administration part is not switched on at the server yet (the team-admin function).';
  return code;
}

// ------------------------------------------------------------------ birthdays
/** profiles whose birthday is today (month and day, Cairo calendar day given as YYYY-MM-DD) */
export function birthdaysOn(profiles: Profile[], today: string): Profile[] {
  const md = today.slice(5);
  return profiles.filter((p) => p.active && p.birthday && p.birthday.slice(5) === md);
}
