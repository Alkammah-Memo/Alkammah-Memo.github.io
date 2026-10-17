import React, { useMemo, useRef, useState } from 'react';
import { Meeting, Task } from '../../types';
import { GOOGLE_ID_PREFIX } from '../../lib/googleCalendar';
import { Locale, translations } from '../../lib/translations';
import { formatCairoDateDisplay, getCairoDateString, cairoDateOf, cairoTimeOf } from '../../lib/cairoTime';
import { buildIcs } from '../../lib/exporters';
import { useCairoClock } from '../../lib/useCairoClock';
import { TimeGrid, WEEKEND_HATCH } from './TimeGrid';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertCircle,
  ExternalLink,
  Users,
  MapPin,
  CheckCircle2,
} from 'lucide-react';

interface CalendarCenterProps {
  meetings: Meeting[];
  tasks: Task[];
  locale: Locale;
  onOpenMeetingModal: (meeting: Meeting | null, initialDate?: string, initialStartTime?: string) => void;
  onOpenTaskModal: (task: Task) => void;
}

type CalendarViewMode = 'year' | 'month' | 'week' | 'day' | 'agenda';

type SourceFilter = 'all' | 'system' | 'google';
const SOURCE_KEY = 'alkammah_calendar_source_v1';
const readSource = (): SourceFilter => {
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    return v === 'system' || v === 'google' ? v : 'all';
  } catch {
    return 'all';
  }
};

