import { describe, it, expect } from 'vitest';
import { eventsToMeetings, planSync } from '../src/lib/googleCalendar';
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

  it('plans a two-way sync: pull, push, and deletions on both sides', () => {
    const mk = (id: string, title: string, updatedAt: string, extra: Partial<Meeting> = {}): Meeting =>
      ({ id, title, description: '', start: '2026-10-20T07:00:00.000Z', end: '2026-10-20T08:00:00.000Z', attendees: [], updatedAt, syncState: 'synced', ...extra } as unknown as Meeting);
    const W = ['2026-10-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'] as const;
    const existing = [
      mk('gcal_keep', 'Old', '2026-10-01T00:00:00Z', { googleEventId: 'keep' }),
      mk('gcal_edited', 'My title', '2026-10-10T00:00:00Z', { googleEventId: 'edited' }),
      mk('gcal_gone', 'Gone in Google', '2026-10-01T00:00:00Z', { googleEventId: 'gone' }),
      mk('own_new', 'Created here', '2026-10-02T00:00:00Z'),
      mk('own_synced', 'Mirrored', '2026-10-02T00:00:00Z', { googleEventId: 'mirrored' }),
    ];
    const remote = [
      mk('gcal_keep', 'New title', '2026-10-05T00:00:00Z', { googleEventId: 'keep' }),
      mk('gcal_edited', 'Google title', '2026-10-05T00:00:00Z', { googleEventId: 'edited' }),
      mk('gcal_fresh', 'Fresh', '2026-10-05T00:00:00Z', { googleEventId: 'fresh' }),
      mk('gcal_mirrored', 'Mirrored', '2026-10-02T00:00:00Z', { googleEventId: 'mirrored' }),
      mk('gcal_deleted_here', 'Deleted here', '2026-10-02T00:00:00Z', { googleEventId: 'deleted_here' }),
    ];
    const plan = planSync(existing, remote, W[0], W[1], ['keep', 'edited', 'gone', 'mirrored', 'deleted_here']);
    expect(plan.upsert.map((m) => m.id).sort()).toEqual(['gcal_fresh', 'gcal_keep']);
    expect(plan.push.map((m) => m.id).sort()).toEqual(['gcal_edited', 'own_new']);
    expect(plan.removeLocal.map((m) => m.id)).toEqual(['gcal_gone']);
    expect(plan.deleteRemote).toEqual(['deleted_here']);
  });
});
