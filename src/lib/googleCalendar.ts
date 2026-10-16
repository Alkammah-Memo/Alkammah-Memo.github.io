/**
 * Google Calendar link, two-way. The user signs in with the normal Google account chooser (Google Identity Services); the app gets a
 * short-lived token and mirrors the primary calendar: Google events appear as meetings, and meetings added, changed or deleted here
 * are added, changed or deleted in Google.
 * Needs a Google OAuth "Web client ID" (public, not a secret) with this site as an authorized JavaScript origin.
 */
import type { Meeting, Task } from '../types';
import { cairoLocalToIso } from './cairoTime';
import { supabase } from './cloud';

/** read and write events, plus the account's email address (to show which account is linked) */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
/** bump when the scope changes so devices signed in with the old one ask again */
const SCOPE_VERSION = 2;
const KEY = 'alkammah_google_link_v1';
export const GOOGLE_ID_PREFIX = 'gcal_';

export interface GoogleLink {
  clientId: string;
  email?: string;
  token?: string;
  expiresAt?: number;
  lastSyncAt?: string;
  lastCount?: number;
  autoSync: boolean;
  scopeV?: number;
  /** true once the long-lived (server-side) sign-in is set up, so tokens renew by themselves */
  serverLinked?: boolean;
  /** task id -> the Google event that shows it, and a signature of what was last sent */
  taskEvents?: Record<string, { eventId: string; sig: string }>;
  /** Google event ids that were mirrored at the last sync (used to notice what was deleted here) */
  known?: string[];
}

// The Client ID is public (it only names this app to Google), so it ships as the default and every device is ready to sign in
const DEFAULT_CLIENT_ID = '849813350824-nlaan8g858fs2o3hhenfedrtc1ehclte.apps.googleusercontent.com';
const DEFAULT: GoogleLink = { clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID, autoSync: true };
let link: GoogleLink | null = null;
const listeners = new Set<() => void>();

export function getGoogleLink(): GoogleLink {
  if (!link) {
    try {
      const raw = localStorage.getItem(KEY);
      link = raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
      if (!link!.clientId) link = { ...link!, clientId: DEFAULT.clientId };
    } catch {
      link = DEFAULT;
    }
  }
  return link!;
}

