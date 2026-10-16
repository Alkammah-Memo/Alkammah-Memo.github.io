/**
 * Google Calendar link (read-only). The user signs in with the normal Google account chooser (Google Identity Services), the app
 * gets a short-lived read-only token and imports the events as meetings. Nothing is ever written back to Google.
 * Needs a Google OAuth "Web client ID" (public, not a secret) with this site as an authorized JavaScript origin.
 */
import type { Meeting } from '../types';
import { cairoLocalToIso } from './cairoTime';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
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
  return !!l.token && !!l.expiresAt && l.expiresAt - 60_000 > Date.now();
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

/** Opens the Google account chooser (or refreshes silently) and stores the token. Must start from a tap when interactive. */
export function requestGoogleToken(interactive: boolean): Promise<string> {
  const l = getGoogleLink();
  if (!l.clientId.trim()) return Promise.reject(new Error('NO_CLIENT_ID'));
  const w = window as unknown as { google?: Gis };
  if (!w.google?.accounts?.oauth2) return Promise.reject(new Error('Google sign-in is still loading, try again in a moment.'));
  return new Promise((resolve, reject) => {
    const client = w.google.accounts.oauth2.initTokenClient({
      client_id: l.clientId.trim(),
      scope: GOOGLE_SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => {
        if (!resp.access_token) return reject(new Error(resp.error_description || resp.error || 'Google did not return access'));
        setGoogleLink({ token: resp.access_token, expiresAt: Date.now() + (resp.expires_in || 3600) * 1000 });
        resolve(resp.access_token);
      },
      error_callback: (err: { type?: string; message?: string }) => reject(new Error(err?.message || err?.type || 'Google sign-in was closed')),
    });
    client.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
  });
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
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchPrimaryCalendar(token: string): Promise<{ email: string }> {
  const c = await googleFetch<{ id?: string; summary?: string }>('https://www.googleapis.com/calendar/v3/calendars/primary', token);
  return { email: c.id || c.summary || '' };
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

/** Google events -> app meetings (all-day events run midnight to midnight Cairo time; cancelled ones are skipped). */
export function eventsToMeetings(events: GoogleEvent[]): Meeting[] {
  const meetings: Meeting[] = [];
  for (const e of events) {
    if (e.status === 'cancelled' || !e.id) continue;
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
      attendees: (e.attendees || []).filter((a) => !a.self).map((a) => a.displayName || a.email || '').filter(Boolean),
      googleEventId: e.id,
      syncState: 'synced',
      createdAt: e.created ? new Date(e.created).toISOString() : stamp,
      updatedAt: stamp,
      createdBy: 'google-calendar',
    });
  }
  return meetings;
}

const SAME_FIELDS: (keyof Meeting)[] = ['title', 'description', 'start', 'end', 'location', 'conferenceUrl'];

/**
 * Works out what to write: new or changed Google events, and imported events that no longer exist in Google (inside the window).
 * A meeting edited here after Google last changed it is left alone, so local edits are never silently lost.
 */
export function planImport(existing: Meeting[], incoming: Meeting[], fromIso: string, toIso: string): { upsert: Meeting[]; remove: Meeting[] } {
  const byId = new Map(existing.map((m) => [m.id, m]));
  const upsert: Meeting[] = [];
  for (const m of incoming) {
    const ex = byId.get(m.id);
    if (!ex) {
      upsert.push(m);
      continue;
    }
    const differs = SAME_FIELDS.some((f) => (ex[f] || '') !== (m[f] || '')) || (ex.attendees || []).join('|') !== (m.attendees || []).join('|');
    const localNewer = Date.parse(ex.updatedAt) > Date.parse(m.updatedAt);
    if (differs && !localNewer) upsert.push({ ...ex, ...m });
  }
  const seen = new Set(incoming.map((m) => m.id));
  const remove = existing.filter((m) => m.id.startsWith(GOOGLE_ID_PREFIX) && !seen.has(m.id) && m.start >= fromIso && m.start <= toIso);
  return { upsert, remove };
}
