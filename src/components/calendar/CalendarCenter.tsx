import React, { useState } from 'react';
import { Meeting, Task } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { formatCairoDateDisplay, getCairoDateString, cairoDateOf, cairoTimeOf } from '../../lib/cairoTime';
import { buildIcs } from '../../lib/exporters';
import { useCairoClock } from '../../lib/useCairoClock';
import { TimeGrid } from './TimeGrid';
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

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export const CalendarCenter: React.FC<CalendarCenterProps> = ({
  meetings,
  tasks,
  locale,
  onOpenMeetingModal,
  onOpenTaskModal,
}) => {
  const t = translations[locale];
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

  // Date navigation
  const prevDate = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else if (viewMode === 'day') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
  };

  const nextDate = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else if (viewMode === 'day') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
  };

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
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div>
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

      {/* Month / Week / Day Navigation Strip */}
      <div className="flex items-center justify-between bg-white px-6 py-3 rounded-2xl border border-stone-200 shadow-xs">
        <button
          onClick={prevDate}
          className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100"
        >
          <ChevronLeft className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold text-stone-800 font-mono">
            {viewMode === 'month' && fmtYmd(currentDate, { month: 'long', year: 'numeric' })}
            {viewMode === 'week' &&
              `${fmtYmd(weekDays[0], { month: 'short', day: 'numeric' })} - ${fmtYmd(weekDays[6], { month: 'short', day: 'numeric', year: 'numeric' })}`}
            {viewMode === 'day' && fmtYmd(currentDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
        </div>
        <button
          onClick={nextDate}
          className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100"
        >
          <ChevronRight className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Main Calendar Views */}
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
          <div className="grid grid-cols-7 divide-x divide-y divide-stone-100 min-h-[550px]">
            {/* Blank cells before 1st of month */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`blank-${i}`} className="bg-stone-50/30 p-2 min-h-[100px]" />
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
                  onClick={() => onOpenMeetingModal(null, cellDateStr)}
                  className="p-2 min-h-[100px] hover:bg-blue-50/20 transition-colors flex flex-col justify-between group cursor-pointer relative"
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
                          {dayMeetings.length} {ar ? 'اجتماع' : dayMeetings.length === 1 ? 'meeting' : 'meetings'}
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

                  {/* Badges in cell */}
                  <div className="space-y-1 my-1 overflow-y-auto max-h-[80px]">
                    {dayMeetings.map((m) => (
                      <div
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMeetingModal(m);
                        }}
                        className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-[10px] p-1 rounded font-medium truncate cursor-pointer transition-colors shadow-2xs"
                        title={`${cairoTimeOf(m.start)} - ${cairoTimeOf(m.end)}: ${m.title}`}
                      >
                        <span className="font-mono text-blue-700 font-bold me-1">
                          {cairoTimeOf(m.start)}
                        </span>
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
                        className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] p-1 rounded font-medium truncate cursor-pointer transition-colors"
                        title={t.title}
                      >
                        {ar ? 'مهمة' : 'Task'}: {t.title}
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
