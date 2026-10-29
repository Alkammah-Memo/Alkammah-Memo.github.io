import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Task, Meeting } from '../../types';
import { Locale, translations } from '../../lib/translations';
import { addDaysToDateString, cairoDateOf, cairoTimeOf, getCairoUtcOffsetLabel, isTaskOverdue } from '../../lib/cairoTime';
import { isActiveTask, rankTopPriorities } from '../../lib/taskLogic';
import { useCairoClock } from '../../lib/useCairoClock';
import { formatTimeLabel } from '../common/DateTimeField';
import { TinyTaskModal } from '../calendar/TinyTasks';
import { getTeam, subscribeTeam } from '../../lib/team';
import { AlertTriangle, Calendar, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Clock, Hourglass, ListChecks, Plus, Sparkles, Users, Zap } from 'lucide-react';

interface TodayBriefingProps {
  tasks: Task[];
  meetings: Meeting[];
  locale: Locale;
  onNavigateToTab: (tab: string) => void;
  onOpenTaskModal: (task: Task) => void;
  onOpenMeetingModal: (meeting: Meeting) => void;
  onNewMeeting: () => void;
  onSaveQuickAction: (title: string, comment: string, date: string, time: string, id?: string) => void;
  onQuickStatusChange: (taskId: string, newStatus: Task['status']) => void;
}

type Range = 'today' | 'week' | 'month';
type Kind = 'meeting' | 'quick' | 'deadline';
type KindFilter = 'all' | 'meeting' | 'quick' | 'deadline';
type Bucket = 'overdue' | 'soon' | 'upcoming' | 'none';

interface Item {
  key: string;
  kind: Kind;
  day: string;
  time: string;
  end?: string;
  title: string;
  sub: string;
  past: boolean;
  task?: Task;
  meeting?: Meeting;
}

const TITLES = /^(eng\.?|dr\.?|mr\.?|mrs\.?|ms\.?|م\.|د\.|المهندس|الدكتور)\s+/i;
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
const splitOwners = (v: string) => (v || '').split(/[,،/&]+/).map(norm).filter(Boolean);

