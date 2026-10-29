import React, { useState } from 'react';
import { useSortable } from './useSortable';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Task, Workstream, TaskStatus } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { INITIAL_WORKSTREAMS, INITIAL_DEPARTMENTS } from '../../lib/referenceData';
import { isTaskOverdue } from '../../lib/cairoTime';
import { useCairoClock } from '../../lib/useCairoClock';
import { DateTimeField, formatDateLabel, formatTimeLabel } from '../common/DateTimeField';
import {
  Table,
  Kanban,
  Search,
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  ChevronDown,
  RotateCcw,
  Archive,
  Trash2,
  ArrowUpDown,
  GripVertical,
  ChevronUp,
} from 'lucide-react';

interface TaskCenterProps {
  tasks: Task[];
  locale: Locale;
  onOpenTaskModal: (task: Task | null) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onToggleArchive: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  /** the full new order of every task id (first = top); the app stores it so the order survives reloads and syncs */
  onReorderTasks?: (orderedIds: string[]) => void;
  departments?: string[];
}

/** Serial number with a drag handle and tiny up / down arrows: drag or tap to move a task up or down the list. */
const RowControls: React.FC<{
  sort: ReturnType<typeof useSortable>;
  id: string;
  index: number;
  total: number;
  ar: boolean;
  vertical?: boolean;
}> = ({ sort, id, index, total, ar, vertical }) => (
  <div className={`flex items-center ${vertical ? 'flex-col gap-0.5' : 'gap-0.5'} select-none`} onClick={(e) => e.stopPropagation()}>
    <button
      type="button"
      onPointerDown={sort.startDrag(id)}
      aria-label={ar ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}
      title={ar ? 'اسحب لإعادة الترتيب' : 'Drag to reorder'}
      className="touch-none cursor-grab active:cursor-grabbing h-11 w-11 -my-1 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 active:bg-stone-200 active:text-stone-900"
    >
      <GripVertical className="w-5 h-5" />
    </button>
    <span className="min-w-5 text-center font-mono font-bold text-[11px] tabular-nums text-stone-700">{index + 1}</span>
    <div className={`flex ${vertical ? 'flex-row' : 'flex-col'}`}>
      <button
        type="button"
        disabled={index === 0}
        onClick={() => sort.move(id, -1)}
        aria-label={ar ? 'نقل لأعلى' : 'Move up'}
        title={ar ? 'نقل لأعلى' : 'Move up'}
        className="h-7 w-9 inline-flex items-center justify-center rounded-md text-stone-500 hover:text-stone-800 active:bg-stone-100 disabled:opacity-25"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        type="button"
        disabled={index === total - 1}
        onClick={() => sort.move(id, 1)}
        aria-label={ar ? 'نقل لأسفل' : 'Move down'}
        title={ar ? 'نقل لأسفل' : 'Move down'}
        className="h-7 w-9 inline-flex items-center justify-center rounded-md text-stone-500 hover:text-stone-800 active:bg-stone-100 disabled:opacity-25"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  </div>
);

type TabFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'archived';
type StatusFilter = 'any' | TaskStatus;
/** "All Active" shows only these; On Hold and Closed are reached through the status filter */
const ACTIVE_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Waiting'];

