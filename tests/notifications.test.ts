import { describe, it, expect } from 'vitest';
import { buildNotifications, DEFAULT_PREFS } from '../src/lib/notifications';
import type { Meeting, Task } from '../src/types';

const meeting = (id: string, startMs: number, lenMin = 60): Meeting =>
  ({ id, title: `M ${id}`, start: new Date(startMs).toISOString(), end: new Date(startMs + lenMin * 60_000).toISOString() } as Meeting);
const task = (id: string, extra: Partial<Task>): Task => ({ id, title: `T ${id}`, status: 'Pending', isArchived: false, ...extra } as Task);

// 2026-10-17 10:00 Cairo (UTC+3) = 07:00 UTC
const NOW = Date.UTC(2026, 9, 17, 7, 0, 0);

describe('buildNotifications', () => {
  it('alerts for a meeting starting within 15 minutes, not later ones', () => {
    const list = buildNotifications([meeting('a', NOW + 10 * 60_000), meeting('b', NOW + 40 * 60_000)], [], { ...DEFAULT_PREFS, dueSoon: false }, NOW);
    expect(list.map((n) => n.refId)).toEqual(['a']);
    expect(list[0].minutes).toBe(10);
  });

  it('keeps a meeting in progress and drops a finished one', () => {
    const list = buildNotifications([meeting('on', NOW - 10 * 60_000), meeting('done', NOW - 120 * 60_000)], [], DEFAULT_PREFS, NOW);
    expect(list.map((n) => n.refId)).toEqual(['on']);
    expect(list[0].minutes).toBeLessThanOrEqual(0);
  });

  it('flags overdue tasks and due follow-ups but not done or archived ones', () => {
    const tasks = [
      task('late', { dueDate: '2026-10-15' }),
      task('today-passed', { dueDate: '2026-10-17', dueTime: '09:00' }),
      task('today-later', { dueDate: '2026-10-17', dueTime: '18:00' }),
      task('done', { dueDate: '2026-10-01', status: 'Done' }),
      task('arch', { dueDate: '2026-10-01', isArchived: true }),
      task('fu', { followUpDate: '2026-10-16' }),
      task('fu-future', { followUpDate: '2026-10-20' }),
    ];
    const list = buildNotifications([], tasks, DEFAULT_PREFS, NOW);
    expect(list.filter((n) => n.kind === 'overdue').map((n) => n.refId).sort()).toEqual(['late', 'today-passed']);
    expect(list.filter((n) => n.kind === 'followup').map((n) => n.refId)).toEqual(['fu']);
  });

  it('respects switches and lead time', () => {
    const prefs = { ...DEFAULT_PREFS, leadMinutes: 30, overdue: false };
    const list = buildNotifications([meeting('b', NOW + 25 * 60_000)], [task('late', { dueDate: '2026-10-15' })], prefs, NOW);
    expect(list.map((n) => n.kind)).toEqual(['meeting']);
  });

  it('lists the rest of today\'s meetings, tasks due today and tomorrow, and re-alerts overdue ones each day', () => {
    const tasks = [
      task('t0', { dueDate: '2026-10-17', dueTime: '18:00' }),
      task('t1', { dueDate: '2026-10-18T00:00:00.000Z' }),
      task('late', { dueDate: '2026-10-10' }),
    ];
    const list = buildNotifications([meeting('later', NOW + 5 * 3600_000)], tasks, DEFAULT_PREFS, NOW);
    expect(list.filter((n) => n.kind === 'today').map((n) => n.refId)).toEqual(['t0']);
    expect(list.filter((n) => n.kind === 'soon').map((n) => n.refId)).toEqual(['t1']);
    expect(list.filter((n) => n.kind === 'meeting').map((n) => n.refId)).toEqual(['later']);
    const nextDay = buildNotifications([], tasks, DEFAULT_PREFS, NOW + 24 * 3600_000);
    const id = (l: typeof list) => l.find((n) => n.kind === 'overdue' && n.refId === 'late')?.id;
    expect(id(list)).toBeTruthy();
    expect(id(nextDay)).not.toBe(id(list));
  });
});
