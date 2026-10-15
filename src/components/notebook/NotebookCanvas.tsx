import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  InkStroke,
  InkPoint,
  NotebookTemplate,
  PageVersion,
  CanvasTextItem,
  PaperStyle,
  PaperColor,
} from '../../types';
import { Locale, translations } from '../../lib/translations';
import { formatCairoHeaderDateTime } from '../../lib/cairoTime';
import { VersionHistoryModal } from './VersionHistoryModal';
import {
  Pen,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  Scissors,
  Sparkles,
  MousePointer,
  PenTool,
  Check,
  Clock,
  History,
  Type,
  Maximize2,
  Minimize2,
  GripVertical,
  ChevronDown,
  Edit3,
  RectangleHorizontal,
  RectangleVertical,
  Trash2,
  AlignJustify,
  Grid3X3,
  Grid,
  Square,
  Palette,
} from 'lucide-react';

export const PAPER_THEMES: Record<
  PaperColor,
  {
    nameEn: string;
    nameAr: string;
    bg: string;
    border: string;
    ruledLine: string;
    marginLine: string;
    gridLine: string;
    gridMajorLine: string;
    dotColor: string;
    isDark: boolean;
    headerBg: string;
    headerBorder: string;
    textColor: string;
    subtextColor: string;
    badgeBg: string;
    badgeBorder: string;
    swatchBorder: string;
  }
> = {
  cream: {
    nameEn: 'Ivory Cream',
    nameAr: 'عاجي دافئ',
    bg: '#FAF7F0',
    border: '#E3DDD1',
    ruledLine: '#E7E2D6',
    marginLine: 'rgba(180, 83, 9, 0.22)',
    gridLine: '#EAE5D9',
    gridMajorLine: '#DCD4C4',
    dotColor: '#C8BEAB',
    isDark: false,
    headerBg: '#FFFFFF',
    headerBorder: '#E5E5EA',
    textColor: '#1C1917',
    subtextColor: '#78716C',
    badgeBg: '#F5F2EB',
    badgeBorder: '#DDD6C8',
    swatchBorder: '#D8CEBE',
  },
  white: {
    nameEn: 'Pure White',
    nameAr: 'أبيض ناصع',
    bg: '#FFFFFF',
    border: '#E2E8F0',
    ruledLine: '#EDF2F7',
    marginLine: 'rgba(59, 130, 246, 0.22)',
    gridLine: '#F1F5F9',
    gridMajorLine: '#E2E8F0',
    dotColor: '#CBD5E1',
    isDark: false,
    headerBg: '#FFFFFF',
    headerBorder: '#E2E8F0',
    textColor: '#0F172A',
    subtextColor: '#64748B',
    badgeBg: '#F8FAFC',
    badgeBorder: '#E2E8F0',
    swatchBorder: '#CBD5E1',
  },
  sepia: {
    nameEn: 'Vintage Sepia',
    nameAr: 'ورق بردي',
    bg: '#F5EEDB',
    border: '#DFD3B8',
    ruledLine: '#E5D9BC',
    marginLine: 'rgba(146, 64, 14, 0.28)',
    gridLine: '#EADFC3',
    gridMajorLine: '#D8C9A3',
    dotColor: '#C4B48E',
    isDark: false,
    headerBg: '#FBF7ED',
    headerBorder: '#DFD2B4',
    textColor: '#292524',
    subtextColor: '#786C58',
    badgeBg: '#ECE2C8',
    badgeBorder: '#D4C49F',
    swatchBorder: '#C8B790',
  },
  dark: {
    nameEn: 'Midnight Dark',
    nameAr: 'أسود ليلي',
    bg: '#18191D',
    border: '#2E323B',
    ruledLine: '#262A33',
    marginLine: 'rgba(245, 158, 11, 0.35)',
    gridLine: '#242831',
    gridMajorLine: '#333945',
    dotColor: '#454C5B',
    isDark: true,
    headerBg: '#202227',
    headerBorder: '#2E323B',
    textColor: '#F4F4F5',
    subtextColor: '#A1A1AA',
    badgeBg: '#272A32',
    badgeBorder: '#3E4450',
    swatchBorder: '#4B5563',
  },
};

export const PAPER_STYLES: { id: PaperStyle; nameEn: string; nameAr: string }[] = [
  { id: 'ruled', nameEn: 'Ruled Lines', nameAr: 'مسطر' },
  { id: 'grid', nameEn: 'Grid Boxes', nameAr: 'مربعات' },
  { id: 'dotted', nameEn: 'Dot Grid', nameAr: 'نقاط' },
  { id: 'blank', nameEn: 'Blank Sheet', nameAr: 'سادة' },
];

interface NotebookCanvasProps {
  pageId: string;
  template: NotebookTemplate;
  pageTitle: string;
  initialStrokes: InkStroke[];
  initialTextNotes?: CanvasTextItem[];
  versions?: PageVersion[];
  locale: Locale;
  orientation?: 'landscape' | 'portrait';
  paperStyle?: PaperStyle;
  paperColor?: PaperColor;
  isFullScreenPaper?: boolean;
  onToggleFullScreenPaper?: () => void;
  onOrientationChange?: (orientation: 'landscape' | 'portrait') => void;
  onPaperStyleChange?: (style: PaperStyle) => void;
  onPaperColorChange?: (color: PaperColor) => void;
  onDeletePage?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onStrokesChange: (strokes: InkStroke[], textNotes?: CanvasTextItem[], versions?: PageVersion[]) => void;
  onExtractRegion: (imageBase64: string, boundingBox: { x: number; y: number; width: number; height: number }) => void;
  /** Hands the parent a function that renders the whole page (ink + typed notes) to a compact JPEG, or null when the page is empty */
  registerSnapshot?: (fn: (() => { dataUrl: string; box: { x: number; y: number; width: number; height: number } } | null) | null) => void;
}

type ToolMode = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'text';
type InteractionMode = 'stylus' | 'touch_nav';

const PEN_COLORS = [
  { name: 'Obsidian Black', value: '#1E293B' },
  { name: 'Royal Navy', value: '#1D4ED8' },
  { name: 'Emerald Green', value: '#047857' },
  { name: 'Imperial Burgundy', value: '#881337' },
  { name: 'Graphite Slate', value: '#475569' },
  { name: 'Warm Amber', value: '#B45309' },
  { name: 'Pure White', value: '#FFFFFF' },
  { name: 'Cairo Gold', value: '#F59E0B' },
];

const FONT_FAMILIES = [
  { label: 'Serif (Executive)', value: 'Georgia, "Playfair Display", serif' },
  { label: 'Sans (Modern)', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Cairo (Arabic / Naskh)', value: '"Cairo", "Amiri", sans-serif' },
  { label: 'Script (Handwritten)', value: '"Caveat", "Brush Script MT", cursive' },
  { label: 'Mono (Technical)', value: '"JetBrains Mono", Consolas, monospace' },
];

const FONT_SIZES = [14, 18, 22, 28, 36];

const DEFAULT_LANDSCAPE_WIDTH = 1450;
const DEFAULT_LANDSCAPE_HEIGHT = 950;
const DEFAULT_PORTRAIT_WIDTH = 1100;
const DEFAULT_PORTRAIT_HEIGHT = 1450;

const MAX_VERSIONS = 50;
const HIGHLIGHT_COLOR = '#F59E0B';
const HIGHLIGHT_WIDTH = 18;
const highlightAlpha = (theme: { isDark: boolean }) => (theme.isDark ? 0.45 : 0.35);

const getDpr = () =>
  typeof window === 'undefined' ? 1 : Math.min(3, Math.max(1, window.devicePixelRatio || 1));

const distPtSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const segsIntersect = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
) => {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = o(ax, ay, bx, by, cx, cy);
  const d2 = o(ax, ay, bx, by, dx, dy);
  const d3 = o(cx, cy, dx, dy, ax, ay);
  const d4 = o(cx, cy, dx, dy, bx, by);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

const segSegDist = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
) => {
  if (segsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    distPtSeg(ax, ay, cx, cy, dx, dy),
    distPtSeg(bx, by, cx, cy, dx, dy),
    distPtSeg(cx, cy, ax, ay, bx, by),
    distPtSeg(dx, dy, ax, ay, bx, by)
  );
};

