import { describe, expect, it } from 'vitest';
import { parseBackup } from '../src/lib/backup';
import { convertLegacyMeeting, isLegacyWallClockMeeting } from '../src/lib/legacyMeetings';
import type { Meeting } from '../src/types';

const wrap = (data: unknown) => JSON.stringify({ version: '1.1.0', data });

describe('parseBackup', () => {
  it('accepts a valid file', () => {
    const r = parseBackup(wrap({ tasks: [{ id: 't1' }], meetings: [], departments: ['Legal'] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.departments).toEqual(['Legal']);
  });
  it('rejects malformed JSON and wrong shapes', () => {
    expect(parseBackup('{nope')).toMatchObject({ ok: false, code: 'invalid_json' });
    expect(parseBackup('[]')).toMatchObject({ ok: false, code: 'invalid_format' });
    expect(parseBackup(JSON.stringify({ tasks: [] }))).toMatchObject({ ok: false, code: 'invalid_format' });
    expect(parseBackup(wrap({}))).toMatchObject({ ok: false, code: 'empty' });
  });
  it('rejects the whole file when any record lacks a string id', () => {
    expect(parseBackup(wrap({ tasks: [{ id: 't1' }], meetings: [{ title: 'no id' }] }))).toMatchObject({
      ok: false, code: 'invalid_records', detail: 'meetings',
    });
    expect(parseBackup(wrap({ tasks: {} }))).toMatchObject({ ok: false, code: 'invalid_records' });
    expect(parseBackup(wrap({ tasks: [{ id: 5 }] }))).toMatchObject({ ok: false, code: 'invalid_records' });
    expect(parseBackup(wrap({ tasks: [null] }))).toMatchObject({ ok: false, code: 'invalid_records' });
  });
});

describe('legacy meeting migration', () => {
  const legacy = { id: 'm', start: '2026-10-16T10:00:00Z', end: '2026-10-16T11:00:00Z', updatedAt: 'x' } as Meeting;
  it('re-interprets wall-clock-as-UTC as Cairo time (UTC+3 in October 2026)', () => {
    const fixed = convertLegacyMeeting(legacy, '2026-10-15T00:00:00.000Z')!;
    expect(fixed.start).toBe('2026-10-16T07:00:00.000Z');
    expect(fixed.end).toBe('2026-10-16T08:00:00.000Z');
    expect(fixed.updatedAt).toBe('2026-10-15T00:00:00.000Z');
  });
  it('is idempotent and leaves real UTC meetings alone', () => {
    const fixed = convertLegacyMeeting(legacy)!;
    expect(isLegacyWallClockMeeting(fixed)).toBe(false);
    expect(convertLegacyMeeting(fixed)).toBeNull();
    expect(convertLegacyMeeting({ ...legacy, start: '2026-10-16T07:00:00.000Z', end: '2026-10-16T08:00:00.000Z' })).toBeNull();
  });
});