export const TaskCenter: React.FC<TaskCenterProps> = ({
  tasks,
  locale,
  onOpenTaskModal,
  onUpdateTaskStatus,
  onToggleArchive,
  onDeleteTask,
  onReorderTasks,
  departments = INITIAL_DEPARTMENTS,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const { today: todayCairo } = useCairoClock();
  const statusLabel: Record<TaskStatus, string> = {
    Pending: t.pending,
    'In Progress': t.inProgress,
    Waiting: t.waiting,
    'On Hold': t.onHold,
    Closed: t.closed,
  };

  const [viewType, setViewType] = useState<'table' | 'kanban'>('table');
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any');
  const [moreFilters, setMoreFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkstream, setSelectedWorkstream] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  // date-only filters (the time of day never takes part, so a 9:00 or 17:00 task on the same day is always the same match)
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [pending, setPending] = useState<{ kind: 'archive' | 'delete'; task: Task } | null>(null);
  // Names typed in different ways ("yara adel", "Yara ADEL ") are one person/project: group by a normalised key
  const keyOf = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  const niceName = (variants: string[]) => {
    const mixed = variants.find((v) => v !== v.toLowerCase() && v !== v.toUpperCase());
    if (mixed) return mixed.trim().replace(/\s+/g, ' ');
    const first = variants[0].trim().replace(/\s+/g, ' ');
    return first.length <= 3 ? first.toUpperCase() : first.replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/(?<=\p{L})\p{L}+/gu, (w) => w.toLowerCase());
  };
  const groupNames = (values: string[]) => {
    const map = new Map<string, string[]>();
    for (const v of values) {
      if (!v || !v.trim() || v === 'Unassigned') continue;
      const k = keyOf(v);
      map.set(k, [...(map.get(k) || []), v]);
    }
    return [...map.entries()].map(([key, vs]) => ({ key, label: niceName(vs) })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const splitOwners = (v: string) => (v || '').split(/[,،/&]+/).map((o) => o.trim()).filter(Boolean);
  const ownerOptions = groupNames(tasks.flatMap((t) => splitOwners(t.ownerAlias || '')));
  const projectOptions = groupNames(tasks.map((t) => t.project || ''));

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    // tiny tasks live in their own list on the Calendar page
    if (task.isTiny) return false;

    // Archived filter
    if (tabFilter === 'archived') {
      if (!task.isArchived) return false;
    } else {
      if (task.isArchived) return false;
    }

    // Workstream filter
    if (selectedWorkstream !== 'all' && task.workstream !== selectedWorkstream) {
      return false;
    }

    // Department filter
    if (selectedDepartment !== 'all' && task.department !== selectedDepartment) {
      return false;
    }

    // Project filter
    if (selectedProject !== 'all' && keyOf(task.project || '') !== selectedProject) {
      return false;
    }

    // Person filter (a task can have several owners, e.g. "YA, MM")
    if (selectedOwner !== 'all') {
      if (!splitOwners(task.ownerAlias || '').some((o) => keyOf(o) === selectedOwner)) return false;
    }

    // Date filter: by day only
    {
      const day = (task.dueDate || '').slice(0, 10);
      if (dueFrom && (!day || day < dueFrom)) return false;
      if (dueTo && (!day || day > dueTo)) return false;
    }

    // Status filter: an explicit choice always wins (it is how closed / on-hold tasks are reached)
    if (statusFilter !== 'any') {
      if (task.status !== statusFilter) return false;
    } else if (tabFilter === 'all' && !ACTIVE_STATUSES.includes(task.status)) {
      return false;
    }

    // Tab filter
    if (tabFilter === 'today') {
      if ((task.dueDate || '').slice(0, 10) !== todayCairo || (statusFilter === 'any' && task.status === 'Closed')) return false;
    } else if (tabFilter === 'upcoming') {
      if (!task.dueDate || task.dueDate.slice(0, 10) <= todayCairo || (statusFilter === 'any' && task.status === 'Closed')) return false;
    } else if (tabFilter === 'overdue') {
      if (!isTaskOverdue(task.dueDate, task.dueTime, task.status)) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchProject = task.project?.toLowerCase().includes(q);
      const matchOwner = task.ownerAlias?.toLowerCase().includes(q);
      const matchNextAction = task.nextAction?.toLowerCase().includes(q);
      if (!matchTitle && !matchProject && !matchOwner && !matchNextAction) return false;
    }

    return true;
  });

  // Manual order: tasks you have moved keep their stored position; tasks never moved sit on top in their usual order
  const stored = tasks.filter((x) => x.sortOrder !== undefined).map((x) => x.sortOrder as number);
  const baseKey = stored.length ? Math.min(...stored) : 0;
  const keyMap = new Map(tasks.map((x, i) => [x.id, x.sortOrder ?? baseKey - tasks.length + i]));
  const byKey = (a: Task, b: Task) => (keyMap.get(a.id) as number) - (keyMap.get(b.id) as number);
  const orderedFiltered = [...filteredTasks].sort(byKey);
  const orderedIds = orderedFiltered.map((x) => x.id);
  const fullOrder = [...tasks].sort(byKey).map((x) => x.id);
  const commitOrder = (visibleOrder: string[]) => {
    // the moved rows swap places only among the slots they already occupied, so hidden (filtered-out) tasks keep their place
    const visible = new Set(visibleOrder);
    const slots = fullOrder.map((id, i) => (visible.has(id) ? i : -1)).filter((i) => i >= 0);
    const next = [...fullOrder];
    slots.forEach((slot, k) => {
      next[slot] = visibleOrder[k];
    });
    onReorderTasks?.(next);
  };
  const tableSort = useSortable(orderedIds, commitOrder);
  const cardSort = useSortable(orderedIds, commitOrder);
  const byId = new Map(filteredTasks.map((x) => [x.id, x]));
  const rowsOf = (sort: ReturnType<typeof useSortable>) => sort.order.map((id) => byId.get(id)).filter((x): x is Task => !!x);
  const tableRows = rowsOf(tableSort);
  const cardRows = rowsOf(cardSort);

  const KANBAN_STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Waiting', 'On Hold', 'Closed'];
  const statusTone: Record<TaskStatus, string> = {
    Pending: 'bg-white text-stone-800 border-stone-300',
    'In Progress': 'bg-sky-50 text-sky-800 border-sky-200',
    Waiting: 'bg-amber-50 text-amber-800 border-amber-200',
    'On Hold': 'bg-violet-50 text-violet-800 border-violet-200',
    Closed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };
  const extraActive = [selectedWorkstream, selectedDepartment, selectedProject, selectedOwner].filter((v) => v !== 'all').length + (dueFrom || dueTo ? 1 : 0);
  const anyFilter = extraActive > 0 || statusFilter !== 'any' || !!searchQuery.trim();
  const resetFilters = () => {
    setStatusFilter('any');
    setSelectedWorkstream('all');
    setSelectedDepartment('all');
    setSelectedProject('all');
    setSelectedOwner('all');
    setDueFrom('');
    setDueTo('');
    setSearchQuery('');
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            {t.navTasks}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {filteredTasks.length} {locale === 'en' ? (filteredTasks.length === 1 ? 'task' : 'tasks') : 'مهمة'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* View Toggle (Table / Kanban) */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
            <button
              onClick={() => setViewType('table')}
              className={`p-2 rounded-lg text-xs font-medium transition-all ${
                viewType === 'table' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
              title={ar ? 'عرض جدول' : 'Table View'}
            >
              <Table className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewType('kanban')}
              className={`p-2 rounded-lg text-xs font-medium transition-all ${
                viewType === 'kanban' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
              }`}
              title={ar ? 'لوحة كانبان' : 'Kanban Board'}
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => onOpenTaskModal(null)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addTask}</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3">
        {/* Smart Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs -mx-1 px-1">
          <button
            onClick={() => setTabFilter('all')}
            className={`px-3.5 min-h-9 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'All Active' : 'كافة المهام النشطة'}
          </button>
          <button
            onClick={() => setTabFilter('today')}
            className={`px-3.5 min-h-9 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'today' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'Due Today' : 'استحقاق اليوم'}
          </button>
          <button
            onClick={() => setTabFilter('upcoming')}
            className={`px-3.5 min-h-9 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'upcoming' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {t.upcomingTasks}
          </button>
          <button
            onClick={() => setTabFilter('overdue')}
            className={`px-3.5 min-h-9 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'overdue' ? 'bg-slate-800 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'Overdue' : t.overdueTasks}
          </button>
          <button
            onClick={() => setTabFilter('archived')}
            className={`px-3.5 min-h-9 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'archived' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5 inline me-1" />
            {locale === 'en' ? 'Archive' : 'الأرشيف'}
          </button>
        </div>

        {/* Search + status: always visible */}
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_12rem_auto] gap-2 pt-2 border-t border-stone-100 items-center">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="w-4 h-4 text-stone-400 absolute start-3 top-3" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search}
              className="w-full h-10 ps-9 pe-3 rounded-xl border border-stone-200 text-base sm:text-xs bg-stone-50 focus:bg-white focus:outline-none focus:border-stone-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label={locale === 'en' ? 'Filter by status' : 'تصفية حسب الحالة'}
            className={`h-10 px-3 rounded-xl border text-xs font-semibold focus:outline-none ${statusFilter === 'any' ? 'border-stone-200 bg-stone-50' : 'border-slate-900 bg-slate-900 text-white'}`}
          >
            <option value="any">{locale === 'en' ? 'Any status' : 'كل الحالات'}</option>
            {KANBAN_STATUSES.map((st) => (
              <option key={st} value={st}>
                {statusLabel[st]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMoreFilters((v) => !v)}
            aria-expanded={moreFilters}
            className="h-10 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-700 inline-flex items-center gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" />
            {locale === 'en' ? 'More' : 'المزيد'}
            {extraActive > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-slate-900 text-white text-[11px] inline-flex items-center justify-center">{extraActive}</span>}
          </button>
        </div>

        {moreFilters && (
          <div className="space-y-2.5 pt-2.5 border-t border-stone-100">
            <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { v: selectedWorkstream, set: setSelectedWorkstream, all: locale === 'en' ? 'All Workstreams' : 'كافة مسارات العمل', opts: INITIAL_WORKSTREAMS.map((x) => ({ key: x, label: x })), label: t.workstream },
                { v: selectedDepartment, set: setSelectedDepartment, all: locale === 'en' ? 'All Departments' : 'كافة الإدارات', opts: departments.map((x) => ({ key: x, label: x })), label: t.department },
                { v: selectedProject, set: setSelectedProject, all: locale === 'en' ? 'All Projects' : 'كافة المشاريع', opts: projectOptions, label: locale === 'en' ? 'Filter by project' : 'تصفية حسب المشروع' },
                { v: selectedOwner, set: setSelectedOwner, all: locale === 'en' ? 'All People' : 'كل الأشخاص', opts: ownerOptions, label: locale === 'en' ? 'Filter by person' : 'تصفية حسب الشخص' },
              ].map((f) => (
                <select
                  key={f.label}
                  value={f.v}
                  onChange={(e) => f.set(e.target.value)}
                  aria-label={f.label}
                  className={`h-10 w-full px-3 rounded-xl border text-xs focus:outline-none ${f.v === 'all' ? 'border-stone-200 bg-stone-50' : 'border-slate-900 bg-white font-semibold'}`}
                >
                  <option value="all">{f.all}</option>
                  {f.opts.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>
            {/* Due date range: by day only */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-stone-500">{locale === 'en' ? 'Due date (day only):' : 'تاريخ الاستحقاق (اليوم فقط):'}</span>
              <div className="w-40 max-w-[46%]">
                <DateTimeField mode="date" locale={locale} date={dueFrom} clearable placeholder={locale === 'en' ? 'From any day' : 'من أي يوم'} onChange={(v) => setDueFrom(v.date)} title={locale === 'en' ? 'From date' : 'من تاريخ'} ariaLabel={locale === 'en' ? 'Due from' : 'من'} />
              </div>
              <div className="w-40 max-w-[46%]">
                <DateTimeField mode="date" locale={locale} date={dueTo} clearable placeholder={locale === 'en' ? 'To any day' : 'إلى أي يوم'} onChange={(v) => setDueTo(v.date)} title={locale === 'en' ? 'To date' : 'إلى تاريخ'} ariaLabel={locale === 'en' ? 'Due to' : 'إلى'} />
              </div>
            </div>
          </div>
        )}

        {anyFilter && (
          <div className="flex items-center justify-between gap-2 text-xs text-stone-600">
            <span>
              {filteredTasks.length} {locale === 'en' ? 'matching' : 'نتيجة'}
            </span>
            <button type="button" onClick={resetFilters} className="min-h-9 px-3 font-semibold text-rose-600 rounded-lg active:bg-rose-50">
              {locale === 'en' ? 'Clear all filters' : 'مسح كل الفلاتر'}
            </button>
          </div>
        )}
      </div>

      {/* Views */}
      {viewType === 'table' ? (
        /* Phone: one card per task (a wide table forces sideways scrolling), table from tablet width up */
        <>
        <div className="sm:hidden space-y-2.5">
          {cardRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 py-10 text-center text-xs text-stone-400">
              {locale === 'en' ? 'No tasks found matching criteria.' : 'لم يتم العثور على مهام مطابقة.'}
            </div>
          ) : (
            cardRows.map((task, idx) => {
              const overdue = isTaskOverdue(task.dueDate, task.dueTime, task.status);
              return (
                <div
                  key={task.id}
                  ref={cardSort.ref(task.id)}
                  onClick={() => onOpenTaskModal(task)}
                  className={`relative rounded-2xl border p-3 active:bg-stone-50 ${
                    cardSort.dragId === task.id
                      ? 'bg-amber-50 border-amber-300 shadow-xl z-20'
                      : overdue
                      ? 'bg-red-50 border-red-300 shadow-xs'
                      : 'bg-white border-stone-200 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-2">
                  <RowControls sort={cardSort} id={task.id} index={idx} total={cardRows.length} ar={ar} vertical />
                  <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-900 break-words">{task.title}</div>
                      {(task.project || task.counterpart) && (
                        <div className="mt-0.5 text-[11px] text-stone-500 truncate">
                          {[task.project, task.counterpart].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 -me-1.5 -mt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setPending({ kind: 'archive', task })}
                        className="w-10 h-10 flex items-center justify-center text-stone-400 rounded-lg"
                        aria-label={task.isArchived ? (ar ? 'استعادة' : 'Restore') : ar ? 'أرشفة' : 'Archive'}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPending({ kind: 'delete', task })}
                        className="w-10 h-10 flex items-center justify-center text-stone-400 rounded-lg"
                        aria-label={ar ? 'حذف المهمة' : 'Delete task'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={task.status}
                      onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                      className={`h-10 text-xs font-semibold px-2 rounded-lg border ${statusTone[task.status] || statusTone.Pending}`}
                    >
                      {KANBAN_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {statusLabel[st]}
                        </option>
                      ))}
                    </select>
                    {task.ownerAlias && (
                      <span className="font-mono text-[11px] font-semibold bg-stone-100 px-2 py-1 rounded text-stone-800">{task.ownerAlias}</span>
                    )}
                    {task.dueDate && (
                      <span className={`font-mono text-[11px] tabular-nums ${overdue ? 'text-red-600 font-bold' : 'text-stone-600'}`}>
                        {overdue ? (ar ? '⚠ متأخرة · ' : '⚠ Overdue · ') : ''}
                        {formatDateLabel(task.dueDate, locale, false)}
                        {task.dueTime ? ` · ${formatTimeLabel(task.dueTime, locale)}` : ''}
                      </span>
                    )}
                  </div>
                  {task.nextAction && <div className="mt-2 text-xs text-stone-600 break-words">→ {task.nextAction}</div>}
                  </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="max-sm:hidden bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 ps-3 pe-1 w-24 text-center">#</th>
                  <th className="py-3 px-4">{t.status}</th>
                  <th className="py-3 px-4">{locale === 'en' ? 'Title & Project' : 'العنوان والمشروع'}</th>
                  <th className="py-3 px-4">{t.workstream}</th>
                  <th className="py-3 px-4">{t.owner}</th>
                  <th className="py-3 px-4">{t.dueDate}</th>
                  <th className="py-3 px-4">{t.nextAction}</th>
                  <th className="py-3 px-4 text-end">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-stone-400">
                      {locale === 'en' ? 'No tasks found matching criteria.' : 'لم يتم العثور على مهام مطابقة.'}
                    </td>
                  </tr>
                ) : (
                  tableRows.map((task, idx) => {
                    const overdue = isTaskOverdue(task.dueDate, task.dueTime, task.status);

                    return (
                      <tr
                        key={task.id}
                        ref={tableSort.ref(task.id)}
                        onClick={() => onOpenTaskModal(task)}
                        className={`transition-colors cursor-pointer group ${
                          tableSort.dragId === task.id
                            ? 'bg-amber-100 relative z-20 shadow-lg'
                            : overdue
                            ? 'bg-red-50 hover:bg-red-100/80 shadow-[inset_3px_0_0_#dc2626]'
                            : 'hover:bg-amber-50/40'
                        }`}
                      >
                        {/* Serial number + drag handle + up / down */}
                        <td className="py-2 ps-3 pe-1">
                          <RowControls sort={tableSort} id={task.id} index={idx} total={tableRows.length} ar={ar} />
                        </td>

                        {/* Status Select */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={task.status}
                            onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                            className={`text-xs font-semibold px-2 py-1.5 rounded-lg border focus:outline-none ${statusTone[task.status] || statusTone.Pending}`}
                          >
                            {KANBAN_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {statusLabel[st]}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Title & Project */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-stone-900 group-hover:text-amber-800 transition-colors truncate">
                            {task.title}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                            {task.project && (
                              <span className="font-medium text-stone-700">{task.project}</span>
                            )}
                            {task.counterpart && (
                              <>
                                <span>·</span>
                                <span className="text-stone-400">{task.counterpart}</span>
                              </>
                            )}
                            {task.sourceRef && (
                              <>
                                <span>·</span>
                                <span className="text-amber-700 font-mono text-[10px]">
                                  p.{task.sourceRef.pageNumber} ink
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Workstream */}
                        <td className="py-3 px-4 whitespace-nowrap text-stone-600">
                          {task.workstream}
                        </td>

                        {/* Owner Alias */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono text-[11px] font-semibold bg-stone-100 px-2 py-0.5 rounded text-stone-800">
                            {task.ownerAlias}
                          </span>
                        </td>

                        {/* Due Date & Overdue Flag */}
                        <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums">
                          {task.dueDate ? (
                            <div className="flex items-center gap-1.5">
                              {overdue && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                              <span className={overdue ? 'text-red-600 font-bold' : 'text-stone-700'}>
                                {formatDateLabel(task.dueDate, locale, false)}
                                {task.dueTime ? ` · ${formatTimeLabel(task.dueTime, locale)}` : ''}
                              </span>
                              {overdue && <span className="text-[10px] font-bold uppercase text-red-700 bg-red-100 rounded px-1.5 py-0.5 font-sans">{ar ? 'متأخرة' : 'Overdue'}</span>}
                            </div>
                          ) : (
                            <span className="text-stone-400 italic">
                              {locale === 'en' ? 'Ongoing' : 'مستمر'}
                            </span>
                          )}
                        </td>

                        {/* Next Action */}
                        <td className="py-3 px-4 text-stone-600 max-w-xs truncate">
                          {task.nextAction || '—'}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setPending({ kind: 'archive', task })}
                            className="p-2 text-stone-400 hover:text-stone-800 rounded"
                            title={task.isArchived ? (ar ? 'استعادة' : 'Restore') : (ar ? 'أرشفة' : 'Archive')}
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setPending({ kind: 'delete', task })}
                            className="p-2 text-stone-400 hover:text-rose-600 rounded"
                            title={ar ? 'حذف' : 'Delete'}
                            aria-label={ar ? 'حذف المهمة' : 'Delete task'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      ) : (
        /* Kanban Board View */
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-1 px-1">
          {KANBAN_STATUSES.map((statusCol) => {
            const colTasks = orderedFiltered.filter((t) => t.status === statusCol);

            return (
              <div
                key={statusCol}
                className="bg-stone-100/70 rounded-2xl p-3 border border-stone-200/80 flex flex-col min-h-40 w-[82%] sm:w-72 lg:w-0 lg:flex-1 lg:min-w-52 shrink-0 snap-start"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200 text-xs font-bold text-stone-700">
                  <span>{statusLabel[statusCol]}</span>
                  <span className="bg-white px-2 py-0.5 rounded-full text-[11px] text-stone-500 font-mono">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onOpenTaskModal(task)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer shadow-xs space-y-2 ${
                        isTaskOverdue(task.dueDate, task.dueTime, task.status) ? 'bg-red-50 border-red-300 hover:border-red-500' : 'bg-white border-stone-200 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-stone-400">
                        <span className="font-semibold text-stone-600">{task.workstream.split(' ')[0]}</span>
                        <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded text-stone-700">
                          {task.ownerAlias}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-stone-900 line-clamp-2">
                        {task.title}
                      </h4>
                      <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                        {task.dueDate ? (
                          <span
                            className={`text-[11px] font-mono ${
                              isTaskOverdue(task.dueDate, task.dueTime, task.status) ? 'text-red-600 font-bold' : 'text-stone-500'
                            }`}
                          >
                            {task.dueDate}
                          </span>
                        ) : (
                          <span />
                        )}
                        <select
                          value={task.status}
                          onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                          className={`text-[11px] h-8 border rounded-lg px-1.5 ${statusTone[task.status] || statusTone.Pending}`}
                          aria-label={t.status}
                        >
                          {KANBAN_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {statusLabel[st]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!pending}
        ar={ar}
        title={
          pending?.kind === 'delete'
            ? ar ? 'هل تريد حذف هذه المهمة؟' : 'Delete this task?'
            : pending?.task.isArchived
              ? ar ? 'استعادة هذه المهمة من الأرشيف؟' : 'Restore this task from the archive?'
              : ar ? 'أرشفة هذه المهمة؟' : 'Archive this task?'
        }
        detail={pending?.task.title}
        confirmLabel={
          pending?.kind === 'delete' ? undefined : pending?.task.isArchived ? (ar ? 'نعم، استعد' : 'Yes, restore') : ar ? 'نعم، أرشف' : 'Yes, archive'
        }
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (!p) return;
          if (p.kind === 'delete') onDeleteTask(p.task.id);
          else onToggleArchive(p.task.id);
        }}
      />
    </div>
  );
};