export function setGoogleLink(patch: Partial<GoogleLink>): void {
  link = { ...getGoogleLink(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const subscribeGoogleLink = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function tokenIsValid(l: GoogleLink = getGoogleLink()): boolean {
  return !!l.token && l.scopeV === SCOPE_VERSION && !!l.expiresAt && l.expiresAt - 60_000 > Date.now();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gis = any;
let gisPromise: Promise<Gis> | null = null;

/** Loads Google's sign-in library once (call early so the later click can open the popup immediately). */
export function loadGoogleIdentity(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => (w.google?.accounts?.oauth2 ? resolve(w.google) : reject(new Error('Google sign-in did not load')));
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Could not reach Google sign-in. Check the internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

// ----- permanent sign-in: the Edge Function keeps Google's refresh token and hands out fresh access tokens on request
export type ServerState = 'unknown' | 'ready' | 'unavailable';
let serverState: ServerState = 'unknown';
export const getServerState = () => serverState;

async function callAuth(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string }> {
  if (!supabase) return { data: null, error: 'no_cloud' };
  const { data, error } = await supabase.functions.invoke('google-calendar-auth', { body });
  if (!error) return { data: data as Record<string, unknown>, error: '' };
  let code = error.message || 'failed';
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) code = String((await ctx.json())?.error || code);
  } catch {
    /* keep message */
  }
  return { data: null, error: code };
}

/** Finds out (once per visit) whether the server side is set up. Call it early: a later tap must start Google's popup without waiting. */
export async function probeServer(): Promise<ServerState> {
  const r = await callAuth({ action: 'status' });
  serverState = r.data && r.data.configured ? 'ready' : 'unavailable';
  if (r.data && r.data.linked === false && getGoogleLink().serverLinked) setGoogleLink({ serverLinked: false });
  return serverState;
}

function applyToken(access: string, expiresIn: number, scope: string) {
  const ok = GOOGLE_SCOPE.split(' ').every((sc) => scope.includes(sc));
  if (!ok) {
    setGoogleLink({ token: undefined, expiresAt: undefined, scopeV: undefined });
    throw new Error('GOOGLE_SCOPES_MISSING');
  }
  setGoogleLink({ token: access, expiresAt: Date.now() + (expiresIn || 3600) * 1000, scopeV: SCOPE_VERSION });
  return access;
}

async function refreshFromServer(): Promise<string> {
  const r = await callAuth({ action: 'refresh' });
  if (!r.data) {
    if (r.error === 'reauth' || r.error === 'no_link') setGoogleLink({ serverLinked: false });
    throw new Error(r.error === 'reauth' || r.error === 'no_link' ? 'GOOGLE_TOKEN_EXPIRED' : r.error);
  }
  return applyToken(String(r.data.access_token), Number(r.data.expires_in), String(r.data.scope || ''));
}

/** Starts Google's popup synchronously (must be inside a tap) and swaps the returned code for a permanent link. */
function connectViaServer(): Promise<string> {
  const l = getGoogleLink();
  const w = window as unknown as { google?: Gis };
  return new Promise((resolve, reject) => {
    const client = w.google.accounts.oauth2.initCodeClient({
      client_id: l.clientId.trim(),
      scope: GOOGLE_SCOPE,
      ux_mode: 'popup',
      callback: async (resp: { code?: string; error?: string }) => {
        if (!resp.code) return reject(new Error(resp.error || 'Google did not return access'));
        const r = await callAuth({ action: 'exchange', code: resp.code });
        if (!r.data) return reject(new Error(r.error));
        try {
          const token = applyToken(String(r.data.access_token), Number(r.data.expires_in), String(r.data.scope || ''));
          setGoogleLink({ serverLinked: true });
          resolve(token);
        } catch (e) {
          await callAuth({ action: 'disconnect' });
          reject(e);
        }
      },
      error_callback: (err: { type?: string; message?: string }) => reject(new Error(err?.message || err?.type || 'Google sign-in was closed')),
    });
    client.requestCode();
  });
}

/** Browser-only one-hour token (used when the server side is not set up). */
function requestBrowserToken(prompt: 'select_account' | 'consent' | 'none'): Promise<string> {
  const l = getGoogleLink();
  const w = window as unknown as { google?: Gis };
  return new Promise((resolve, reject) => {
    const timer = prompt === 'none' ? setTimeout(() => reject(new Error('GOOGLE_TOKEN_EXPIRED')), 8000) : undefined;
    const client = w.google.accounts.oauth2.initTokenClient({
      client_id: l.clientId.trim(),
      scope: GOOGLE_SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string; error_description?: string; scope?: string }) => {
        clearTimeout(timer);
        if (!resp.access_token) return reject(new Error(prompt === 'none' ? 'GOOGLE_TOKEN_EXPIRED' : resp.error_description || resp.error || 'Google did not return access'));
        try {
          resolve(applyToken(resp.access_token, resp.expires_in || 3600, resp.scope || ''));
        } catch (e) {
          reject(e);
        }
      },
      error_callback: (err: { type?: string; message?: string }) => {
        clearTimeout(timer);
        reject(new Error(prompt === 'none' ? 'GOOGLE_TOKEN_EXPIRED' : err?.message || err?.type || 'Google sign-in was closed'));
      },
    });
    client.requestAccessToken({ prompt });
  });
}

/**
 * Gets a working access token. With the permanent (server) link it renews by itself, no tap needed. Otherwise an interactive call opens
 * the account chooser, and a silent call tries to renew quietly with the browser's own Google session.
 */
export function requestGoogleToken(interactive: boolean): Promise<string> {
  const l = getGoogleLink();
  if (!l.clientId.trim()) return Promise.reject(new Error('NO_CLIENT_ID'));
  const w = window as unknown as { google?: Gis };
  const gisReady = !!w.google?.accounts?.oauth2;
  if (l.serverLinked) {
    return refreshFromServer().catch((e) => {
      if (!interactive || !gisReady || serverState !== 'ready') throw e;
      return connectViaServer();
    });
  }
  if (!gisReady) return Promise.reject(new Error('Google sign-in is still loading, try again in a moment.'));
  if (interactive) {
    if (serverState === 'ready') return connectViaServer();
    return requestBrowserToken(l.scopeV === SCOPE_VERSION ? 'select_account' : 'consent');
  }
  return requestBrowserToken('none');
}

/** Forget the permanent link (also revokes it at Google). */
export async function disconnectGoogle(): Promise<void> {
  if (getGoogleLink().serverLinked) await callAuth({ action: 'disconnect' });
  setGoogleLink({ token: undefined, expiresAt: undefined, email: undefined, lastSyncAt: undefined, lastCount: undefined, serverLinked: false, known: undefined, taskEvents: undefined });
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  updated?: string;
  created?: string;
  organizer?: { email?: string; displayName?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/** A 403 about scopes means the permissions were not all granted: forget the token so the next tap asks again. */
function mapScopeError(status: number, msg: string): string {
  if (status === 403 && /insufficient (authentication )?scopes?|insufficientPermissions/i.test(msg)) {
    setGoogleLink({ token: undefined, expiresAt: undefined, scopeV: undefined });
    return 'GOOGLE_SCOPES_MISSING';
  }
  return msg;
}

async function googleFetch<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    setGoogleLink({ token: undefined, expiresAt: undefined });
    throw new Error('GOOGLE_TOKEN_EXPIRED');
  }
  if (!res.ok) {
    let msg = `Google Calendar error ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(mapScopeError(res.status, msg));
  }
  return res.json() as Promise<T>;
}

export async function fetchPrimaryCalendar(token: string): Promise<{ email: string }> {
  const u = await googleFetch<{ email?: string }>('https://www.googleapis.com/oauth2/v3/userinfo', token);
  return { email: u.email || '' };
}

export async function fetchGoogleEvents(token: string, fromIso: string, toIso: string): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeMin: fromIso, timeMax: toIso });
    if (pageToken) qs.set('pageToken', pageToken);
    const j = await googleFetch<{ items?: GoogleEvent[]; nextPageToken?: string }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${qs}`, token);
    out.push(...(j.items || []));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

/** Attendee names typed here are kept in the event itself (Google only holds emails), so they survive the round trip. */
function memoAttendees(e: GoogleEvent): string[] | null {
  const raw = e.extendedProperties?.private?.memoAttendees;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
}

/** Google events -> app meetings (all-day events run midnight to midnight Cairo time; cancelled ones are skipped). */
export function eventsToMeetings(events: GoogleEvent[]): Meeting[] {
  const meetings: Meeting[] = [];
  for (const e of events) {
    // events that show an app task are not meetings
    if (e.status === 'cancelled' || !e.id || e.extendedProperties?.private?.memoTaskId) continue;
    let start: string;
    let end: string;
    if (e.start?.dateTime && e.end?.dateTime) {
      start = new Date(e.start.dateTime).toISOString();
      end = new Date(e.end.dateTime).toISOString();
    } else if (e.start?.date && e.end?.date) {
      start = cairoLocalToIso(e.start.date, '00:00');
      end = cairoLocalToIso(e.end.date, '00:00');
    } else continue;
    const stamp = e.updated ? new Date(e.updated).toISOString() : new Date().toISOString();
    meetings.push({
      id: `${GOOGLE_ID_PREFIX}${e.id}`,
      workspaceId: 'default-ws',
      title: e.summary || 'Google Calendar event',
      description: e.description || '',
      start,
      end,
      timezone: 'Africa/Cairo',
      location: e.location || undefined,
      conferenceUrl: e.hangoutLink || undefined,
      organizer: e.organizer?.displayName || e.organizer?.email || 'Google Calendar',
      attendees: memoAttendees(e) ?? (e.attendees || []).filter((a) => !a.self).map((a) => a.displayName || a.email || '').filter(Boolean),
      googleEventId: e.id,
      googleSyncedAt: stamp,
      syncState: 'synced',
      createdAt: e.created ? new Date(e.created).toISOString() : stamp,
      updatedAt: stamp,
      createdBy: 'google-calendar',
    });
  }
  return meetings;
}

const SAME_FIELDS: (keyof Meeting)[] = ['title', 'description', 'start', 'end', 'location'];

const differs = (a: Meeting, b: Meeting) =>
  SAME_FIELDS.some((f) => (a[f] || '') !== (b[f] || '')) || (a.attendees || []).join('|') !== (b.attendees || []).join('|');

/**
 * Works out the two-way sync: what to pull into the app, what to push to Google, and what was deleted on either side.
 *  - The side that changed last wins; a meeting edited here after Google last changed it is pushed, never overwritten.
 *  - A meeting that disappeared here (but was mirrored before) is deleted in Google; an event that disappeared in Google is removed here.
 */
export function planSync(
  existing: Meeting[],
  remote: Meeting[],
  fromIso: string,
  toIso: string,
  known: string[]
): { upsert: Meeting[]; removeLocal: Meeting[]; push: Meeting[]; deleteRemote: string[] } {
  const knownSet = new Set(known);
  const localByGoogle = new Map(existing.filter((m) => m.googleEventId).map((m) => [m.googleEventId as string, m]));
  // a remote event that is already a local meeting keeps the local meeting's id
  const incoming = remote.map((m) => ({ ...m, id: localByGoogle.get(m.googleEventId as string)?.id ?? m.id }));
  const incomingByGoogle = new Map(incoming.map((m) => [m.googleEventId as string, m]));
  const byId = new Map(existing.map((m) => [m.id, m]));

  // deleted here: mirrored before, still in Google, gone from the app
  const deleteRemote = known.filter((gid) => !localByGoogle.has(gid) && incomingByGoogle.has(gid));
  const dropped = new Set(deleteRemote);

  const upsert: Meeting[] = [];
  const push: Meeting[] = [];
  for (const m of incoming) {
    if (dropped.has(m.googleEventId as string)) continue;
    const ex = byId.get(m.id);
    if (!ex) {
      upsert.push(m);
      continue;
    }
    if (!differs(ex, m)) continue;
    if (Date.parse(ex.updatedAt) > Date.parse(m.updatedAt)) push.push(ex);
    else upsert.push({ ...ex, ...m });
  }
  // new here: never sent to Google yet
  for (const m of existing) {
    if (!m.googleEventId && !m.id.startsWith(GOOGLE_ID_PREFIX) && m.start >= fromIso && m.start <= toIso) push.push(m);
  }
  // deleted in Google: mirrored (or imported) before, inside the window, not returned any more
  const removeLocal = existing.filter(
    (m) => !!m.googleEventId && (m.id.startsWith(GOOGLE_ID_PREFIX) || knownSet.has(m.googleEventId)) && !incomingByGoogle.has(m.googleEventId) && m.start >= fromIso && m.start <= toIso
  );
  return { upsert, removeLocal, push, deleteRemote };
}

function eventBody(m: Meeting) {
  return {
    summary: m.title,
    description: m.description || undefined,
    location: m.location || undefined,
    start: { dateTime: m.start, timeZone: 'Africa/Cairo' },
    end: { dateTime: m.end, timeZone: 'Africa/Cairo' },
    extendedProperties: { private: { memoAttendees: JSON.stringify(m.attendees || []), memoId: m.id } },
  };
}

async function googleWrite(method: 'POST' | 'PATCH' | 'DELETE', path: string, token: string, body?: unknown): Promise<{ id?: string; updated?: string } | null> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    setGoogleLink({ token: undefined, expiresAt: undefined });
    throw new Error('GOOGLE_TOKEN_EXPIRED');
  }
  if (method === 'DELETE' && (res.status === 404 || res.status === 410 || res.ok)) return null;
  if (!res.ok) {
    let msg = `Google Calendar error ${res.status}`;
    try {
      msg = (await res.json())?.error?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(mapScopeError(res.status, msg));
  }
  return res.json();
}

/** Creates or updates the event in Google; returns its id and Google's own "updated" time. */
export async function pushMeeting(token: string, m: Meeting): Promise<{ id: string; updated: string }> {
  const r = m.googleEventId ? await googleWrite('PATCH', `/${encodeURIComponent(m.googleEventId)}`, token, eventBody(m)) : await googleWrite('POST', '', token, eventBody(m));
  return { id: (r?.id || m.googleEventId) as string, updated: r?.updated ? new Date(r.updated).toISOString() : new Date().toISOString() };
}

export async function deleteGoogleEvent(token: string, eventId: string): Promise<void> {
  await googleWrite('DELETE', `/${encodeURIComponent(eventId)}`, token);
}

// ----- tasks -> Google Calendar (one way: the app is the source of truth for tasks)
const addDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);

