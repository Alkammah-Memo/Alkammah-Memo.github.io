import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  cairoToday,
  dayOfWeek,
  dayTitle,
  daySubtitle,
  findPageForDate,
  isWeekend,
  monthGrid,
  monthOf,
  monthTitle,
  weekNumber,
  startOfWeek,
} from '../src/lib/planner';

describe('planner helpers', () => {
  it('week numbers match the printed planner (Sunday start, week 1 contains Jan 1)', () => {
    expect(weekNumber('2026-01-01')).toBe(1);
    expect(weekNumber('2026-01-03')).toBe(1);
    expect(weekNumber('2026-01-04')).toBe(2);
    expect(weekNumber('2026-02-01')).toBe(6);
    expect(weekNumber('2026-02-09')).toBe(7);
    expect(weekNumber('2026-02-22')).toBe(9);
    expect(weekNumber('2026-02-28')).toBe(9);
  });

  it('knows weekdays and the Egyptian weekend', () => {
    expect(dayOfWeek('2026-02-22')).toBe(0);
    expect(isWeekend('2026-02-20')).toBe(true); // Friday
    expect(isWeekend('2026-02-21')).toBe(true); // Saturday
    expect(isWeekend('2026-02-22')).toBe(false); // Sunday
    expect(startOfWeek('2026-02-25')).toBe('2026-02-22');
  });

  it('steps days and months across boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', 12)).toBe('2027-03');
    expect(monthOf('2026-02-22')).toBe('2026-02');
  });

  it('formats titles', () => {
    expect(dayTitle('2026-02-22')).toBe('FEBRUARY 22');
    expect(daySubtitle('2026-02-22')).toBe('Sunday • Week 9');
    expect(monthTitle('2026-02')).toBe('FEBRUARY 2026');
    expect(monthTitle('2026-02', 'ar')).toBe('فبراير 2026');
  });

  it('builds a Sunday-first month grid', () => {
    const g = monthGrid('2026-02');
    expect(g).toHaveLength(4);
    expect(g[0].weekNumber).toBe(6);
    expect(g[0].cells[0]).toEqual({ date: '2026-02-01', day: 1, inMonth: true });
    const g2 = monthGrid('2026-04'); // 1 April 2026 is a Wednesday
    expect(g2[0].cells[0]).toEqual({ date: '2026-03-29', day: 29, inMonth: false });
    expect(g2[0].cells[3].inMonth).toBe(true);
    expect(g2.every((w) => w.cells.length === 7)).toBe(true);
    expect(g2[g2.length - 1].cells.some((c) => c.date === '2026-04-30')).toBe(true);
  });

  it('cairoToday follows Cairo time, not UTC', () => {
    // 22:30 UTC on 30 Jun is already 1 Jul in Cairo (UTC+3 in summer)
    expect(cairoToday(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    expect(cairoToday(new Date('2026-01-10T21:30:00Z'))).toBe('2026-01-10');
  });

  it('finds the page for a date, counting archive pages', () => {
    const pages = [
      { plannerDate: '2026-02-22', template: 'planner_archive' as const, id: 'a' },
      { plannerDate: '2026-02-23', template: 'planner_daily' as const, id: 'b' },
      { plannerDate: '2026-02', template: 'planner_monthly' as const, id: 'c' },
      { plannerDate: '2026-02-24', template: 'planner_mom' as const, id: 'd' },
    ];
    expect(findPageForDate(pages, '2026-02-22')?.id).toBe('a');
    expect(findPageForDate(pages, '2026-02-23')?.id).toBe('b');
    expect(findPageForDate(pages, '2026-02')?.id).toBe('c');
    expect(findPageForDate(pages, '2026-02-24')).toBeUndefined();
    expect(findPageForDate(pages, '2026-03-01')).toBeUndefined();
  });
});
