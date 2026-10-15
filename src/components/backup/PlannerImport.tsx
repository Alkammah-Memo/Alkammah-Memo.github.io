import React, { useRef, useState } from 'react';
import { BookOpen, Loader2, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Locale } from '../../lib/translations';
import type { PlannerImportPage } from '../../types';
import { openPlannerPdf, scanPlannerPages, renderPlannerPages } from '../../lib/pdfImport';
import type { PlannerPdf, ScannedPage } from '../../lib/pdfImport';

interface PlannerImportProps {
  locale: Locale;
  onImport: (notebookTitle: string, pages: PlannerImportPage[]) => Promise<void>;
}

type Phase = 'idle' | 'scanning' | 'ready' | 'importing' | 'done' | 'error';

/** Imports a PDF planner (for example a GoodNotes export) as notebook pages. Everything happens on this device. */
export const PlannerImport: React.FC<PlannerImportProps> = ({ locale, onImport }) => {
  const ar = locale === 'ar';
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pdf, setPdf] = useState<PlannerPdf | null>(null);
  const [scanned, setScanned] = useState<ScannedPage[]>([]);
  const [mode, setMode] = useState<'writing' | 'all'>('writing');
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [message, setMessage] = useState('');

  const writingPages = scanned.filter((p) => p.hasWriting);
  const selected = mode === 'writing' ? writingPages : scanned;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPhase('scanning');
    setMessage('');
    setProgress({ done: 0, total: 0 });
    try {
      const opened = await openPlannerPdf(file);
      setPdf(opened);
      const base = file.name.replace(/\.pdf$/i, '').trim();
      setTitle(`${base.includes(String(opened.year)) ? base : `${opened.year} ${base}`} (${ar ? 'أرشيف' : 'archive'})`.slice(0, 80));
      const pages = await scanPlannerPages(opened, (done, total) => setProgress({ done, total }));
      setScanned(pages);
      setPhase('ready');
    } catch (err) {
      setPhase('error');
      setMessage((err as Error)?.message || String(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!pdf || selected.length === 0) return;
    setPhase('importing');
    setProgress({ done: 0, total: selected.length });
    try {
      const pages = await renderPlannerPages(
        pdf,
        selected.map((p) => p.pageNumber),
        (done, total) => setProgress({ done, total })
      );
      await onImport(title.trim() || 'Planner archive', pages);
      setPhase('done');
      setMessage(
        ar
          ? `تم استيراد ${pages.length} صفحة إلى دفتر "${title.trim()}". يمكنك الكتابة فوقها كما في GoodNotes.`
          : `Imported ${pages.length} pages into the notebook "${title.trim()}". You can keep writing on them, just like in GoodNotes.`
      );
    } catch (err) {
      setPhase('error');
      setMessage((err as Error)?.message || String(err));
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-[#d2d2d7] bg-white space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-[#0071e3] to-[#7928ca] text-white flex items-center justify-center">
          <BookOpen className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-[#1d1d1f]">{ar ? 'استيراد المخطط (PDF)' : 'Import planner PDF'}</div>
          <p className="text-xs text-[#515154] mt-0.5">
            {ar
              ? 'استورد دفتر GoodNotes القديم كصفحات يمكن الكتابة فوقها. تتم المعالجة على هذا الجهاز فقط.'
              : 'Bring your old GoodNotes planner in as pages you can keep writing on. Processing happens on this device only.'}
          </p>
        </div>
      </div>

      {(phase === 'idle' || phase === 'error' || phase === 'done') && (
        <label className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl bg-[#0071e3] hover:bg-[#0062c4] text-white text-xs font-bold cursor-pointer transition-colors">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void handleFile(e.target.files?.[0])} />
          {ar ? 'اختر ملف PDF' : 'Choose PDF file'}
        </label>
      )}

      {phase === 'scanning' && (
        <div className="flex items-center gap-2 text-xs text-[#515154]" aria-live="polite">
          <Loader2 className="w-4 h-4 animate-spin text-[#0071e3]" />
          {ar ? 'جارٍ فحص الصفحات بحثاً عن الكتابة اليدوية…' : 'Scanning pages for handwriting…'}
          {progress.total > 0 && <span className="font-mono">{progress.done}/{progress.total}</span>}
        </div>
      )}

      {phase === 'ready' && pdf && (
        <div className="space-y-3">
          <div className="text-xs text-[#1d1d1f]">
            {ar
              ? `${pdf.pageCount} صفحة، منها ${writingPages.length} تحتوي على كتابة يدوية.`
              : `${pdf.pageCount} pages, ${writingPages.length} of them contain handwriting.`}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['writing', ar ? `الصفحات المكتوبة فقط (${writingPages.length})` : `Pages with writing only (${writingPages.length})`],
                ['all', ar ? `كل الصفحات (${scanned.length})` : `All pages (${scanned.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`min-h-10 px-3.5 rounded-xl border text-xs font-semibold transition-colors ${
                  mode === value ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-xs font-semibold text-[#515154]">
            {ar ? 'اسم الدفتر' : 'Notebook name'}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-[#d2d2d7] bg-white text-sm outline-none focus:border-[#0071e3]"
            />
          </label>
          {mode === 'all' && selected.length > 120 && (
            <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {ar ? 'استيراد كل الصفحات قد يستغرق وقتاً طويلاً ويستهلك مساحة كبيرة.' : 'Importing every page is slow and uses a lot of storage.'}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={selected.length === 0}
            className="min-h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40 transition-colors"
          >
            {ar ? `استيراد ${selected.length} صفحة` : `Import ${selected.length} pages`}
          </button>
        </div>
      )}

      {phase === 'importing' && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center gap-2 text-xs text-[#515154]">
            <Loader2 className="w-4 h-4 animate-spin text-[#0071e3]" />
            {ar ? 'جارٍ تجهيز الصفحات…' : 'Preparing pages…'}
            <span className="font-mono">{progress.done}/{progress.total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#ececf0] overflow-hidden">
            <div className="h-full bg-[#0071e3] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <p className="text-xs text-emerald-700 flex items-start gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {message}
        </p>
      )}
      {phase === 'error' && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {message}
        </p>
      )}

      <p className="text-[11px] text-stone-500 flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {ar ? 'لا يُرفع الملف إلى أي خادم. تُحفظ الصفحات فقط في حسابك الخاص.' : 'The file is never uploaded anywhere. Only the resulting pages are saved, privately, in your own account.'}
      </p>
    </div>
  );
};
