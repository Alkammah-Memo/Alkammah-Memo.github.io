import { describe, expect, it } from 'vitest';
import { rankTopPriorities, selectFollowUps, hasDuplicateName, newId } from '../src/lib/taskLogic';
import { getCairoDateString, addDaysToDateString, isValidDateString, cairoLocalToIso } from '../src/lib/cairoTime';
import type { Task } from '../src/types';

const today = getCairoDateString();
const task = (o: Partial<Task>): Task =>
  ({ id: 'x', title: 't', status: 'Pending', priority: 'Normal', isArchived: false, ...o }) as Task;

describe('rankTopPriorities', () => {
  it('puts overdue first, then priority, then due date; ignores done/archived', () => {
    const list = [
      task({ id: 'a', priority: 'Urgent', dueDate: addDaysToDateString(today, 30) }),
      task({ id: 'b', priority: 'Low', dueDate: addDaysToDateString(today, -2) }),
      task({ id: 'c', priority: 'High', dueDate: addDaysToDateString(today, 1) }),
      task({ id: 'd', priority: 'Urgent', status: 'Done' }),
      task({ id: 'e', priority: 'Urgent', isArchived: true }),
      task({ id: 'f', priority: 'Urgent', dueDate: addDaysToDateString(today, 2) }),
    ];
    expect(rankTopPriorities(list, 4).map((t) => t.id)).toEqual(['b', 'f', 'a', 'c']);
  });
  it('is stable for equal tasks', () => {
    const list = [task({ id: 'b' }), task({ id: 'a' })];
    expect(rankTopPriorities(list).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('selectFollowUps', () => {
  it('only returns waiting, due follow-ups and overdue tasks', () => {
    const list = [
      task({ id: 'w', status: 'Waiting' }),
      task({ id: 'f', followUpDate: today }),
      task({ id: 'future', followUpDate: addDaysToDateString(today, 3) }),
      task({ id: 'o', dueDate: addDaysToDateString(today, -1) }),
      task({ id: 'plain' }),
      task({ id: 'done', status: 'Done', followUpDate: today }),
    ];
    expect(selectFollowUps(list, today).map((t) => t.id).sort()).toEqual(['f', 'o', 'w']);
  });
});

describe('helpers', () => {
  it('detects duplicate department names case-insensitively', () => {
    expect(hasDuplicateName(['Legal', 'Finance'], '  legal ')).toBe(true);
    expect(hasDuplicateName(['Legal'], 'Logistics')).toBe(false);
  });
  it('generates unique ids even in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('task')));
    expect(ids.size).toBe(1000);
    expect([...ids][0].startsWith('task-')).toBe(true);
  });
  it('validates calendar dates', () => {
    expect(isValidDateString('2026-02-31')).toBe(false);
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(() => cairoLocalToIso('2026-02-31', '10:00')).toThrow();
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
  });
});
