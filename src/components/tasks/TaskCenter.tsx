import React, { useState } from 'react';
import { Task, Workstream, TaskStatus } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { INITIAL_WORKSTREAMS, INITIAL_DEPARTMENTS } from '../../lib/referenceData';
import { isTaskOverdue } from '../../lib/cairoTime';
import { useCairoClock } from '../../lib/useCairoClock';
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
  ArrowUpDown,
} from 'lucide-react';

interface TaskCenterProps {
  tasks: Task[];
  locale: Locale;
  onOpenTaskModal: (task: Task | null) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: TaskStatus) => void;
  onToggleArchive: (taskId: string) => void;
  departments?: string[];
}

type TabFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'waiting' | 'no_owner' | 'archived';

export const TaskCenter: React.FC<TaskCenterProps> = ({
  tasks,
  locale,
  onOpenTaskModal,
  onUpdateTaskStatus,
  onToggleArchive,
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
    Done: t.done,
    Closed: t.closed,
  };

  const [viewType, setViewType] = useState<'table' | 'kanban'>('table');
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkstream, setSelectedWorkstream] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const projectOptions = Array.from(new Set(tasks.map((t) => (t.project || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
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
    if (selectedProject !== 'all' && (task.project || '').trim() !== selectedProject) {
      return false;
    }

    // Tab filter
    if (tabFilter === 'today') {
      if (task.dueDate !== todayCairo || task.status === 'Done' || task.status === 'Closed') return false;
    } else if (tabFilter === 'upcoming') {
      if (!task.dueDate || task.dueDate <= todayCairo || task.status === 'Done' || task.status === 'Closed') return false;
    } else if (tabFilter === 'overdue') {
      if (!isTaskOverdue(task.dueDate, task.dueTime, task.status)) return false;
    } else if (tabFilter === 'waiting') {
      if (task.status !== 'Waiting') return false;
    } else if (tabFilter === 'no_owner') {
      if (task.ownerAlias && task.ownerAlias !== 'Unassigned') return false;
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

  const KANBAN_STATUSES: TaskStatus[] = [
    'Pending',
    'In Progress',
    'Waiting',
    'On Hold',
    'Done',
    'Closed',
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            {t.navTasks}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {filteredTasks.length} {locale === 'en' ? 'operational action records' : 'سجلات عمليات تنفيذية'}
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
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setTabFilter('all')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'All Active' : 'كافة المهام النشطة'}
          </button>
          <button
            onClick={() => setTabFilter('today')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'today' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'Due Today' : 'استحقاق اليوم'}
          </button>
          <button
            onClick={() => setTabFilter('upcoming')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'upcoming' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {t.upcomingTasks}
          </button>
          <button
            onClick={() => setTabFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'overdue' ? 'bg-slate-800 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {t.overdueTasks}
          </button>
          <button
            onClick={() => setTabFilter('waiting')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'waiting' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'Waiting on Others' : 'بانتظار طرف آخر'}
          </button>
          <button
            onClick={() => setTabFilter('no_owner')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'no_owner' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            {locale === 'en' ? 'Unassigned' : 'بدون مسؤول'}
          </button>
          <button
            onClick={() => setTabFilter('archived')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              tabFilter === 'archived' ? 'bg-slate-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5 inline me-1" />
            {locale === 'en' ? 'Archive' : 'الأرشيف'}
          </button>
        </div>

        {/* Search & Dropdown Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-stone-100">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute start-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.search}
              className="w-full ps-9 pe-3 py-2 rounded-xl border border-stone-200 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:border-stone-400"
            />
          </div>

          <div>
            <select
              value={selectedWorkstream}
              onChange={(e) => setSelectedWorkstream(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs bg-stone-50 focus:bg-white focus:outline-none"
            >
              <option value="all">{locale === 'en' ? 'All Workstreams' : 'كافة مسارات العمل'}</option>
              {INITIAL_WORKSTREAMS.map((ws) => (
                <option key={ws} value={ws}>
                  {ws}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs bg-stone-50 focus:bg-white focus:outline-none"
            >
              <option value="all">{locale === 'en' ? 'All Departments' : 'كافة الإدارات'}</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              aria-label={locale === 'en' ? 'Filter by project' : 'تصفية حسب المشروع'}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs bg-stone-50 focus:bg-white focus:outline-none"
            >
              <option value="all">{locale === 'en' ? 'All Projects' : 'كافة المشاريع'}</option>
              {projectOptions.map((pr) => (
                <option key={pr} value={pr}>
                  {pr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Views */}
      {viewType === 'table' ? (
        /* Executive Table View */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-semibold uppercase tracking-wider">
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
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-400">
                      {locale === 'en' ? 'No tasks found matching criteria.' : 'لم يتم العثور على مهام مطابقة.'}
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const overdue = isTaskOverdue(task.dueDate, task.dueTime, task.status);

                    return (
                      <tr
                        key={task.id}
                        onClick={() => onOpenTaskModal(task)}
                        className="hover:bg-amber-50/40 transition-colors cursor-pointer group"
                      >
                        {/* Status Select */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={task.status}
                            onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as TaskStatus)}
                            className={`text-xs font-semibold px-2 py-1 rounded-lg border focus:outline-none ${
                              task.status === 'Done'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : task.status === 'Waiting'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : task.status === 'Closed'
                                ? 'bg-stone-100 text-stone-500 border-stone-200'
                                : 'bg-white text-stone-800 border-stone-300'
                            }`}
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
                                {task.dueDate}
                              </span>
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
                            onClick={() => onToggleArchive(task.id)}
                            className="p-1 text-stone-400 hover:text-stone-800 rounded"
                            title={task.isArchived ? (ar ? 'استعادة' : 'Restore') : (ar ? 'أرشفة' : 'Archive')}
                          >
                            <Archive className="w-3.5 h-3.5" />
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
      ) : (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto pb-4">
          {KANBAN_STATUSES.map((statusCol) => {
            const colTasks = filteredTasks.filter((t) => t.status === statusCol);

            return (
              <div
                key={statusCol}
                className="bg-stone-100/70 rounded-2xl p-3 border border-stone-200/80 flex flex-col min-h-[500px]"
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
                      className="bg-white p-3 rounded-xl border border-stone-200 hover:border-amber-400 transition-all cursor-pointer shadow-xs space-y-2"
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
                          className="text-[11px] border border-stone-200 rounded-lg px-1.5 py-0.5 bg-white"
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
    </div>
  );
};
