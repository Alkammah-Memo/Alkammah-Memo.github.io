import React, { useState, useEffect, useRef } from 'react';
import { Task, Meeting, NotebookPage, Person, Project, PlannerImportPage } from '../../types';
import { PlannerImport } from './PlannerImport';
import { Locale, translations } from '../../lib/translations';
import { localDB, BackupError } from '../../lib/indexedDb';
import type { WorkspaceState } from '../../lib/indexedDb';
import { parseBackup } from '../../lib/backup';
import { buildTasksCsv, escapeHtml } from '../../lib/exporters';
import { getCairoDateString, formatCairoDateDisplay } from '../../lib/cairoTime';
import {
  Download,
  Printer,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Database,
  BookOpen,
  RotateCcw,
  Trash2,
  ChevronLeft,
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  tasks: Task[];
  meetings: Meeting[];
  pages: NotebookPage[];
  people: Person[];
  projects: Project[];
  locale: Locale;
  onClose: () => void;
  /** Called after a successful restore with the freshly loaded workspace and the mode used. */
  onRestoreCompleted: (state: WorkspaceState, mode: 'replace' | 'merge') => Promise<void> | void;
  onClearAllData?: () => Promise<void>;
  /** Imports pages produced from a planner PDF (see PlannerImport) */
  onImportPlannerPages?: (notebookTitle: string, pages: PlannerImportPage[]) => Promise<void>;
}

type Status = { type: 'ok' | 'err'; text: string } | null;
interface PendingRestore {
  text: string;
  fileName: string;
  counts: Array<[string, number]>;
}

