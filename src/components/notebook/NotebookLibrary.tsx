import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  FileText,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  Trash2,
  Download,
} from 'lucide-react';
import type { Notebook, NotebookPage } from '../../types';
import type { Locale } from '../../lib/translations';
import { cairoDateOf } from '../../lib/cairoTime';
import { dayOfWeek, dayTitle, isPlannerDay, isPlannerMonth, monthTitle, weekdayName } from '../../lib/planner';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PagePreview } from './PagePreview';

type PageKind = 'note' | 'daily' | 'todo' | 'monthly' | 'mom' | 'imported';

const kindOf = (p: NotebookPage): PageKind => {
  switch (p.template) {
    case 'planner_daily':
      return 'daily';
    case 'planner_todo':
      return 'todo';
    case 'planner_monthly':
      return 'monthly';
    case 'planner_mom':
      return 'mom';
    case 'planner_archive':
      return 'imported';
    default:
      return 'note';
  }
};

const KIND_LABEL: Record<PageKind, { en: string; ar: string; tone: string }> = {
  note: { en: 'Note', ar: 'ملاحظة', tone: 'bg-stone-100 text-stone-700' },
  daily: { en: 'Daily', ar: 'يومية', tone: 'bg-blue-50 text-blue-700' },
  todo: { en: 'To-do list', ar: 'قائمة مهام', tone: 'bg-emerald-50 text-emerald-700' },
  monthly: { en: 'Monthly', ar: 'شهرية', tone: 'bg-violet-50 text-violet-700' },
  mom: { en: 'Meeting minutes', ar: 'محضر اجتماع', tone: 'bg-amber-50 text-amber-800' },
  imported: { en: 'Old notebook', ar: 'من الدفتر القديم', tone: 'bg-rose-50 text-rose-700' },
};

/** The date a page is about (daily/monthly pages) or when it was last written on */
const pageDate = (p: NotebookPage): string => {
  if (isPlannerDay(p.plannerDate)) return p.plannerDate;
  if (isPlannerMonth(p.plannerDate)) return `${p.plannerDate}-01`;
  const sane = (d: string) => (d && Number(d.slice(0, 4)) >= 2020 ? d : '');
  return sane(cairoDateOf(p.updatedAt)) || sane(cairoDateOf(p.createdAt));
};

const dateLabel = (date: string, locale: Locale): string => {
  if (!isPlannerDay(date)) return '';
  const ar = locale === 'ar';
  const wd = weekdayName(dayOfWeek(date), ar ? 'ar' : 'en');
  return `${ar ? wd : wd.slice(0, 3)} · ${dayTitle(date, ar ? 'ar' : 'en')} ${date.slice(0, 4)}`;
};

/** Plain, readable name for a page (generated names like "Daily Planner 2026 — Page 10" become "Page 10") */
const displayTitle = (p: NotebookPage, locale: Locale): string => {
  const ar = locale === 'ar';
  const generated = /^.+ — Page (\d+)$/.exec(p.title || '');
  if (generated) return ar ? `صفحة ${generated[1]}` : `Page ${generated[1]}`;
  if (p.template === 'planner_monthly' && isPlannerMonth(p.plannerDate)) return monthTitle(p.plannerDate, ar ? 'ar' : 'en');
  return p.title || (ar ? `صفحة ${p.pageNumber}` : `Page ${p.pageNumber}`);
};

interface NotebookLibraryProps {
  notebooks: Notebook[];
  pages: NotebookPage[];
  activeNotebookId: string;
  locale: Locale;
  onSelectNotebook: (id: string) => void;
  onOpenPage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onToday: () => void;
  onNewNote: () => void;
  onNewDaily: () => void;
  onNewTodo: () => void;
  onNewMonthly: () => void;
  onNewMom: () => void;
  onCreateNotebook: (title: string) => void;
  onOpenImport?: () => void;
}

