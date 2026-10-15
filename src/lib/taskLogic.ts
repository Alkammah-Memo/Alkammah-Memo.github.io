import type { Task } from '../types';
import { isTaskOverdue } from './cairoTime';

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

export const isActiveTask = (t: Task): boolean => !t.isArchived && t.status !== 'Done' && t.status !== 'Closed';

/** Top suggested priorities: overdue first, then priority, then earliest due date/time. Stable and deterministic. */
export function rankTopPriorities(tasks: Task[], limit = 3): Task[] {
  return tasks
    .filter(isActiveTask)
    .map((t) => ({ t, overdue: isTaskOverdue(t.dueDate, t.dueTime, t.status) }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const pr = (PRIORITY_RANK[a.t.priority] ?? 2) - (PRIORITY_RANK[b.t.priority] ?? 2);
      if (pr !== 0) return pr;
      const ad = a.t.dueDate ? `${a.t.dueDate}T${a.t.dueTime || '99:99'}` : '9999';
      const bd = b.t.dueDate ? `${b.t.dueDate}T${b.t.dueTime || '99:99'}` : '9999';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0;
    })
    .slice(0, limit)
    .map((x) => x.t);
}

/** Tasks that need a check-in: waiting, follow-up date reached, or overdue. Soonest first. */
export function selectFollowUps(tasks: Task[], todayCairo: string): Task[] {
  const key = (t: Task) => t.followUpDate || t.dueDate || '9999-12-31';
  return tasks
    .filter(isActiveTask)
    .filter(
      (t) =>
        t.status === 'Waiting' ||
        (!!t.followUpDate && t.followUpDate <= todayCairo) ||
        isTaskOverdue(t.dueDate, t.dueTime, t.status)
    )
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

/** Case-insensitive, trimmed duplicate check used for departments. */
export function hasDuplicateName(list: string[], name: string): boolean {
  const n = name.trim().toLowerCase();
  return list.some((x) => x.trim().toLowerCase() === n);
}

export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}
