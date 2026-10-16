import React, { useState, useEffect } from 'react';
import { Task, Workstream, TaskStatus, TaskPriority } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { INITIAL_WORKSTREAMS, INITIAL_DEPARTMENTS } from '../../lib/referenceData';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { X, Calendar, User, Building2, Flag, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  locale: Locale;
  onClose: () => void;
  onSave: (taskData: Partial<Task>) => void;
  onDelete?: (id: string) => void;
  departments?: string[];
}

export const TaskModal: React.FC<TaskModalProps> = ({
  task,
  isOpen,
  locale,
  onClose,
  onSave,
  onDelete,
  departments = INITIAL_DEPARTMENTS,
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
    if (status === 'Closed' && !closureReason.trim()) {
      setFormError(ar ? 'يرجى إدخال سبب الإغلاق.' : 'Please enter the closure reason.');
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
      completionDate: status === 'Done' ? (task?.completionDate || new Date().toISOString()) : undefined,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-stone-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-white text-stone-900 px-6 py-4 flex items-center justify-between border-b border-stone-200">
          <div>
            <span className="text-[11px] font-mono uppercase text-[#0071e3] font-semibold">
              {task ? (ar ? 'تعديل مهمة تنفيذية' : 'EDIT EXECUTIVE TASK') : (ar ? 'مهمة تنفيذية جديدة' : 'NEW EXECUTIVE TASK')}
            </span>
            <h2 className="text-lg font-bold text-stone-900">
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:border-[#0071e3] font-medium"
            />
          </div>

          {/* Workstream & Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.workstream}
              </label>
              <select
                value={workstream}
                onChange={(e) => setWorkstream(e.target.value as Workstream)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
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
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                {(department && !departments.includes(department) ? [department, ...departments] : departments).map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Project & Counterpart */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.project}
              </label>
              <input
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder={locale === 'ar' ? 'اسم المشروع أو المنطقة الاستثمارية' : 'Project or investment zone'}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.counterpart}
              </label>
              <input
                type="text"
                value={counterpart}
                onChange={(e) => setCounterpart(e.target.value)}
                placeholder={locale === 'ar' ? 'الجهة أو الشريك المقابل' : 'Counterpart entity or partner'}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
              />
            </div>
          </div>

          {/* Status, Priority & Owner Alias */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.status}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                <option value="Pending">{t.pending}</option>
                <option value="In Progress">{t.inProgress}</option>
                <option value="Waiting">{t.waiting}</option>
                <option value="On Hold">{t.onHold}</option>
                <option value="Done">{t.done}</option>
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
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              >
                <option value="Urgent">{ar ? 'عاجل' : 'Urgent'}</option>
                <option value="High">{ar ? 'مرتفع' : 'High'}</option>
                <option value="Normal">{ar ? 'عادي' : 'Normal'}</option>
                <option value="Low">{ar ? 'منخفض' : 'Low'}</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.owner}
              </label>
              <input
                type="text"
                value={ownerAlias}
                onChange={(e) => setOwnerAlias(e.target.value)}
                placeholder={locale === 'ar' ? 'اسم المسؤول أو رمزه' : 'Owner alias or name'}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3] font-mono"
              />
            </div>
          </div>

          {/* Due Date & Follow-Up Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {t.dueDate}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Due Time (Cairo)' : 'وقت الاستحقاق'}
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Next Follow-up Date' : 'تاريخ المتابعة'}
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full min-w-0 box-border px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white focus:outline-none focus:border-[#0071e3]"
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
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
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
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/50 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Closure Reason (if Closed) */}
          {status === 'Closed' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                {locale === 'en' ? 'Closure Reason *' : 'سبب الإغلاق الإداري *'}
              </label>
              <input
                type="text"
                value={closureReason}
                required
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder={locale === 'ar' ? 'سبب الإغلاق أو الاستبدال' : 'Reason for closure or superseded action'}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              {locale === 'en' ? 'Detailed Notes / Executive Context' : 'ملاحظات وتفاصيل تنفيذية'}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={ar ? 'سجّل السياق والنقاط الرئيسية والملاحظات' : 'Context, key points and notes'}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-[#0071e3]"
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
          <div className="flex items-center justify-between pt-4 border-t border-stone-200">
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
                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors"
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
