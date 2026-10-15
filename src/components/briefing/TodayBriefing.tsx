import React from 'react';
import { getCairoUtcOffsetLabel } from '../../lib/cairoTime';
import { Task, Meeting } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { formatCairoDateDisplay, cairoDateOf, isTaskOverdue } from '../../lib/cairoTime';
import { rankTopPriorities, selectFollowUps, isActiveTask } from '../../lib/taskLogic';
import { useCairoClock } from '../../lib/useCairoClock';
import { Clock, Calendar, AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Sparkles, Building2 } from 'lucide-react';

interface TodayBriefingProps {
  tasks: Task[];
  meetings: Meeting[];
  locale: Locale;
  onNavigateToTab: (tab: string) => void;
  onOpenTaskModal: (task: Task) => void;
  onOpenMeetingModal: (meeting: Meeting) => void;
  onQuickStatusChange: (taskId: string, newStatus: Task['status']) => void;
}

export const TodayBriefing: React.FC<TodayBriefingProps> = ({
  tasks,
  meetings,
  locale,
  onNavigateToTab,
  onOpenTaskModal,
  onOpenMeetingModal,
  onQuickStatusChange,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const { today: todayCairo, time: cairoTimeNow } = useCairoClock();
  const cairoHour = Number(cairoTimeNow.slice(0, 2));
  const greeting =
    cairoHour < 12
      ? ar ? 'صباح الخير' : 'Good morning'
      : cairoHour < 18
      ? ar ? 'مساء الخير' : 'Good afternoon'
      : ar ? 'مساء الخير' : 'Good evening';

  // Today's meetings in Cairo time, earliest first
  const todaysMeetings = meetings
    .filter((m) => cairoDateOf(m.start) === todayCairo)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Overdue (active, non-archived) tasks, oldest first
  const overdueTasks = tasks
    .filter((task) => isActiveTask(task) && isTaskOverdue(task.dueDate, task.dueTime, task.status))
    .sort((a, b) => `${a.dueDate}${a.dueTime || ''}`.localeCompare(`${b.dueDate}${b.dueTime || ''}`));

  // Waiting tasks and follow-ups that have come due
  const overdueIds = new Set(overdueTasks.map((x) => x.id));
  const waitingTasks = selectFollowUps(tasks, todayCairo).filter((x) => !overdueIds.has(x.id));

  // Active top 3 strategic priorities (overdue first, then priority, then due date)
  const topPriorities = rankTopPriorities(tasks, 3);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white/90 backdrop-blur-2xl text-[#1d1d1f] rounded-3xl p-6 sm:p-8 shadow-xl border border-[#d2d2d7]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0071e3] mb-2 uppercase tracking-wide">
              <Sparkles className="w-4 h-4" />
              <span>{locale === 'en' ? 'EXECUTIVE DAILY BRIEFING' : 'الموجز اليومي التنفيذي'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f]">
              {greeting}
            </h1>
            <p className="text-[#86868b] text-sm mt-1">
              {formatCairoDateDisplay(new Date(), locale, false)} · {t.cairoTime}
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#f5f5f7] px-4 py-2.5 rounded-2xl border border-[#d2d2d7] font-mono text-xs sm:text-sm tabular-nums shadow-xs">
            <Clock className="w-4 h-4 text-[#0071e3] shrink-0" />
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-bold text-[#0071e3]">{cairoTimeNow}</span>
              <span className="text-[10px] text-[#86868b] bg-white px-2 py-0.5 rounded-md border border-[#d2d2d7] shrink-0 font-sans">
                CAIRO ({getCairoUtcOffsetLabel()})
              </span>
            </div>
          </div>
        </div>

        {/* 3 Suggested Strategic Priorities */}
        <div className="mt-6 pt-6 border-t border-[#d2d2d7]/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-[#86868b] uppercase tracking-wider">
              {t.prioritiesToday}
            </h2>
            <button
              onClick={() => onNavigateToTab('tasks')}
              className="text-xs text-[#0071e3] hover:underline flex items-center gap-1 font-bold transition-colors"
            >
              <span>{locale === 'en' ? 'View all tasks' : 'عرض كافة المهام'}</span>
              <ChevronRight className={`w-3.5 h-3.5 ${locale === 'ar' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topPriorities.length === 0 && (
              <p className="md:col-span-3 text-center text-sm text-[#86868b] py-6">
                {ar ? 'لا توجد مهام نشطة حالياً.' : 'No active tasks right now.'}
              </p>
            )}
            {topPriorities.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => onOpenTaskModal(item)}
                className="bg-[#f5f5f7] hover:bg-[#e8e8ed] transition-all p-4 rounded-2xl border border-[#d2d2d7] cursor-pointer flex flex-col justify-between group shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#86868b] mb-2">
                    <span className="font-bold text-[#0071e3]">{String(idx + 1).padStart(2, '0')}. {item.workstream}</span>
                    <span className="bg-white px-2 py-0.5 rounded-xl text-[11px] text-[#1d1d1f] border border-[#d2d2d7]">
                      {item.ownerAlias}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#1d1d1f] group-hover:text-[#0071e3] transition-colors line-clamp-2">
                    {item.title}
                  </h3>
                  {item.project && (
                    <div className="flex items-center gap-1 text-xs text-[#86868b] mt-2">
                      <Building2 className="w-3 h-3 text-[#0071e3]" />
                      <span className="truncate">{item.project}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[#d2d2d7]/60 flex items-center justify-between text-xs">
                  <span className="text-[#86868b]">
                    {item.dueDate ? `${locale === 'en' ? 'Due' : 'استحقاق'} ${item.dueDate}` : (locale === 'en' ? 'Ongoing' : 'مستمر')}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickStatusChange(item.id, 'Done');
                    }}
                    className="text-emerald-700 hover:text-emerald-800 text-xs flex items-center gap-1 font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t.markDone}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid: Meetings & Overdue Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Meetings */}
        <div className="bg-white border border-[#d2d2d7] rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#0071e3]" />
              <h2 className="text-base font-bold text-[#1d1d1f]">{t.todaysMeetings}</h2>
            </div>
            <button
              onClick={() => onNavigateToTab('calendar')}
              className="text-xs text-[#0071e3] hover:underline font-bold"
            >
              {locale === 'en' ? 'Calendar view' : 'عرض التقويم'}
            </button>
          </div>

          {todaysMeetings.length === 0 ? (
            <div className="text-center py-8 text-[#86868b] text-sm">
              {locale === 'en'
                ? 'No executive meetings scheduled for today.'
                : 'لا توجد اجتماعات تنفيذية مجدولة لليوم.'}
            </div>
          ) : (
            <div className="space-y-3">
              {todaysMeetings.map((m) => (
                <div
                  key={m.id}
                  onClick={() => onOpenMeetingModal(m)}
                  className="bg-[#f5f5f7] hover:bg-[#e8e8ed] p-4 rounded-xl border border-[#d2d2d7] transition-all cursor-pointer shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-[#86868b] mb-1">
                        <Clock className="w-3 h-3 text-[#0071e3]" />
                        <span>
                          {formatCairoDateDisplay(m.start, locale, true)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[#1d1d1f]">{m.title}</h3>
                      {m.location && (
                        <p className="text-xs text-[#86868b] mt-1">{m.location}</p>
                      )}
                    </div>
                    {m.attendees && m.attendees.length > 0 && (
                      <span className="text-xs font-semibold bg-white text-[#1d1d1f] px-2 py-1 rounded-lg border border-[#d2d2d7]">
                        {m.attendees.length} {locale === 'en' ? 'attendees' : 'حضور'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue & Waiting Follow-ups */}
        <div className="bg-white border border-[#d2d2d7] rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-bold text-[#1d1d1f]">
                {t.overdueTasks} ({overdueTasks.length})
              </h2>
            </div>
            <button
              onClick={() => onNavigateToTab('followup')}
              className="text-xs text-stone-600 hover:text-stone-900 font-medium"
            >
              {locale === 'en' ? 'Follow-up Center' : 'مركز المتابعة'}
            </button>
          </div>

          {overdueTasks.length === 0 ? (
            <div className="text-center py-8 text-stone-500 text-sm">
              {locale === 'en'
                ? 'All operational tasks are on track. No overdue items.'
                : 'كافة المهام التشغيلية ضمن المخطط. لا توجد مهام متأخرة.'}
            </div>
          ) : (
            <div className="space-y-3">
              {overdueTasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  onClick={() => onOpenTaskModal(task)}
                  className="bg-white p-3.5 rounded-xl border border-stone-200/80 hover:border-stone-300 transition-all cursor-pointer shadow-xs flex items-center justify-between"
                >
                  <div className="min-w-0 pe-3">
                    <h3 className="text-sm font-medium text-stone-900 truncate">{task.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
                      <span className="text-stone-700 font-medium">
                        {locale === 'en' ? 'Due' : 'استحق'} {task.dueDate}
                      </span>
                      <span>·</span>
                      <span>{task.ownerAlias}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickStatusChange(task.id, 'Done');
                    }}
                    className="shrink-0 p-1.5 text-stone-400 hover:text-emerald-600 rounded-lg hover:bg-stone-50"
                    title={t.markDone}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {overdueTasks.length > 4 && (
                <button
                  onClick={() => onNavigateToTab('tasks')}
                  className="w-full text-xs font-semibold text-[#0071e3] hover:underline py-1"
                >
                  {ar ? `+${overdueTasks.length - 4} مهام متأخرة أخرى` : `+${overdueTasks.length - 4} more overdue`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Waiting & follow-ups that have come due */}
      {waitingTasks.length > 0 && (
        <div className="bg-white border border-[#d2d2d7] rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#1d1d1f]">
              {t.waitingFollowups} ({waitingTasks.length})
            </h2>
            <button onClick={() => onNavigateToTab('followup')} className="text-xs text-[#0071e3] hover:underline font-bold">
              {ar ? 'مركز المتابعة' : 'Follow-up Center'}
            </button>
          </div>
          <div className="space-y-2">
            {waitingTasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                onClick={() => onOpenTaskModal(task)}
                className="p-3 rounded-xl border border-stone-200/80 hover:border-stone-300 cursor-pointer flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-stone-900 truncate">{task.title}</span>
                <span className="text-xs text-stone-500 shrink-0">
                  {task.blocker ? task.blocker : task.followUpDate ? `${ar ? 'متابعة' : 'Follow-up'} ${task.followUpDate}` : task.ownerAlias}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
