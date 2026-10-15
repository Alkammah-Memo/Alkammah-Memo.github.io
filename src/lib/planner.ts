/**
 * Planner date helpers. All dates are plain calendar strings in Cairo terms:
 * 'YYYY-MM-DD' (daily pages) and 'YYYY-MM' (monthly pages). Pure date arithmetic, no time zone involved,
 * except cairoToday() which resolves "today" through cairoTime.ts. Weeks start on Sunday; the weekend is Friday + Saturday.
 */
import { addDaysToDateString, getCairoDateString, isValidDateString } from './cairoTime';
import type { NotebookPage } from '../types';

export const PLANNER_CANVAS = { width: 1450, height: 1007 } as const;

export type PlannerLocale = 'en' | 'ar';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function cairoToday(now: Date = new Date()): string {
  return getCairoDateString(now);
}

export function isPlannerDay(value: string | undefined | null): value is string {
  return isValidDateString(value);
}

export function isPlannerMonth(value: string | undefined | null): value is string {
  const m = String(value ?? '').match(MONTH_RE);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Cairo plannerDate (YYYY-MM-DD) of an instant */
export function plannerDateOf(date: Date): string {
  return getCairoDateString(date);
}

const utcMs = (dateStr: string): number => {
  const m = dateStr.match(DAY_RE);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(dateStr: string): number {
  const ms = utcMs(dateStr);
  return isNaN(ms) ? 0 : new Date(ms).getUTCDay();
}

/** Egyptian weekend: Friday and Saturday */
export function isWeekend(dateStr: string): boolean {
  const d = dayOfWeek(dateStr);
  return d === 5 || d === 6;
}

export function addDays(dateStr: string, days: number): string {
  return addDaysToDateString(dateStr, days);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / 86400000);
}

export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -dayOfWeek(dateStr));
}

/**
 * Week number as printed in the planner: week 1 is the week (Sunday start) that contains January 1.
 * Check: 2026-02-01 (Sun) -> 6, 2026-02-09 -> 7, 2026-02-22 -> 9.
 */
export function weekNumber(dateStr: string): number {
  const year = dateStr.slice(0, 4);
  const firstWeekStart = startOfWeek(`${year}-01-01`);
  return Math.floor(daysBetween(firstWeekStart, startOfWeek(dateStr)) / 7) + 1;
}

export function addMonths(ym: string, delta: number): string {
  const m = ym.match(MONTH_RE);
  if (!m) return ym;
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`;
}

export function daysInMonth(ym: string): number {
  const m = ym.match(MONTH_RE);
  if (!m) return 30;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
}

const EN_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function monthName(monthIndex0: number, locale: PlannerLocale = 'en'): string {
  return (locale === 'ar' ? AR_MONTHS : EN_MONTHS)[monthIndex0] ?? '';
}

export function weekdayName(dayIndex: number, locale: PlannerLocale = 'en'): string {
  return (locale === 'ar' ? AR_DAYS : EN_DAYS)[dayIndex] ?? '';
}

/** 'FEBRUARY 22' */
export function dayTitle(dateStr: string, locale: PlannerLocale = 'en'): string {
  const m = dateStr.match(DAY_RE);
  if (!m) return dateStr;
  const month = monthName(Number(m[2]) - 1, locale);
  return locale === 'ar' ? `${Number(m[3])} ${month}` : `${month} ${Number(m[3])}`;
}

/** 'Sunday • Week 9' */
export function daySubtitle(dateStr: string, locale: PlannerLocale = 'en'): string {
  const wk = weekNumber(dateStr);
  return `${weekdayName(dayOfWeek(dateStr), locale)} • ${locale === 'ar' ? 'الأسبوع' : 'Week'} ${wk}`;
}

/** 'FEBRUARY 2026' */
export function monthTitle(ym: string, locale: PlannerLocale = 'en'): string {
  const m = ym.match(MONTH_RE);
  if (!m) return ym;
  return `${monthName(Number(m[2]) - 1, locale)} ${m[1]}`;
}

export interface MonthCell {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
}
export interface MonthWeek {
  weekNumber: number;
  cells: MonthCell[]; // 7 cells, Sunday first
}

/** Sunday-first month grid (only the weeks that touch the month; cells outside the month flagged) */
export function monthGrid(ym: string): MonthWeek[] {
  const first = `${ym}-01`;
  if (!isValidDateString(first)) return [];
  const last = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
  const weeks: MonthWeek[] = [];
  let cursor = startOfWeek(first);
  while (daysBetween(cursor, last) >= 0) {
    const cells: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i);
      cells.push({ date, day: Number(date.slice(8, 10)), inMonth: monthOf(date) === ym });
    }
    weeks.push({ weekNumber: weekNumber(cursor), cells });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** Finds the page for a date: a daily page by 'YYYY-MM-DD', a monthly page by 'YYYY-MM' (monthly template only). */
export function findPageForDate<T extends Pick<NotebookPage, 'plannerDate' | 'template'>>(
  pages: T[],
  plannerDate: string,
  kind: 'day' | 'month' = plannerDate.length > 7 ? 'day' : 'month'
): T | undefined {
  const wanted = kind === 'month' ? 'planner_monthly' : 'planner_daily';
  // Daily/monthly pages and imported archive pages (which carry the same plannerDate) all count as "the page for that date"
  return pages.find((p) => p.plannerDate === plannerDate && (p.template === wanted || p.template === 'planner_archive'));
}

/** What the notebook header asks the app to open or create (see App.handleOpenPlannerPage) */
export type PlannerPageRequest =
  | { kind: 'daily'; date: string }
  | { kind: 'monthly'; month: string }
  | { kind: 'todo'; title: string }
  | { kind: 'mom'; date: string };

/** Title and paper defaults for a new planner page */
export function plannerPageDefaults(req: PlannerPageRequest): {
  title: string;
  template: 'planner_daily' | 'planner_monthly' | 'planner_todo' | 'planner_mom';
  plannerDate: string;
  paperColor: 'white' | 'cream';
} {
  switch (req.kind) {
    case 'daily':
      return { title: dayTitle(req.date, 'en'), template: 'planner_daily', plannerDate: req.date, paperColor: 'white' };
    case 'monthly':
      return { title: monthTitle(req.month, 'en'), template: 'planner_monthly', plannerDate: req.month, paperColor: 'white' };
    case 'todo':
      return { title: req.title.trim(), template: 'planner_todo', plannerDate: '', paperColor: 'cream' };
    case 'mom':
      return { title: `MoM ${dayTitle(req.date, 'en')} ${req.date.slice(0, 4)}`, template: 'planner_mom', plannerDate: req.date, paperColor: 'cream' };
  }
}
