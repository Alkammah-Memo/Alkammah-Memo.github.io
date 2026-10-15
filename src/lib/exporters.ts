import type { Task, Meeting } from '../types';

/** Escapes text for safe interpolation into HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One quoted CSV cell. Leading = + - @ (and tab/CR) are neutralised against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildTasksCsv(tasks: Task[]): string {
  const headers = [
    'ID', 'Title', 'Description', 'Workstream', 'Department', 'Project', 'Location', 'Owner', 'Status', 'Priority',
    'Due Date', 'Due Time', 'Follow-up Date', 'Next Action', 'Counterpart', 'Blocker', 'Archived',
  ];
  const rows = tasks.map((t) =>
    [
      t.id, t.title, t.description, t.workstream, t.department, t.project, t.location, t.ownerAlias, t.status, t.priority,
      t.dueDate, t.dueTime, t.followUpDate, t.nextAction, t.counterpart, t.blocker, t.isArchived ? 'Yes' : 'No',
    ]
      .map(csvCell)
      .join(',')
  );
  // UTF-8 BOM so Excel reads Arabic text correctly
  return '﻿' + [headers.map(csvCell).join(','), ...rows].join('\r\n');
}

/** RFC 5545 TEXT escaping. */
export function icsEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line to 75 octets-ish (75 characters) per RFC 5545. */
export function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
  return parts.join('\r\n');
}

function icsDate(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

export function buildIcs(meetings: Meeting[], now: Date = new Date()): string {
  const stamp = icsDate(now.toISOString())!;
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alkammah Memo//Cairo Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const m of meetings) {
    const s = icsDate(m.start);
    const e = icsDate(m.end);
    if (!s || !e) continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${String(m.id).replace(/[^A-Za-z0-9._-]/g, '')}@alkammah-memo`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${s}`);
    lines.push(`DTEND:${e}`);
    lines.push(`SUMMARY:${icsEscape(m.title)}`);
    const desc = m.agenda || m.description || '';
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    if (m.location) lines.push(`LOCATION:${icsEscape(m.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n');
}
