import React, { useState, useEffect, useCallback, useRef } from 'react';
import { extractInkCandidates } from '../../lib/ai/gemini';
import {
  Notebook,
  NotebookPage,
  Task,
  InkStroke,
  ExtractedCandidate,
  PageVersion,
  CanvasTextItem,
  PaperStyle,
  PaperColor,
} from '../../types';
import { Locale, translations } from '../../lib/translations';
import { NotebookCanvas } from './NotebookCanvas';
import { INITIAL_WORKSTREAMS } from '../../lib/referenceData';
import { getCairoDateString } from '../../lib/cairoTime';
import {
  addDays,
  addMonths,
  dayTitle,
  findPageForDate,
  isPlannerDay,
  isPlannerMonth,
  monthOf,
  monthTitle,
  weekdayName,
  dayOfWeek,
} from '../../lib/planner';
import type { PlannerPageRequest } from '../../lib/planner';
import { PLANNER_CANVAS } from '../../lib/planner';
import {
  BookOpen,
  FileText,
  Columns,
  Sparkles,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Plus,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Building2,
  User,
  Clock,
  Maximize2,
  Minimize2,
  EyeOff,
  PenLine,
  Calendar,
  Trash2,
  RectangleHorizontal,
  RectangleVertical,
  MapPin,
  Users,
  RefreshCw,
  Loader2,
  Wand2,
  CalendarDays,
  CalendarRange,
  ListChecks,
  NotebookPen,
  FileText as FileTextIcon,
  ChevronDown,
} from 'lucide-react';

interface NotebookViewProps {
  notebooks: Notebook[];
  pages: NotebookPage[];
  tasks: Task[];
  activeNotebookId: string;
  activePageId: string;
  locale: Locale;
  isFullScreenPaper?: boolean;
  onToggleFullScreenPaper?: () => void;
  onSelectNotebook: (id: string) => void;
  onSelectPage: (id: string) => void;
  onUpdateStrokes: (pageId: string, strokes: InkStroke[]) => void;
  onUpdatePageData?: (
    pageId: string,
    data: {
      strokes?: InkStroke[];
      textNotes?: CanvasTextItem[];
      versions?: PageVersion[];
      title?: string;
      orientation?: 'landscape' | 'portrait';
      paperStyle?: PaperStyle;
      paperColor?: PaperColor;
    }
  ) => void;
  onAcceptCandidate: (candidate: ExtractedCandidate) => void;
  onOpenTaskModal: (task: Task) => void;
  onNewPage: (notebookId: string) => void;
  /** Opens (creating on demand) a planner page: daily / monthly / to-do list / minutes of meeting */
  onOpenPlanner?: (req: PlannerPageRequest) => void | Promise<void>;
  onDeletePage?: (pageId: string) => void;
}

