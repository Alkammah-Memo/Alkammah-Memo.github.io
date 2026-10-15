import { describe, expect, it } from 'vitest';
import { buildIcs, csvCell, escapeHtml, icsEscape, icsFold, buildTasksCsv } from '../src/lib/exporters';
import type { Meeting, Task } from '../src/types';

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml('<img src=x onerror="a()">&')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;');
  });
});

describe('csvCell', () => {
  it('quotes and doubles quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  it('neutralises formula injection', () => {
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('@x')).toBe('"\'@x"');
    expect(csvCell(undefined)).toBe('""');
  });
  it('buildTasksCsv starts with a BOM', () => {
    expect(buildTasksCsv([]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe('ics', () => {
  it('escapes text per RFC 5545', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
  });
  it('folds long lines at 75 chars', () => {
    const folded = icsFold('X'.repeat(200)).split('\r\n');
    expect(folded[0].length).toBe(75);
    expect(folded[1].startsWith(' ')).toBe(true);
  });
  it('builds events with DTSTAMP and real UTC times', () => {
    const m = {
      id: 'meet-1', title: 'Board; review', description: '', start: '2026-10-16T13:00:00.000Z', end: '2026-10-16T14:00:00.000Z',
      agenda: 'line1\nline2', location: 'Room, 2',
    } as Meeting;
    const ics = buildIcs([m], new Date('2026-10-15T08:00:00Z'));
    expect(ics).toContain('DTSTAMP:20261015T080000Z');
    expect(ics).toContain('DTSTART:20261016T130000Z');
    expect(ics).toContain('SUMMARY:Board\; review');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
    expect(ics).toContain('LOCATION:Room\\, 2');
  });
  it('skips meetings with invalid dates', () => {
    const ics = buildIcs([{ id: 'x', title: 't', start: 'bad', end: 'bad' } as Meeting]);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});

describe('task csv columns', () => {
  it('keeps due time and archived flag', () => {
    const t = { id: 'a', title: 'T', dueDate: '2026-10-16', dueTime: '09:30', isArchived: true } as Task;
    expect(buildTasksCsv([t])).toContain('"09:30"');
    expect(buildTasksCsv([t])).toContain('"Yes"');
  });
});
