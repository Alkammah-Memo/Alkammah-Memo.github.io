import { cairoLocalToIso } from './cairoTime';
import type { Meeting } from '../types';

/**
 * Meetings saved by the old meeting form stored the Cairo wall-clock time labelled as UTC,
 * in the exact shape "YYYY-MM-DDTHH:mm:00Z" (no milliseconds). Every real UTC value produced by
 * the app (Date#toISOString, cairoLocalToIso, normalizeToIso) carries ".000Z", so the shape is a
 * safe marker: converted meetings no longer match it, which makes the migration idempotent.
 *
 * Limitation: a legacy meeting whose start/end came from outside the app in exactly that shape
 * (for example an imported file) is indistinguishable and will be treated as Cairo wall time.
 */
const LEGACY_SHAPE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):00Z$/;

export function isLegacyWallClockMeeting(m: Pick<Meeting, 'start' | 'end'>): boolean {
  return LEGACY_SHAPE.test(String(m.start)) && LEGACY_SHAPE.test(String(m.end));
}

export function convertLegacyMeeting(m: Meeting, nowIso: string = new Date().toISOString()): Meeting | null {
  if (!isLegacyWallClockMeeting(m)) return null;
  const s = String(m.start).match(LEGACY_SHAPE)!;
  const e = String(m.end).match(LEGACY_SHAPE)!;
  try {
    return {
      ...m,
      start: cairoLocalToIso(s[1], s[2]),
      end: cairoLocalToIso(e[1], e[2]),
      updatedAt: nowIso,
    };
  } catch {
    return null;
  }
}