export const TodayBriefing: React.FC<TodayBriefingProps> = ({
  tasks,
  meetings,
  locale,
  onNavigateToTab,
  onOpenTaskModal,
  onOpenMeetingModal,
  onNewMeeting,
  onSaveQuickAction,
  onQuickStatusChange,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const { today, time: nowTime } = useCairoClock();
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const me = team.profiles.find((p) => p.user_id === team.meId);
  const fullName = me?.display_name.trim() || '';
  const firstName = fullName.replace(TITLES, '').split(' ')[0] || '';

  const [range, setRange] = useState<Range>('today');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [showAllToday, setShowAllToday] = useState(false);
  const [who, setWho] = useState<'mine' | 'delegated'>('mine');
  const [openBucket, setOpenBucket] = useState<Bucket | null>('overdue');
  const [focusOpen, setFocusOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickEdit, setQuickEdit] = useState<Task | null>(null);

  const hour = Number(nowTime.slice(0, 2));
  const greeting = hour < 12 ? (ar ? 'صباح الخير' : 'Good morning') : hour < 18 ? (ar ? 'مساء الخير' : 'Good afternoon') : ar ? 'مساء الخير' : 'Good evening';

  const lastDay = useMemo(() => {
    if (range === 'today') return today;
    if (range === 'week') return addDaysToDateString(today, 6);
    const [y, m] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }, [range, today]);

  // everything that happens in the chosen range, as one list
  const items = useMemo(() => {
    const out: Item[] = [];
    const nowMs = Date.now();
    for (const m of meetings) {
      const day = cairoDateOf(m.start);
      if (day < today || day > lastDay) continue;
      out.push({
        key: `m-${m.id}`,
        kind: 'meeting',
        day,
        time: cairoTimeOf(m.start),
        end: cairoTimeOf(m.end),
        title: m.title,
        sub: new Date(m.end).getTime() < nowMs ? (ar ? 'انتهى' : 'Past') : m.location || '',
        past: new Date(m.end).getTime() < nowMs,
        meeting: m,
      });
    }
    for (const x of tasks) {
      if (x.isArchived || x.status === 'Closed') continue;
      const day = (x.dueDate || '').slice(0, 10);
      if (!day || day < today || day > lastDay) continue;
      if (x.isTiny) out.push({ key: `q-${x.id}`, kind: 'quick', day, time: x.dueTime || '', title: x.title, sub: x.description || '', past: false, task: x });
      else
        out.push({
          key: `d-${x.id}`,
          kind: 'deadline',
          day,
          time: x.dueTime || '',
          title: x.title,
          sub: [day === today ? (ar ? 'يستحق اليوم' : 'Due today') : ar ? 'موعد التسليم' : 'Deadline', x.ownerAlias && x.ownerAlias !== 'Unassigned' ? x.ownerAlias : ''].filter(Boolean).join(' · '),
          past: false,
          task: x,
        });
    }
    return out.sort((a, b) => `${a.day}${a.time || '99:99'}`.localeCompare(`${b.day}${b.time || '99:99'}`));
  }, [meetings, tasks, today, lastDay, ar]);

  const todayItems = useMemo(() => {
    const out: Item[] = [];
    for (const i of items) if (i.day === today) out.push(i);
    return out;
  }, [items, today]);
  const count = (k: Kind, list: Item[]) => list.filter((i) => i.kind === k).length;
  const overdueAll = tasks.filter((x) => isActiveTask(x) && isTaskOverdue(x.dueDate, x.dueTime, x.status));
  const overdueQuick = tasks.filter((x) => x.isTiny && !x.isArchived && x.status !== 'Closed' && isTaskOverdue(x.dueDate, x.dueTime, x.status)).length;
  const statSource = range === 'today' ? todayItems : items;

  // ---- task summary
  const meTokens = useMemo(() => {
    const set = new Set<string>();
    if (fullName) {
      set.add(norm(fullName));
      set.add(norm(fullName.replace(TITLES, '')));
      set.add(norm(firstName));
    }
    return set;
  }, [fullName, firstName]);
  const isMine = (x: Task) => {
    const owners = splitOwners(x.ownerAlias || '').filter((o) => o !== 'unassigned');
    if (owners.length === 0) return true;
    return owners.some((o) => meTokens.has(o) || [...meTokens].some((m) => m && (m.startsWith(`${o} `) || o.startsWith(`${m} `))));
  };
  const active = tasks.filter(isActiveTask);
  const mineCount = active.filter(isMine).length;
  const scoped = active.filter((x) => (who === 'mine') === isMine(x));
  const soonEnd = addDaysToDateString(today, 2);
  const bucketOf = (x: Task): Bucket => {
    if (isTaskOverdue(x.dueDate, x.dueTime, x.status)) return 'overdue';
    const d = (x.dueDate || '').slice(0, 10);
    if (!d) return 'none';
    return d <= soonEnd ? 'soon' : 'upcoming';
  };
  const buckets: Record<Bucket, Task[]> = { overdue: [], soon: [], upcoming: [], none: [] };
  scoped.forEach((x) => buckets[bucketOf(x)].push(x));
  (Object.keys(buckets) as Bucket[]).forEach((b) => buckets[b].sort((p, q) => `${p.dueDate || '9999'}${p.dueTime || ''}`.localeCompare(`${q.dueDate || '9999'}${q.dueTime || ''}`)));
  const waiting = scoped.filter((x) => x.status === 'Waiting').length;
  const focus = rankTopPriorities(tasks, 3);

  const bucketMeta: Record<Bucket, { label: string; icon: React.ReactNode; tone: string }> = {
    overdue: { label: ar ? 'متأخرة' : 'Overdue', icon: <AlertTriangle className="w-4 h-4" />, tone: 'text-red-600 bg-red-50 border-red-200' },
    soon: { label: ar ? 'قريباً' : 'Due soon', icon: <Clock className="w-4 h-4" />, tone: 'text-orange-600 bg-orange-50 border-orange-200' },
    upcoming: { label: ar ? 'قادمة' : 'Upcoming', icon: <Calendar className="w-4 h-4" />, tone: 'text-[#0071e3] bg-[#0071e3]/5 border-[#0071e3]/20' },
    none: { label: ar ? 'بلا موعد' : 'No deadline', icon: <CircleDashed className="w-4 h-4" />, tone: 'text-stone-600 bg-stone-50 border-stone-200' },
  };

  const dayLabel = (d: string) => {
    const dt = new Date(`${d}T12:00:00Z`);
    return `${dt.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })} ${dt.getUTCDate()}`;
  };
  const rangeLabel = range === 'today' ? '' : `${dayLabel(today)} – ${dayLabel(lastDay)}`;
  const timeText = (i: Item) => (i.time ? `${formatTimeLabel(i.time, locale)}${i.kind === 'meeting' && i.end ? ` – ${formatTimeLabel(i.end, locale)}` : ''}` : '');

  const openItem = (i: Item) => {
    if (i.meeting) onOpenMeetingModal(i.meeting);
    else if (i.kind === 'quick' && i.task) {
      setQuickEdit(i.task);
      setQuickOpen(true);
    } else if (i.task) onOpenTaskModal(i.task);
  };

  const row = (i: Item) => {
    const icon =
      i.kind === 'meeting' ? <Calendar className="w-5 h-5 text-[#0071e3]" /> : i.kind === 'quick' ? <Zap className="w-5 h-5 text-orange-500" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    const checkable = i.kind !== 'meeting' && i.task;
    return (
      <li key={i.key} className={`flex items-center gap-2 rounded-2xl border px-3 min-h-14 py-1.5 ${i.kind === 'quick' ? 'border-orange-200 bg-orange-50/60' : 'border-stone-200 bg-white'} ${i.past ? 'opacity-60' : ''}`}>
        <button type="button" onClick={() => openItem(i)} className="flex-1 min-w-0 flex items-center gap-3 text-start py-1">
          <span className="shrink-0">{icon}</span>
          <span className="min-w-0 flex-1">
            {timeText(i) && <span className={`block font-mono text-[11px] tabular-nums ${i.kind === 'meeting' ? 'text-[#0071e3]' : i.kind === 'quick' ? 'text-orange-600' : 'text-stone-500'}`}>{timeText(i)}</span>}
            <span className="block text-sm font-bold text-stone-900 break-words">{i.title}</span>
            {i.sub && <span className="block text-xs text-stone-500 break-words">{i.sub}</span>}
          </span>
        </button>
        {checkable && (
          <button
            type="button"
            onClick={() => onQuickStatusChange(i.task!.id, 'Closed')}
            aria-label={t.markDone}
            className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl"
          >
            <span className="w-6 h-6 rounded-md border-2 border-stone-300 bg-white" />
          </button>
        )}
      </li>
    );
  };

  const shownToday = showAllToday ? todayItems : todayItems.slice(0, 4);
  const filtered = items.filter((i) => kindFilter === 'all' || i.kind === kindFilter);
  const byDay = new Map<string, Item[]>();
  filtered.forEach((i) => byDay.set(i.day, [...(byDay.get(i.day) || []), i]));
  const days = [...byDay.keys()].sort();

  const tabs: [Range, string][] = [
    ['today', ar ? 'اليوم' : 'Today'],
    ['week', ar ? 'الأسبوع' : 'This week'],
    ['month', ar ? 'الشهر' : 'Month'],
  ];
  const tiles: { n: number; label: string; icon: React.ReactNode; tone: string }[] = [
    { n: count('meeting', statSource), label: ar ? 'اجتماعات' : 'Meetings', icon: <Calendar className="w-5 h-5" />, tone: 'text-[#0071e3]' },
    { n: count('quick', statSource), label: ar ? 'إجراءات سريعة' : 'Quick actions', icon: <Zap className="w-5 h-5" />, tone: 'text-orange-500' },
    { n: count('deadline', statSource), label: range === 'today' ? (ar ? 'تستحق اليوم' : 'Due today') : ar ? 'مواعيد تسليم' : 'Deadlines', icon: <CheckCircle2 className="w-5 h-5" />, tone: 'text-emerald-600' },
    { n: overdueAll.length + overdueQuick, label: ar ? 'متأخرة' : 'Overdue', icon: <AlertTriangle className="w-5 h-5" />, tone: 'text-red-600' },
  ];

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-12">
      {/* Greeting, range switch and the four numbers */}
      <section className="bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-4 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0071e3] uppercase tracking-wide">
          <Sparkles className="w-4 h-4" />
          {ar ? 'الموجز اليومي التنفيذي' : 'Executive daily briefing'}
        </div>
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f]">
          {greeting}
          {firstName ? `${ar ? '، ' : ', '}${firstName}` : ''}
        </h1>
        <p className="text-sm text-[#86868b] mt-0.5">{new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#d2d2d7] bg-[#f5f5f7] px-3 h-9 text-xs">
          <Clock className="w-4 h-4 text-[#0071e3]" />
          <span className="font-mono font-bold text-[#0071e3] tabular-nums">{formatTimeLabel(nowTime, locale)}</span>
          <span className="text-[#86868b]">
            {t.cairoTime} ({getCairoUtcOffsetLabel()})
          </span>
        </div>

        <div role="tablist" className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-[#f5f5f7] p-1 border border-[#d2d2d7]/70">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={range === k}
              onClick={() => {
                setRange(k);
                setKindFilter('all');
              }}
              className={`min-h-11 rounded-full text-sm font-semibold transition-colors ${range === k ? 'bg-[#0071e3] text-white shadow-xs' : 'text-[#515154]'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {tiles.map((x) => (
            <div key={x.label} className="rounded-2xl border border-stone-200 bg-white px-1 py-2.5 text-center min-w-0">
              <div className={`flex items-center justify-center gap-1 ${x.tone}`}>
                <span className="text-xl font-bold tabular-nums">{x.n}</span>
              </div>
              <div className={`flex justify-center mt-0.5 ${x.tone}`}>{React.cloneElement(x.icon as React.ReactElement<{ className?: string }>, { className: 'w-4 h-4' })}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-stone-600 px-0.5">{x.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What is coming */}
      <section className="bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-[#0071e3]" />
          <h2 className="flex-1 text-sm font-bold uppercase tracking-wide text-[#1d1d1f]">
            {range === 'today' ? (ar ? 'اليوم' : 'Today') : range === 'week' ? (ar ? 'هذا الأسبوع' : 'This week') : ar ? 'هذا الشهر' : 'This month'}
            {rangeLabel && <span className="ms-2 normal-case font-medium text-[#86868b]">{rangeLabel}</span>}
          </h2>
          <button onClick={() => onNavigateToTab('calendar')} className="min-h-10 px-1 text-xs font-bold text-[#0071e3] inline-flex items-center gap-1">
            {ar ? 'فتح التقويم' : 'Open calendar'}
            <ChevronRight className={`w-3.5 h-3.5 ${ar ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {range !== 'today' && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {([
              ['all', ar ? 'الكل' : 'All'],
              ['meeting', ar ? 'اجتماعات' : 'Meetings'],
              ['quick', ar ? 'إجراءات سريعة' : 'Quick actions'],
              ['deadline', ar ? 'مواعيد التسليم' : 'Deadlines'],
            ] as [KindFilter, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKindFilter(k)}
                className={`min-h-9 px-3.5 rounded-full whitespace-nowrap text-xs font-semibold border ${kindFilter === k ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-stone-200 text-stone-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {range === 'today' ? (
          todayItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#86868b]">{ar ? 'لا شيء مجدول اليوم.' : 'Nothing scheduled for today.'}</p>
          ) : (
            <ul className="mt-3 space-y-2">{shownToday.map(row)}</ul>
          )
        ) : days.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#86868b]">{ar ? 'لا شيء في هذه الفترة.' : 'Nothing in this period.'}</p>
        ) : (
          <div className="mt-3 space-y-3">
            {days.map((d) => (
              <div key={d}>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#515154]">
                  {dayLabel(d)}
                  {d === today && <span className="ms-2 rounded-full bg-[#0071e3] text-white px-2 py-0.5 text-[10px] normal-case">{ar ? 'اليوم' : 'Today'}</span>}
                </div>
                <ul className="space-y-2">{(byDay.get(d) || []).map(row)}</ul>
              </div>
            ))}
          </div>
        )}

        {range === 'today' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button onClick={onNewMeeting} className="min-h-10 inline-flex items-center gap-1 text-sm font-semibold text-[#0071e3]">
              <Plus className="w-4 h-4" />
              {ar ? 'اجتماع' : 'Meeting'}
            </button>
            <button
              onClick={() => {
                setQuickEdit(null);
                setQuickOpen(true);
              }}
              className="min-h-10 inline-flex items-center gap-1 text-sm font-semibold text-[#0071e3]"
            >
              <Plus className="w-4 h-4" />
              {ar ? 'إجراء سريع' : 'Quick Action'}
            </button>
            {todayItems.length > 4 && (
              <button onClick={() => setShowAllToday((v) => !v)} className="ms-auto min-h-10 inline-flex items-center gap-1 text-sm font-semibold text-[#0071e3]">
                {showAllToday ? (ar ? 'عرض أقل' : 'Show less') : ar ? `عرض كل ${todayItems.length}` : `Show all ${todayItems.length} items`}
                <ChevronRight className={`w-3.5 h-3.5 ${ar ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Task summary */}
      <section className="bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-[#0071e3]" />
          <h2 className="flex-1 min-w-0 text-sm font-bold uppercase tracking-wide text-[#1d1d1f] truncate">{ar ? 'ملخص المهام' : 'Tasks'}</h2>
          <div className="inline-flex rounded-full bg-[#f5f5f7] p-0.5 border border-[#d2d2d7]/70" role="tablist">
            {([
              ['mine', ar ? 'مهامي' : 'My tasks'],
              ['delegated', ar ? 'المفوّضة' : 'Delegated'],
            ] as ['mine' | 'delegated', string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={who === k} onClick={() => setWho(k)} className={`min-h-9 px-3 rounded-full text-xs font-semibold ${who === k ? 'bg-[#0071e3] text-white' : 'text-[#515154]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold text-[#1d1d1f]">
          {scoped.length} <span className="text-sm font-semibold text-[#86868b]">{ar ? 'نشطة' : 'active'}</span>
          {who === 'delegated' && mineCount === active.length && <span className="ms-2 text-xs font-normal text-[#86868b]">{ar ? '(لا مهام مفوّضة)' : '(nothing delegated)'}</span>}
        </p>

        <div className="mt-3 space-y-2">
          {(Object.keys(bucketMeta) as Bucket[]).map((b) => {
            const list = buckets[b];
            const open = openBucket === b;
            const m = bucketMeta[b];
            return (
              <div key={b} className={`rounded-2xl border ${open ? m.tone : 'border-stone-200 bg-white'}`}>
                <button type="button" aria-expanded={open} onClick={() => setOpenBucket(open ? null : b)} className="w-full min-h-12 px-3 flex items-center gap-2 text-start">
                  <span className={m.tone.split(' ')[0]}>{m.icon}</span>
                  <span className={`flex-1 text-sm font-bold ${m.tone.split(' ')[0]}`}>
                    {m.label} <span className="font-mono">({list.length})</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <ul className="px-2 pb-2 space-y-1">
                    {list.length === 0 && <li className="px-2 py-2 text-xs text-stone-500">{ar ? 'لا شيء هنا.' : 'Nothing here.'}</li>}
                    {list.slice(0, 5).map((x) => (
                      <li key={x.id} className="flex items-center gap-1 rounded-xl bg-white border border-stone-200 pe-1">
                        <button type="button" onClick={() => onQuickStatusChange(x.id, 'Closed')} aria-label={t.markDone} className="w-11 h-11 shrink-0 inline-flex items-center justify-center">
                          <span className="w-5 h-5 rounded-md border-2 border-stone-300" />
                        </button>
                        <button type="button" onClick={() => onOpenTaskModal(x)} className="flex-1 min-w-0 text-start py-2 flex items-center gap-2">
                          <span className="flex-1 min-w-0 text-sm font-semibold text-stone-900 truncate">{x.title}</span>
                          <span className="shrink-0 max-w-[40%] text-[11px] text-stone-500 truncate">{x.ownerAlias && x.ownerAlias !== 'Unassigned' ? x.ownerAlias : ''}</span>
                        </button>
                      </li>
                    ))}
                    {list.length > 5 && (
                      <li>
                        <button onClick={() => onNavigateToTab('tasks')} className="w-full min-h-10 text-xs font-bold text-[#0071e3] inline-flex items-center justify-center gap-1">
                          {ar ? `عرض كل ${list.length}` : `Show all ${list.length}`}
                          <ChevronRight className={`w-3.5 h-3.5 ${ar ? 'rotate-180' : ''}`} />
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {waiting > 0 && (
          <button type="button" onClick={() => onNavigateToTab('followup')} className="mt-2 w-full rounded-2xl border border-stone-200 min-h-12 px-3 flex items-center gap-2 text-start">
            <Users className="w-4 h-4 text-stone-600" />
            <span className="flex-1 text-sm font-bold text-stone-800">{ar ? `${waiting} بانتظار الرد` : `${waiting} waiting for response`}</span>
            <ChevronRight className={`w-4 h-4 text-stone-400 ${ar ? 'rotate-180' : ''}`} />
          </button>
        )}

        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={() => setFocusOpen((v) => !v)} aria-expanded={focusOpen} className="min-h-10 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0071e3]">
            <Sparkles className="w-4 h-4" />
            {ar ? 'أولويات سبيرو المقترحة' : "Spero's suggested focus"}
            <ChevronDown className={`w-4 h-4 transition-transform ${focusOpen ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => onNavigateToTab('tasks')} className="min-h-10 inline-flex items-center gap-1 text-sm font-semibold text-[#0071e3]">
            {ar ? 'كل المهام' : 'All tasks'}
            <ChevronRight className={`w-3.5 h-3.5 ${ar ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {focusOpen && (
          <ol className="mt-1 space-y-1.5">
            {focus.length === 0 && <li className="text-xs text-stone-500 px-1">{ar ? 'لا توجد مهام نشطة.' : 'No active tasks right now.'}</li>}
            {focus.map((x, i) => (
              <li key={x.id}>
                <button type="button" onClick={() => onOpenTaskModal(x)} className="w-full min-h-12 rounded-2xl border border-stone-200 px-3 flex items-center gap-3 text-start">
                  <span className="font-mono text-xs font-bold text-[#0071e3]">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-stone-900 truncate">{x.title}</span>
                    {x.project && <span className="block text-[11px] text-stone-500 truncate">{x.project}</span>}
                  </span>
                  {isTaskOverdue(x.dueDate, x.dueTime, x.status) && <Hourglass className="w-4 h-4 text-red-500 shrink-0" />}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <TinyTaskModal editing={quickEdit} open={quickOpen} locale={locale} onClose={() => setQuickOpen(false)} onSave={onSaveQuickAction} />
    </div>
  );
};