const bboxCache = new WeakMap<InkStroke, { minX: number; minY: number; maxX: number; maxY: number }>();
const getStrokeBBox = (st: InkStroke) => {
  let bb = bboxCache.get(st);
  if (!bb) {
    if (!st.points || st.points.length === 0) return null;
    bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of st.points) {
      if (p.x < bb.minX) bb.minX = p.x;
      if (p.y < bb.minY) bb.minY = p.y;
      if (p.x > bb.maxX) bb.maxX = p.x;
      if (p.y > bb.maxY) bb.maxY = p.y;
    }
    bboxCache.set(st, bb);
  }
  return bb;
};

/** Single stroke painter shared by full redraw and the commit blit (ctx must already have the DPR transform). */
const paintStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  theme: { isDark: boolean }
) => {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let color = stroke.color;
  if (stroke.tool === 'highlighter') {
    // legacy strokes stored rgba(); normalise to opaque and apply one alpha constant
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
    if (m) color = `rgb(${m[1]},${m[2]},${m[3]})`;
    ctx.globalAlpha = highlightAlpha(theme);
  } else if (theme.isDark && (color === '#1E293B' || color === '#000000')) {
    color = '#F8FAFC';
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (stroke.pressureWidth && stroke.tool === 'pen') {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = stroke.width * (0.6 + 0.8 * (pts[i].pressure ?? 0.5));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else {
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
};

export const NotebookCanvas: React.FC<NotebookCanvasProps> = ({
  pageId,
  template: _template,
  pageTitle,
  initialStrokes,
  initialTextNotes = [],
  versions = [],
  locale,
  orientation: initialOrientation = 'landscape',
  paperStyle: initialPaperStyle = 'ruled',
  paperColor: initialPaperColor = 'cream',
  isFullScreenPaper = false,
  onToggleFullScreenPaper,
  onOrientationChange,
  onPaperStyleChange,
  onPaperColorChange,
  onDeletePage,
  onTitleChange,
  onStrokesChange,
  onExtractRegion,
  registerSnapshot,
}) => {
  const t = translations[locale];
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(initialOrientation || 'landscape');
  const [paperStyle, setPaperStyle] = useState<PaperStyle>(initialPaperStyle || 'ruled');
  const [paperColor, setPaperColor] = useState<PaperColor>(initialPaperColor || 'cream');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const currentTheme = PAPER_THEMES[paperColor] || PAPER_THEMES.cream;

  const paperStyleRef = useRef<PaperStyle>(paperStyle);
  paperStyleRef.current = paperStyle;

  const paperColorRef = useRef<PaperColor>(paperColor);
  paperColorRef.current = paperColor;

  useEffect(() => {
    if (initialOrientation && initialOrientation !== orientation) {
      setOrientation(initialOrientation);
    }
  }, [initialOrientation]);

  useEffect(() => {
    if (initialPaperStyle && initialPaperStyle !== paperStyle) {
      setPaperStyle(initialPaperStyle);
    }
  }, [initialPaperStyle]);

  useEffect(() => {
    if (initialPaperColor && initialPaperColor !== paperColor) {
      setPaperColor(initialPaperColor);
    }
  }, [initialPaperColor]);

  const canvasWidth = orientation === 'landscape' ? DEFAULT_LANDSCAPE_WIDTH : DEFAULT_PORTRAIT_WIDTH;
  const canvasHeight = orientation === 'landscape' ? DEFAULT_LANDSCAPE_HEIGHT : DEFAULT_PORTRAIT_HEIGHT;

  const [dpr, setDpr] = useState<number>(getDpr);
  const dprRef = useRef<number>(dpr);
  dprRef.current = dpr;
  const logicalRef = useRef({ w: canvasWidth, h: canvasHeight });
  logicalRef.current = { w: canvasWidth, h: canvasHeight };
  const [scale, setScale] = useState<number>(1);
  const [paperH, setPaperH] = useState<number | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Canvas refs for High-Performance Direct Hardware Inking
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // In-memory data refs — critical: does NOT trigger React re-renders while inking
  const strokesRef = useRef<InkStroke[]>(initialStrokes || []);
  const textNotesRef = useRef<CanvasTextItem[]>(initialTextNotes || []);
  const versionsRef = useRef<PageVersion[]>(versions || []);
  const historyRef = useRef<InkStroke[][]>([]);
  const redoHistoryRef = useRef<InkStroke[][]>([]);

  // Lightweight state for toolbar UI only
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const canUndoRef = useRef<boolean>(false);
  const canRedoRef = useRef<boolean>(false);
  const [textNotes, setTextNotes] = useState<CanvasTextItem[]>(initialTextNotes || []);

  // Tool & Inking Settings
  const [tool, setTool] = useState<ToolMode>('pen');
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('stylus');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value);
  const [customColor, setCustomColor] = useState<string>('#1E293B');
  const [lineWidth, setLineWidth] = useState<number>(2.5);

  // Font Control Settings
  const [fontFamily, setFontFamily] = useState<string>(FONT_FAMILIES[0].value);
  const [fontSize, setFontSize] = useState<number>(18);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  // Synchronized refs for zero-latency event handlers
  const toolRef = useRef<ToolMode>(tool);
  const interactionModeRef = useRef<InteractionMode>(interactionMode);
  const penColorRef = useRef<string>(penColor);
  const lineWidthRef = useRef<number>(lineWidth);
  const fontFamilyRef = useRef<string>(fontFamily);
  const fontSizeRef = useRef<number>(fontSize);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);
  useEffect(() => {
    penColorRef.current = penColor;
  }, [penColor]);
  useEffect(() => {
    lineWidthRef.current = lineWidth;
  }, [lineWidth]);
  useEffect(() => {
    fontFamilyRef.current = fontFamily;
  }, [fontFamily]);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  // Draggable Floating Toolbar State
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number }>({ x: 24, y: 16 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState<boolean>(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(false);
  const [showFontMenu, setShowFontMenu] = useState<boolean>(false);

  // Lasso & Selection State
  const [lassoBox, setLassoBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const lassoBoxRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Version Control State
  const [isVersionModalOpen, setIsVersionModalOpen] = useState<boolean>(false);
  const [selectedPreviewVersion, setSelectedPreviewVersion] = useState<PageVersion | null>(null);

  // Inline Editable Header (Date & Time of Today Cairo Time)
  const [headerText, setHeaderText] = useState<string>(
    pageTitle || formatCairoHeaderDateTime(new Date(), locale)
  );
  const [isEditingHeader, setIsEditingHeader] = useState<boolean>(false);

  // Persistence (debounced, with flush). The save target (handler + data) is captured AT SCHEDULE TIME
  // so a pending save can never be delivered to a different page after a page switch.
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    fn: NotebookCanvasProps['onStrokesChange'];
    strokes: InkStroke[];
    notes: CanvasTextItem[];
    versions: PageVersion[];
  } | null>(null);
  const previewRef = useRef<PageVersion | null>(null);
  const [, bumpRender] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2500);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  const onStrokesChangeRef = useRef(onStrokesChange);
  useEffect(() => {
    onStrokesChangeRef.current = onStrokesChange;
  }, [onStrokesChange]);

  const onTitleChangeRef = useRef(onTitleChange);
  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  const flushNow = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    const p = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (p && p.fn) p.fn(p.strokes, p.notes, p.versions);
  }, []);

  const scheduleSave = useCallback(
    (newStrokes: InkStroke[], newNotes: CanvasTextItem[], newVersions?: PageVersion[]) => {
      pendingSaveRef.current = {
        fn: onStrokesChangeRef.current,
        strokes: newStrokes,
        notes: newNotes,
        versions: newVersions || versionsRef.current,
      };
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(flushNow, 700);
    },
    [flushNow]
  );

  // Flush when the tab is hidden / page is unloaded
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) flushNow();
    };
    const onHide = () => flushNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [flushNow]);

  // Flush on page change and on unmount (declared BEFORE the pageId-sync effect)
  useEffect(() => {
    return () => flushNow();
  }, [pageId, flushNow]);

  const pushHistory = useCallback((prev: InkStroke[]) => {
    historyRef.current.push(prev);
    if (historyRef.current.length > 100) historyRef.current.shift();
    redoHistoryRef.current = [];
    if (!canUndoRef.current) {
      canUndoRef.current = true;
      setCanUndo(true);
    }
    if (canRedoRef.current) {
      canRedoRef.current = false;
      setCanRedo(false);
    }
  }, []);

  // Render Background Canvas (paper + committed strokes) in LOGICAL coordinates (transform handles DPR)
  const renderBackgroundCanvas = useCallback((strokesToRender: InkStroke[]) => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const d = dprRef.current;
    const W = logicalRef.current.w;
    const H = logicalRef.current.h;
    const currentStyle = paperStyleRef.current;
    const theme = PAPER_THEMES[paperColorRef.current] || PAPER_THEMES.cream;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(d, 0, 0, d, 0, 0);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);

    const topMargin = 120;
    const bottomMargin = 40;

    if (currentStyle === 'ruled') {
      ctx.save();
      ctx.strokeStyle = theme.ruledLine;
      ctx.lineWidth = 0.8;
      const lineSpacing = 34;
      for (let y = topMargin; y < H - bottomMargin; y += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(35, y);
        ctx.lineTo(W - 35, y);
        ctx.stroke();
      }
      ctx.strokeStyle = theme.marginLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(85, topMargin - 20);
      ctx.lineTo(85, H - 30);
      ctx.stroke();
      ctx.restore();
    } else if (currentStyle === 'grid') {
      ctx.save();
      const boxSize = 32;
      const leftMargin = 32;
      const rightMargin = 32;
      let row = 0;
      for (let y = topMargin; y <= H - bottomMargin; y += boxSize) {
        ctx.beginPath();
        ctx.strokeStyle = row % 4 === 0 ? theme.gridMajorLine : theme.gridLine;
        ctx.lineWidth = row % 4 === 0 ? 1 : 0.75;
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(W - rightMargin, y);
        ctx.stroke();
        row++;
      }
      let col = 0;
      for (let x = leftMargin; x <= W - rightMargin; x += boxSize) {
        ctx.beginPath();
        ctx.strokeStyle = col % 4 === 0 ? theme.gridMajorLine : theme.gridLine;
        ctx.lineWidth = col % 4 === 0 ? 1 : 0.75;
        ctx.moveTo(x, topMargin);
        ctx.lineTo(x, H - bottomMargin);
        ctx.stroke();
        col++;
      }
      ctx.restore();
    } else if (currentStyle === 'dotted') {
      ctx.save();
      ctx.fillStyle = theme.dotColor;
      const dotSpacing = 28;
      for (let y = topMargin; y <= H - bottomMargin; y += dotSpacing) {
        for (let x = 35; x <= W - 35; x += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1.25, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (currentStyle === 'blank') {
      ctx.save();
      ctx.strokeStyle = theme.gridLine;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(35, topMargin, W - 70, H - topMargin - bottomMargin);
      ctx.restore();
    }

    for (const stroke of strokesToRender) paintStroke(ctx, stroke, theme);
  }, []);

  // Resize / orientation / paper change: backing store is reset by React, so redraw synchronously (no blank frame)
  useLayoutEffect(() => {
    renderBackgroundCanvas(previewRef.current ? previewRef.current.strokes || [] : strokesRef.current);
  }, [canvasWidth, canvasHeight, dpr, paperStyle, paperColor, renderBackgroundCanvas]);

  // Sync when pageId changes
  useLayoutEffect(() => {
    strokesRef.current = [...(initialStrokes || [])];
    textNotesRef.current = [...(initialTextNotes || [])];
    versionsRef.current = [...(versions || [])];
    previewRef.current = null;
    setTextNotes(textNotesRef.current);
    setActiveTextId(null);
    historyRef.current = [];
    redoHistoryRef.current = [];
    canUndoRef.current = false;
    canRedoRef.current = false;
    setCanUndo(false);
    setCanRedo(false);
    setLassoBox(null);
    lassoBoxRef.current = null;
    setSelectedPreviewVersion(null);
    setHeaderText(pageTitle || formatCairoHeaderDateTime(new Date(), locale));
    renderBackgroundCanvas(strokesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, renderBackgroundCanvas]);

  // Fit paper to available width (scale transform) and track DPR
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const cs = getComputedStyle(container);
      const avail =
        container.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const s = Math.max(0.2, Math.min(1, avail / (canvasWidth + 2)));
      setScale((prev) => (Math.abs(prev - s) < 0.001 ? prev : s));
      const p = paperRef.current;
      if (p) setPaperH((prev) => (prev === p.offsetHeight ? prev : p.offsetHeight));
      const nd = getDpr();
      setDpr((prev) => (prev === nd ? prev : nd));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    if (paperRef.current) observer.observe(paperRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [canvasWidth]);

  // NATIVE POINTER BINDINGS (zero-latency ink, coalesced events, no React state per move)
  useEffect(() => {
    const maybeCanvas = activeCanvasRef.current;
    if (!maybeCanvas) return;
    const canvas: HTMLCanvasElement = maybeCanvas;

    const preventGesture = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onTouchPrevent = (e: TouchEvent) => {
      if (interactionModeRef.current === 'stylus') e.preventDefault();
    };
    canvas.addEventListener('dblclick', preventGesture, { passive: false });
    canvas.addEventListener('selectstart', preventGesture, { passive: false });
    canvas.addEventListener('contextmenu', preventGesture, { passive: false });
    canvas.addEventListener('gesturestart', preventGesture, { passive: false });
    canvas.addEventListener('gesturechange', preventGesture, { passive: false });
    canvas.addEventListener('gestureend', preventGesture, { passive: false });
    canvas.addEventListener('touchstart', onTouchPrevent, { passive: false });
    canvas.addEventListener('touchmove', onTouchPrevent, { passive: false });

    type Rect = { left: number; top: number; width: number; height: number };
    interface Session {
      pointerId: number;
      kind: 'draw' | 'lasso' | 'scroll';
      tool: ToolMode;
      color: string;
      width: number;
      points: InkPoint[];
      rect: Rect;
      erasePushed: boolean;
      lastX: number;
      lastY: number;
      ring: { x: number; y: number; w: number; h: number } | null;
      lassoRaf: number | null;
    }
    let session = null as Session | null;
    const ERASER_RADIUS = 16;

    const toPoint = (e: PointerEvent, rect: Rect): InkPoint => ({
      x: (e.clientX - rect.left) * (logicalRef.current.w / (rect.width || 1)),
      y: (e.clientY - rect.top) * (logicalRef.current.h / (rect.height || 1)),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      time: Date.now(),
    });

    const activeCtx = () => {
      const c = canvas.getContext('2d');
      if (!c) return null;
      const d = dprRef.current;
      c.setTransform(d, 0, 0, d, 0, 0);
      return c;
    };
    const clearActive = () => {
      const c = canvas.getContext('2d');
      if (c) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.style.opacity = '1';
      if (session) session.ring = null;
    };

    const drawLiveSegment = (s: Session, a: InkPoint, b: InkPoint) => {
      const ctx = activeCtx();
      if (!ctx) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.tool === 'pen' ? s.width * (0.6 + 0.8 * (b.pressure ?? 0.5)) : s.width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    const drawRing = (s: Session, p: InkPoint) => {
      const ctx = activeCtx();
      if (!ctx) return;
      if (s.ring) ctx.clearRect(s.ring.x, s.ring.y, s.ring.w, s.ring.h);
      ctx.beginPath();
      ctx.arc(p.x, p.y, ERASER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,120,120,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,100,100,0.65)';
      ctx.lineWidth = 1;
      ctx.stroke();
      s.ring = { x: p.x - ERASER_RADIUS - 2, y: p.y - ERASER_RADIUS - 2, w: ERASER_RADIUS * 2 + 4, h: ERASER_RADIUS * 2 + 4 };
    };

    const eraseSegment = (s: Session, a: InkPoint, b: InkPoint) => {
      const cur = strokesRef.current;
      const minX = Math.min(a.x, b.x) - ERASER_RADIUS;
      const maxX = Math.max(a.x, b.x) + ERASER_RADIUS;
      const minY = Math.min(a.y, b.y) - ERASER_RADIUS;
      const maxY = Math.max(a.y, b.y) + ERASER_RADIUS;
      let changed = false;
      const next: InkStroke[] = [];
      for (const st of cur) {
        const bb = getStrokeBBox(st);
        let hit = false;
        if (bb && bb.maxX >= minX && bb.minX <= maxX && bb.maxY >= minY && bb.minY <= maxY) {
          const pts = st.points;
          if (pts.length === 1) {
            hit = distPtSeg(pts[0].x, pts[0].y, a.x, a.y, b.x, b.y) <= ERASER_RADIUS;
          }
          for (let i = 0; i < pts.length - 1 && !hit; i++) {
            if (segSegDist(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, a.x, a.y, b.x, b.y) <= ERASER_RADIUS) hit = true;
          }
        }
        if (hit) changed = true;
        else next.push(st);
      }
      if (!changed) return;
      if (!s.erasePushed) {
        s.erasePushed = true;
        pushHistory(cur);
      }
      strokesRef.current = next;
      renderBackgroundCanvas(next);
      scheduleSave(next, textNotesRef.current);
    };

    const removeWindowListeners = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    function onMove(e: PointerEvent) {
      const s = session;
      if (!s || e.pointerId !== s.pointerId) return;
      e.preventDefault();
      e.stopPropagation();

      if (s.kind === 'scroll') {
        const c = containerRef.current;
        if (c) c.scrollBy(s.lastX - e.clientX, s.lastY - e.clientY);
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        return;
      }

      if (s.kind === 'lasso') {
        const p = toPoint(e, s.rect);
        const box = lassoBoxRef.current;
        if (box) {
          lassoBoxRef.current = { ...box, endX: p.x, endY: p.y };
          if (s.lassoRaf === null) {
            s.lassoRaf = requestAnimationFrame(() => {
              s.lassoRaf = null;
              setLassoBox(lassoBoxRef.current);
            });
          }
        }
        return;
      }

      const raw = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const events = raw && raw.length > 0 ? raw : [e];
      for (const ce of events) {
        const p = toPoint(ce, s.rect);
        const last = s.points[s.points.length - 1];
        if (s.tool === 'eraser') {
          eraseSegment(s, last, p);
          s.points = [p];
          drawRing(s, p);
        } else {
          s.points.push(p);
          drawLiveSegment(s, last, p);
        }
      }
    }

    function finish(e: PointerEvent, cancelled: boolean) {
      const s = session;
      if (!s || e.pointerId !== s.pointerId) return;
      session = null;
      removeWindowListeners();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      e.preventDefault();

      if (s.kind === 'scroll') return;
      if (s.kind === 'lasso') {
        if (s.lassoRaf !== null) cancelAnimationFrame(s.lassoRaf);
        if (cancelled) {
          lassoBoxRef.current = null;
          setLassoBox(null);
        } else {
          setLassoBox(lassoBoxRef.current);
        }
        return;
      }

      // draw / erase
      const c = canvas.getContext('2d');
      if (c) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvas.style.opacity = '1';
      if (cancelled || s.tool === 'eraser') return;

      const pts = s.points;
      const fin = toPoint(e, s.rect);
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(fin.x - last.x, fin.y - last.y) > 0.5) pts.push(fin);
      if (pts.length === 1) {
        pts.push({ x: pts[0].x + 0.15, y: pts[0].y + 0.15, pressure: pts[0].pressure, time: pts[0].time });
      }

      const newStroke: InkStroke = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tool: s.tool === 'highlighter' ? 'highlighter' : 'pen',
        color: s.color,
        width: s.width,
        points: pts,
        pageId,
        timestamp: Date.now(),
        ...(s.tool === 'pen' ? { pressureWidth: true } : {}),
      };

      pushHistory(strokesRef.current);
      strokesRef.current = [...strokesRef.current, newStroke];

      const bgCanvas = bgCanvasRef.current;
      const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
      if (bgCtx) {
        const d = dprRef.current;
        bgCtx.setTransform(d, 0, 0, d, 0, 0);
        paintStroke(bgCtx, newStroke, PAPER_THEMES[paperColorRef.current] || PAPER_THEMES.cream);
      }
      scheduleSave(strokesRef.current, textNotesRef.current);
    }
    function onUp(e: PointerEvent) {
      finish(e, false);
    }
    function onCancel(e: PointerEvent) {
      finish(e, true);
    }

    const onPointerDown = (e: PointerEvent) => {
      if (session) return; // ignore a second pointer while one is active
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (previewRef.current) return; // preview is read-only

      const mode = interactionModeRef.current;
      const tool = toolRef.current;
      const isTouch = e.pointerType === 'touch';
      // Palm rejection: touch only inks in none of the ink tools; allowed for text & lasso
      if (isTouch && mode === 'stylus' && tool !== 'text' && tool !== 'lasso') return;

      const r = canvas.getBoundingClientRect();
      const rect: Rect = { left: r.left, top: r.top, width: r.width, height: r.height };

      const attach = () => {
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp, { passive: false });
        window.addEventListener('pointercancel', onCancel, { passive: false });
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* capture unsupported */
        }
      };

      const base = {
        pointerId: e.pointerId,
        rect,
        erasePushed: false,
        lastX: e.clientX,
        lastY: e.clientY,
        ring: null,
        lassoRaf: null,
        points: [] as InkPoint[],
      };

      if (isTouch && mode === 'touch_nav') {
        e.preventDefault();
        session = { ...base, kind: 'scroll', tool, color: '', width: 0 };
        attach();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const p = toPoint(e, rect);

      if (tool === 'text') {
        const newNote: CanvasTextItem = {
          id: `txt-${Date.now()}`,
          x: p.x,
          y: p.y,
          text: '',
          fontSize: fontSizeRef.current,
          fontFamily: fontFamilyRef.current,
          color: penColorRef.current,
        };
        const updated = [...textNotesRef.current, newNote];
        textNotesRef.current = updated;
        setTextNotes(updated);
        setActiveTextId(newNote.id);
        scheduleSave(strokesRef.current, updated);
        return;
      }

      if (tool === 'lasso') {
        session = { ...base, kind: 'lasso', tool, color: '', width: 0 };
        const box = { startX: p.x, startY: p.y, endX: p.x, endY: p.y };
        lassoBoxRef.current = box;
        setLassoBox(box);
        attach();
        return;
      }

      const isHl = tool === 'highlighter';
      const color = isHl ? HIGHLIGHT_COLOR : penColorRef.current;
      const width = isHl ? HIGHLIGHT_WIDTH : lineWidthRef.current;
      const s: Session = { ...base, kind: 'draw', tool, color, width, points: [p] };
      session = s;
      attach();

      if (tool === 'eraser') {
        eraseSegment(s, p, p);
        drawRing(s, p);
        return;
      }

      if (isHl) {
        canvas.style.opacity = String(highlightAlpha(PAPER_THEMES[paperColorRef.current] || PAPER_THEMES.cream));
      }
      const ctx = activeCtx();
      if (ctx) {
        const w = tool === 'pen' ? width * (0.6 + 0.8 * (p.pressure ?? 0.5)) : width;
        ctx.beginPath();
        ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });

    return () => {
      if (session) {
        if (session.lassoRaf !== null) cancelAnimationFrame(session.lassoRaf);
        session = null;
        clearActive();
      }
      canvas.removeEventListener('dblclick', preventGesture);
      canvas.removeEventListener('selectstart', preventGesture);
      canvas.removeEventListener('contextmenu', preventGesture);
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', preventGesture);
      canvas.removeEventListener('gestureend', preventGesture);
      canvas.removeEventListener('touchstart', onTouchPrevent);
      canvas.removeEventListener('touchmove', onTouchPrevent);
      canvas.removeEventListener('pointerdown', onPointerDown);
      removeWindowListeners();
    };
  }, [pageId, renderBackgroundCanvas, scheduleSave, pushHistory]);

  // Undo / Redo handlers (arrays are never mutated in place, so no copies needed)
  const handleUndo = () => {
    if (previewRef.current) return;
    const last = historyRef.current.pop();
    if (!last) return;
    redoHistoryRef.current.push(strokesRef.current);
    strokesRef.current = last;
    canUndoRef.current = historyRef.current.length > 0;
    canRedoRef.current = true;
    setCanUndo(canUndoRef.current);
    setCanRedo(true);
    renderBackgroundCanvas(last);
    scheduleSave(last, textNotesRef.current);
  };

  const handleRedo = () => {
    if (previewRef.current) return;
    const next = redoHistoryRef.current.pop();
    if (!next) return;
    historyRef.current.push(strokesRef.current);
    if (historyRef.current.length > 100) historyRef.current.shift();
    strokesRef.current = next;
    canUndoRef.current = true;
    canRedoRef.current = redoHistoryRef.current.length > 0;
    setCanUndo(true);
    setCanRedo(canRedoRef.current);
    renderBackgroundCanvas(next);
    scheduleSave(next, textNotesRef.current);
  };

  // Save Version Checkpoint (always snapshots the LIVE draft, never a preview)
  const handleSaveVersionCheckpoint = (customLabel?: string) => {
    flushNow();
    const cairoNow = formatCairoHeaderDateTime(new Date(), locale);
    const newVersion: PageVersion = {
      id: `ver-${Date.now()}`,
      pageId,
      title: headerText,
      strokes: [...strokesRef.current],
      textNotes: [...textNotesRef.current],
      timestamp: new Date().toISOString(),
      cairoTimestamp: cairoNow,
      strokeCount: strokesRef.current.length,
      label: customLabel || `${locale === 'ar' ? 'إصدار' : 'Version'} · ${cairoNow}`,
    };
    const updatedVersions = [newVersion, ...versionsRef.current].slice(0, MAX_VERSIONS);
    versionsRef.current = updatedVersions;
    onStrokesChangeRef.current(strokesRef.current, textNotesRef.current, updatedVersions);
    bumpRender((n) => n + 1);
  };

  // Restore a Version (undoable, saved immediately)
  const handleRestoreVersion = (version: PageVersion) => {
    handleSaveVersionCheckpoint(
      locale === 'ar' ? 'نقطة تلقائية قبل استعادة الإصدار' : 'Automatic checkpoint before restore'
    );
    pushHistory(strokesRef.current);
    strokesRef.current = [...(version.strokes || [])];
    textNotesRef.current = [...(version.textNotes || [])];
    previewRef.current = null;
    setTextNotes(textNotesRef.current);
    setActiveTextId(null);
    setSelectedPreviewVersion(null);
    renderBackgroundCanvas(strokesRef.current);
    scheduleSave(strokesRef.current, textNotesRef.current);
    flushNow();
  };

  // Preview or toggle between versions (read-only)
  const handleToggleVersion = (version: PageVersion | null) => {
    previewRef.current = version;
    setSelectedPreviewVersion(version);
    setActiveTextId(null);
    setLassoBox(null);
    lassoBoxRef.current = null;
    if (version) {
      renderBackgroundCanvas(version.strokes || []);
      setTextNotes(version.textNotes || []);
    } else {
      renderBackgroundCanvas(strokesRef.current);
      setTextNotes(textNotesRef.current);
    }
  };

  // Renders a region of the page (committed ink + typed notes) to an offscreen canvas
  const compositeRegion = (x0: number, y0: number, x1: number, y1: number): HTMLCanvasElement | null => {
    const bg = bgCanvasRef.current;
    if (!bg) return null;
    const d = dprRef.current;
    const W = logicalRef.current.w;
    const width = x1 - x0;
    const height = y1 - y0;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(width * d));
    out.height = Math.max(1, Math.round(height * d));
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bg, x0 * d, y0 * d, width * d, height * d, 0, 0, out.width, out.height);

    // Typed notes
    const theme = PAPER_THEMES[paperColorRef.current] || PAPER_THEMES.cream;
    const notes = previewRef.current ? previewRef.current.textNotes || [] : textNotesRef.current;
    ctx.save();
    ctx.scale(d, d);
    ctx.translate(-x0, -y0);
    ctx.textBaseline = 'top';
    for (const note of notes) {
      if (!note.text) continue;
      let col = note.color;
      if (theme.isDark && (col === '#1E293B' || col === '#000000' || !col)) col = '#F4F4F5';
      ctx.fillStyle = col || '#1C1917';
      ctx.font = `${note.fontSize}px ${note.fontFamily}`;
      const maxW = Math.max(80, W - note.x - 12);
      const lineH = Math.round(note.fontSize * 1.25);
      let ty = note.y + 4;
      for (const para of note.text.split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          const test = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(test).width > maxW) {
            ctx.fillText(line, note.x + 4, ty);
            ty += lineH;
            line = word;
          } else {
            line = test;
          }
        }
        ctx.fillText(line, note.x + 4, ty);
        ty += lineH;
      }
    }
    ctx.restore();

    return out;
  };


  useEffect(() => {
    if (!registerSnapshot) return;
    registerSnapshot(() => {
      if (strokesRef.current.length === 0 && !textNotesRef.current.some((n) => n.text.trim())) return null;
      const W = logicalRef.current.w;
      const H = logicalRef.current.h;
      const full = compositeRegion(0, 0, W, H);
      if (!full) return null;
      const maxW = 1800;
      let canvas = full;
      if (full.width > maxW) {
        const scaled = document.createElement('canvas');
        scaled.width = maxW;
        scaled.height = Math.round((full.height * maxW) / full.width);
        const sctx = scaled.getContext('2d');
        if (!sctx) return null;
        sctx.drawImage(full, 0, 0, scaled.width, scaled.height);
        canvas = scaled;
      }
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), box: { x: 0, y: 0, width: W, height: H } };
    });
    return () => registerSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSnapshot]);

  // Convert selection or page to tasks (composites typed notes into the exported image)
  const handleExtractSelection = () => {
    const bg = bgCanvasRef.current;
    if (!bg) return;
    const d = dprRef.current;
    const W = logicalRef.current.w;
    const H = logicalRef.current.h;
    let x0 = 0;
    let y0 = 0;
    let x1 = W;
    let y1 = H;

    if (lassoBox) {
      const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
      x0 = Math.round(clamp(Math.min(lassoBox.startX, lassoBox.endX), W));
      x1 = Math.round(clamp(Math.max(lassoBox.startX, lassoBox.endX), W));
      y0 = Math.round(clamp(Math.min(lassoBox.startY, lassoBox.endY), H));
      y1 = Math.round(clamp(Math.max(lassoBox.startY, lassoBox.endY), H));
      if (x1 - x0 < 20 || y1 - y0 < 20) {
        setLassoBox(null);
        lassoBoxRef.current = null;
        showNotice(
          locale === 'ar'
            ? 'منطقة التحديد صغيرة جداً. اسحب لتحديد منطقة أكبر.'
            : 'Selection is too small. Drag a larger area around the writing.'
        );
        return;
      }
    }

    const width = x1 - x0;
    const height = y1 - y0;
    const out = compositeRegion(x0, y0, x1, y1);
    if (!out) return;

    onExtractRegion(out.toDataURL('image/png'), { x: x0, y: y0, width, height });
    if (lassoBox) {
      setLassoBox(null);
      lassoBoxRef.current = null;
    }
  };

  // Movable toolbar (pointer events + capture)
  const handleToolbarPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragOffsetRef.current = { x: e.clientX - toolbarPos.x, y: e.clientY - toolbarPos.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setIsDraggingToolbar(true);
  };

  useEffect(() => {
    if (!isDraggingToolbar) return;
    const handleMove = (e: PointerEvent) => {
      const w = toolbarRef.current?.offsetWidth ?? 300;
      const minVisible = 120;
      setToolbarPos({
        x: Math.max(minVisible - w, Math.min(window.innerWidth - minVisible, e.clientX - dragOffsetRef.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffsetRef.current.y)),
      });
    };
    const handleUp = () => setIsDraggingToolbar(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDraggingToolbar]);

  // Live Cairo clock
  const [liveCairoTime, setLiveCairoTime] = useState(formatCairoHeaderDateTime(new Date(), locale));
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveCairoTime(formatCairoHeaderDateTime(new Date(), locale));
    }, 1000);
    return () => clearInterval(timer);
  }, [locale]);

  const commitHeader = () => {
    setIsEditingHeader(false);
    if (onTitleChangeRef.current) onTitleChangeRef.current(headerText);
  };

  const handleStampCairoTime = () => {
    if (previewRef.current) return;
    const stamped = formatCairoHeaderDateTime(new Date(), locale);
    setHeaderText(stamped);
    if (onTitleChangeRef.current) onTitleChangeRef.current(stamped);

    const newNote: CanvasTextItem = {
      id: `txt-stamp-${Date.now()}`,
      x: 40,
      y: 60,
      text: `[STAMPED: ${stamped}]`,
      fontSize: 14,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#0071e3',
    };
    const updated = [...textNotesRef.current, newNote];
    textNotesRef.current = updated;
    setTextNotes(updated);
    scheduleSave(strokesRef.current, updated);
  };


  return (
    <div className="relative flex-1 flex flex-col h-full bg-[#f5f5f7] overflow-hidden select-none">
      {/* Docked inking toolbar: lives in the layout flow so it can never cover the app header or the paper */}
      <div className="shrink-0 flex justify-center px-2 py-1.5 bg-[#f5f5f7] border-b border-[#e5e5ea] z-20">
      <div
        ref={toolbarRef}
        className="shadow-sm rounded-2xl bg-white border border-stone-200/90 text-stone-800 flex flex-wrap items-center justify-center gap-1.5 p-1.5 max-w-full"
      >
        {/* Minimized Pill Mode */}
        {isToolbarCollapsed ? (
          <div className="flex items-center gap-2 pr-2">
            <button
              onClick={() => setIsToolbarCollapsed(false)}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-[#0071e3] text-white rounded-xl shadow-xs"
            >
              <Pen className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'إظهار الأدوات' : 'Tools'}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mode: Stylus (with Palm Rejection) vs Finger Touch */}
            <div className="flex items-center bg-stone-100/90 p-0.5 rounded-xl border border-stone-200/80">
              <button
                onClick={() => setInteractionMode('stylus')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  interactionMode === 'stylus'
                    ? 'bg-[#0071e3] text-white font-bold shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
                title="Apple Pencil Inking with Native Palm Rejection"
              >
                <PenTool className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setInteractionMode('touch_nav')}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  interactionMode === 'touch_nav'
                    ? 'bg-[#0071e3] text-white font-bold shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
                title="Finger Navigation / Scroll"
              >
                <MousePointer className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-[1px] h-5 bg-stone-200" />

            {/* Inking Tools: Pen, Highlighter, Eraser, Text, Lasso */}
            <div className="flex items-center bg-stone-100/90 p-0.5 rounded-xl border border-stone-200/80">
              <button
                onClick={() => {
                  setTool('pen');
                  setLassoBox(null);
                  lassoBoxRef.current = null;
                }}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  tool === 'pen' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-stone-500 hover:text-stone-900'
                }`}
                title={t.pen}
              >
                <Pen className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setTool('highlighter');
                  setLassoBox(null);
                  lassoBoxRef.current = null;
                }}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  tool === 'highlighter' ? 'bg-amber-100 text-amber-800 shadow-xs font-bold' : 'text-stone-500 hover:text-stone-900'
                }`}
                title={t.highlighter}
              >
                <Highlighter className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setTool('eraser');
                  setLassoBox(null);
                  lassoBoxRef.current = null;
                }}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  tool === 'eraser' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-stone-500 hover:text-stone-900'
                }`}
                title={t.eraser}
              >
                <Eraser className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setTool('text');
                  setLassoBox(null);
                  lassoBoxRef.current = null;
                }}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  tool === 'text' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-stone-500 hover:text-stone-900'
                }`}
                title="Type Text with Font Control (Click paper to place)"
              >
                <Type className="w-4 h-4" />
              </button>

              <button
                onClick={() => setTool('lasso')}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  tool === 'lasso' ? 'bg-white text-[#0071e3] shadow-xs font-bold' : 'text-stone-500 hover:text-stone-900'
                }`}
                title={t.lasso}
              >
                <Scissors className="w-4 h-4" />
              </button>
            </div>

            <div className="w-[1px] h-5 bg-stone-200" />

            {/* Ink Colors & Custom Color */}
            <div className="flex items-center gap-1 bg-stone-100/90 px-1.5 py-1 rounded-xl border border-stone-200/80">
              {PEN_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => {
                    setPenColor(c.value);
                    if (tool === 'eraser' || tool === 'lasso') setTool('pen');
                  }}
                  className="w-4.5 h-4.5 rounded-full border border-black/15 transition-transform active:scale-90 flex items-center justify-center shrink-0"
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                >
                  {penColor === c.value && <Check className="w-2.5 h-2.5 text-white" />}
                </button>
              ))}

              {/* Native color picker */}
              <label
                className="w-4.5 h-4.5 rounded-full border border-black/15 flex items-center justify-center cursor-pointer relative overflow-hidden shrink-0 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500"
                title="Custom Ink Color"
              >
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setPenColor(e.target.value);
                  }}
                  className="opacity-0 absolute inset-0 cursor-pointer"
                />
              </label>

              {/* Stroke Width Toggle */}
              <button
                onClick={() => setLineWidth((prev) => (prev === 1.8 ? 2.8 : prev === 2.8 ? 4.5 : 1.8))}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded text-stone-700 hover:bg-stone-200 ml-0.5 font-bold"
                title="Pen Stroke Thickness"
              >
                {lineWidth === 1.8 ? 'Fine' : lineWidth === 2.8 ? 'Med' : 'Bold'}
              </button>
            </div>

            {/* Font Control Dropdown & Font Size */}
            <div className="relative">
              <button
                onClick={() => setShowFontMenu(!showFontMenu)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-stone-100/90 border border-stone-200/80 text-xs text-stone-700 hover:bg-stone-200"
                title="Font Family & Typography Control"
              >
                <span className="font-serif text-[11px] font-semibold">Aa</span>
                <ChevronDown className="w-3 h-3 text-stone-500" />
              </button>

              {showFontMenu && (
                <div className="absolute top-full mt-1.5 left-0 z-50 bg-white/95 backdrop-blur-2xl border border-stone-200 shadow-2xl rounded-2xl p-2.5 w-60 text-xs space-y-2 text-stone-800">
                  <div className="text-[10px] font-mono uppercase text-stone-400 pb-1 border-b border-stone-200">
                    {locale === 'ar' ? 'الخط والطباعة' : 'Font Family & Typography'}
                  </div>
                  <div className="space-y-1">
                    {FONT_FAMILIES.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => {
                          setFontFamily(f.value);
                          setShowFontMenu(false);
                          if (tool !== 'text') setTool('text');
                        }}
                        style={{ fontFamily: f.value }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                          fontFamily === f.value ? 'bg-[#0071e3] text-white font-bold' : 'text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <span>{f.label}</span>
                        {fontFamily === f.value && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
                    <span className="text-[11px] text-stone-500">{locale === 'ar' ? 'الحجم' : 'Font Size'}:</span>
                    <div className="flex items-center gap-1">
                      {FONT_SIZES.map((sz) => (
                        <button
                          key={sz}
                          onClick={() => setFontSize(sz)}
                          className={`w-6 h-6 rounded-md text-[10px] font-mono flex items-center justify-center ${
                            fontSize === sz ? 'bg-[#0071e3] text-white font-bold' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="w-[1px] h-5 bg-stone-200" />

            {/* Small Version Button */}
            <button
              onClick={() => setIsVersionModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50/80 hover:bg-blue-100 text-[#0071e3] border border-blue-200 text-xs font-semibold transition-colors"
              title="View Version & Edit History by Cairo Date and Time"
            >
              <Clock className="w-3.5 h-3.5 text-[#0071e3]" />
              <span>{locale === 'ar' ? 'الإصدارات' : 'Versions'}</span>
              <span className="text-[10px] bg-blue-200/60 px-1.5 py-0.2 rounded-full font-mono text-[#0071e3] font-bold">
                {versionsRef.current.length}
              </span>
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleUndo}
                disabled={!canUndo || !!selectedPreviewVersion}
                className="p-1.5 text-stone-500 hover:text-stone-900 disabled:opacity-25 rounded-lg hover:bg-stone-100"
                title={t.undoStroke}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo || !!selectedPreviewVersion}
                className="p-1.5 text-stone-500 hover:text-stone-900 disabled:opacity-25 rounded-lg hover:bg-stone-100"
                title={t.redoStroke}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* AI Extract Selection or Page */}
            <button
              onClick={handleExtractSelection}
              className="p-1.5 bg-[#0071e3] hover:bg-[#0062c4] text-white shadow-xs rounded-xl transition-all"
              title={lassoBox ? t.extractSelection : t.extractPage}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            {/* Minimize / Collapse Bar */}
            <button
              onClick={() => setIsToolbarCollapsed(true)}
              className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100"
              title="Minimize movable toolbar"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      </div>

      {/* Exit button for Full Paper View only (the normal toggle lives in the notebook sub-header) */}
      {onToggleFullScreenPaper && isFullScreenPaper && (
        <button
          onClick={onToggleFullScreenPaper}
          className={`fixed z-30 ${
            locale === 'ar' ? 'left-4' : 'right-4'
          } top-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg text-xs font-semibold transition-all ${
            isFullScreenPaper
              ? 'bg-[#0071e3] text-white shadow-blue-500/30'
              : 'bg-white/90 text-stone-800 border border-stone-200 hover:bg-white'
          }`}
          title={isFullScreenPaper ? t.showBars : t.hideBars}
        >
          {isFullScreenPaper ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">
            {isFullScreenPaper ? (locale === 'ar' ? 'إظهار الأشرطة' : 'Show Bars') : (locale === 'ar' ? 'شاشة كاملة للورقة' : 'Full Paper View')}
          </span>
        </button>
      )}

      {/* Version Preview Banner */}
      {selectedPreviewVersion && (
        <div className="bg-[#0071e3] text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-md z-20">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>
              {locale === 'ar'
                ? `معاينة إصدار محفوظ: ${selectedPreviewVersion.label || selectedPreviewVersion.cairoTimestamp}`
                : `Previewing Version: ${selectedPreviewVersion.label || selectedPreviewVersion.cairoTimestamp}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestoreVersion(selectedPreviewVersion)}
              className="px-3 py-1 bg-white text-[#0071e3] rounded-lg text-xs font-semibold hover:bg-stone-100"
            >
              {locale === 'ar' ? 'استعادة هذا الإصدار' : 'Restore this Version'}
            </button>
            <button
              onClick={() => handleToggleVersion(null)}
              className="px-2.5 py-1 bg-blue-700 text-white rounded-lg text-xs hover:bg-blue-800"
            >
              {locale === 'ar' ? 'العودة للمسودة الحالية' : 'Back to Current'}
            </button>
          </div>
        </div>
      )}

      {/* Paper Canvas Viewport */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto p-2 sm:p-4 lg:p-5 flex flex-col items-center select-none transition-colors duration-200 ${
          currentTheme.isDark ? 'bg-[#0e0f12]' : 'bg-[#e5e5ea]/80'
        }`}
        style={{
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'pan-x pan-y',
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        {/* Paper controls: full size (outside the scaled paper) so every control is a comfortable touch target on iPad; scrolls with the page */}
      <div className="w-full shrink-0 pb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 [&_button]:min-h-9">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg border shadow-2xs transition-colors"
                  style={{
                    backgroundColor: currentTheme.badgeBg,
                    borderColor: currentTheme.badgeBorder,
                    color: currentTheme.isDark ? '#38bdf8' : '#0071e3',
                  }}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-semibold">{liveCairoTime}</span>
                </div>
                <button
                  onClick={handleStampCairoTime}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-lg text-xs font-bold shadow-2xs transition-all active:scale-95"
                  title="Stamp current Cairo Time and Date into page header and notes"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'ختم الوقت والتاريخ الآن' : 'Stamp Now'}</span>
                </button>
              </div>
              {/* Controls Group: 4 Paper Styles + 4 Paper Colors + Orientation + Version + Trash */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. 4 Styles of Paper (Ruled Lines, Grid Boxes, Dot Grid, Blank Plain) */}
                <div
                  className="flex items-center gap-0.5 p-1 rounded-xl border transition-colors"
                  style={{
                    backgroundColor: currentTheme.badgeBg,
                    borderColor: currentTheme.badgeBorder,
                  }}
                  title={locale === 'ar' ? 'نمط تسطير الورقة (٤ أنماط)' : 'Paper Ruling Style (4 Styles)'}
                >
                  {PAPER_STYLES.map((ps) => {
                    const isSelected = paperStyle === ps.id;
                    return (
                      <button
                        key={ps.id}
                        onClick={() => {
                          setPaperStyle(ps.id);
                          if (onPaperStyleChange) onPaperStyleChange(ps.id);
                        }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-[#0071e3] text-white shadow-2xs font-bold'
                            : currentTheme.isDark
                            ? 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                            : 'text-stone-600 hover:text-stone-900 hover:bg-white/80'
                        }`}
                        title={`${ps.nameEn} · ${ps.nameAr}`}
                      >
                        {ps.id === 'ruled' && <AlignJustify className="w-3.5 h-3.5" />}
                        {ps.id === 'grid' && <Grid3X3 className="w-3.5 h-3.5" />}
                        {ps.id === 'dotted' && <Grid className="w-3.5 h-3.5" />}
                        {ps.id === 'blank' && <Square className="w-3.5 h-3.5" />}
                        <span className="hidden xl:inline">{locale === 'ar' ? ps.nameAr : ps.nameEn}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 2. 4 Background Colors of Notes & Ink (Cream, White, Sepia, Midnight Dark) */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl border transition-colors"
                  style={{
                    backgroundColor: currentTheme.badgeBg,
                    borderColor: currentTheme.badgeBorder,
                  }}
                  title={locale === 'ar' ? 'لون خلفية الورقة والحبر (٤ ألوان)' : 'Paper Background Color (4 Colors)'}
                >
                  {(['cream', 'white', 'sepia', 'dark'] as PaperColor[]).map((cKey) => {
                    const th = PAPER_THEMES[cKey];
                    const isSelected = paperColor === cKey;
                    return (
                      <button
                        key={cKey}
                        onClick={() => {
                          setPaperColor(cKey);
                          // Auto adjust pen if switching to/from dark
                          if (cKey === 'dark' && (penColor === '#1E293B' || penColor === '#475569')) {
                            setPenColor('#FFFFFF');
                          } else if (cKey !== 'dark' && penColor === '#FFFFFF') {
                            setPenColor('#1E293B');
                          }
                          if (onPaperColorChange) onPaperColorChange(cKey);
                        }}
                        className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'ring-2 ring-[#0071e3] ring-offset-1 scale-110'
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: th.bg,
                          borderColor: th.swatchBorder,
                        }}
                        title={`${th.nameEn} · ${th.nameAr}`}
                      >
                        {isSelected && (
                          <Check className={`w-2.5 h-2.5 ${th.isDark ? 'text-amber-400' : 'text-[#0071e3]'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* 3. Landscape / Portrait Orientation Toggle */}
                <button
                  onClick={() => {
                    const next = orientation === 'landscape' ? 'portrait' : 'landscape';
                    setOrientation(next);
                    if (onOrientationChange) onOrientationChange(next);
                  }}
                  className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all shadow-2xs ${
                    currentTheme.isDark
                      ? 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700 hover:text-white'
                      : 'bg-[#f5f5f7] text-stone-700 border-[#d2d2d7] hover:bg-[#e8e8ed] hover:text-stone-900'
                  }`}
                  title={orientation === 'landscape' ? (locale === 'ar' ? 'تبديل إلى رأسي (Portrait)' : 'Switch to Portrait paper') : (locale === 'ar' ? 'تبديل إلى أفقي (Landscape)' : 'Switch to Landscape paper')}
                >
                  {orientation === 'landscape' ? (
                    <>
                      <RectangleHorizontal className="w-3.5 h-3.5 text-[#0071e3]" />
                      <span className="hidden sm:inline">{locale === 'ar' ? 'أفقي' : 'Landscape'}</span>
                    </>
                  ) : (
                    <>
                      <RectangleVertical className="w-3.5 h-3.5 text-[#0071e3]" />
                      <span className="hidden sm:inline">{locale === 'ar' ? 'رأسي' : 'Portrait'}</span>
                    </>
                  )}
                </button>

                {/* 4. Small Version Button */}
                <button
                  onClick={() => setIsVersionModalOpen(true)}
                  className={`text-xs font-mono flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${
                    currentTheme.isDark
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                      : 'bg-stone-100 text-stone-600 border-stone-200 hover:text-stone-900'
                  }`}
                  title="Open Version History"
                >
                  <History className="w-3.5 h-3.5 text-[#0071e3]" />
                  <span>v{versionsRef.current.length + 1}</span>
                </button>

                {/* 5. Delete Page Button */}
                {onDeletePage && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                    title={locale === 'ar' ? 'حذف الصفحة' : 'Delete Page'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
      </div>

        <div
          className="relative shrink-0"
          style={{
            width: (canvasWidth + 2) * scale,
            height: paperH != null ? paperH * scale : undefined,
          }}
        >
        <div
          ref={paperRef}
          className="absolute top-0 left-0 shadow-xl rounded-2xl overflow-hidden select-none transition-colors duration-200"
          style={{
            width: canvasWidth + 2,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            backgroundColor: currentTheme.headerBg,
            borderColor: currentTheme.headerBorder,
            borderWidth: 1,
            borderStyle: 'solid',
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
          }}
        >
          {/* Executive Paper Stationery Header: Live Cairo Date & Time + 4 Styles + 4 Colors + Orientation */}
          <div
            className="p-4 sm:p-6 pb-3 relative z-10 font-sans select-none transition-colors duration-200"
            style={{
              backgroundColor: currentTheme.headerBg,
              borderBottom: `1px solid ${currentTheme.headerBorder}`,
              color: currentTheme.textColor,
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-2">
              <span className="font-mono text-[10px] tracking-wider uppercase font-bold" style={{ color: currentTheme.isDark ? '#38bdf8' : '#0071e3' }}>
                EXECUTIVE PLANNER · CAIRO BASELINE
              </span>
            </div>

            {/* Editable Header Date and Time (Cairo Time) + Stationery Customizer Strip */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {isEditingHeader ? (
                <input
                  type="text"
                  value={headerText}
                  onChange={(e) => {
                    setHeaderText(e.target.value);
                  }}
                  onBlur={commitHeader}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitHeader();
                  }}
                  autoFocus
                  style={{ color: currentTheme.textColor }}
                  className="text-lg sm:text-xl font-bold bg-transparent border-b-2 border-[#0071e3] focus:outline-none w-full tracking-tight font-serif"
                />
              ) : (
                <h1
                  onClick={() => setIsEditingHeader(true)}
                  style={{ color: currentTheme.textColor }}
                  className="text-lg sm:text-xl font-bold tracking-tight cursor-text hover:text-[#0071e3] transition-colors font-serif flex items-center gap-2 shrink-0"
                  title="Click to edit date and time of today"
                >
                  <span>{headerText}</span>
                  <Edit3 className="w-3.5 h-3.5 opacity-60 hover:opacity-100" style={{ color: currentTheme.subtextColor }} />
                </h1>
              )}

            </div>
          </div>

          {/* Canvas Wrapper with Double-Buffering & Zero Latency */}
          <div
            className="relative select-none touch-none"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: 'none',
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
            }}
          >
            {/* Background Canvas: committed strokes & ruled stationery lines */}
            <canvas
              ref={bgCanvasRef}
              width={Math.round(canvasWidth * dpr)}
              height={Math.round(canvasHeight * dpr)}
              style={{ width: canvasWidth, height: canvasHeight }}
              className="absolute inset-0 pointer-events-none select-none z-1"
            />

            {/* Active Drawing Canvas: real-time inking under Apple Pencil Pro with native non-passive listeners */}
            <canvas
              ref={activeCanvasRef}
              width={Math.round(canvasWidth * dpr)}
              height={Math.round(canvasHeight * dpr)}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
              }}
              className={`absolute inset-0 z-10 touch-none select-none ${
                interactionMode === 'stylus'
                  ? tool === 'text'
                    ? 'cursor-text'
                    : 'cursor-crosshair'
                  : 'cursor-grab'
              }`}
            />

            {/* Lasso Selection Box Render */}
            {lassoBox && (
              <div
                style={{
                  position: 'absolute',
                  left: `${Math.min(lassoBox.startX, lassoBox.endX)}px`,
                  top: `${Math.min(lassoBox.startY, lassoBox.endY)}px`,
                  width: `${Math.abs(lassoBox.endX - lassoBox.startX)}px`,
                  height: `${Math.abs(lassoBox.endY - lassoBox.startY)}px`,
                  border: '2px dashed #2563EB',
                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                  pointerEvents: 'none',
                  zIndex: 15,
                }}
              />
            )}

            {/* Typed Text Notes on Canvas (with font control and dark/light paper theme contrast) */}
            {textNotes.map((note) => {
              let displayColor = note.color;
              if (currentTheme.isDark && (displayColor === '#1E293B' || displayColor === '#000000' || !displayColor)) {
                displayColor = '#F4F4F5';
              }
              return (
                <div
                  key={note.id}
                  style={{
                    position: 'absolute',
                    left: `${note.x}px`,
                    top: `${note.y}px`,
                    fontFamily: note.fontFamily,
                    fontSize: `${note.fontSize}px`,
                    color: displayColor,
                    zIndex: 20,
                    pointerEvents:
                      !selectedPreviewVersion && (tool === 'text' || activeTextId === note.id) ? 'auto' : 'none',
                  }}
                  className="group select-text"
                >
                  {tool === 'text' && !selectedPreviewVersion && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        const updated = textNotesRef.current.filter((n) => n.id !== note.id);
                        textNotesRef.current = updated;
                        setTextNotes(updated);
                        if (activeTextId === note.id) setActiveTextId(null);
                        scheduleSave(strokesRef.current, updated);
                      }}
                      className="absolute -top-2.5 -right-2.5 z-10 w-5 h-5 rounded-full bg-rose-600 text-white text-[11px] leading-none flex items-center justify-center shadow"
                      title={locale === 'ar' ? 'حذف الملاحظة' : 'Delete note'}
                    >
                      ×
                    </button>
                  )}
                  {activeTextId === note.id ? (
                    <textarea
                      value={note.text}
                      autoFocus
                      onChange={(e) => {
                        const updated = textNotesRef.current.map((n) =>
                          n.id === note.id ? { ...n, text: e.target.value } : n
                        );
                        textNotesRef.current = updated;
                        setTextNotes(updated);
                        scheduleSave(strokesRef.current, updated);
                      }}
                      onBlur={() => {
                        setActiveTextId(null);
                        const cleaned = textNotesRef.current.filter(
                          (n) => !(n.id === note.id && n.text.trim() === '')
                        );
                        if (cleaned.length !== textNotesRef.current.length) {
                          textNotesRef.current = cleaned;
                          setTextNotes(cleaned);
                        }
                        scheduleSave(strokesRef.current, textNotesRef.current);
                      }}
                      placeholder={locale === 'ar' ? 'اكتب ملاحظتك هنا...' : 'Type note here...'}
                      className={`p-1.5 rounded border focus:outline-none min-w-[200px] resize ${
                        currentTheme.isDark
                          ? 'bg-zinc-800 text-white border-amber-500 shadow-lg'
                          : 'bg-white/90 text-stone-900 border-amber-500 shadow-sm'
                      }`}
                    />
                  ) : (
                    <div
                      onClick={() => {
                        if (!selectedPreviewVersion) setActiveTextId(note.id);
                      }}
                      className={`cursor-pointer p-1 rounded transition-colors whitespace-pre-wrap ${
                        currentTheme.isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-amber-100/40'
                      }`}
                    >
                      {note.text || (locale === 'ar' ? '[ملاحظة فارغة]' : '[Empty text note]')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-stone-900/90 text-white text-xs font-semibold shadow-xl"
        >
          {notice}
        </div>
      )}

      {/* Version History Modal */}
      <VersionHistoryModal
        isOpen={isVersionModalOpen}
        pageTitle={headerText}
        versions={versionsRef.current}
        currentStrokes={strokesRef.current}
        currentTextNotes={textNotesRef.current}
        selectedVersionId={selectedPreviewVersion?.id || null}
        locale={locale}
        onClose={() => setIsVersionModalOpen(false)}
        onSelectVersion={handleToggleVersion}
        onRestoreVersion={handleRestoreVersion}
        onSaveCheckpoint={handleSaveVersionCheckpoint}
      />

      {/* Delete Page Confirmation Modal */}
      {showDeleteConfirm && (
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
                    ? 'سيتم حذف الصفحة ويمكنك التراجع عبر إشعار التراجع السريع.'
                    : 'This page will be removed. You can undo this action from the undo toast.'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
              >
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  flushNow();
                  if (onDeletePage) onDeletePage();
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
