// @ts-nocheck -- this file runs on Supabase Edge Functions (Deno), not in the browser build
// Supabase Edge Function: reads a published calendar link (.ics, e.g. Outlook / Microsoft 365) and returns its events as plain JSON.
// A browser cannot read that link itself (Microsoft does not allow it), so the server does it on the signed-in user's behalf.
// Safety: only signed-in users, only https links from a short list of calendar hosts, small size limit, short timeout.
// No secrets are needed. Deploy with "Verify JWT" ON.
import { createClient } from 'npm:@supabase/supabase-js@2';
import ICAL from 'npm:ical.js@1.5.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ALLOWED_HOSTS = ['outlook.office365.com', 'outlook.office.com', 'outlook.live.com', 'calendar.google.com'];
const MAX_BYTES = 8 * 1024 * 1024;
const DAY = 86400_000;

// a time without a zone ("floating") is read as Cairo wall-clock time
const cairoOffsetMs = (ms: number) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
};
const toMs = (t: any): number => {
  if (t.zone !== ICAL.Timezone.localTimezone) return t.toJSDate().getTime();
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, 0);
  let ms = wall - cairoOffsetMs(wall);
  ms = wall - cairoOffsetMs(ms);
  return ms;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: 'not_signed_in' }, 401);

    const body = await req.json().catch(() => ({}));
    let url: URL;
    try {
      url = new URL(String(body?.url || ''));
    } catch {
      return json({ error: 'bad_link' }, 400);
    }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname) || !/\.ics$/i.test(url.pathname)) return json({ error: 'link_not_allowed' }, 400);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let text = '';
    try {
      const res = await fetch(url.toString(), { signal: ctl.signal, redirect: 'follow', headers: { Accept: 'text/calendar' } });
      if (!res.ok) return json({ error: `fetch_failed_${res.status}` }, 502);
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return json({ error: 'too_big' }, 413);
      text = await res.text();
      if (text.length > MAX_BYTES) return json({ error: 'too_big' }, 413);
    } finally {
      clearTimeout(timer);
    }
    if (!/BEGIN:VCALENDAR/.test(text)) return json({ error: 'not_a_calendar' }, 422);

    const from = Date.now() - 30 * DAY;
    const to = Date.now() + 365 * DAY;
    const comp = new ICAL.Component(ICAL.parse(text));
    comp.getAllSubcomponents('vtimezone').forEach((tz) => {
      try {
        ICAL.TimezoneService.register(tz);
      } catch {
        /* ignore a bad zone definition */
      }
    });
    const all = comp.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
    const masters = all.filter((e) => !e.isRecurrenceException());
    all.filter((e) => e.isRecurrenceException()).forEach((ex) => {
      const m = masters.find((x) => x.uid === ex.uid);
      if (m) m.relateException(ex);
    });

    const out: unknown[] = [];
    const add = (uid: string, ev: any, s: any, e: any) => {
      if (String(ev.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
      const allDay = s.isDate;
      const sMs = toMs(s);
      const eMs = e ? toMs(e) : sMs;
      if (eMs < from || sMs > to) return;
      out.push({
        uid,
        title: ev.summary || '',
        location: ev.location || '',
        description: (ev.description || '').slice(0, 2000),
        allDay,
        start: allDay ? s.toString() : new Date(sMs).toISOString(),
        end: allDay ? (e ? e.toString() : s.toString()) : new Date(eMs).toISOString(),
        organizer: (ev.organizer || '').replace(/^mailto:/i, ''),
      });
    };

    for (const m of masters) {
      if (out.length >= 3000) break;
      if (!m.isRecurring()) {
        add(m.uid, m, m.startDate, m.endDate);
        continue;
      }
      const it = m.iterator();
      let guard = 0;
      for (let next = it.next(); next && guard < 4000; next = it.next(), guard++) {
        if (next.toJSDate().getTime() > to) break;
        const d = m.getOccurrenceDetails(next);
        add(`${m.uid}#${d.recurrenceId.toString()}`, d.item, d.startDate, d.endDate);
      }
    }
    return json({ events: out, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
