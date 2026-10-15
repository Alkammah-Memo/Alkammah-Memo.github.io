import { describe, expect, it } from 'vitest';
import { parseTimeTo24h, cairoLocalToIso, normalizeToIso } from '../src/lib/cairoTime';

describe('parseTimeTo24h', () => {
  it('handles 12-hour clock text written by hand', () => {
    expect(parseTimeTo24h('6:00 PM')).toBe('18:00');
    expect(parseTimeTo24h('6pm')).toBe('18:00');
    expect(parseTimeTo24h('12:00 AM')).toBe('00:00');
    expect(parseTimeTo24h('12:30 PM')).toBe('12:30');
    expect(parseTimeTo24h('9.15 am')).toBe('09:15');
  });
  it('handles 24-hour clock and Arabic numerals', () => {
    expect(parseTimeTo24h('18:00')).toBe('18:00');
    expect(parseTimeTo24h('٦:٣٠ م')).toBe('18:30');
  });
  it('rejects nonsense', () => {
    expect(parseTimeTo24h('soon')).toBeNull();
    expect(parseTimeTo24h('25:99')).toBeNull();
    expect(parseTimeTo24h(undefined)).toBeNull();
  });
});

describe('cairoLocalToIso', () => {
  it('uses summer time (UTC+3) in October 2026 before the DST switch', () => {
    expect(cairoLocalToIso('2026-10-16', '18:00')).toBe('2026-10-16T15:00:00.000Z');
  });
  it('uses winter time (UTC+2) in January', () => {
    expect(cairoLocalToIso('2026-01-15', '18:00')).toBe('2026-01-15T16:00:00.000Z');
  });
  it('rejects invalid input', () => {
    expect(() => cairoLocalToIso('tomorrow', '18:00')).toThrow();
  });
});

describe('normalizeToIso', () => {
  it('treats zone-less timestamps as Cairo time', () => {
    expect(normalizeToIso('2026-10-16T18:00:00')).toBe('2026-10-16T15:00:00.000Z');
  });
  it('honors explicit offsets and Z', () => {
    expect(normalizeToIso('2026-10-16T18:00:00Z')).toBe('2026-10-16T18:00:00.000Z');
    expect(normalizeToIso('2026-10-16T18:00:00+02:00')).toBe('2026-10-16T16:00:00.000Z');
  });
  it('falls back safely', () => {
    const fb = new Date('2026-01-01T00:00:00Z');
    expect(normalizeToIso('', fb)).toBe(fb.toISOString());
    expect(normalizeToIso('garbage', fb)).toBe(fb.toISOString());
  });
});

import { getCairoUtcOffsetLabel } from '../src/lib/cairoTime';
describe('getCairoUtcOffsetLabel', () => {
  it('follows Egyptian daylight saving time', () => {
    expect(getCairoUtcOffsetLabel(new Date('2026-10-15T09:00:00Z'))).toBe('UTC+3');
    expect(getCairoUtcOffsetLabel(new Date('2026-01-15T09:00:00Z'))).toBe('UTC+2');
  });
});