export const NotebookView: React.FC<NotebookViewProps> = ({
  notebooks,
  pages,
  tasks,
  activeNotebookId,
  activePageId,
  locale,
  isFullScreenPaper,
  onToggleFullScreenPaper,
  onSelectNotebook,
  onSelectPage,
  onUpdateStrokes,
  onUpdatePageData,
  onAcceptCandidate,
  onOpenTaskModal,
  onNewPage,
  onOpenPlanner,
  onDeletePage,
}) => {
  const t = translations[locale];
  const [viewMode, setViewMode] = useState<'handwritten' | 'structured' | 'split'>('handwritten');
  const [extracting, setExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string>('');
  const [candidates, setCandidates] = useState<ExtractedCandidate[]>([]);
  const [showReviewDrawer, setShowReviewDrawer] = useState<boolean>(false);

  // Development-only visual QA hook: lets layout be inspected without calling the AI (stripped from production builds)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      const raw = localStorage.getItem('qa_candidates');
      if (raw) {
        setCandidates(JSON.parse(raw));
        setShowReviewDrawer(true);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [showDeletePageConfirm, setShowDeletePageConfirm] = useState<boolean>(false);
  // "Hide tools": removes every bar above the paper so there is room to write (remembered on this device)
  const [toolsHidden, setToolsHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('alkammah_tools_hidden') === '1';
    } catch {
      return false;
    }
  });
  const toggleTools = () =>
    setToolsHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('alkammah_tools_hidden', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });

  // When full screen paper is enabled, default to handwritten view
  useEffect(() => {
    if (isFullScreenPaper) {
      setViewMode('handwritten');
    }
  }, [isFullScreenPaper]);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId) || notebooks[0];
  const notebookPages = pages
    .filter((p) => p.notebookId === (activeNotebook?.id || ''))
    .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
  const extractionSeq = useRef(0);
  const activePage = pages.find((p) => p.id === activePageId) || notebookPages[0] || pages[0];

  // ---------------------------------------------------------------------------------------------
  // Planner navigation: Today, day and month steppers, and the "+ Page" menu
  // ---------------------------------------------------------------------------------------------
  const ar = locale === 'ar';
  const [navDay, setNavDay] = useState<string>(() => getCairoDateString());
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [plannerPrompt, setPlannerPrompt] = useState<null | 'todo' | 'mom'>(null);
  const [promptText, setPromptText] = useState('');
  const [promptDate, setPromptDate] = useState('');
  const plannerBusy = useRef(false);

  useEffect(() => {
    const d = activePage?.plannerDate;
    if (isPlannerDay(d)) setNavDay(d);
    else if (isPlannerMonth(d)) setNavDay((prev) => (monthOf(prev) === d ? prev : `${d}-01`));
  }, [activePage?.plannerDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPlanner = async (req: PlannerPageRequest) => {
    if (!onOpenPlanner || plannerBusy.current) return;
    plannerBusy.current = true;
    try {
      await onOpenPlanner(req);
    } finally {
      plannerBusy.current = false;
    }
  };
  const goDay = (date: string) => {
    setNavDay(date);
    void openPlanner({ kind: 'daily', date });
  };
  const goMonth = (month: string) => {
    const cur = monthOf(navDay);
    const nextDay = month === cur ? navDay : `${month}-01`;
    setNavDay(nextDay);
    void openPlanner({ kind: 'monthly', month });
  };
  const todayStr = getCairoDateString();
  const dayExists = !!findPageForDate(pages, navDay, 'day');
  const navDayLabel = `${ar ? weekdayName(dayOfWeek(navDay), 'ar') : weekdayName(dayOfWeek(navDay), 'en').slice(0, 3)} · ${dayTitle(navDay, ar ? 'ar' : 'en')}`;

  const submitPrompt = () => {
    if (plannerPrompt === 'todo') {
      const title = promptText.trim();
      if (!title) return;
      void openPlanner({ kind: 'todo', title });
    } else if (plannerPrompt === 'mom') {
      void openPlanner({ kind: 'mom', date: isPlannerDay(promptDate) ? promptDate : todayStr });
    }
    setPlannerPrompt(null);
  };

  const pageOptionLabel = (p: NotebookPage) => {
    const title = p.title || (ar ? 'صفحة' : 'Page');
    // imported pages carry their date; daily/monthly/MoM titles already say it
    return p.template === 'planner_archive' && p.plannerDate && !title.includes(p.plannerDate) ? `${title} · ${p.plannerDate}` : title;
  };

  // Tasks linked to this page
  const linkedTasks = tasks.filter(
    (t) => activePage?.linkedTaskIds?.includes(t.id) || t.sourceRef?.pageId === activePage?.id
  );


  // ---------------------------------------------------------------------------------------------
  // Live structuring (split view): after the writer pauses, the page is read by Gemini and the detected
  // tasks and meetings appear in the structured panel without pressing anything.
  // ---------------------------------------------------------------------------------------------
  type LiveStatus = 'idle' | 'waiting' | 'analyzing' | 'done' | 'error';
  const [autoAnalyze, setAutoAnalyze] = useState<boolean>(() => {
    try {
      return localStorage.getItem('alkammah_auto_analyze') !== 'off';
    } catch {
      return true;
    }
  });
  const [liveItems, setLiveItems] = useState<ExtractedCandidate[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');
  const [liveError, setLiveError] = useState<string>('');
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string>('');
  const [handledKeys, setHandledKeys] = useState<Record<string, string[]>>({});
  const snapshotFnRef = useRef<(() => { dataUrl: string; box: { x: number; y: number; width: number; height: number } } | null) | null>(null);
  const registerSnapshot = useCallback(
    (fn: (() => { dataUrl: string; box: { x: number; y: number; width: number; height: number } } | null) | null) => {
      snapshotFnRef.current = fn;
    },
    []
  );
  const liveToken = useRef(0);
  const liveCache = useRef<Record<string, { sig: string; items: ExtractedCandidate[]; at: string }>>({});

  const candidateKey = (c: ExtractedCandidate) =>
    `${c.entryType === 'meeting' ? 'm' : 't'}|${(c.suggestedTitle || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${
      c.entryType === 'meeting' ? c.suggestedMeetingDate || '' : c.suggestedDueDate || ''
    }`;

  const markHandled = (c: ExtractedCandidate) => {
    const pid = c.pageId;
    setHandledKeys((prev) => ({ ...prev, [pid]: [...(prev[pid] || []), candidateKey(c)] }));
  };

  const pageSignature = activePage
    ? `${activePage.strokes.length}:${activePage.strokes[activePage.strokes.length - 1]?.id || ''}:${(activePage.textNotes || [])
        .map((n) => n.text)
        .join('|')}`
    : '';

  const analyzeLive = useCallback(
    async (sig: string) => {
      if (!activePage) return;
      const pid = activePage.id;
      const snap = snapshotFnRef.current?.();
      if (!snap) {
        liveCache.current[pid] = { sig, items: [], at: '' };
        setLiveItems([]);
        setLiveStatus('idle');
        return;
      }
      const token = ++liveToken.current;
      setLiveStatus('analyzing');
      setLiveError('');
      try {
        const found = await extractInkCandidates(snap.dataUrl, pid, snap.box);
        if (token !== liveToken.current) return;
        const at = new Date().toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Cairo',
        });
        liveCache.current[pid] = { sig, items: found, at };
        setLiveItems(found);
        setLiveUpdatedAt(at);
        setLiveStatus('done');
      } catch (err) {
        if (token !== liveToken.current) return;
        const noKeys = (err as Error)?.name === 'NoKeysConfiguredError';
        setLiveError(
          noKeys
            ? locale === 'en'
              ? 'Add a Gemini key in Settings to read your handwriting automatically.'
              : 'أضف مفتاح Gemini من الإعدادات لقراءة خطك اليدوي تلقائياً.'
            : locale === 'en'
            ? 'All keys are busy right now. Retrying when you write again.'
            : 'كل المفاتيح مشغولة حالياً. ستُعاد المحاولة عند الكتابة مجدداً.'
        );
        setLiveStatus('error');
      }
    },
    [activePage?.id, locale] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Show cached results when switching pages; reset otherwise
  useEffect(() => {
    liveToken.current++;
    const cached = activePage ? liveCache.current[activePage.id] : undefined;
    setLiveItems(cached?.items || []);
    setLiveUpdatedAt(cached?.at || '');
    setLiveStatus(cached?.items?.length ? 'done' : 'idle');
    setLiveError('');
    // Development-only visual QA hook (stripped from production builds)
    if (import.meta.env.DEV) {
      try {
        const raw = localStorage.getItem('qa_live');
        if (raw) {
          const items = JSON.parse(raw);
          if (activePage) liveCache.current[activePage.id] = { sig: pageSignature, items, at: '14:05' };
          setLiveItems(items);
          setLiveStatus('done');
          setLiveUpdatedAt('14:05');
        }
      } catch {
        /* ignore */
      }
    }
  }, [activePage?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-analysis (only in split view, only when the content really changed)
  useEffect(() => {
    if (viewMode !== 'split' || !autoAnalyze || !activePage) return;
    if (liveCache.current[activePage.id]?.sig === pageSignature) return;
    setLiveStatus((s) => (s === 'analyzing' ? s : 'waiting'));
    const timer = setTimeout(() => void analyzeLive(pageSignature), 4500);
    return () => clearTimeout(timer);
  }, [pageSignature, viewMode, autoAnalyze, activePage?.id, analyzeLive]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleLiveItems = liveItems.filter((c) => {
    const key = candidateKey(c);
    if ((handledKeys[c.pageId] || []).includes(key)) return false;
    const title = (c.suggestedTitle || '').toLowerCase().trim();
    return !linkedTasks.some((t) => t.title.toLowerCase().trim() === title);
  });

  const acceptLive = (c: ExtractedCandidate) => {
    const finalized: ExtractedCandidate =
      c.entryType === 'meeting'
        ? { ...c, suggestedStartTime: c.suggestedStartTime || '10:00', suggestedEndTime: c.suggestedEndTime || '11:00' }
        : c;
    onAcceptCandidate(finalized);
    markHandled(c);
  };

  const editLive = (c: ExtractedCandidate) => {
    setCandidates([c]);
    setExtractError('');
    setShowReviewDrawer(true);
  };

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (!activePage) return;
      if (onUpdatePageData) {
        onUpdatePageData(activePage.id, { title: newTitle });
      }
    },
    [activePage?.id, onUpdatePageData]
  );

  const handleStrokesChange = useCallback(
    (strokes: InkStroke[], textNotes?: CanvasTextItem[], versions?: PageVersion[]) => {
      if (!activePage) return;
      if (onUpdatePageData) {
        onUpdatePageData(activePage.id, { strokes, textNotes, versions });
      } else {
        onUpdateStrokes(activePage.id, strokes);
      }
    },
    [activePage?.id, onUpdatePageData, onUpdateStrokes]
  );

  // Trigger Gemini Multimodal Extraction
  const handleExtractRegion = async (
    imageBase64: string,
    boundingBox: { x: number; y: number; width: number; height: number }
  ) => {
    const seq = ++extractionSeq.current;
    setExtracting(true);
    setExtractError('');
    setShowReviewDrawer(true);
    try {
      const found = await extractInkCandidates(imageBase64, activePage?.id || '', boundingBox);
      if (seq !== extractionSeq.current) return; // a newer extraction superseded this one
      setCandidates(found);
      if (found.length === 0) {
        setExtractError(
          locale === 'en'
            ? 'No tasks or meetings were recognized in this selection. Try selecting the writing more tightly.'
            : 'لم يتم التعرف على مهام أو اجتماعات في هذا التحديد. جرّب تحديد الكتابة بشكل أدق.'
        );
      }
    } catch (err) {
      if (seq !== extractionSeq.current) return;
      // Never invent placeholder tasks: surface the real problem instead
      console.error('Extraction error:', err);
      setCandidates([]);
      const noKeys = (err as Error)?.name === 'NoKeysConfiguredError';
      setExtractError(
        noKeys
          ? locale === 'en'
            ? 'Add a Gemini API key in Settings to enable handwriting recognition.'
            : 'أضف مفتاح Gemini من الإعدادات لتفعيل قراءة الخط اليدوي.'
          : locale === 'en'
          ? 'Could not read the handwriting: all Gemini keys are busy or rate-limited. Please try again in a moment.'
          : 'تعذرت قراءة الخط: كل مفاتيح Gemini مشغولة أو وصلت للحد. حاول مرة أخرى بعد لحظات.'
      );
    } finally {
      if (seq === extractionSeq.current) setExtracting(false);
    }
  };

  const handleCandidateFieldChange = (
    id: string,
    field: keyof ExtractedCandidate,
    val: unknown
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  const handleAcceptItem = (candidate: ExtractedCandidate) => {
    // Save exactly what the review form displays (it shows 10:00-11:00 when the fields are empty)
    const finalized: ExtractedCandidate =
      candidate.entryType === 'meeting'
        ? {
            ...candidate,
            suggestedStartTime: candidate.suggestedStartTime || '10:00',
            suggestedEndTime: candidate.suggestedEndTime || '11:00',
          }
        : candidate;
    onAcceptCandidate(finalized);
    markHandled(candidate);
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
    if (candidates.length <= 1) {
      setShowReviewDrawer(false);
    }
  };

  const handleRejectItem = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    if (candidates.length <= 1) {
      setShowReviewDrawer(false);
    }
  };

  return (
    <div className={`flex flex-col ${isFullScreenPaper ? 'h-[100dvh]' : 'h-full'} overflow-hidden bg-[#f5f5f7]`}>
      {/* Top Notebook Sub-header */}
      <div className={`${toolsHidden ? 'hidden' : ''} bg-white/90 backdrop-blur-xl text-[#1d1d1f] px-3 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[#d2d2d7] shrink-0`}>
        {/* Notebook & Page Selector */}
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          <BookOpen className="w-4 h-4 text-[#0071e3]" />
          <select
            value={activeNotebook?.id}
            onChange={(e) => {
              onSelectNotebook(e.target.value);
              const firstP = pages.find((p) => p.notebookId === e.target.value);
              if (firstP) onSelectPage(firstP.id);
            }}
            className="bg-[#f5f5f7] text-xs font-semibold text-[#1d1d1f] px-3 py-1.5 rounded-lg border border-[#d2d2d7] focus:outline-none focus:border-[#0071e3] min-w-0 max-w-[38vw] sm:max-w-none truncate"
          >
            {notebooks.map((nb) => (
              <option key={nb.id} value={nb.id}>
                {nb.title} ({pages.filter((p) => p.notebookId === nb.id).length}p)
              </option>
            ))}
          </select>

          {/* Page Selector: title + date, with previous/next */}
          <div className="flex items-center gap-0.5 bg-[#f5f5f7] px-1 rounded-lg border border-[#d2d2d7] text-xs min-w-0">
            <button
              onClick={() => {
                const curIdx = notebookPages.findIndex((p) => p.id === activePage?.id);
                if (curIdx > 0) onSelectPage(notebookPages[curIdx - 1].id);
              }}
              className="w-9 h-9 flex items-center justify-center hover:text-[#0071e3]"
              title={locale === 'ar' ? 'الصفحة السابقة' : 'Previous Page'}
              aria-label={locale === 'ar' ? 'الصفحة السابقة' : 'Previous Page'}
            >
              <ChevronLeft className={`w-4 h-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />
            </button>
            <select
              value={activePage?.id || ''}
              onChange={(e) => onSelectPage(e.target.value)}
              aria-label={locale === 'ar' ? 'اختيار الصفحة' : 'Choose page'}
              className="bg-transparent text-xs font-semibold text-[#1d1d1f] h-9 max-w-[26vw] sm:max-w-[200px] min-w-0 truncate focus:outline-none"
            >
              {notebookPages.map((p, idx) => (
                <option key={p.id} value={p.id}>
                  {idx + 1}. {pageOptionLabel(p)}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const curIdx = notebookPages.findIndex((p) => p.id === activePage?.id);
                if (curIdx < notebookPages.length - 1) onSelectPage(notebookPages[curIdx + 1].id);
              }}
              className="w-9 h-9 flex items-center justify-center hover:text-[#0071e3]"
              title={locale === 'ar' ? 'الصفحة التالية' : 'Next Page'}
              aria-label={locale === 'ar' ? 'الصفحة التالية' : 'Next Page'}
            >
              <ChevronRight className={`w-4 h-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Orientation Toggle in sub-header */}
          {!(activePage?.canvasSize || (activePage?.template && activePage.template.startsWith('planner_'))) && (
          <button
            onClick={() => {
              if (!activePage) return;
              const nextOri = activePage.orientation === 'portrait' ? 'landscape' : 'portrait';
              if (onUpdatePageData) {
                onUpdatePageData(activePage.id, { orientation: nextOri });
              }
            }}
            className="flex items-center gap-1.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-xs font-semibold text-[#1d1d1f] px-2.5 py-1.5 rounded-lg border border-[#d2d2d7] transition-colors"
            title={activePage?.orientation === 'portrait' ? 'Switch to Landscape paper' : 'Switch to Portrait paper'}
          >
            {activePage?.orientation === 'portrait' ? (
              <>
                <RectangleVertical className="w-3.5 h-3.5 text-[#0071e3]" />
                <span className="hidden md:inline">{locale === 'ar' ? 'رأسي' : 'Portrait'}</span>
              </>
            ) : (
              <>
                <RectangleHorizontal className="w-3.5 h-3.5 text-[#0071e3]" />
                <span className="hidden md:inline">{locale === 'ar' ? 'أفقي (عريض)' : 'Landscape'}</span>
              </>
            )}
          </button>
          )}

          {/* Delete Page Button in sub-header */}
          {onDeletePage && activePage && (
            <button
              onClick={() => setShowDeletePageConfirm(true)}
              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
              title={locale === 'ar' ? 'حذف هذه الصفحة' : 'Delete Page'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right side controls: Full Screen Toggle + View Mode Switcher */}
        <div className="flex items-center gap-2">
          {onToggleFullScreenPaper && (
            <button
              onClick={onToggleFullScreenPaper}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isFullScreenPaper
                  ? 'bg-[#0071e3] text-white font-bold shadow-xs'
                  : 'bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] border border-[#d2d2d7]'
              }`}
              title={isFullScreenPaper ? t.showBars : t.hideBars}
            >
              {isFullScreenPaper ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {isFullScreenPaper ? (locale === 'ar' ? 'إظهار الأشرطة' : 'Show Bars') : (locale === 'ar' ? 'شاشة كاملة للورقة' : 'Full Paper View')}
              </span>
            </button>
          )}

          {/* View Mode Switcher: Handwritten | Structured | Split (Apple Light Glass Theme) */}
          <div className="flex items-center gap-1 bg-[#f5f5f7] p-1 rounded-xl border border-[#d2d2d7]">
            <button
              onClick={() => setViewMode('handwritten')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'handwritten'
                  ? 'bg-white text-[#0071e3] font-bold shadow-xs'
                  : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.handwrittenView}</span>
            </button>
            <button
              onClick={() => setViewMode('structured')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'structured'
                  ? 'bg-white text-[#0071e3] font-bold shadow-xs'
                  : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.structuredView}</span>
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'split'
                  ? 'bg-white text-[#0071e3] font-bold shadow-xs'
                  : 'text-[#515154] hover:text-[#1d1d1f]'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.splitView}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Planner bar: Today, day/month steppers and the "+ Page" menu (opens or creates pages on demand) */}
      {onOpenPlanner && !toolsHidden && (
        <div className="relative z-40 bg-white/90 backdrop-blur-xl px-3 sm:px-4 py-1 sm:py-1.5 flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 border-b border-[#d2d2d7] shrink-0">
          <button
            type="button"
            onClick={() => goDay(todayStr)}
            className="min-h-11 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-[#0071e3] hover:bg-[#0062c4] active:scale-[0.98] text-white text-sm font-bold shadow-xs transition-all"
            title={ar ? 'صفحة اليوم' : "Open today's page"}
          >
            <CalendarDays className="w-4 h-4" />
            {ar ? 'اليوم' : 'Today'}
          </button>

          {/* Day stepper */}
          <div className="flex items-center rounded-xl border border-[#d2d2d7] bg-[#f5f5f7] min-w-0 flex-1 sm:flex-none" role="group" aria-label={ar ? 'التنقل بين الأيام' : 'Day navigation'}>
            <button
              type="button"
              onClick={() => goDay(addDays(navDay, -1))}
              className="w-10 sm:w-11 h-11 shrink-0 flex items-center justify-center hover:text-[#0071e3] rounded-s-xl"
              title={ar ? 'اليوم السابق' : 'Previous day'}
              aria-label={ar ? 'اليوم السابق' : 'Previous day'}
            >
              <ChevronLeft className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => goDay(navDay)}
              className={`min-h-11 min-w-0 flex-1 sm:flex-none sm:min-w-[9.5rem] px-1 sm:px-2 text-sm font-semibold truncate ${dayExists ? 'text-[#1d1d1f]' : 'text-[#515154]'} hover:text-[#0071e3]`}
              title={ar ? 'فتح صفحة هذا اليوم' : 'Open this day'}
            >
              {navDayLabel}
            </button>
            <button
              type="button"
              onClick={() => goDay(addDays(navDay, 1))}
              className="w-10 sm:w-11 h-11 shrink-0 flex items-center justify-center hover:text-[#0071e3] rounded-e-xl"
              title={ar ? 'اليوم التالي' : 'Next day'}
              aria-label={ar ? 'اليوم التالي' : 'Next day'}
            >
              <ChevronRight className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Month stepper */}
          <div className="max-sm:hidden flex items-center rounded-xl border border-[#d2d2d7] bg-[#f5f5f7]" role="group" aria-label={ar ? 'التنقل بين الشهور' : 'Month navigation'}>
            <button
              type="button"
              onClick={() => goMonth(addMonths(monthOf(navDay), -1))}
              className="w-11 h-11 flex items-center justify-center hover:text-[#0071e3] rounded-s-xl"
              title={ar ? 'الشهر السابق' : 'Previous month'}
              aria-label={ar ? 'الشهر السابق' : 'Previous month'}
            >
              <ChevronLeft className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => goMonth(monthOf(navDay))}
              className="min-h-11 min-w-[9.5rem] px-2 text-sm font-semibold text-[#1d1d1f] hover:text-[#0071e3] inline-flex items-center justify-center gap-1.5"
              title={ar ? 'فتح صفحة الشهر' : 'Open this month'}
            >
              <CalendarRange className="w-4 h-4 text-[#0071e3]" />
              {monthTitle(monthOf(navDay), ar ? 'ar' : 'en')}
            </button>
            <button
              type="button"
              onClick={() => goMonth(addMonths(monthOf(navDay), 1))}
              className="w-11 h-11 flex items-center justify-center hover:text-[#0071e3] rounded-e-xl"
              title={ar ? 'الشهر التالي' : 'Next month'}
              aria-label={ar ? 'الشهر التالي' : 'Next month'}
            >
              <ChevronRight className={`w-5 h-5 ${ar ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* + Page menu */}
          <div className="relative ms-auto">
            <button
              type="button"
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={addMenuOpen}
              className="min-h-11 px-3 sm:px-4 inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] text-sm font-semibold text-[#1d1d1f] shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4 text-[#0071e3]" />
              <span className="max-sm:sr-only">{ar ? 'صفحة' : 'Page'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#86868b]" />
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} aria-hidden="true" />
                <div role="menu" className="absolute z-50 end-0 top-full mt-1.5 w-64 rounded-2xl bg-white border border-[#d2d2d7] shadow-2xl p-1.5">
                  {[
                    {
                      key: 'daily',
                      icon: <CalendarDays className="w-4 h-4 text-[#0071e3]" />,
                      label: ar ? 'صفحة يومية' : 'Daily page',
                      sub: dayTitle(navDay, ar ? 'ar' : 'en'),
                      run: () => goDay(navDay),
                    },
                    {
                      key: 'todo',
                      icon: <ListChecks className="w-4 h-4 text-[#0071e3]" />,
                      label: ar ? 'قائمة مهام' : 'To-do list',
                      sub: ar ? 'باسم مسار العمل' : 'named by workstream',
                      run: () => {
                        setPromptText('');
                        setPlannerPrompt('todo');
                      },
                    },
                    {
                      key: 'monthly',
                      icon: <CalendarRange className="w-4 h-4 text-[#0071e3]" />,
                      label: ar ? 'صفحة شهرية' : 'Monthly page',
                      sub: monthTitle(monthOf(navDay), ar ? 'ar' : 'en'),
                      run: () => goMonth(monthOf(navDay)),
                    },
                    {
                      key: 'mom',
                      icon: <NotebookPen className="w-4 h-4 text-[#0071e3]" />,
                      label: ar ? 'محضر اجتماع (MoM)' : 'Minutes of meeting (MoM)',
                      sub: ar ? 'مهمة | مسؤول | تاريخ' : 'Task | Owner | Due Date',
                      run: () => {
                        setPromptDate(todayStr);
                        setPlannerPrompt('mom');
                      },
                    },
                    {
                      key: 'blank',
                      icon: <FileTextIcon className="w-4 h-4 text-[#0071e3]" />,
                      label: ar ? 'صفحة سادة / مسطرة' : 'Blank / ruled',
                      sub: ar ? 'في هذه المفكرة' : 'in this notebook',
                      run: () => onNewPage(activeNotebook?.id || ''),
                    },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        item.run();
                      }}
                      className="w-full min-h-11 px-3 py-1.5 flex items-center gap-3 rounded-xl text-start hover:bg-[#f5f5f7] transition-colors"
                    >
                      {item.icon}
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-semibold text-[#1d1d1f]">{item.label}</span>
                        <span className="text-[11px] text-[#86868b]">{item.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main View Area */}
      <div className={`flex-1 flex overflow-hidden relative ${viewMode === 'split' ? 'flex-col lg:flex-row' : ''}`}>
        {/* Hide / show every tool bar so the paper gets the whole screen */}
        <button
          type="button"
          onClick={toggleTools}
          aria-pressed={toolsHidden}
          aria-label={toolsHidden ? (locale === 'ar' ? 'إظهار الأدوات' : 'Show tools') : (locale === 'ar' ? 'إخفاء الأدوات' : 'Hide tools')}
          title={toolsHidden ? (locale === 'ar' ? 'إظهار الأدوات' : 'Show tools') : (locale === 'ar' ? 'إخفاء الأدوات' : 'Hide tools')}
          className={`absolute z-30 bottom-3 ${locale === 'ar' ? 'right-3' : 'left-3'} h-11 min-w-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-full shadow-lg border text-xs font-bold active:scale-95 transition ${
            toolsHidden ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white/95 border-[#d2d2d7] text-[#1d1d1f]'
          }`}
        >
          {toolsHidden ? <PenLine className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span className={toolsHidden ? '' : 'hidden sm:inline'}>
            {toolsHidden ? (locale === 'ar' ? 'الأدوات' : 'Tools') : (locale === 'ar' ? 'إخفاء الأدوات' : 'Hide tools')}
          </span>
        </button>

        {/* Left / Primary Ink Canvas */}
        {(viewMode === 'handwritten' || viewMode === 'split') && (
          <div
            className={`overflow-hidden flex flex-col min-w-0 ${
              viewMode === 'split' ? 'w-full lg:w-1/2 h-1/2 lg:h-full border-b lg:border-b-0 lg:border-r border-stone-300 shrink-0 lg:shrink' : 'h-full w-full flex-1'
            }`}
          >
            {activePage && (
              <NotebookCanvas
                pageId={activePage.id}
                template={activePage.template}
                plannerDate={activePage.plannerDate}
                backgroundImage={activePage.backgroundImage}
                canvasSize={
                  activePage.canvasSize ||
                  (activePage.template.startsWith('planner_') && activePage.template !== 'planner_archive' ? PLANNER_CANVAS : undefined)
                }
                pageTitle={activePage.title}
                initialStrokes={activePage.strokes}
                initialTextNotes={activePage.textNotes || []}
                versions={activePage.versions || []}
                locale={locale}
                orientation={activePage.orientation || 'landscape'}
                paperStyle={activePage.paperStyle || 'ruled'}
                paperColor={activePage.paperColor || 'cream'}
                isFullScreenPaper={isFullScreenPaper}
                onToggleFullScreenPaper={onToggleFullScreenPaper}
                hideTools={toolsHidden}
                onOrientationChange={(newOri) => {
                  if (onUpdatePageData) {
                    onUpdatePageData(activePage.id, { orientation: newOri });
                  }
                }}
                onPaperStyleChange={(newStyle) => {
                  if (onUpdatePageData) {
                    onUpdatePageData(activePage.id, { paperStyle: newStyle });
                  }
                }}
                onPaperColorChange={(newColor) => {
                  if (onUpdatePageData) {
                    onUpdatePageData(activePage.id, { paperColor: newColor });
                  }
                }}
                onDeletePage={() => {
                  if (onDeletePage) onDeletePage(activePage.id);
                }}
                onTitleChange={handleTitleChange}
                onStrokesChange={handleStrokesChange}
                onExtractRegion={handleExtractRegion}
                registerSnapshot={registerSnapshot}
              />
            )}
          </div>
        )}

        {/* Right / Structured View */}
        {(viewMode === 'structured' || viewMode === 'split') && (
          <div
            className={`overflow-y-auto p-4 sm:p-6 bg-[#FAF8F5] ${
              viewMode === 'split' ? 'w-full lg:w-1/2 h-1/2 lg:h-full shrink-0 lg:shrink' : 'h-full w-full max-w-5xl mx-auto'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
                    <FileText className="w-4 h-4" />
                    <span>{locale === 'en' ? 'STRUCTURED SOURCE OF TRUTH' : 'سجل العمليات المنظم'}</span>
                  </div>
                  <h2 className="text-lg font-bold text-stone-900 mt-0.5">
                    {locale === 'en' ? 'Typed Actions for this Page' : 'المهام المسجلة المرتبطة بهذه الصفحة'}
                  </h2>
                </div>
                <span className="text-xs text-stone-500 font-mono">
                  {linkedTasks.length} {locale === 'en' ? 'linked tasks' : 'مهام مرتبطة'}
                </span>
              </div>

              {/* Live detection: handwriting is read automatically in split view and listed here */}
              <div className="rounded-2xl border border-[#d2d2d7] bg-white shadow-xs overflow-hidden">
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-gradient-to-r from-[#0071e3]/[0.06] to-[#7928ca]/[0.06]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#0071e3] to-[#7928ca] text-white flex items-center justify-center shadow-xs">
                      {liveStatus === 'analyzing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-900">
                        {locale === 'en' ? 'Detected from your handwriting' : 'تم التعرف عليه من خطك اليدوي'}
                      </div>
                      <div className="text-[11px] text-stone-500" aria-live="polite">
                        {viewMode !== 'split'
                          ? locale === 'en'
                            ? 'Switch to Split Screen to see this update as you write.'
                            : 'انتقل إلى العرض المقسّم لمشاهدة التحديث أثناء الكتابة.'
                          : !autoAnalyze
                          ? locale === 'en'
                            ? 'Automatic reading is off.'
                            : 'القراءة التلقائية متوقفة.'
                          : liveStatus === 'waiting'
                          ? locale === 'en'
                            ? 'Waiting for you to finish writing…'
                            : 'بانتظار انتهائك من الكتابة…'
                          : liveStatus === 'analyzing'
                          ? locale === 'en'
                            ? 'Reading your handwriting…'
                            : 'جارٍ قراءة خطك اليدوي…'
                          : liveStatus === 'done' && liveUpdatedAt
                          ? locale === 'en'
                            ? `Updated ${liveUpdatedAt} (Cairo)`
                            : `آخر تحديث ${liveUpdatedAt} (القاهرة)`
                          : locale === 'en'
                          ? 'Write on the left and tasks appear here automatically.'
                          : 'اكتب على اليسار وستظهر المهام هنا تلقائياً.'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => activePage && void analyzeLive(pageSignature)}
                      disabled={liveStatus === 'analyzing'}
                      className="min-h-9 px-3 inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#d2d2d7] text-xs font-semibold text-stone-800 hover:bg-[#f5f5f7] disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#0071e3]" />
                      {locale === 'en' ? 'Analyze now' : 'حلّل الآن'}
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoAnalyze}
                      onClick={() => {
                        const next = !autoAnalyze;
                        setAutoAnalyze(next);
                        try {
                          localStorage.setItem('alkammah_auto_analyze', next ? 'on' : 'off');
                        } catch {
                          /* ignore */
                        }
                      }}
                      className={`min-h-9 px-3 inline-flex items-center gap-2 rounded-xl border text-xs font-semibold transition-colors ${
                        autoAnalyze ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-[#d2d2d7] text-stone-700'
                      }`}
                      title={locale === 'en' ? 'Read the page automatically after you stop writing' : 'قراءة الصفحة تلقائياً بعد التوقف عن الكتابة'}
                    >
                      <span className={`w-2 h-2 rounded-full ${autoAnalyze ? 'bg-white' : 'bg-stone-400'}`} />
                      {locale === 'en' ? 'Auto' : 'تلقائي'}
                    </button>
                  </div>
                </div>

                {liveStatus === 'error' && liveError && (
                  <div className="mx-4 mt-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3">{liveError}</div>
                )}

                {visibleLiveItems.length === 0 ? (
                  liveStatus === 'done' && (
                    <p className="px-4 py-5 text-xs text-stone-500 text-center">
                      {locale === 'en'
                        ? 'No new tasks or meetings detected on this page.'
                        : 'لم يتم العثور على مهام أو اجتماعات جديدة في هذه الصفحة.'}
                    </p>
                  )
                ) : (
                  <ul className="p-3 space-y-2.5">
                    {visibleLiveItems.map((c) => {
                      const isMeeting = c.entryType === 'meeting';
                      return (
                        <li
                          key={c.id}
                          className={`rounded-xl border p-3 bg-white animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                            isMeeting ? 'border-sky-200' : 'border-emerald-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${
                                isMeeting ? 'bg-sky-50 text-[#0071e3]' : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {isMeeting ? <Calendar className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-semibold text-stone-500">
                                {isMeeting
                                  ? locale === 'en'
                                    ? 'Meeting'
                                    : 'اجتماع'
                                  : locale === 'en'
                                  ? 'Task'
                                  : 'مهمة'}
                                {isMeeting && c.suggestedMeetingDate
                                  ? ` · ${c.suggestedMeetingDate}${c.suggestedStartTime ? ` · ${c.suggestedStartTime}` : ''}`
                                  : !isMeeting && c.suggestedDueDate
                                  ? ` · ${locale === 'en' ? 'Due' : 'الاستحقاق'} ${c.suggestedDueDate}`
                                  : ''}
                              </div>
                              <div className="text-sm font-bold text-stone-900 break-words">{c.suggestedTitle}</div>
                              {c.suggestedOwnerAlias && c.suggestedOwnerAlias !== 'Unassigned' && (
                                <div className="text-[11px] text-stone-500 mt-0.5">{c.suggestedOwnerAlias}</div>
                              )}
                              {c.uncertainFields.length > 0 && (
                                <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  {locale === 'en' ? 'Please verify: ' : 'يرجى التحقق: '}
                                  {c.uncertainFields.join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => markHandled(c)}
                              className="min-h-9 px-3 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
                            >
                              {locale === 'en' ? 'Dismiss' : 'تجاهل'}
                            </button>
                            <button
                              type="button"
                              onClick={() => editLive(c)}
                              className="min-h-9 px-3 rounded-xl text-xs font-semibold text-stone-800 bg-white border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-colors"
                            >
                              {locale === 'en' ? 'Review & edit' : 'مراجعة وتعديل'}
                            </button>
                            <button
                              type="button"
                              onClick={() => acceptLive(c)}
                              className={`min-h-9 px-3.5 rounded-xl text-xs font-bold text-white shadow-xs transition-colors ${
                                isMeeting ? 'bg-[#0071e3] hover:bg-[#0062c4]' : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {isMeeting
                                ? locale === 'en'
                                  ? 'Add to Calendar'
                                  : 'أضف إلى التقويم'
                                : locale === 'en'
                                ? 'Add to Tasks'
                                : 'أضف إلى المهام'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Linked Tasks List */}
              {linkedTasks.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-stone-200 rounded-2xl p-6">
                  <p className="text-stone-500 text-sm mb-3">
                    {locale === 'en'
                      ? 'No structured tasks linked to this handwritten page yet.'
                      : 'لا توجد مهام منظمة مرتبطة بهذه الصفحة بعد.'}
                  </p>
                  <p className="text-xs text-stone-400">
                    {locale === 'en'
                      ? 'Use the Lasso tool or click "Convert Page to Tasks" to extract handwritten notes.'
                      : 'استخدم أداة التحديد أو اضغط على "تحويل الصفحة إلى مهام" للتعرف على الخط.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {linkedTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onOpenTaskModal(task)}
                      className="bg-white p-4 rounded-xl border border-stone-200 hover:border-amber-400/80 transition-all cursor-pointer shadow-xs group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <span className="font-semibold text-stone-700">{task.workstream}</span>
                            <span>·</span>
                            <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded text-[11px] font-mono">
                              {task.ownerAlias}
                            </span>
                            {task.sourceRef && (
                              <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                {locale === 'en' ? 'Ink Source Linked' : 'مرتبط بالأصل المكتوب'}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-stone-900 group-hover:text-amber-800 transition-colors">
                            {task.title}
                          </h3>
                          {task.nextAction && (
                            <p className="text-xs text-stone-600">
                              <span className="font-medium text-stone-700">
                                {locale === 'en' ? 'Next Action: ' : 'الإجراء القادم: '}
                              </span>
                              {task.nextAction}
                            </p>
                          )}
                        </div>

                        <span
                          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            task.status === 'Done'
                              ? 'bg-emerald-100 text-emerald-800'
                              : task.status === 'Waiting'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-stone-100 text-stone-800'
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Extraction Candidate Review Drawer */}
        {showReviewDrawer && (
          <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px] lg:static lg:inset-auto lg:w-[400px] xl:w-[430px] lg:shrink-0 lg:h-full bg-white backdrop-blur-xl shadow-2xl lg:shadow-none border-l border-[#d2d2d7] flex flex-col min-h-0 animate-in slide-in-from-right duration-200">
            <div className="bg-[#f5f5f7] text-[#1d1d1f] px-5 py-3.5 border-b border-[#e5e5ea] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#0071e3] to-[#7928ca] flex items-center justify-center text-white shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-bold text-[#1d1d1f]">
                  {locale === 'en' ? 'Extraction Review' : 'مراجعة الاستخراج'}
                </h3>
              </div>
              <button
                onClick={() => setShowReviewDrawer(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] p-1.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
                title={locale === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {extracting ? (
                <div className="text-center py-16 space-y-3">
                  <div className="w-8 h-8 border-3 border-[#0071e3] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-[#515154] font-medium">
                    {locale === 'en'
                      ? 'Transcribing handwriting and verifying project entities...'
                      : 'جارٍ قراءة الخط اليدوي ومطابقة الكيانات والمشاريع...'}
                  </p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-12 text-xs">
                  {extractError ? (
                    <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{extractError}</p>
                  ) : (
                    <p className="text-stone-500">
                      {locale === 'en' ? 'No candidates pending review.' : 'لا توجد بنود بانتظار المراجعة.'}
                    </p>
                  )}
                </div>
              ) : (
                candidates.map((cand) => (
                  <div
                    key={cand.id}
                    className="border border-stone-200 rounded-xl p-4 bg-[#FCFBF9] space-y-3 text-xs shadow-xs"
                  >
                    {/* Raw Text Previews */}
                    <div className="space-y-1 bg-stone-100 p-2.5 rounded-lg font-mono text-[11px] text-stone-700">
                      {cand.rawTextArabic && (
                        <p dir="rtl" className="text-right">
                          <span className="text-stone-400">عربي:</span> {cand.rawTextArabic}
                        </p>
                      )}
                      {cand.rawTextEnglish && (
                        <p>
                          <span className="text-stone-400">EN:</span> {cand.rawTextEnglish}
                        </p>
                      )}
                    </div>

                    {/* Uncertainty alert */}
                    {cand.uncertainFields.length > 0 && (
                      <div className="flex items-center gap-1.5 text-amber-800 text-[11px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {locale === 'en'
                            ? `Please verify uncertain fields: ${cand.uncertainFields.join(', ')}`
                            : `يرجى التحقق من الحقول غير المؤكدة: ${cand.uncertainFields.join(', ')}`}
                        </span>
                      </div>
                    )}

                    {/* Classification Type Selector: Calendar Meeting vs Action Task */}
                    <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleCandidateFieldChange(cand.id, 'entryType', 'meeting')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          cand.entryType === 'meeting'
                            ? 'bg-white text-[#0071e3] shadow-xs font-bold'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#0071e3]" />
                        <span>{locale === 'en' ? 'Calendar Meeting' : 'اجتماع في التقويم'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCandidateFieldChange(cand.id, 'entryType', 'task')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          cand.entryType !== 'meeting'
                            ? 'bg-white text-emerald-700 shadow-xs font-bold'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{locale === 'en' ? 'Action Task' : 'مهمة عمل'}</span>
                      </button>
                    </div>

                    {/* Editable Title */}
                    <div>
                      <label className="font-semibold text-stone-700 block mb-1">
                        {cand.entryType === 'meeting'
                          ? (locale === 'en' ? 'Meeting Title / Subject' : 'عنوان الاجتماع')
                          : (locale === 'en' ? 'Action Title' : 'عنوان الإجراء')}
                      </label>
                      <input
                        type="text"
                        value={cand.suggestedTitle}
                        onChange={(e) => handleCandidateFieldChange(cand.id, 'suggestedTitle', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none focus:border-[#0071e3]"
                      />
                    </div>

                    {cand.entryType === 'meeting' ? (
                      /* Meeting Details */
                      <div className="space-y-2.5 bg-blue-50/40 p-2.5 rounded-xl border border-blue-100">
                        <div className="grid grid-cols-2 gap-2 [&>*:first-child]:col-span-2">
                          <div className="col-span-1">
                            <label className="font-semibold text-stone-700 block mb-1">
                              {locale === 'en' ? 'Date' : 'التاريخ'}
                            </label>
                            <input
                              type="date"
                              value={cand.suggestedMeetingDate || cand.suggestedDueDate || ''}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedMeetingDate', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-stone-700 block mb-1">
                              {locale === 'en' ? 'Start Time' : 'وقت البدء'}
                            </label>
                            <input
                              type="time"
                              value={cand.suggestedStartTime || '10:00'}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedStartTime', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none font-mono"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-stone-700 block mb-1">
                              {locale === 'en' ? 'End Time' : 'وقت الانتهاء'}
                            </label>
                            <input
                              type="time"
                              value={cand.suggestedEndTime || '11:00'}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedEndTime', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="font-semibold text-stone-700 block mb-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#0071e3]" />
                              <span>{locale === 'en' ? 'Location' : 'المكان'}</span>
                            </label>
                            <input
                              type="text"
                              value={cand.suggestedLocation || ''}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedLocation', e.target.value)
                              }
                              placeholder={locale === 'en' ? 'Location or call link' : 'المكان أو رابط الاتصال'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="font-semibold text-stone-700 block mb-1 flex items-center gap-1">
                              <Users className="w-3 h-3 text-[#0071e3]" />
                              <span>{locale === 'en' ? 'Attendees' : 'المشاركون'}</span>
                            </label>
                            <input
                              type="text"
                              value={
                                Array.isArray(cand.suggestedAttendees)
                                  ? cand.suggestedAttendees.join(', ')
                                  : cand.suggestedOwnerAlias || ''
                              }
                              onChange={(e) =>
                                handleCandidateFieldChange(
                                  cand.id,
                                  'suggestedAttendees',
                                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                                )
                              }
                              placeholder={locale === 'ar' ? 'أسماء المشاركين' : 'Attendee names'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Task Details */
                      <>
                        {/* Workstream & Owner Alias */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="font-semibold text-stone-700 block mb-1">
                              {t.workstream}
                            </label>
                            <select
                              value={cand.suggestedWorkstream || INITIAL_WORKSTREAMS[0]}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedWorkstream', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none"
                            >
                              {INITIAL_WORKSTREAMS.map((ws) => (
                                <option key={ws} value={ws}>
                                  {ws}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="font-semibold text-stone-700 block mb-1">
                              {t.owner}
                            </label>
                            <input
                              type="text"
                              value={cand.suggestedOwnerAlias}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedOwnerAlias', e.target.value)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none font-mono"
                              placeholder={locale === 'ar' ? 'رمز أو اسم المسؤول' : 'Owner alias or name'}
                            />
                          </div>
                        </div>

                        {/* Due Date & Next Action */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="font-semibold text-stone-700 block mb-1">
                              {t.dueDate}
                            </label>
                            <input
                              type="date"
                              value={cand.suggestedDueDate || ''}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedDueDate', e.target.value)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-stone-700 block mb-1">
                              {t.project}
                            </label>
                            <input
                              type="text"
                              value={cand.suggestedProject}
                              onChange={(e) =>
                                handleCandidateFieldChange(cand.id, 'suggestedProject', e.target.value)
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-stone-900 focus:outline-none"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Actions: Accept or Reject */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                      <button
                        onClick={() => handleRejectItem(cand.id)}
                        className="px-3 py-1.5 text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-100 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{locale === 'en' ? 'Reject' : 'استبعاد'}</span>
                      </button>

                      <button
                        onClick={() => handleAcceptItem(cand)}
                        className={`px-3.5 py-1.5 text-white font-medium rounded-lg shadow-xs flex items-center gap-1.5 transition-colors ${
                          cand.entryType === 'meeting'
                            ? 'bg-[#0071e3] hover:bg-[#0062c4]'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        {cand.entryType === 'meeting' ? (
                          <>
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{locale === 'en' ? 'Add as Calendar Meeting' : 'جدولة كاجتماع في التقويم'}</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>{locale === 'en' ? 'Accept into Tasks' : 'اعتماد كمهمة'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* To-do list name / MoM date prompt */}
      {plannerPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setPlannerPrompt(null)}>
          <form
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#d2d2d7] p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              submitPrompt();
            }}
          >
            <h3 className="text-base font-bold text-stone-900">
              {plannerPrompt === 'todo'
                ? ar ? 'قائمة مهام جديدة' : 'New to-do list'
                : ar ? 'محضر اجتماع جديد' : 'New minutes of meeting'}
            </h3>
            {plannerPrompt === 'todo' ? (
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-stone-600" htmlFor="planner-todo-name">
                  {ar ? 'اسم مسار العمل' : 'Workstream name'}
                </label>
                <input
                  id="planner-todo-name"
                  autoFocus
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className="w-full min-h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm text-stone-900 focus:outline-none focus:border-[#0071e3]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {INITIAL_WORKSTREAMS.map((ws) => (
                    <button
                      key={ws}
                      type="button"
                      onClick={() => setPromptText(ws)}
                      className="min-h-9 px-3 rounded-full border border-[#d2d2d7] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-xs font-medium text-stone-700"
                    >
                      {ws}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-stone-600" htmlFor="planner-mom-date">
                  {ar ? 'تاريخ الاجتماع' : 'Meeting date'}
                </label>
                <input
                  id="planner-mom-date"
                  type="date"
                  value={promptDate}
                  onChange={(e) => setPromptDate(e.target.value)}
                  className="w-full min-h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm text-stone-900 focus:outline-none focus:border-[#0071e3]"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setPlannerPrompt(null)}
                className="min-h-11 px-4 rounded-xl text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={plannerPrompt === 'todo' && !promptText.trim()}
                className="min-h-11 px-5 rounded-xl text-sm font-bold bg-[#0071e3] hover:bg-[#0062c4] disabled:opacity-40 text-white transition-colors"
              >
                {ar ? 'إنشاء' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Page Confirmation Modal */}
      {showDeletePageConfirm && activePage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[#d2d2d7] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  {locale === 'ar' ? 'حذف صفحة الملاحظات؟' : 'Delete Notebook Page?'}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  {locale === 'ar'
                    ? `سيتم حذف "${activePage.title}". يمكنك التراجع عبر إشعار التراجع السريع.`
                    : `"${activePage.title}" will be removed. You can undo this action from the undo toast.`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setShowDeletePageConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
              >
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  setShowDeletePageConfirm(false);
                  if (onDeletePage) onDeletePage(activePage.id);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-xs"
              >
                {locale === 'ar' ? 'تأكيد الحذف' : 'Delete Page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
