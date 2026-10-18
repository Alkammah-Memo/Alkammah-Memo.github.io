/**
 * Cairo Timezone (Africa/Cairo) and Date Helpers
 * Sunday is the start of the executive work week.
 */

export const CAIRO_TIMEZONE = 'Africa/Cairo';

/**
 * Returns formatted Cairo date string YYYY-MM-DD
 */
export function getCairoDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Current Cairo UTC offset label, e.g. "UTC+3" during Egyptian summer time and "UTC+2" otherwise.
 */
export function getCairoUtcOffsetLabel(date: Date = new Date()): string {
  const offsetMin = Math.round((cairoWallClockMs(date.getTime()) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const hours = offsetMin / 60;
  return `UTC${hours >= 0 ? '+' : '-'}${Math.abs(hours)}`;
}

/**
 * Returns formatted Cairo time string HH:mm
 */
export function getCairoTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(date);
}

/** True when the string is a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidDateString(value: string | undefined | null): boolean {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Cairo calendar date (YYYY-MM-DD) of an ISO instant; '' when the value is not a valid date. */
export function cairoDateOf(iso: string | undefined | null): string {
  const d = new Date(String(iso ?? ''));
  return isNaN(d.getTime()) ? '' : getCairoDateString(d);
}

/** Cairo wall-clock time (HH:mm) of an ISO instant; '' when the value is not a valid date. */
export function cairoTimeOf(iso: string | undefined | null): string {
  const d = new Date(String(iso ?? ''));
  return isNaN(d.getTime()) ? '' : getCairoTimeString(d);
}

/** Adds calendar days to a YYYY-MM-DD string (pure date arithmetic, no time zone involved). */
export function addDaysToDateString(dateStr: string, days: number): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Cairo wall-clock time of an instant, expressed as a UTC-based millisecond value.
 */
function cairoWallClockMs(instantMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Parses "18:00", "6:00 PM", "6pm", "٦:٠٠ م" style strings into 24h "HH:mm".
 * Returns null when the text cannot be understood.
 */
export function parseTimeTo24h(input: string | undefined | null): string | null {
  if (!input) return null;
  const normalized = String(input)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
    .toLowerCase();
  const match = normalized.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (minute > 59 || hour > 24) return null;
  if (meridiem) {
    const isPm = meridiem.startsWith('p') || meridiem === 'م';
    if (hour > 12) return null;
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  }
  if (hour === 24) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Converts a Cairo wall-clock date + time ("2026-10-16", "18:00") to a UTC ISO string.
 * DST-aware because it resolves the offset from the Africa/Cairo time zone database.
 */
export function cairoLocalToIso(dateStr: string, timeStr: string): string {
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const time = parseTimeTo24h(timeStr);
  if (!dateMatch || !time || !isValidDateString(dateMatch[0])) throw new RangeError(`Invalid Cairo date/time: ${dateStr} ${timeStr}`);
  const [h, m] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), h, m, 0);
  let instant = wallAsUtc - (cairoWallClockMs(wallAsUtc) - wallAsUtc);
  instant = wallAsUtc - (cairoWallClockMs(instant) - instant); // re-check across DST boundaries
  return new Date(instant).toISOString();
}

/**
 * Normalizes whatever a model/user supplies into a UTC ISO string.
 * - Strings with an explicit zone ("Z" or "+02:00") are honored as-is.
 * - Zone-less strings ("2026-10-16T18:00:00") are interpreted as Cairo time.
 */
export function normalizeToIso(value: unknown, fallback: Date = new Date()): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback.toISOString();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
  }
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/);
  if (m) {
    try {
      return cairoLocalToIso(m[1], m[2]);
    } catch {
      return fallback.toISOString();
    }
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
}

/**
 * Formats a date for display in Cairo locale (English or Arabic)
 */
export function formatCairoDateDisplay(
  dateInput: string | Date | undefined,
  locale: 'en' | 'ar' = 'en',
  includeTime: boolean = false
): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return String(dateInput);

  const options: Intl.DateTimeFormatOptions = {
    timeZone: CAIRO_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', options).format(date);
}

/**
 * Returns full formatted Cairo date and time for page header
 * e.g. "Tuesday, October 14, 2026 at 10:15 AM (Cairo Time)"
 */
export function formatCairoHeaderDateTime(
  dateInput: string | Date = new Date(),
  locale: 'en' | 'ar' = 'en'
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const validDate = isNaN(date.getTime()) ? new Date() : date;
  const options: Intl.DateTimeFormatOptions = {
    timeZone: CAIRO_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  const formatted = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', options).format(validDate);
  return locale === 'ar' ? `${formatted} (توقيت القاهرة)` : `${formatted} (Cairo Time)`;
}

/**
 * Checks whether a task with a given due date is overdue in Cairo time
 * Note: Done and Closed tasks are never marked overdue.
 */
export function isTaskOverdue(
  dueDate: string | undefined,
  dueTime: string | undefined,
  status: string
): boolean {
  if (!dueDate) return false;
  if (status === 'Done' || status === 'Closed') return false;

  const todayCairo = getCairoDateString();
  dueDate = dueDate.slice(0, 10); // tolerate full ISO strings
  if (dueDate < todayCairo) return true;

  if (dueDate === todayCairo && dueTime) {
    const currentCairoTime = getCairoTimeString();
    return currentCairoTime > dueTime;
  }

  return false;
}

/**
 * Adds Cairo working days (excluding Friday & Saturday)
 */
export function addCairoWorkingDays(startDateStr: string, workingDays: number): string {
  const parts = startDateStr.split('-');
  let current = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  let added = 0;

  while (added < workingDays) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay(); // 0: Sun, 1: Mon, ..., 5: Fri, 6: Sat
    // In Egypt, working days are Sunday(0) through Thursday(4)
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
      added++;
    }
  }

  const y = current.getFullYear();
  const m = String(current.getMonth() + 1).padStart(2, '0');
  const d = String(current.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Detects conflicts between a proposed start/end time and existing meetings
 */
export function checkMeetingConflicts(
  newMeeting: { id?: string; start: string; end: string },
  existingMeetings: Array<{ id: string; title: string; start: string; end: string }>
): Array<{ id: string; title: string; start: string; end: string }> {
  const newStart = new Date(newMeeting.start).getTime();
  const newEnd = new Date(newMeeting.end).getTime();

  return existingMeetings.filter((m) => {
    if (newMeeting.id && m.id === newMeeting.id) return false;
    const mStart = new Date(m.start).getTime();
    const mEnd = new Date(m.end).getTime();
    // Overlap condition: start < otherEnd && end > otherStart
    return newStart < mEnd && newEnd > mStart;
  });
}
