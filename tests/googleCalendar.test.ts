import { describe, it, expect } from 'vitest';
import { eventsToMeetings, planImport } from '../src/lib/googleCalendar';
import type { Meeting } from '../src/types';

describe('google calendar import', () => {
  it('maps timed and all-day events and skips cancelled ones', () => {
    const list = eventsToMeetings([
      { id: 'a', summary: 'Board', start: { dateTime: '2026-10-20T10:00:00+03:00' }, end: { dateTime: '2026-10-20T11:00:00+03:00' }, attendees: [{ email: 'me@x.com', self: true }, { email: 'a@x.com', displayName: 'Ali' }] },
      { id: 'b', summary: 'Holiday', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } },
      { id: 'c', status: 'cancelled', start: { dateTime: '2026-10-20T10:00:00Z' }, end: { dateTime: '2026-10-20T11:00:00Z' } },
    ]);
    expect(list.map((m) => m.id)).toEqual(['gcal_a', 'gcal_b']);
    expect(list[0].start).toBe('2026-10-20T07:00:00.000Z');
    expect(list[0].attendees).toEqual(['Ali']);
    expect(list[1].start < list[1].end).toBe(true);
  });

  it('plans adds, changes and removals without overwriting newer local edits', () => {
    const mk = (id: string, title: string, updatedAt: string, start = '2026-10-20T07:00:00.000Z'): Meeting =>
      ({ id, title, description: '', start, end: '2026-10-20T08:00:00.000Z', attendees: [], updatedAt, syncState: 'synced' } as unknown as Meeting);
    const existing = [mk('gcal_keep', 'Old', '2026-10-01T00:00:00Z'), mk('gcal_edited', 'My title', '2026-10-10T00:00:00Z'), mk('gcal_gone', 'Gone', '2026-10-01T00:00:00Z'), mk('own_1', 'Mine', '2026-10-01T00:00:00Z')];
    const incoming = [mk('gcal_keep', 'New title', '2026-10-05T00:00:00Z'), mk('gcal_edited', 'Google title', '2026-10-05T00:00:00Z'), mk('gcal_new', 'Fresh', '2026-10-05T00:00:00Z')];
    const plan = planImport(existing, incoming, '2026-10-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z');
    expect(plan.upsert.map((m) => m.id).sort()).toEqual(['gcal_keep', 'gcal_new']);
    expect(plan.remove.map((m) => m.id)).toEqual(['gcal_gone']);
  });
});