function taskBody(t: Task) {
  const due = (t.dueDate || '').slice(0, 10);
  const timed = !!t.dueTime;
  const start = timed ? cairoLocalToIso(due, t.dueTime as string) : '';
  const details = [t.project && `Project: ${t.project}`, t.ownerAlias && `Owner: ${t.ownerAlias}`, `Priority: ${t.priority}`, `Status: ${t.status}`, t.nextAction && `Next action: ${t.nextAction}`, t.description]
    .filter(Boolean)
    .join('\n');
  return {
    summary: `Task: ${t.title}`,
    description: details,
    colorId: '5',
    ...(timed
      ? { start: { dateTime: start, timeZone: 'Africa/Cairo' }, end: { dateTime: new Date(Date.parse(start) + 30 * 60_000).toISOString(), timeZone: 'Africa/Cairo' } }
      : { start: { date: due }, end: { date: addDay(due) } }),
    extendedProperties: { private: { memoTaskId: t.id } },
  };
}

/**
 * Shows open tasks that have a due date as events in Google Calendar (all-day, or timed when the task has a due time). Changing a task
 * updates its event; finishing, archiving or deleting it (or clearing its date) removes the event.
 */
export async function syncTasksToGoogle(token: string, tasks: Task[], fromDay: string, toDay: string): Promise<{ created: number; updated: number; removed: number }> {
  const map: NonNullable<GoogleLink['taskEvents']> = { ...(getGoogleLink().taskEvents || {}) };
  let created = 0;
  let updated = 0;
  let removed = 0;
  const eligible = new Map(
    tasks
      .filter((t) => !t.isArchived && t.status !== 'Done' && t.status !== 'Closed' && !!t.dueDate && t.dueDate.slice(0, 10) >= fromDay && t.dueDate.slice(0, 10) <= toDay)
      .map((t) => [t.id, t])
  );
  for (const [taskId, link] of Object.entries(map)) {
    if (eligible.has(taskId)) continue;
    await deleteGoogleEvent(token, link.eventId);
    delete map[taskId];
    removed++;
  }
  for (const t of eligible.values()) {
    const body = taskBody(t);
    const sig = JSON.stringify(body);
    const cur = map[t.id];
    if (cur && cur.sig === sig) continue;
    if (cur) {
      try {
        await googleWrite('PATCH', `/${encodeURIComponent(cur.eventId)}`, token, body);
        map[t.id] = { eventId: cur.eventId, sig };
        updated++;
        continue;
      } catch (e) {
        if ((e as Error).message === 'GOOGLE_SCOPES_MISSING' || (e as Error).message === 'GOOGLE_TOKEN_EXPIRED') throw e;
        /* the event is gone in Google: fall through and create it again */
      }
    }
    const r = await googleWrite('POST', '', token, body);
    if (r?.id) {
      map[t.id] = { eventId: r.id, sig };
      created++;
    }
  }
  setGoogleLink({ taskEvents: map });
  return { created, updated, removed };
}
