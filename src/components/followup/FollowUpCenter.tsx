import React, { useState } from 'react';
import { Task } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { addCairoWorkingDays } from '../../lib/cairoTime';
import { selectFollowUps } from '../../lib/taskLogic';
import { useCairoClock } from '../../lib/useCairoClock';
import {
  Bell,
  CheckCircle2,
  Clock,
  RotateCcw,
  Calendar,
  Building2,
  User,
  AlertCircle,
  MessageSquare,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface FollowUpCenterProps {
  tasks: Task[];
  locale: Locale;
  onOpenTaskModal: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
}

export const FollowUpCenter: React.FC<FollowUpCenterProps> = ({
  tasks,
  locale,
  onOpenTaskModal,
  onUpdateTask,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const { today: todayCairo } = useCairoClock();
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  // Follow-up candidates: waiting tasks, follow-up dates that have arrived, and overdue tasks (soonest first)
  const followUpTasks = selectFollowUps(tasks, todayCairo);

  // Still Pending handler: records check-in and computes next follow-up (+3 working days) WITHOUT changing original due date!
  const handleStillPending = (task: Task) => {
    const nextFollowUp = addCairoWorkingDays(todayCairo, 3);
    const updatedNotes = [
      ...(task.progressNotes || []),
      ar
        ? `متابعة بتاريخ ${todayCairo}: لا يزال قيد المتابعة. موعد المتابعة التالي ${nextFollowUp}.`
        : `Follow-up check-in on ${todayCairo}: Still pending. Next follow-up set to ${nextFollowUp}.`,
    ];

    onUpdateTask({
      ...task,
      followUpDate: nextFollowUp,
      progressNotes: updatedNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleMarkDone = (task: Task) => {
    onUpdateTask({
      ...task,
      status: 'Done',
      completionDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddNote = (task: Task) => {
    const note = noteInputs[task.id];
    if (!note || !note.trim()) return;

    const updatedNotes = [
      ...(task.progressNotes || []),
      ar ? `مستجد (${todayCairo}): ${note.trim()}` : `Update (${todayCairo}): ${note.trim()}`,
    ];

    onUpdateTask({
      ...task,
      progressNotes: updatedNotes,
      updatedAt: new Date().toISOString(),
    });

    setNoteInputs((prev) => ({ ...prev, [task.id]: '' }));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="bg-white/90 backdrop-blur-xl text-[#1d1d1f] p-6 sm:p-8 rounded-3xl border border-[#d2d2d7] shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0071e3] mb-1 uppercase tracking-wide">
              <Bell className="w-4 h-4" />
              <span>{locale === 'en' ? 'PROACTIVE FOLLOW-UP ENGINE' : 'محرك المتابعة الحثيثة'}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">
              {locale === 'en' ? 'Executive Follow-up Cards' : 'بطاقات المتابعة الدورية'}
            </h1>
            <p className="text-xs text-[#86868b] mt-1">
              {locale === 'en'
                ? 'Persistent follow-up cadence (3 working days default). "Still Pending" records check-ins without shifting due dates.'
                : 'دورة متابعة مستمرة (3 أيام عمل). خيار "لا زال قيد المتابعة" يسجل الإفادة دون المساس بتاريخ الاستحقاق الأصلي.'}
            </p>
          </div>

          <div className="bg-[#f5f5f7] px-4 py-2 rounded-2xl border border-[#d2d2d7] text-xs font-mono text-[#1d1d1f]">
            <span>{followUpTasks.length} {ar ? 'متابعة نشطة' : 'active follow-ups'}</span>
          </div>
        </div>
      </div>

      {/* Follow-up Cards Feed */}
      <div className="space-y-4">
        {followUpTasks.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 p-6 text-stone-500 text-sm">
            {locale === 'en'
              ? 'No follow-ups are due right now.'
              : 'لا توجد متابعات مستحقة حالياً.'}
          </div>
        ) : (
          followUpTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4 hover:border-amber-400/80 transition-all"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span className="font-semibold text-stone-800">{task.workstream}</span>
                    <span>·</span>
                    <span className="font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded text-[11px]">
                      {task.ownerAlias}
                    </span>
                    {task.project && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-stone-700">{task.project}</span>
                      </>
                    )}
                  </div>
                  <h3
                    onClick={() => onOpenTaskModal(task)}
                    className="text-base font-bold text-stone-900 cursor-pointer hover:text-amber-800 transition-colors"
                  >
                    {task.title}
                  </h3>
                  {task.nextAction && (
                    <p className="text-xs text-stone-600">
                      <span className="font-semibold text-stone-700">
                        {locale === 'en' ? 'Next Action: ' : 'الإجراء القادم: '}
                      </span>
                      {task.nextAction}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-stone-500">
                  {task.dueDate && (
                    <span className="bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-lg">
                      {ar ? 'الاستحقاق' : 'Due'}: {task.dueDate}
                    </span>
                  )}
                  {task.followUpDate && (
                    <span className="bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-lg font-bold">
                      {ar ? 'المتابعة' : 'Follow-up'}: {task.followUpDate}
                    </span>
                  )}
                </div>
              </div>

              {/* Blocker alert if Waiting */}
              {task.status === 'Waiting' && task.blocker && (
                <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    <strong className="font-semibold">{locale === 'en' ? 'Waiting on: ' : 'معلق على: '}</strong>
                    {task.blocker}
                  </span>
                </div>
              )}

              {/* Progress history log */}
              {task.progressNotes && task.progressNotes.length > 0 && (
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-150 text-xs text-stone-600 space-y-1">
                  <span className="font-semibold text-stone-700 block">
                    {locale === 'en' ? 'Check-in History:' : 'سجل المتابعات:'}
                  </span>
                  {task.progressNotes.slice(-3).map((note, idx) => (
                    <p key={idx} className="font-mono text-[11px] text-stone-600">
                      • {note}
                    </p>
                  ))}
                </div>
              )}

              {/* Inline update note input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={noteInputs[task.id] || ''}
                  onChange={(e) =>
                    setNoteInputs({ ...noteInputs, [task.id]: e.target.value })
                  }
                  placeholder={locale === 'en' ? 'Add quick update or counterparty response...' : 'أضف إفادة أو رد من الشريك...'}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => handleAddNote(task)}
                  disabled={!noteInputs[task.id]?.trim()}
                  className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 disabled:opacity-40 text-stone-800 rounded-xl text-xs font-semibold transition-colors"
                >
                  {t.addNote}
                </button>
              </div>

              {/* Interactive Card Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-150">
                <span className="text-xs font-medium text-stone-500">
                  {t.anyUpdate}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStillPending(task)}
                    className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold transition-colors"
                    title={ar ? 'يسجّل المتابعة ويضيف 3 أيام عمل لموعد المتابعة دون تغيير تاريخ الاستحقاق' : 'Logs check-in and adds 3 working days to follow-up date without altering due date'}
                  >
                    {t.stillPending}
                  </button>

                  <button
                    onClick={() => onOpenTaskModal(task)}
                    className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-medium transition-colors"
                  >
                    {t.reschedule}
                  </button>

                  <button
                    onClick={() => handleMarkDone(task)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t.markDone}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