export const CalendarCenter: React.FC<CalendarCenterProps> = ({
  meetings: allMeetings,
  tasks: allTasks,
  locale,
  onOpenMeetingModal,
  onOpenTaskModal,
}) => {
  const t = translations[locale];
  // where a meeting came from: events that arrived from Google (phone calendar etc.) vs. ones created in this system
  const [source, setSourceState] = useState<SourceFilter>(readSource);
  const setSource = (v: SourceFilter) => {
    setSourceState(v);
    try {
      localStorage.setItem(SOURCE_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const isFromGoogle = (m: Meeting) => m.id.startsWith(GOOGLE_ID_PREFIX);
  const googleCount = useMemo(() => allMeetings.filter(isFromGoogle).length, [allMeetings]);
  const meetings = useMemo(
    () => (source === 'all' ? allMeetings : allMeetings.filter((m) => (source === 'google') === isFromGoogle(m))),
    [allMeetings, source]
  );
  const tasks = source === 'google' ? [] : allTasks;
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const ar = locale === 'ar';
  const { today: todayCairo, time: nowCairoTime } = useCairoClock();
  const cairoTodayAsLocalDate = () => {
    const [y, m, d] = getCairoDateString().split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const [currentDate, setCurrentDate] = useState<Date>(cairoTodayAsLocalDate);
  const [showPast, setShowPast] = useState<boolean>(false);
  const intlLocale = ar ? 'ar-EG' : 'en-US';
  // Calendar cells are plain Y-M-D values: format them at UTC noon so no device time zone can shift the day
  const fmtYmd = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intlLocale, { ...opts, timeZone: 'UTC' }).format(
      new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12))
    );

  // Date navigation: one step is a day, week, month or year depending on the view; swiping the calendar does the same
  const [slide, setSlide] = useState<{ dir: 'next' | 'prev'; n: number }>({ dir: 'next', n: 0 });
  const shift = (dir: 1 | -1) => {
    const d = new Date(currentDate);
    if (viewMode === 'year') return goTo(new Date(d.getFullYear() + dir, d.getMonth(), 1), dir);
    if (viewMode === 'month') return goTo(new Date(d.getFullYear(), d.getMonth() + dir, 1), dir);
    if (viewMode === 'week') d.setDate(d.getDate() + 7 * dir);
    else if (viewMode === 'day') d.setDate(d.getDate() + dir);
    else return;
    goTo(d, dir);
  };
  const goTo = (d: Date, dir: 1 | -1) => {
    setCurrentDate(d);
    setSlide((s) => ({ dir: dir === 1 ? 'next' : 'prev', n: s.n + 1 }));
  };
  const prevDate = () => shift(-1);
  const nextDate = () => shift(1);
  const openDay = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    setCurrentDate(new Date(y, m - 1, d));
    setViewMode('day');
  };

  // Swipe (finger or mouse drag) left/right moves the calendar; vertical scrolling is left alone
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const justSwiped = useRef(false);
  const onSwipeDown = (e: React.PointerEvent) => {
    if (viewMode === 'agenda') return;
    swipe.current = { x: e.clientX, y: e.clientY, at: Date.now() };
  };
  const onSwipeUp = (e: React.PointerEvent) => {
    const st = swipe.current;
    swipe.current = null;
    if (!st) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - st.at > 900) return;
    justSwiped.current = true;
    setTimeout(() => (justSwiped.current = false), 350);
    shift(((dx < 0 ? 1 : -1) * (ar ? -1 : 1)) as 1 | -1);
  };

  // Meetings per day for the year overview
  const countsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const mt of meetings) {
      const k = cairoDateOf(mt.start);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [meetings]);

  // Generate calendar grid for current month (Sunday start)
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Week view dates (Sunday to Saturday)
  const currentDayOfWeek = currentDate.getDay();
  const weekStartDate = new Date(currentDate);
  weekStartDate.setDate(currentDate.getDate() - currentDayOfWeek);

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    return d;
  });

  // Hours for the day view: 08:00-20:00 by default, widened to include any meeting outside those hours
  const dayStr = formatYYYYMMDD(currentDate);
  const dayMeetingHours = meetings
    .filter((m) => cairoDateOf(m.start) === dayStr)
    .map((m) => Number((cairoTimeOf(m.start) || '08:00').slice(0, 2)));
  const firstHour = Math.min(8, ...dayMeetingHours);
  const lastHour = Math.max(20, ...dayMeetingHours);
  const hours = Array.from({ length: lastHour - firstHour + 1 }).map((_, i) => i + firstHour);
  const meetingsOn = (dateStr: string) =>
    meetings
      .filter((m) => cairoDateOf(m.start) === dateStr)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const weekdayNames = ar
    ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // Helper to format ISO YYYY-MM-DD
  function formatYYYYMMDD(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Export meetings to .ics format
  const exportToICS = () => {
    const blob = new Blob([buildIcs(meetings)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `executive-calendar-${getCairoDateString()}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const nowMs = Date.now();
  const agendaMeetings = meetings
    .filter((m) => showPast || new Date(m.end).getTime() >= nowMs)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return (
    <div className="space-y-3 sm:space-y-4 max-w-7xl mx-auto pb-4 sm:pb-16">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 bg-white p-3 sm:p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div className="max-sm:hidden">
          <div className="flex items-center gap-2 text-xs font-mono text-stone-500 uppercase mb-1">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span>{ar ? 'توقيت القاهرة · بداية الأسبوع الأحد' : 'CAIRO TIME · WEEK STARTS SUNDAY'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            {t.navCalendar}
          </h1>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setViewMode('year')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'year' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {ar ? 'سنوي' : 'Year'}
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'month' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {t.monthView}
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'week' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {locale === 'ar' ? 'أسبوعي' : 'Week'}
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'day' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {locale === 'ar' ? 'يومي' : 'Day'}
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === 'agenda' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {t.agendaView}
            </button>
          </div>

          <button
            onClick={() => setCurrentDate(cairoTodayAsLocalDate())}
            className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold"
          >
            {t.today}
          </button>

          <button
            onClick={exportToICS}
            className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium flex items-center gap-1"
            title={t.exportIcs}
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => onOpenMeetingModal(null, formatYYYYMMDD(currentDate))}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addMeeting}</span>
          </button>
        </div>
      </div>

      {/* Source filter: everything, only what was created in this system, or only what came from Google */}
      <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs self-start max-w-full overflow-x-auto" role="group" aria-label={ar ? 'مصدر المواعيد' : 'Meeting source'}>
        {([
          ['all', ar ? 'الكل' : 'All', allMeetings.length],
          ['system', ar ? 'من النظام' : 'From system', allMeetings.length - googleCount],
          ['google', ar ? 'من Google (التقويم)' : 'From Google calendar', googleCount],
        ] as [SourceFilter, string, number][]).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setSource(k)}
            aria-pressed={source === k}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${source === k ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'}`}
          >
            {label} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {/* Month / Week / Day Navigation Strip (the agenda has no date steps) */}
      <div className={`${viewMode === 'agenda' ? 'hidden' : 'flex'} items-center justify-between bg-white px-3 sm:px-6 py-2 sm:py-3 rounded-2xl border border-stone-200 shadow-xs`}>
        <button
          onClick={prevDate}
          aria-label={ar ? 'السابق' : 'Previous'}
          className="min-h-10 min-w-10 inline-flex items-center justify-center text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100"
        >
          <ChevronLeft className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-stone-800 font-mono">
            {viewMode === 'year' && fmtYmd(currentDate, { year: 'numeric' })}
            {viewMode === 'month' && fmtYmd(currentDate, { month: 'long', year: 'numeric' })}
            {viewMode === 'week' &&
              `${fmtYmd(weekDays[0], { month: 'short', day: 'numeric' })} - ${fmtYmd(weekDays[6], { month: 'short', day: 'numeric', year: 'numeric' })}`}
            {viewMode === 'day' && fmtYmd(currentDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
        </div>
        <button
          onClick={nextDate}
          aria-label={ar ? 'التالي' : 'Next'}
          className="min-h-10 min-w-10 inline-flex items-center justify-center text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100"
        >
          <ChevronRight className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Main Calendar Views (swipe left or right to move; the animation follows the direction) */}
      <div
        key={`${viewMode}-${slide.n}`}
        onPointerDown={onSwipeDown}
        onPointerUp={onSwipeUp}
        onPointerCancel={() => (swipe.current = null)}
        onClickCapture={(e) => {
          if (justSwiped.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className={`${slide.n > 0 ? (slide.dir === 'next' ? 'cal-in-next' : 'cal-in-prev') : ''} space-y-3`}
        style={{ touchAction: 'pan-y' }}
      >
      {viewMode === 'year' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, mi) => {
            const first = new Date(year, mi, 1).getDay();
            const dim = new Date(year, mi + 1, 0).getDate();
            const monthKey = `${year}-${String(mi + 1).padStart(2, '0')}`;
            const monthCount = Array.from({ length: dim }).reduce<number>((n, _, di) => n + (countsByDay.get(`${monthKey}-${String(di + 1).padStart(2, '0')}`) || 0), 0);
            return (
              <div key={mi} className="bg-white rounded-2xl border border-stone-200 shadow-xs p-2 sm:p-3">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentDate(new Date(year, mi, 1));
                    setViewMode('month');
                  }}
                  className="w-full flex items-center justify-between mb-1.5 min-h-8 text-start"
                >
                  <span className="text-xs sm:text-sm font-bold text-stone-900">{fmtYmd(new Date(year, mi, 1), { month: 'long' })}</span>
                  {monthCount > 0 && <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 rounded">{monthCount}</span>}
                </button>
                <div className="grid grid-cols-7 text-center text-[9px] sm:text-[10px] text-stone-400 mb-0.5">
                  {weekdayNames.map((n) => (
                    <span key={n}>{n.slice(0, ar ? 1 : 1)}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs">
                  {Array.from({ length: first }).map((_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {Array.from({ length: dim }).map((_, di) => {
                    const ds = `${monthKey}-${String(di + 1).padStart(2, '0')}`;
                    const c = countsByDay.get(ds) || 0;
                    return (
                      <button
                        key={ds}
                        type="button"
                        onClick={() => openDay(ds)}
                        className={`relative aspect-square flex items-center justify-center rounded-full ${
                          ds === todayCairo ? 'bg-[#0071e3] text-white font-bold' : c > 0 ? 'bg-blue-100 text-blue-900 font-semibold' : 'text-stone-700 hover:bg-stone-100'
                        }`}
                        aria-label={`${ds}${c ? `, ${c}` : ''}`}
                      >
                        {di + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'month' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          {/* Day Headers (Sunday Start) */}
          <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50/80 text-center text-xs font-bold text-stone-600 py-2.5">
            {weekdayNames.map((n, i) => (
              <span key={n} className={i === 5 || i === 6 ? 'text-stone-400' : i === 0 ? 'text-amber-800' : ''}>
                {n}
              </span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 auto-rows-auto divide-x divide-y divide-stone-100 sm:min-h-[550px]">
            {/* Blank cells before 1st of month */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div
                key={`blank-${i}`}
                className="bg-stone-50/30 p-1 sm:p-2 min-h-[56px] sm:min-h-[100px]"
                style={i % 7 === 5 || i % 7 === 6 ? { backgroundImage: WEEKEND_HATCH } : undefined}
              />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayMeetings = meetingsOn(cellDateStr);
              const dayTasks = tasks.filter(
                (t) => t.dueDate === cellDateStr && t.status !== 'Done' && t.status !== 'Closed' && !t.isArchived
              );

              return (
                <div
                  key={`day-${dayNum}`}
                  onClick={() => openDay(cellDateStr)}
                  className="p-0.5 sm:p-2 min-h-[72px] sm:min-h-[100px] hover:bg-blue-50/20 transition-colors flex flex-col justify-between group cursor-pointer relative"
                  style={(firstDayIndex + i) % 7 >= 5 ? { backgroundImage: WEEKEND_HATCH } : undefined}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span
                      className={`font-bold transition-colors ${
                        cellDateStr === todayCairo
                          ? 'bg-[#0071e3] text-white w-6 h-6 rounded-full flex items-center justify-center'
                          : 'text-stone-800 group-hover:text-[#0071e3]'
                      }`}
                    >
                      {dayNum}
                    </span>
                    <div className="flex items-center gap-1">
                      {dayMeetings.length > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">
                          {dayMeetings.length}<span className="max-sm:hidden"> {ar ? 'اجتماع' : dayMeetings.length === 1 ? 'meeting' : 'meetings'}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMeetingModal(null, cellDateStr);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 bg-slate-900 text-white rounded hover:scale-110 transition-all text-[10px] flex items-center justify-center"
                        title={locale === 'ar' ? 'إضافة اجتماع جديد في هذا اليوم' : 'Add meeting on this date'}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Every meeting and task of the day is listed by name (the cell grows to fit); tapping an item opens it, tapping the day opens the day view */}
                  <div className="my-1 space-y-0.5 sm:space-y-1 min-w-0">
                    {dayMeetings.map((m) => (
                      <div
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMeetingModal(m);
                        }}
                        className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 sm:p-1 rounded font-medium cursor-pointer transition-colors shadow-2xs break-words line-clamp-2 sm:line-clamp-none sm:truncate"
                        title={`${cairoTimeOf(m.start)} - ${cairoTimeOf(m.end)}: ${m.title}`}
                      >
                        <span className="font-mono text-blue-700 font-bold me-0.5 max-sm:hidden">{cairoTimeOf(m.start)}</span>
                        {m.title}
                      </div>
                    ))}
                    {dayTasks.map((t) => (
                      <div
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTaskModal(t);
                        }}
                        className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[9px] sm:text-[10px] leading-tight px-1 py-0.5 sm:p-1 rounded font-medium cursor-pointer transition-colors break-words line-clamp-2 sm:line-clamp-none sm:truncate"
                        title={t.title}
                      >
                        <span className="max-sm:hidden">{ar ? 'مهمة' : 'Task'}: </span>
                        {t.title}
                      </div>
                    ))}
                  </div>

                  <div />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View: time grid, tap an empty slot to add a meeting at that date and time */}
      {viewMode === 'week' && (
        <TimeGrid
          days={weekDays.map((d) => {
            const dateStr = formatYYYYMMDD(d);
            return {
              dateStr,
              weekday: fmtYmd(d, { weekday: 'short' }),
              dayNumber: String(d.getDate()),
              isToday: dateStr === todayCairo,
            };
          })}
          meetings={meetings}
          ar={ar}
          nowTime={nowCairoTime}
          onCreateAt={(dateStr, time) => onOpenMeetingModal(null, dateStr, time)}
          onOpenMeeting={(m) => onOpenMeetingModal(m)}
        />
      )}

      {/* Day View: same grid, one column */}
      {viewMode === 'day' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono text-stone-500 uppercase">{ar ? 'الجدول الزمني' : 'TIMELINE VIEW'}</span>
              <h3 className="text-lg font-bold text-stone-900">
                {fmtYmd(currentDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
            </div>
          </div>
          <TimeGrid
            days={[
              {
                dateStr: dayStr,
                weekday: fmtYmd(currentDate, { weekday: 'long' }),
                dayNumber: String(currentDate.getDate()),
                isToday: dayStr === todayCairo,
              },
            ]}
            meetings={meetings}
            ar={ar}
            nowTime={nowCairoTime}
            onCreateAt={(dateStr, time) => onOpenMeetingModal(null, dateStr, time)}
            onOpenMeeting={(m) => onOpenMeetingModal(m)}
          />
        </div>
      )}

      </div>

      {/* Agenda View */}
      {viewMode === 'agenda' && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h3 className="text-base font-bold text-stone-900">
              {showPast
                ? ar ? 'كافة الاجتماعات' : 'All Meetings'
                : ar ? 'جدول الأعمال التنفيذي القادم' : 'Upcoming Executive Agenda'}
            </h3>
            <button
              onClick={() => setShowPast(!showPast)}
              className="text-xs font-semibold text-[#0071e3] hover:underline"
            >
              {showPast ? (ar ? 'القادمة فقط' : 'Upcoming only') : ar ? 'إظهار السابقة' : 'Show past'}
            </button>
          </div>

          <div className="space-y-3">
            {agendaMeetings.length === 0 && (
              <p className="text-xs text-stone-500 py-6 text-center">
                {ar ? 'لا توجد اجتماعات قادمة.' : 'No upcoming meetings.'}
              </p>
            )}
            {agendaMeetings.map((m) => (
              <div
                key={m.id}
                onClick={() => onOpenMeetingModal(m)}
                className="bg-stone-50 hover:bg-stone-100/80 p-4 rounded-xl border border-stone-200 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-stone-500 mb-1">
                    <Clock className="w-3.5 h-3.5 text-stone-600" />
                    <span>{formatCairoDateDisplay(m.start, locale, true)}</span>
                  </div>
                  <h4 className="text-sm font-bold text-stone-900">{m.title}</h4>
                  {m.location && (
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1">
                      <MapPin className="w-3 h-3" />
                      <span>{m.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs bg-white text-stone-700 px-3 py-1 rounded-lg border border-stone-200 font-mono">
                    {m.attendees?.length || 0} {locale === 'en' ? 'attendees' : 'حضور'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