export const NotebookLibrary: React.FC<NotebookLibraryProps> = ({
  notebooks,
  pages,
  activeNotebookId,
  locale,
  onSelectNotebook,
  onOpenPage,
  onDeletePage,
  onToday,
  onNewNote,
  onNewDaily,
  onNewTodo,
  onNewMonthly,
  onNewMom,
  onCreateNotebook,
  onOpenImport,
}) => {
  const ar = locale === 'ar';
  const notebook = notebooks.find((n) => n.id === activeNotebookId) || notebooks[0];
  const [filter, setFilter] = useState<'all' | PageKind>('all');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toDelete, setToDelete] = useState<NotebookPage | null>(null);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookName, setNewBookName] = useState('');

  const bookPages = useMemo(() => pages.filter((p) => p.notebookId === notebook?.id), [pages, notebook?.id]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookPages.length };
    for (const p of bookPages) c[kindOf(p)] = (c[kindOf(p)] || 0) + 1;
    return c;
  }, [bookPages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookPages
      .filter((p) => filter === 'all' || kindOf(p) === filter)
      .filter((p) => !q || `${displayTitle(p, locale)} ${p.title} ${dateLabel(pageDate(p), locale)}`.toLowerCase().includes(q))
      .sort((a, b) => pageDate(b).localeCompare(pageDate(a)) || (b.pageNumber || 0) - (a.pageNumber || 0));
  }, [bookPages, filter, query, locale]);

  const allChip: { id: 'all' | PageKind; label: string } = { id: 'all', label: ar ? 'الكل' : 'All' };
  const kindChips: { id: 'all' | PageKind; label: string }[] = (['note', 'daily', 'todo', 'monthly', 'mom', 'imported'] as PageKind[]).map((k) => ({
    id: k,
    label: ar ? KIND_LABEL[k].ar : KIND_LABEL[k].en,
  }));
  const chips = [allChip, ...kindChips].filter((c) => c.id === 'all' || (counts[c.id] || 0) > 0);

  const menuItems = [
    { key: 'note', icon: <FileText className="w-5 h-5" />, label: ar ? 'ورقة ملاحظات' : 'Blank note page', sub: ar ? 'ورقة مسطرة للكتابة الحرة' : 'Ruled paper for free writing', run: onNewNote },
    { key: 'daily', icon: <CalendarDays className="w-5 h-5" />, label: ar ? 'صفحة يومية' : 'Daily page', sub: ar ? 'جدول اليوم والأهداف والمهام' : 'Agenda, goals and to-do for one day', run: onNewDaily },
    { key: 'todo', icon: <ListChecks className="w-5 h-5" />, label: ar ? 'قائمة مهام' : 'To-do list', sub: ar ? 'باسم مسار العمل' : 'Named by workstream', run: onNewTodo },
    { key: 'monthly', icon: <CalendarRange className="w-5 h-5" />, label: ar ? 'صفحة شهرية' : 'Monthly page', sub: ar ? 'تقويم الشهر' : 'Month calendar with notes', run: onNewMonthly },
    { key: 'mom', icon: <NotebookPen className="w-5 h-5" />, label: ar ? 'محضر اجتماع' : 'Meeting minutes', sub: ar ? 'مهمة | مسؤول | تاريخ' : 'Task | Owner | Due date', run: onNewMom },
  ];

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-[#f5f5f7]" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-5 pb-28 space-y-4">
        {/* Title + the two main actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[#1d1d1f]">{ar ? 'المفكرة' : 'Notes'}</h1>
            <p className="text-xs text-[#6e6e73]">
              {ar ? 'اختر دفتراً ثم اضغط على أي صفحة لفتحها' : 'Pick a notebook, then tap any page to open it'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToday}
              className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-[#0071e3] hover:bg-[#0062c4] text-white text-sm font-bold shadow-xs active:scale-[0.98]"
            >
              <CalendarDays className="w-4 h-4" />
              {ar ? 'صفحة اليوم' : "Today's page"}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-white border border-[#d2d2d7] text-sm font-semibold text-[#1d1d1f] shadow-xs active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 text-[#0071e3]" />
                {ar ? 'صفحة جديدة' : 'New page'}
                <ChevronDown className="w-3.5 h-3.5 text-[#86868b]" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div role="menu" className={`absolute z-50 top-full mt-1.5 w-[min(300px,86vw)] rounded-2xl bg-white border border-[#d2d2d7] shadow-2xl p-1.5 ${ar ? 'left-0' : 'right-0'}`}>
                    {menuItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          item.run();
                        }}
                        className="w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl text-start hover:bg-[#f5f5f7]"
                      >
                        <span className="text-[#0071e3]">{item.icon}</span>
                        <span className="flex flex-col leading-tight">
                          <span className="text-sm font-semibold text-[#1d1d1f]">{item.label}</span>
                          <span className="text-[11px] text-[#86868b]">{item.sub}</span>
                        </span>
                      </button>
                    ))}
                    {onOpenImport && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenImport();
                        }}
                        className="w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl text-start hover:bg-[#f5f5f7] border-t border-[#ececf0] mt-1"
                      >
                        <span className="text-[#0071e3]"><Download className="w-5 h-5" /></span>
                        <span className="flex flex-col leading-tight">
                          <span className="text-sm font-semibold text-[#1d1d1f]">{ar ? 'استيراد من الدفتر القديم' : 'Import old notebook (PDF)'}</span>
                          <span className="text-[11px] text-[#86868b]">{ar ? 'صفحات GoodNotes' : 'GoodNotes pages'}</span>
                        </span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notebooks (books) */}
        <section aria-label={ar ? 'الدفاتر' : 'Notebooks'}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#6e6e73] mb-2">{ar ? 'دفاتري' : 'My notebooks'}</div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 snap-x">
            {notebooks.map((nb) => {
              const count = pages.filter((p) => p.notebookId === nb.id).length;
              const selected = nb.id === notebook?.id;
              return (
                <button
                  key={nb.id}
                  type="button"
                  onClick={() => {
                    onSelectNotebook(nb.id);
                    setFilter('all');
                    setQuery('');
                  }}
                  aria-pressed={selected}
                  className={`snap-start shrink-0 w-40 sm:w-48 min-h-[88px] rounded-2xl p-3 text-start border transition-all active:scale-[0.98] ${
                    selected ? 'bg-[#0071e3] border-[#0071e3] text-white shadow-lg' : 'bg-white border-[#d2d2d7] text-[#1d1d1f]'
                  }`}
                >
                  <BookOpen className={`w-5 h-5 ${selected ? 'text-white' : 'text-[#0071e3]'}`} />
                  <div className="mt-1.5 text-sm font-bold leading-tight line-clamp-2">{nb.title}</div>
                  <div className={`text-[11px] ${selected ? 'text-blue-100' : 'text-[#6e6e73]'}`}>
                    {ar ? `${count} صفحة` : `${count} ${count === 1 ? 'page' : 'pages'}`}
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setNewBookName('');
                setNewBookOpen(true);
              }}
              className="snap-start shrink-0 w-32 sm:w-40 min-h-[88px] rounded-2xl border-2 border-dashed border-[#c7c7cc] text-[#515154] flex flex-col items-center justify-center gap-1 text-xs font-semibold active:scale-[0.98]"
            >
              <Plus className="w-5 h-5 text-[#0071e3]" />
              {ar ? 'دفتر جديد' : 'New notebook'}
            </button>
          </div>
        </section>

        {/* Pages of the selected notebook */}
        <section aria-label={ar ? 'الصفحات' : 'Pages'} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#6e6e73] truncate">
              {notebook ? (ar ? `صفحات: ${notebook.title}` : `Pages in ${notebook.title}`) : ''}
              <span className="ms-1.5 text-[#86868b] normal-case font-medium">({visible.length})</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[#86868b]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ar ? 'ابحث في الصفحات' : 'Search pages'}
                className="w-full h-11 ps-9 pe-3 rounded-xl border border-[#d2d2d7] bg-white text-sm focus:outline-none focus:border-[#0071e3]"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 max-w-full">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  aria-pressed={filter === c.id}
                  className={`shrink-0 min-h-11 px-3.5 rounded-full text-xs font-semibold border ${
                    filter === c.id ? 'bg-[#1d1d1f] border-[#1d1d1f] text-white' : 'bg-white border-[#d2d2d7] text-[#515154]'
                  }`}
                >
                  {c.label} <span className="opacity-60">{counts[c.id] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#c7c7cc] bg-white/60 py-12 px-4 text-center text-sm text-[#6e6e73]">
              {bookPages.length === 0
                ? ar ? 'لا توجد صفحات في هذا الدفتر بعد. اضغط «صفحة جديدة» للبدء.' : 'No pages in this notebook yet. Tap "New page" to start.'
                : ar ? 'لا توجد صفحات مطابقة.' : 'No matching pages.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map((p) => {
                const kind = kindOf(p);
                const date = dateLabel(pageDate(p), locale);
                const title = displayTitle(p, locale);
                return (
                  <div key={p.id} className="relative group rounded-2xl bg-white border border-[#d2d2d7] shadow-xs overflow-hidden">
                    <button type="button" onClick={() => onOpenPage(p.id)} className="block w-full text-start active:opacity-80" aria-label={`${ar ? 'فتح' : 'Open'} ${title}`}>
                      <div className="border-b border-[#ececf0] bg-[#f5f5f7]">
                        <PagePreview page={p} locale={ar ? 'ar' : 'en'} />
                      </div>
                      <div className="p-2.5 space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_LABEL[kind].tone}`}>
                          {ar ? KIND_LABEL[kind].ar : KIND_LABEL[kind].en}
                        </span>
                        <div className="text-[13px] font-bold text-[#1d1d1f] leading-snug line-clamp-2 break-words">{title}</div>
                        {date && <div className="text-[11px] text-[#6e6e73] truncate">{date}</div>}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete(p)}
                      aria-label={ar ? 'حذف الصفحة' : 'Delete page'}
                      className="absolute top-1.5 end-1.5 w-10 h-10 rounded-full bg-white/90 border border-[#d2d2d7] text-[#6e6e73] hover:text-rose-600 flex items-center justify-center shadow-sm active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        ar={ar}
        title={ar ? 'هل تريد حذف هذه الصفحة؟' : 'Delete this page?'}
        detail={toDelete ? displayTitle(toDelete, locale) : ''}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const p = toDelete;
          setToDelete(null);
          if (p) onDeletePage(p.id);
        }}
      />

      {newBookOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setNewBookOpen(false)}>
          <form
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[#d2d2d7] p-5 space-y-4"
            dir={ar ? 'rtl' : 'ltr'}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const name = newBookName.trim();
              if (!name) return;
              setNewBookOpen(false);
              onCreateNotebook(name);
            }}
          >
            <h3 className="text-base font-bold text-[#1d1d1f]">{ar ? 'دفتر جديد' : 'New notebook'}</h3>
            <input
              autoFocus
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              placeholder={ar ? 'اسم الدفتر' : 'Notebook name'}
              className="w-full min-h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm focus:outline-none focus:border-[#0071e3]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewBookOpen(false)} className="min-h-11 px-4 rounded-xl text-sm font-semibold text-[#515154] hover:bg-[#f5f5f7]">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" disabled={!newBookName.trim()} className="min-h-11 px-5 rounded-xl text-sm font-bold bg-[#0071e3] disabled:opacity-40 text-white">
                {ar ? 'إنشاء' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