function downloadFile(content: string, mime: string, fileName: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  tasks,
  meetings,
  locale,
  onClose,
  onRestoreCompleted,
  onClearAllData,
  onImportPlannerPages,
}) => {
  const t = translations[locale];
  const ar = locale === 'ar';
  const [status, setStatus] = useState<Status>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [clearWord, setClearWord] = useState('');
  // The window shows a compact grid of tiles; the three bigger tools open in the same window, one at a time
  const [view, setView] = useState<'home' | 'planner' | 'restore' | 'erase'>('home');
  useEffect(() => {
    if (isOpen) setView('home');
  }, [isOpen]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const CONFIRM_WORD = ar ? 'حذف' : 'DELETE';

  // Fresh state every time the modal is opened
  useEffect(() => {
    if (isOpen) {
      setStatus(null);
      setPending(null);
      setClearWord('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Export CSV
  const handleExportCSV = () => {
    downloadFile(buildTasksCsv(tasks), 'text/csv;charset=utf-8;', `executive-tasks-${getCairoDateString()}.csv`);
  };

  // 2. Export Printable HTML Report (hidden iframe; every value is HTML-escaped)
  const handlePrintHTML = () => {
    const e = escapeHtml;
    const activeTasks = tasks.filter((x) => !x.isArchived);
    const L = ar
      ? {
          title: 'تقرير العمليات التنفيذية',
          baseline: 'التوقيت المرجعي: القاهرة',
          generated: 'تاريخ الإصدار',
          s1: 'المهام التشغيلية النشطة',
          status: 'الحالة', task: 'المهمة', ws: 'المسار', project: 'المشروع', owner: 'المسؤول', due: 'الاستحقاق', next: 'الإجراء القادم',
          ongoing: 'مستمر',
          s2: 'الاجتماعات التنفيذية المجدولة',
          when: 'التاريخ والوقت', mt: 'الاجتماع', loc: 'المكان', att: 'الحضور',
        }
      : {
          title: 'Executive AI Planner — Operations Report',
          baseline: 'Baseline: Cairo (Africa/Cairo)',
          generated: 'Generated',
          s1: 'Active Operational Tasks',
          status: 'Status', task: 'Task Title', ws: 'Workstream', project: 'Project', owner: 'Owner', due: 'Due Date', next: 'Next Action',
          ongoing: 'Ongoing',
          s2: 'Scheduled Executive Meetings',
          when: 'Date & Time', mt: 'Meeting Title', loc: 'Location', att: 'Attendees',
        };
    const sortedMeetings = [...meetings].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const html = `<!DOCTYPE html>
<html dir="${ar ? 'rtl' : 'ltr'}" lang="${ar ? 'ar' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <title>${e(L.title)} — ${getCairoDateString()}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1c1917; line-height: 1.5; }
      h1 { font-size: 24px; margin-bottom: 4px; }
      .meta { color: #78716c; font-size: 12px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
      th, td { border: 1px solid #e7e5e4; padding: 8px 12px; text-align: ${ar ? 'right' : 'left'}; }
      th { background: #f5f5f4; font-weight: 600; }
      .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      .status-done { background: #dcfce7; color: #166534; }
      .status-wait { background: #fef3c7; color: #92400e; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <h1>${e(L.title)}</h1>
    <div class="meta">${e(L.baseline)} · ${e(L.generated)}: ${e(formatCairoDateDisplay(new Date(), locale, true))}</div>

    <h2>1. ${e(L.s1)} (${activeTasks.length})</h2>
    <table>
      <thead><tr>
        <th>${e(L.status)}</th><th>${e(L.task)}</th><th>${e(L.ws)}</th><th>${e(L.project)}</th><th>${e(L.owner)}</th><th>${e(L.due)}</th><th>${e(L.next)}</th>
      </tr></thead>
      <tbody>
        ${activeTasks
          .map(
            (x) => `<tr>
          <td><span class="badge ${x.status === 'Done' ? 'status-done' : x.status === 'Waiting' ? 'status-wait' : ''}">${e(x.status)}</span></td>
          <td><strong>${e(x.title)}</strong></td>
          <td>${e(x.workstream)}</td>
          <td>${e(x.project || '—')}</td>
          <td><code>${e(x.ownerAlias)}</code></td>
          <td>${e(x.dueDate ? `${x.dueDate}${x.dueTime ? ' ' + x.dueTime : ''}` : L.ongoing)}</td>
          <td>${e(x.nextAction || '—')}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2 style="margin-top: 32px;">2. ${e(L.s2)} (${sortedMeetings.length})</h2>
    <table>
      <thead><tr><th>${e(L.when)}</th><th>${e(L.mt)}</th><th>${e(L.loc)}</th><th>${e(L.att)}</th></tr></thead>
      <tbody>
        ${sortedMeetings
          .map(
            (m) => `<tr>
          <td>${e(formatCairoDateDisplay(m.start, locale, true))}</td>
          <td><strong>${e(m.title)}</strong></td>
          <td>${e(m.location || '—')}</td>
          <td>${e(m.attendees?.join(', ') || '—')}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </body>
</html>`;

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    const win = iframe.contentWindow;
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
    if (win) {
      win.addEventListener('afterprint', cleanup);
      win.focus();
      win.print();
    }
    setTimeout(cleanup, 120000);
  };

  // 3. Full JSON Backup
  const handleFullJSONBackup = async () => {
    try {
      const json = await localDB.exportFullBackup();
      downloadFile(json, 'application/json', `executive-planner-full-backup-${getCairoDateString()}.json`);
    } catch (err) {
      console.error('Backup export error:', err);
      setStatus({ type: 'err', text: ar ? 'تعذر إنشاء النسخة الاحتياطية.' : 'Could not create the backup file.' });
    }
  };

  const describeBackupError = (err: unknown): string => {
    if (err instanceof BackupError) {
      switch (err.code) {
        case 'invalid_json':
          return ar ? 'الملف ليس بصيغة JSON صالحة.' : 'The file is not valid JSON.';
        case 'invalid_format':
          return ar ? 'الملف ليس نسخة احتياطية صالحة لهذا التطبيق.' : 'The file is not a valid backup of this app.';
        case 'invalid_records':
          return ar
            ? `سجلات غير صالحة في القسم "${err.detail}". لم يتم تغيير أي بيانات.`
            : `Invalid records in "${err.detail}". No data was changed.`;
        case 'empty':
          return ar ? 'الملف لا يحتوي على بيانات.' : 'The file contains no data.';
      }
    }
    return ar ? 'تعذرت استعادة النسخة الاحتياطية. لم يتم تغيير أي بيانات.' : 'The backup could not be restored. No data was changed.';
  };

  // 4a. Choose a backup file: validate it, then ask Replace vs Merge
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    setStatus(null);
    setPending(null);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const result = parseBackup(text);
      input.value = ''; // allow choosing the same file again
      if (!result.ok) {
        setStatus({ type: 'err', text: describeBackupError(new BackupError(result.code, result.detail)) });
        return;
      }
      const labels: Record<string, [string, string]> = {
        tasks: ['Tasks', 'المهام'],
        meetings: ['Meetings', 'الاجتماعات'],
        notebooks: ['Notebooks', 'المفكرات'],
        pages: ['Pages', 'الصفحات'],
        people: ['People', 'الأشخاص'],
        projects: ['Projects', 'المشاريع'],
      };
      const counts = Object.entries(result.backup.stores).map(
        ([k, v]) => [(labels[k] || [k, k])[ar ? 1 : 0], v?.length ?? 0] as [string, number]
      );
      setPending({ text, fileName: file.name, counts });
    };
    reader.onerror = () => {
      input.value = '';
      setStatus({ type: 'err', text: ar ? 'تعذرت قراءة الملف.' : 'The file could not be read.' });
    };
    reader.readAsText(file);
  };

  // 4b. Apply the restore
  const applyRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    setIsRestoring(true);
    try {
      const state = await localDB.importFullBackup(pending.text, mode);
      await onRestoreCompleted(state, mode);
      setPending(null);
      setStatus({ type: 'ok', text: ar ? 'تمت استعادة النسخة الاحتياطية بنجاح.' : 'Backup restored successfully.' });
    } catch (err) {
      console.error('Import error:', err);
      setStatus({ type: 'err', text: describeBackupError(err) });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleClearAll = async () => {
    if (!onClearAllData || clearWord.trim() !== CONFIRM_WORD) return;
    setIsClearing(true);
    try {
      // Safety net: always download a full backup before erasing anything
      const json = await localDB.exportFullBackup();
      downloadFile(json, 'application/json', `executive-planner-backup-before-clear-${getCairoDateString()}.json`);
      await onClearAllData();
      setClearWord('');
      setStatus({ type: 'ok', text: ar ? 'تم تفريغ قاعدة البيانات. تم تنزيل نسخة احتياطية قبل الحذف.' : 'Database cleared. A backup was downloaded first.' });
    } catch (err) {
      console.error('Clear error:', err);
      setStatus({ type: 'err', text: ar ? 'تعذر تفريغ قاعدة البيانات.' : 'The database could not be cleared.' });
    } finally {
      setIsClearing(false);
    }
  };

  const tile = (icon: React.ReactNode, title: string, sub: string, onClick: () => void, tone = 'bg-[#f5f5f7] hover:bg-[#e8e8ed] border-[#d2d2d7] text-[#1d1d1f]') => (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[84px] sm:min-h-[96px] p-3 rounded-2xl border text-start flex flex-col justify-between active:scale-[0.98] transition-all ${tone}`}
    >
      <span className="w-8 h-8 rounded-xl bg-white/80 flex items-center justify-center text-[#0071e3]">{icon}</span>
      <span>
        <span className="block text-[13px] font-bold leading-tight">{title}</span>
        <span className="block text-[11px] text-[#6e6e73] font-normal leading-tight mt-0.5">{sub}</span>
      </span>
    </button>
  );

  const viewTitle =
    view === 'planner'
      ? ar ? 'استيراد الدفتر القديم (PDF)' : 'Import old notebook (PDF)'
      : view === 'restore'
      ? ar ? 'استعادة نسخة احتياطية' : 'Restore a backup'
      : view === 'erase'
      ? ar ? 'تفريغ كل البيانات' : 'Erase all data'
      : ar ? 'النسخ والاستيراد' : 'Backup & import';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-150">
      <div
        className="bg-white/95 text-[#1d1d1f] rounded-3xl p-4 sm:p-5 max-w-xl w-full max-h-[calc(100dvh-1rem)] flex flex-col gap-3 shadow-2xl border border-[#d2d2d7] backdrop-blur-2xl"
        dir={ar ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {view !== 'home' ? (
              <button
                type="button"
                onClick={() => setView('home')}
                className="shrink-0 min-h-10 ps-1.5 pe-3 inline-flex items-center gap-1 rounded-xl bg-[#f5f5f7] text-xs font-bold text-[#0071e3]"
                aria-label={ar ? 'رجوع' : 'Back'}
              >
                <ChevronLeft className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
                {ar ? 'رجوع' : 'Back'}
              </button>
            ) : (
              <div className="p-2 bg-blue-50 text-[#0071e3] rounded-xl border border-blue-200 shrink-0">
                <Database className="w-4 h-4" />
              </div>
            )}
            <h3 className="text-sm sm:text-base font-bold truncate">{viewTitle}</h3>
          </div>
          <button onClick={onClose} className="shrink-0 w-10 h-10 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] rounded-full hover:bg-black/5 transition-colors" aria-label={ar ? 'إغلاق' : 'Close'}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {status && (
          <div
            role="status"
            className={`shrink-0 p-2.5 rounded-2xl text-xs flex items-center gap-2 ${
              status.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {status.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="min-w-0">{status.text}</span>
          </div>
        )}

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {view === 'home' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {tile(<Printer className="w-4 h-4" />, t.exportPdf, 'HTML / PDF', handlePrintHTML)}
              {tile(<FileSpreadsheet className="w-4 h-4" />, t.exportCsv, 'CSV / Excel', handleExportCSV)}
              {tile(<Download className="w-4 h-4" />, t.backupJson, ar ? 'المهام + الحبر + الصفحات' : 'Tasks + ink + pages', handleFullJSONBackup)}
              {onImportPlannerPages && tile(<BookOpen className="w-4 h-4" />, ar ? 'استيراد الدفتر القديم' : 'Import old notebook', ar ? 'ملف PDF من GoodNotes' : 'PDF from GoodNotes', () => setView('planner'), 'bg-blue-50/60 hover:bg-blue-50 border-blue-200 text-[#1d1d1f]')}
              {tile(<RotateCcw className="w-4 h-4" />, ar ? 'استعادة نسخة' : 'Restore backup', ar ? 'من ملف JSON' : 'From a JSON file', () => setView('restore'), 'bg-blue-50/60 hover:bg-blue-50 border-blue-200 text-[#1d1d1f]')}
              {onClearAllData && tile(<Trash2 className="w-4 h-4 text-rose-600" />, ar ? 'تفريغ كل البيانات' : 'Erase all data', ar ? 'مع نسخة احتياطية أولاً' : 'Backup is saved first', () => setView('erase'), 'bg-rose-50/70 hover:bg-rose-50 border-rose-200 text-rose-900')}
            </div>
          )}

          {view === 'planner' && onImportPlannerPages && <PlannerImport locale={locale} onImport={onImportPlannerPages} />}

          {view === 'restore' && (
            <div className="p-3.5 bg-blue-50/50 rounded-2xl border border-blue-200 text-xs space-y-2.5">
              <p className="text-[11px] text-[#515154]">{ar ? 'اختر ملف النسخة الاحتياطية (JSON) الذي حفظته سابقاً.' : 'Choose a backup file (JSON) you saved earlier.'}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreFile}
                disabled={isRestoring}
                className="text-xs file:me-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#0071e3] file:text-white hover:file:bg-[#0062c4] file:cursor-pointer w-full"
              />
              {pending && (
                <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-2">
                  <p className="font-semibold text-stone-800 break-all">{pending.fileName}</p>
                  <p className="text-[11px] text-stone-600">{pending.counts.map(([k, n]) => `${k}: ${n}`).join(' · ')}</p>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    {ar
                      ? 'الاستبدال: تصبح بيانات الملف هي النسخة المعتمدة وتُحذف أي سجلات غير موجودة فيه. الدمج: يضيف سجلات الملف ويحدّث المتطابق دون حذف أي شيء.'
                      : "Replace: the file becomes the workspace and anything not in it is removed. Merge: adds the file's records and updates matching ones, removing nothing."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyRestore('merge')} disabled={isRestoring} className="min-h-10 px-4 bg-[#0071e3] hover:bg-[#0062c4] disabled:opacity-50 text-white rounded-xl font-bold">
                      {ar ? 'دمج (موصى به)' : 'Merge (recommended)'}
                    </button>
                    <button onClick={() => applyRestore('replace')} disabled={isRestoring} className="min-h-10 px-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-bold">
                      {ar ? 'استبدال كل البيانات' : 'Replace everything'}
                    </button>
                    <button onClick={() => setPending(null)} disabled={isRestoring} className="min-h-10 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-semibold">
                      {t.cancel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'erase' && onClearAllData && (
            <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-200 text-xs space-y-2.5">
              <p className="text-[11px] text-rose-700 leading-relaxed">
                {ar
                  ? 'يحذف نهائياً كل المهام والاجتماعات والمفكرات والأشخاص والمشاريع من هذا الجهاز ومن السحابة. يتم تنزيل نسخة احتياطية تلقائياً أولاً.'
                  : 'Permanently deletes all tasks, meetings, notebooks, people and projects from this device and the cloud. A backup file is downloaded automatically first.'}
              </p>
              <label className="block text-[11px] text-rose-800">
                {ar ? `اكتب "${CONFIRM_WORD}" للتأكيد` : `Type "${CONFIRM_WORD}" to confirm`}
                <input type="text" value={clearWord} onChange={(ev) => setClearWord(ev.target.value)} className="mt-1 w-full min-h-10 px-3 rounded-xl border border-rose-300 bg-white text-sm focus:outline-none" autoComplete="off" />
              </label>
              <button
                onClick={handleClearAll}
                disabled={isClearing || clearWord.trim() !== CONFIRM_WORD}
                className="w-full min-h-11 px-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2"
              >
                {isClearing ? (ar ? 'جارٍ التفريغ...' : 'Erasing...') : ar ? 'تنزيل نسخة احتياطية وحذف كل البيانات' : 'Download backup & erase all data'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
