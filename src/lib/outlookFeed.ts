/**
 * Work calendar (Outlook / Microsoft 365) shown inside the system, read-only.
 * The person publishes the calendar in Outlook and pastes the .ics link here. A server function reads the link (a browser is not
 * allowed to), and the events appear next to the others. They are never written back and never leave this account.
 */
import { supabase } from './cloud';
import { cairoLocalToIso } from './cairoTime';
import type { Meeting } from '../types';

export const FEED_ID_PREFIX = 'ics_';
const URL_KEY = 'alkammah_feed_url_v1';
const CACHE_KEY = 'alkammah_feed_cache_v1';

export interface FeedState {
  url: string;
  fetchedAt?: string;
  count?: number;
  error?: string;
}

let state: FeedState = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(): FeedState {
  try {
    const url = localStorage.getItem(URL_KEY) || '';
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return { url, fetchedAt: c?.fetchedAt, count: c?.meetings?.length };
  } catch {
    return { url: '' };
  }
}
export const getFeedState = () => state;
export const subscribeFeed = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const isFeedUrl = (u: string): boolean => {
  try {
    const x = new URL(u.trim());
    return x.protocol === 'https:' && /\.ics$/i.test(x.pathname) && ['outlook.office365.com', 'outlook.office.com', 'outlook.live.com', 'calendar.google.com'].includes(x.hostname);
  } catch {
    return false;
  }
};

export function setFeedUrl(url: string) {
  const u = url.trim();
  try {
    if (u) localStorage.setItem(URL_KEY, u);
    else {
      localStorage.removeItem(URL_KEY);
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    /* storage may be unavailable */
  }
  state = u ? { ...state, url: u, error: undefined } : { url: '' };
  emit();
}

export function cachedFeedMeetings(): Meeting[] {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(c?.meetings) ? (c.meetings as Meeting[]) : [];
  } catch {
    return [];
  }
}

interface FeedEvent {
  uid: string;
  title: string;
  location?: string;
  description?: string;
  allDay: boolean;
  start: string;
  end: string;
  organizer?: string;
}

export function feedEventsToMeetings(events: FeedEvent[], stamp = new Date().toISOString()): Meeting[] {
  const out: Meeting[] = [];
  for (const e of events) {
    let start: string;
    let end: string;
    try {
      if (e.allDay) {
        start = cairoLocalToIso(e.start, '00:00');
        end = cairoLocalToIso(e.end && e.end > e.start ? e.end : e.start, e.end && e.end > e.start ? '00:00' : '23:59');
      } else {
        start = new Date(e.start).toISOString();
        end = new Date(e.end).toISOString();
      }
    } catch {
      continue;
    }
    out.push({
      id: `${FEED_ID_PREFIX}${e.uid}`,
      workspaceId: 'default-ws',
      title: e.title || 'Work calendar',
      description: e.description || '',
      start,
      end,
      timezone: 'Africa/Cairo',
      location: e.location || undefined,
      organizer: e.organizer || 'Work calendar',
      attendees: [],
      syncState: 'internal_only',
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: 'work-calendar',
    });
  }
  return out;
}

/** reads the link through the server function; returns the meetings (also cached for offline) */
export async function refreshFeed(): Promise<Meeting[]> {
  if (!supabase) throw new Error('Cloud is not configured.');
  if (!state.url) return [];
  const { data, error } = await supabase.functions.invoke('calendar-feed', { body: { url: state.url } });
  if (error) {
    let code = error.message || 'failed';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = String((await ctx.json())?.error || code);
    } catch {
      /* keep message */
    }
    state = { ...state, error: code };
    emit();
    throw new Error(code);
  }
  const meetings = feedEventsToMeetings((data as { events?: FeedEvent[] })?.events || []);
  const fetchedAt = (data as { fetchedAt?: string })?.fetchedAt || new Date().toISOString();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, meetings }));
  } catch {
    /* too big or unavailable: still shown this session */
  }
  state = { url: state.url, fetchedAt, count: meetings.length };
  emit();
  return meetings;
}
