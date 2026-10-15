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
  Calendar,
  Trash2,
  RectangleHorizontal,
  RectangleVertical,
  MapPin,
  Users,
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
  onDeletePage,
}) => {
  const t = translations[locale];
  const [viewMode, setViewMode] = useState<'handwritten' | 'structured' | 'split'>('handwritten');
  const [extracting, setExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string>('');
  const [candidates, setCandidates] = useState<ExtractedCandidate[]>([]);
  const [showReviewDrawer, setShowReviewDrawer] = useState<boolean>(false);
  const [showDeletePageConfirm, setShowDeletePageConfirm] = useState<boolean>(false);

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

  // Tasks linked to this page
  const linkedTasks = tasks.filter(
    (t) => activePage?.linkedTaskIds?.includes(t.id) || t.sourceRef?.pageId === activePage?.id
  );

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
    <div className={`flex flex-col ${isFullScreenPaper ? 'h-[100dvh]' : 'h-[calc(100dvh-3.75rem)]'} overflow-hidden bg-[#f5f5f7]`}>
      {/* Top Notebook Sub-header */}
      <div className="bg-white/90 backdrop-blur-xl text-[#1d1d1f] px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-[#d2d2d7] shrink-0">
        {/* Notebook & Page Selector */}
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#0071e3]" />
          <select
            value={activeNotebook?.id}
            onChange={(e) => {
              onSelectNotebook(e.target.value);
              const firstP = pages.find((p) => p.notebookId === e.target.value);
              if (firstP) onSelectPage(firstP.id);
            }}
            className="bg-[#f5f5f7] text-xs font-semibold text-[#1d1d1f] px-3 py-1.5 rounded-lg border border-[#d2d2d7] focus:outline-none focus:border-[#0071e3]"
          >
            {notebooks.map((nb) => (
              <option key={nb.id} value={nb.id}>
                {nb.title} ({pages.filter((p) => p.notebookId === nb.id).length}p)
              </option>
            ))}
          </select>

          {/* Page Selector */}
          <div className="flex items-center gap-1 bg-[#f5f5f7] px-2 py-1 rounded-lg border border-[#d2d2d7] text-xs">
            <button
              onClick={() => {
                const curIdx = notebookPages.findIndex((p) => p.id === activePage?.id);
                if (curIdx > 0) onSelectPage(notebookPages[curIdx - 1].id);
              }}
              className="p-1 hover:text-[#0071e3]"
              title={locale === 'ar' ? 'الصفحة السابقة' : 'Previous Page'}
            >
              <ChevronLeft className={`w-3.5 h-3.5 ${locale === 'ar' ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-[#1d1d1f] font-mono">
              {locale === 'ar' ? 'صفحة' : 'Page'} {Math.max(1, notebookPages.findIndex((p) => p.id === activePage?.id) + 1)} / {notebookPages.length || 1}
            </span>
            <button
              onClick={() => {
                const curIdx = notebookPages.findIndex((p) => p.id === activePage?.id);
                if (curIdx < notebookPages.length - 1) onSelectPage(notebookPages[curIdx + 1].id);
              }}
              className="p-1 hover:text-[#0071e3]"
              title={locale === 'ar' ? 'الصفحة التالية' : 'Next Page'}
            >
              <ChevronRight className={`w-3.5 h-3.5 ${locale === 'ar' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <button
            onClick={() => onNewPage(activeNotebook?.id || '')}
            className="flex items-center gap-1 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-xs text-[#1d1d1f] px-2.5 py-1.5 rounded-lg border border-[#d2d2d7] transition-colors"
            title={locale === 'ar' ? 'إضافة صفحة لهذه المفكرة' : 'Add Page to this Notebook'}
          >
            <Plus className="w-3.5 h-3.5 text-[#0071e3]" />
            <span className="hidden sm:inline">{t.newNotePage}</span>
          </button>

          {/* Orientation Toggle in sub-header */}
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

      {/* Main View Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left / Primary Ink Canvas */}
        {(viewMode === 'handwritten' || viewMode === 'split') && (
          <div
            className={`h-full overflow-hidden flex flex-col ${
              viewMode === 'split' ? 'w-full lg:w-1/2 border-r border-stone-300' : 'w-full'
            }`}
          >
            {activePage && (
              <NotebookCanvas
                pageId={activePage.id}
                template={activePage.template}
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
              />
            )}
          </div>
        )}

        {/* Right / Structured View */}
        {(viewMode === 'structured' || viewMode === 'split') && (
          <div
            className={`h-full overflow-y-auto p-4 sm:p-6 bg-[#FAF8F5] ${
              viewMode === 'split' ? 'w-full lg:w-1/2' : 'w-full max-w-5xl mx-auto'
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
          <div className="absolute inset-y-0 right-0 w-full sm:w-[460px] bg-white/95 backdrop-blur-xl shadow-2xl border-l border-[#d2d2d7] z-30 flex flex-col animate-in slide-in-from-right duration-200">
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
                        <div className="grid grid-cols-3 gap-2">
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
