import React, { useState, useEffect } from 'react';
import { Task, Workstream, TaskStatus, TaskPriority, Person, Project } from '../../types';
import { PickField, PickOption } from '../common/PickField';
import { Locale, translations } from '../../lib/translations';
import { INITIAL_WORKSTREAMS, INITIAL_DEPARTMENTS } from '../../lib/referenceData';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DateTimeField } from '../common/DateTimeField';
import { X, Calendar, User, Building2, Flag, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onSave: (taskData: Partial<Task>) => void;
  onDelete?: (id: string) => void;
  departments?: string[];
  /** the directory: owners and projects are picked from these */
  people?: Person[];
  projects?: Project[];
}

export const TaskModal: React.FC<TaskModalProps> = ({
  task,
  isOpen,
  locale,
  onClose,
  onSave,
  onDelete,
  departments = INITIAL_DEPARTMENTS,
  people = [],
  projects = [],
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [workstream, setWorkstream] = useState<Workstream>(task?.workstream || 'Commercial + New Lands');
  const [department, setDepartment] = useState(task?.department || 'Commercial');
  const [project, setProject] = useState(task?.project || '');
  const [location, setLocation] = useState(task?.location || '');
  const [ownerAlias, setOwnerAlias] = useState(task?.ownerAlias || '');
  const [counterpart, setCounterpart] = useState(task?.counterpart || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'Pending');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'Normal');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');
  const [dueTime, setDueTime] = useState(task?.dueTime || '');
  const [followUpDate, setFollowUpDate] = useState(task?.followUpDate || '');
  const [nextAction, setNextAction] = useState(task?.nextAction || '');
  const [expectedDeliverable, setExpectedDeliverable] = useState(task?.expectedDeliverable || '');
  const [blocker, setBlocker] = useState(task?.blocker || '');
  const [closureReason, setClosureReason] = useState(task?.closureReason || '');

  const [formError, setFormError] = useState<string>('');

  const ownerOptions: PickOption[] = people
    .filter((x) => x.isActive !== false)
    .map((x) => ({ value: (x.initials || x.name).trim(), label: x.name, hint: [x.initials, x.role].filter(Boolean).join(' · ') }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const projectOptions: PickOption[] = projects
    .map((x) => ({ value: x.name.trim(), label: x.name, hint: [x.city, x.stage].filter(Boolean).join(' · ') }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Reset the whole form every time the modal opens or a different task is selected
  useEffect(() => {
    if (!isOpen) return;
    setTitle(task?.title || '');
    setDescription(task?.description || '');
    setWorkstream(task?.workstream || 'Commercial + New Lands');
    setDepartment(task?.department || departments[0] || '');
    setProject(task?.project || '');
    setLocation(task?.location || '');
    setOwnerAlias(task?.ownerAlias && task.ownerAlias !== 'Unassigned' ? task.ownerAlias : '');
    setCounterpart(task?.counterpart || '');
    setStatus(task?.status || 'Pending');
    setPriority(task?.priority || 'Normal');
    setDueDate(task?.dueDate || '');
    setDueTime(task?.dueTime || '');
    setFollowUpDate(task?.followUpDate || '');
    setNextAction(task?.nextAction || '');
    setExpectedDeliverable(task?.expectedDeliverable || '');
    setBlocker(task?.blocker || '');
    setClosureReason(task?.closureReason || '');
    setFormError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (status === 'Waiting' && !blocker.trim()) {
      setFormError(ar ? 'يرجى تحديد الجهة أو الأمر المنتظر إنجازه.' : 'Please state who or what you are waiting on.');
      return;
    }

    onSave({
      ...(task || {}),
      title: title.trim(),
      description: description.trim(),
      workstream,
      department,
      project: project.trim(),
      location: location.trim(),
      ownerAlias: ownerAlias.trim() || 'Unassigned',
      counterpart: counterpart.trim(),
      status,
      priority,
      dueDate: dueDate || undefined,
      dueTime: dueDate && dueTime ? dueTime : undefined,
      followUpDate: followUpDate || undefined,
      nextAction: nextAction.trim(),
      expectedDeliverable: expectedDeliverable.trim(),
      blocker: blocker.trim(),
      closureReason: status === 'Closed' ? closureReason.trim() : undefined,
      completionDate: status === 'Closed' ? (task?.completionDate || new Date().toISOString()) : undefined,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl landscape:max-w-4xl w-full border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-white text-stone-900 px-4 py-2.5 sm:px-6 sm:py-4 flex items-center justify-between border-b border-stone-200">
          <div>
            <span className="text-[11px] font-mono uppercase text-[#0071e3] font-semibold">
              {task ? (ar ? 'تعديل مهمة تنفيذية' : 'EDIT EXECUTIVE TASK') : (ar ? 'مهمة تنفيذية جديدة' : 'NEW EXECUTIVE TASK')}
            </span>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 line-clamp-1">
              {task ? task.title : (locale === 'en' ? 'Create New Action Item' : 'إضافة إجراء جديد')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-3 sm:p-5 space-y-2.5 sm:space-y-3.5 max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {locale === 'en' ? 'Task Title *' : 'عنوان المهمة *'}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={locale === 'ar' ? 'عنوان المهمة أو الإجراء التنفيذي...' : 'Task title or milestone...'}
              className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm focus:outline-none focus:border-[#0071e3] font-medium"
            />
          </div>

          {/* Where it belongs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.workstream}
              </label>
              <select
                value={workstream}
                onChange={(e) => setWorkstream(e.target.value as Workstream)}
                className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                {INITIAL_WORKSTREAMS.map((ws) => (
                  <option key={ws} value={ws}>
                    {ws}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.department}
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                {(department && !departments.includes(department) ? [department, ...departments] : departments).map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.project}
              </label>
              <PickField
                options={projectOptions}
                value={project}
                onChange={setProject}
                ar={ar}
                ariaLabel={t.project}
                placeholder={ar ? 'اختر مشروعاً من الدليل' : 'Pick a project from the directory'}
                emptyText={ar ? 'لا توجد مشاريع في الدليل بعد' : 'No projects in the directory yet'}
                useTypedLabel={(v) => (ar ? `استخدم "${v}"` : `Use "${v}"`)}
              />
            </div>
          </div>

          {/* Who and how urgent */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div className="col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.counterpart}
              </label>
              <input
                type="text"
                value={counterpart}
                onChange={(e) => setCounterpart(e.target.value)}
                placeholder={locale === 'ar' ? 'الجهة أو الشريك المقابل' : 'Counterpart entity or partner'}
                className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.status}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full min-w-0 box-border px-3 py-1.5 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                <option value="Pending">{t.pending}</option>
                <option value="In Progress">{t.inProgress}</option>
                <option value="Waiting">{t.waiting}</option>
                <option value="On Hold">{t.onHold}</option>
                <option value="Closed">{t.closed}</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.priority}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full min-w-0 box-border px-3 py-1.5 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                <option value="Urgent">{ar ? 'عاجل' : 'Urgent'}</option>
                <option value="High">{ar ? 'مرتفع' : 'High'}</option>
                <option value="Normal">{ar ? 'عادي' : 'Normal'}</option>
                <option value="Low">{ar ? 'منخفض' : 'Low'}</option>
              </select>
            </div>
          </div>

          {/* Owner and dates: one per row on a phone so the native pickers never touch each other */}
          <div className="grid grid-cols-1 min-[520px]:grid-cols-3 gap-2.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.owner}
              </label>
              <PickField
                multiple
                mono
                options={ownerOptions}
                value={ownerAlias}
                onChange={setOwnerAlias}
                ar={ar}
                ariaLabel={t.owner}
                placeholder={ar ? 'اختر من الأشخاص والرموز' : 'Pick from people & aliases'}
                emptyText={ar ? 'لا يوجد أشخاص في الدليل بعد' : 'No people in the directory yet'}
                useTypedLabel={(v) => (ar ? `استخدم "${v}"` : `Use "${v}"`)}
              />
            </div>
            <div className="min-w-0 min-[520px]:col-span-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Due date & time (Cairo)' : 'موعد الاستحقاق (توقيت القاهرة)'}
              </label>
              <DateTimeField
                locale={locale}
                date={dueDate}
                time={dueTime}
                timeOptional
                clearable
                placeholder={locale === 'en' ? 'Set due date & time' : 'حدد التاريخ والوقت'}
                onChange={(v) => {
                  setDueDate(v.date);
                  setDueTime(v.date ? v.time : '');
                }}
              />
            </div>
          </div>

          {/* Follow-up */}
          <div className="grid grid-cols-1 min-[520px]:grid-cols-3 gap-2.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Next Follow-up Date' : 'تاريخ المتابعة'}
              </label>
              <DateTimeField
                mode="date"
                locale={locale}
                date={followUpDate}
                clearable
                placeholder={locale === 'en' ? 'Set follow-up date' : 'حدد تاريخ المتابعة'}
                onChange={(v) => setFollowUpDate(v.date)}
              />
            </div>
          </div>

          {/* Next Action & Expected Deliverable */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {t.nextAction}
            </label>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder={locale === 'ar' ? 'الإجراء التالي المتوقع تنفيذه' : 'Next concrete milestone or action'}
              className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
            />
          </div>

          {/* Blocker (if Waiting) */}
          {status === 'Waiting' && (
            <div>
              <label className="block text-xs font-semibold text-amber-800 mb-1">
                {t.blocker} *
              </label>
              <input
                type="text"
                value={blocker}
                required
                onChange={(e) => setBlocker(e.target.value)}
                placeholder={locale === 'ar' ? 'الطرف أو الأمر المنتظر إنجازه' : 'Who or what are we waiting on?'}
                className="w-full px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50/50 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Closure Reason (if Closed) */}
          {status === 'Closed' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Closure note (optional)' : 'ملاحظة الإغلاق (اختياري)'}
              </label>
              <input
                type="text"
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder={locale === 'ar' ? 'سبب الإغلاق أو الاستبدال' : 'Reason for closure or superseded action'}
                className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {locale === 'en' ? 'Detailed Notes / Executive Context' : 'ملاحظات وتفاصيل تنفيذية'}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={ar ? 'سجّل السياق والنقاط الرئيسية والملاحظات' : 'Context, key points and notes'}
              className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
            />
          </div>

          {/* Source Link Reference Info */}
          {task?.sourceRef && (
            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs text-stone-600 flex items-center justify-between">
              <div>
                <span className="font-semibold text-stone-800 block">
                  {locale === 'en' ? 'Linked Handwritten Source:' : 'المصدر المخطوط المرتبط:'}
                </span>
                <span className="font-mono text-[11px]">
                  {task.sourceRef.notebookTitle || (ar ? 'المفكرة' : 'Notebook')} · {ar ? 'صفحة' : 'Page'} {task.sourceRef.pageNumber}
                </span>
              </div>
              <span className="text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded text-[11px]">
                {ar ? 'الحبر الأصلي محفوظ' : 'Original Ink Intact'}
              </span>
            </div>
          )}

          {formError && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3 py-2">
              {formError}
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-2.5 pb-1 border-t border-stone-200 sticky bottom-0 bg-white z-10">
            {task && onDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-3.5 py-2 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
              >
                {t.delete}
              </button>
            ) : <div />}
            {task && onDelete && (
              <ConfirmDialog
                open={confirmDelete}
                ar={ar}
                title={ar ? 'هل تريد حذف هذه المهمة؟' : 'Delete this task?'}
                detail={task.title}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => {
                  setConfirmDelete(false);
                  onDelete(task.id);
                  onClose();
                }}
              />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0071e3] hover:bg-[#0062c4] rounded-xl shadow-xs transition-colors"
              >
                {t.save}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
