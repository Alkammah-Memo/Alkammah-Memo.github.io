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
import { PLANNER_CANVAS } from '../../lib/planner';
import { drawPlannerTemplate, isPlannerTemplate } from './plannerTemplates';
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
  ChevronRight,
  ChevronLeft,
  AlignJustify,
  Grid3X3,
  Grid,
  Square,
  Palette,
  SlidersHorizontal,
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
  /** 'YYYY-MM-DD' (daily) or 'YYYY-MM' (monthly): drives the printed date/month of the planner templates */
  plannerDate?: string;
  /** Imported page image (JPEG data URL) drawn as the paper for 'planner_archive' pages */
  backgroundImage?: string;
  /** Logical canvas size; planner templates default to 1450x1007 */
  canvasSize?: { width: number; height: number };
  pageTitle: string;
  initialStrokes: InkStroke[];
  initialTextNotes?: CanvasTextItem[];
  versions?: PageVersion[];
  locale: Locale;
  orientation?: 'landscape' | 'portrait';
  paperStyle?: PaperStyle;
  paperColor?: PaperColor;
  isFullScreenPaper?: boolean;
  hideTools?: boolean;
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

const DEFAULT_PEN_COLOR = '#2F6FEA';
const DEFAULT_HIGHLIGHT_COLOR = '#FDE047';

// Palette follows the planner: blue handwriting, orange status marks, plus the usual dark inks
const PEN_COLORS = [
  { name: 'Ink Blue', value: DEFAULT_PEN_COLOR },
  { name: 'Obsidian Black', value: '#1E293B' },
  { name: 'Status Orange', value: '#E8A13A' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Emerald Green', value: '#047857' },
  { name: 'Navy', value: '#1E3A8A' },
  { name: 'Imperial Burgundy', value: '#881337' },
  { name: 'Graphite Slate', value: '#475569' },
  { name: 'Pure White', value: '#FFFFFF' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow (due dates)', nameAr: 'أصفر (تواريخ الاستحقاق)', value: DEFAULT_HIGHLIGHT_COLOR },
  { name: 'Green (ongoing)', nameAr: 'أخضر (جارٍ)', value: '#86EFAC' },
  { name: 'Orange', nameAr: 'برتقالي', value: '#FDBA74' },
  { name: 'Pink', nameAr: 'وردي', value: '#F9A8D4' },
];

const PEN_COLOR_KEY = 'alkammah_pen_color';
const HL_COLOR_KEY = 'alkammah_hl_color';
const readStored = (key: string, fallback: string, allowed: string[]): string => {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed.includes(v) || /^#[0-9a-fA-F]{6}$/.test(v))) return v;
  } catch {
    /* storage unavailable */
  }
  return fallback;
};
const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

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
const HIGHLIGHT_WIDTH = 18;
const LEGACY_HIGHLIGHT = /^(#f59e0b|rgba?\(\s*245\s*,\s*158\s*,\s*11)/i;
const highlightAlpha = (theme: { isDark: boolean }, color?: string) =>
  color && LEGACY_HIGHLIGHT.test(color) ? (theme.isDark ? 0.45 : 0.35) : theme.isDark ? 0.55 : 0.5;

/** Decoded archive page images, keyed by page id (small LRU: a decoded 1450x1007 page is ~6MB) */
const archiveImages = new Map<string, { src: string; img: HTMLImageElement; ready: boolean }>();
const ARCHIVE_CACHE_MAX = 4;

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
export const paintStroke = (
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
    ctx.globalAlpha = highlightAlpha(theme, stroke.color);
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
  template,
  plannerDate,
  backgroundImage,
  canvasSize: canvasSizeProp,
  pageTitle,
  initialStrokes,
  initialTextNotes = [],
  versions = [],
  locale,
  orientation: initialOrientation = 'landscape',
  paperStyle: initialPaperStyle = 'ruled',
  paperColor: initialPaperColor = 'cream',
  isFullScreenPaper = false,
  hideTools = false,
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

  // Planner / imported pages have a fixed logical size (the aspect of the printed planner) and their own printed layout
  const isArchive = template === 'planner_archive';
  const isPlanner = isPlannerTemplate(template);
  const fixedSize = canvasSizeProp ?? (isPlanner ? PLANNER_CANVAS : undefined);
  const hasFixedPaper = isPlanner || isArchive;
  const canvasWidth = fixedSize ? fixedSize.width : orientation === 'landscape' ? DEFAULT_LANDSCAPE_WIDTH : DEFAULT_PORTRAIT_WIDTH;
  const canvasHeight = fixedSize ? fixedSize.height : orientation === 'landscape' ? DEFAULT_LANDSCAPE_HEIGHT : DEFAULT_PORTRAIT_HEIGHT;

  const templateRef = useRef({ template, plannerDate, backgroundImage, pageTitle, locale, pageId });
  templateRef.current = { template, plannerDate, backgroundImage, pageTitle, locale, pageId };
  const [imageTick, setImageTick] = useState(0);

  const [dpr, setDpr] = useState<number>(getDpr);
  const dprRef = useRef<number>(dpr);
  dprRef.current = dpr;
  const logicalRef = useRef({ w: canvasWidth, h: canvasHeight });
  logicalRef.current = { w: canvasWidth, h: canvasHeight };
  const [fit, setFit] = useState<number>(1);
  // Pinch / button zoom of the paper only (1 = fit to width). The page, bars and tabs never move: the paper scrolls inside its own frame.
  const [zoom, setZoom] = useState<number>(1);
  const scale = fit * zoom;
  // how far you can zoom depends on the screen: a small phone (paper shrunk a lot) may zoom further than an iPad, up to about 160% of the paper's real size
  const ZOOM_MAX = Math.min(6, Math.max(2, 1.6 / fit));
  const zoomMaxRef = useRef(ZOOM_MAX);
  zoomMaxRef.current = ZOOM_MAX;
  const zoomWrapRef = useRef<HTMLDivElement | null>(null);
  const zoomAnchorRef = useRef<{ fx: number; fy: number; mx: number; my: number } | null>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const cancelInkRef = useRef<() => void>(() => undefined);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState<number>(56);
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
  const [penColor, setPenColor] = useState<string>(() =>
    readStored(PEN_COLOR_KEY, DEFAULT_PEN_COLOR, PEN_COLORS.map((c) => c.value))
  );
  const [hlColor, setHlColor] = useState<string>(() =>
    readStored(HL_COLOR_KEY, DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS.map((c) => c.value))
  );
  const [customColor, setCustomColor] = useState<string>(DEFAULT_PEN_COLOR);
  const [lineWidth, setLineWidth] = useState<number>(2.5);

  // Font Control Settings
  const [fontFamily, setFontFamily] = useState<string>(FONT_FAMILIES[0].value);
  const [fontSize, setFontSize] = useState<number>(18);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  // Synchronized refs for zero-latency event handlers
  const toolRef = useRef<ToolMode>(tool);
  const interactionModeRef = useRef<InteractionMode>(interactionMode);
  const penColorRef = useRef<string>(penColor);
  const hlColorRef = useRef<string>(hlColor);
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
    if (penColor.toUpperCase() !== '#FFFFFF') writeStored(PEN_COLOR_KEY, penColor);
  }, [penColor]);
  useEffect(() => {
    hlColorRef.current = hlColor;
    writeStored(HL_COLOR_KEY, hlColor);
  }, [hlColor]);
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
  // Pen tools live in a slim, movable rail: drag the grip anywhere on the page, tap the arrow to fold it away
  const RAIL_KEY = 'alkammah_pen_rail';
  const [railPos, setRailPos] = useState<{ x: number; y: number }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(RAIL_KEY) || 'null');
      if (v && typeof v.x === 'number' && typeof v.y === 'number') return { x: v.x, y: v.y };
    } catch {
      /* ignore */
    }
    return { x: 0, y: 48 };
  });
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(RAIL_KEY) || 'null');
      if (v && typeof v.c === 'boolean') return v.c;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [showColorMenu, setShowColorMenu] = useState<boolean>(false);
  const canvasRootRef = useRef<HTMLDivElement | null>(null);
  const railDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const saveRail = (pos: { x: number; y: number }, collapsed: boolean) => {
    try {
      localStorage.setItem(RAIL_KEY, JSON.stringify({ x: pos.x, y: pos.y, c: collapsed }));
    } catch {
      /* ignore */
    }
  };
  const onRailPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    railDragRef.current = { sx: e.clientX, sy: e.clientY, ox: railPos.x, oy: railPos.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onRailPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = railDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const root = canvasRootRef.current;
    const w = root?.clientWidth ?? window.innerWidth;
    const h = root?.clientHeight ?? window.innerHeight;
    const rw = railCollapsed ? 24 : 36;
    const rh = toolbarRef.current?.offsetHeight ?? 44;
    setRailPos({
      x: Math.max(0, Math.min(Math.max(0, w - rw), d.ox + dx)),
      y: Math.max(0, Math.min(Math.max(0, h - rh), d.oy + dy)),
    });
  };
  const onRailPointerUp = () => {
    const d = railDragRef.current;
    railDragRef.current = null;
    if (!d) return;
    if (d.moved) {
      saveRail(railPos, railCollapsed);
    } else {
      const next = !railCollapsed;
      setRailCollapsed(next);
      setShowColorMenu(false);
      setShowFontMenu(false);
      saveRail(railPos, next);
    }
  };
  const [showPageOptions, setShowPageOptions] = useState<boolean>(false); // phones: paper style/colour row folded away by default
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
    const tpl = templateRef.current;

    if (isPlannerTemplate(tpl.template)) {
      drawPlannerTemplate(ctx, W, H, tpl.template, {
        isDark: theme.isDark,
        locale: tpl.locale === 'ar' ? 'ar' : 'en',
        plannerDate: tpl.plannerDate,
        title: tpl.pageTitle,
        textColor: theme.textColor,
        subtextColor: theme.subtextColor,
      });
    } else if (tpl.template === 'planner_archive') {
      const entry = archiveImages.get(tpl.pageId);
      if (entry && entry.ready && entry.src === tpl.backgroundImage) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(entry.img, 0, 0, W, H);
      }
    } else if (currentStyle === 'ruled') {
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

    // Date column: a vertical rule near the right edge on every ordinary page, so the text goes on the left and the date on the right
    if (!isPlannerTemplate(tpl.template) && tpl.template !== 'planner_archive') {
      ctx.save();
      ctx.strokeStyle = theme.marginLine;
      ctx.lineWidth = 1.4;
      const dateX = Math.round(W * 0.74);
      ctx.beginPath();
      ctx.moveTo(dateX, topMargin - 20);
      ctx.lineTo(dateX, H - 30);
      ctx.stroke();
      ctx.restore();
    }

    for (const stroke of strokesToRender) paintStroke(ctx, stroke, theme);
  }, []);

  // Resize / orientation / paper change: backing store is reset by React, so redraw synchronously (no blank frame)
  useLayoutEffect(() => {
    renderBackgroundCanvas(previewRef.current ? previewRef.current.strokes || [] : strokesRef.current);
  }, [canvasWidth, canvasHeight, dpr, paperStyle, paperColor, template, plannerDate, backgroundImage, pageTitle, locale, imageTick, renderBackgroundCanvas]);

  // Decode the imported page image once per page (cached), then redraw
  useEffect(() => {
    if (template !== 'planner_archive' || !backgroundImage) return;
    const cached = archiveImages.get(pageId);
    if (cached && cached.src === backgroundImage) {
      // refresh LRU position
      archiveImages.delete(pageId);
      archiveImages.set(pageId, cached);
      if (cached.ready) setImageTick((n) => n + 1);
      return;
    }
    const img = new Image();
    const entry = { src: backgroundImage, img, ready: false };
    archiveImages.set(pageId, entry);
    while (archiveImages.size > ARCHIVE_CACHE_MAX) {
      const oldest = archiveImages.keys().next().value;
      if (oldest === undefined || oldest === pageId) break;
      archiveImages.delete(oldest);
    }
    img.onload = () => {
      entry.ready = true;
      setImageTick((n) => n + 1); // harmless if the page has since changed: it just redraws the current page
    };
    img.onerror = () => {
      archiveImages.delete(pageId);
    };
    img.src = backgroundImage;
  }, [pageId, template, backgroundImage]);

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
      setFit((prev) => (Math.abs(prev - s) < 0.001 ? prev : s));
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

  // Zoom the paper inside its own frame: two-finger pinch, Ctrl/trackpad pinch, or the +/- buttons. Keeps the point under the fingers in place.
  const applyZoom = useCallback((next: number, mx?: number, my?: number) => {
    const z = Math.max(1, Math.min(zoomMaxRef.current, next));
    if (Math.abs(z - zoomRef.current) < 0.001) return;
    const c = containerRef.current;
    const w = zoomWrapRef.current;
    if (c && w) {
      const r = w.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const x = mx ?? cr.left + cr.width / 2;
      const y = my ?? cr.top + cr.height / 2;
      zoomAnchorRef.current = { fx: (x - r.left) / (r.width || 1), fy: (y - r.top) / (r.height || 1), mx: x, my: y };
    }
    setZoom(z);
  }, []);
  useLayoutEffect(() => {
    const a = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    const c = containerRef.current;
    const w = zoomWrapRef.current;
    if (!a || !c || !w) return;
    const r = w.getBoundingClientRect();
    c.scrollLeft += r.left + a.fx * r.width - a.mx;
    c.scrollTop += r.top + a.fy * r.height - a.my;
  }, [zoom]);
  useEffect(() => {
    setZoom(1);
  }, [pageId]);
  // after a rotation or resize the allowed zoom changes: never stay above it
  useEffect(() => {
    setZoom((z) => Math.min(z, ZOOM_MAX));
  }, [ZOOM_MAX]);
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    let pinch: { d0: number; z0: number; mx: number; my: number } | null = null;
    let pan: { x: number; y: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        cancelInkRef.current();
        pan = null;
        const m = mid(e.touches);
        pinch = { d0: dist(e.touches) || 1, z0: zoomRef.current, mx: m.x, my: m.y };
      } else if (e.touches.length === 1 && zoomRef.current > 1.001 && interactionModeRef.current === 'stylus' && toolRef.current !== 'text' && toolRef.current !== 'lasso') {
        // a finger only moves the zoomed paper here (the pen does the writing), so drag to pan
        pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pan && e.touches.length === 1) {
        e.preventDefault();
        c.scrollBy(pan.x - e.touches[0].clientX, pan.y - e.touches[0].clientY);
        pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return;
      }
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const m = mid(e.touches);
      c.scrollBy(pinch.mx - m.x, pinch.my - m.y); // two fingers also drag the paper around
      pinch.mx = m.x;
      pinch.my = m.y;
      applyZoom(pinch.z0 * (dist(e.touches) / pinch.d0), m.x, m.y);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) pan = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // plain scrolling stays normal
      e.preventDefault();
      applyZoom(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    const block = (e: Event) => e.preventDefault(); // iOS Safari's own page pinch
    c.addEventListener('touchstart', onStart, { passive: true });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onEnd, { passive: true });
    c.addEventListener('touchcancel', onEnd, { passive: true });
    c.addEventListener('wheel', onWheel, { passive: false });
    c.addEventListener('gesturestart', block, { passive: false });
    c.addEventListener('gesturechange', block, { passive: false });
    return () => {
      c.removeEventListener('touchstart', onStart);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onEnd);
      c.removeEventListener('touchcancel', onEnd);
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('gesturestart', block);
      c.removeEventListener('gesturechange', block);
    };
  }, [applyZoom]);

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
    let sessionIsTouch = false;
    // a second finger means pinch-zoom: drop a half-drawn finger stroke instead of leaving a stray mark
    cancelInkRef.current = () => {
      if (session && sessionIsTouch) finish({ pointerId: session.pointerId, preventDefault: () => undefined } as PointerEvent, true);
    };
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
      sessionIsTouch = isTouch;
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
      const color = isHl ? hlColorRef.current : penColorRef.current;
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
        canvas.style.opacity = String(highlightAlpha(PAPER_THEMES[paperColorRef.current] || PAPER_THEMES.cream, color));
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
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight || 56);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasFixedPaper, template]);
  const [liveCairoTime, setLiveCairoTime] = useState(formatCairoHeaderDateTime(new Date(), locale));
  const shortCairoClock = (void liveCairoTime, new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }));
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
    <div ref={canvasRootRef} className="relative flex-1 flex flex-col h-full bg-[#f5f5f7] overflow-hidden select-none">
      {/* Docked inking toolbar: lives in the layout flow so it can never cover the app header or the paper */}
      <div
        ref={toolbarRef}
        className="absolute z-40 flex flex-col items-start pointer-events-none"
        style={{ left: railPos.x, top: railPos.y, maxHeight: `calc(100% - ${railPos.y}px)` }}
      >
        {/* Grip + arrow: drag to move the rail anywhere, tap to fold it away or bring it back */}
        <button
          type="button"
          aria-label={railCollapsed ? (locale === 'ar' ? 'إظهار أدوات القلم' : 'Show pen tools') : (locale === 'ar' ? 'إخفاء أدوات القلم' : 'Hide pen tools')}
          aria-expanded={!railCollapsed}
          onPointerDown={onRailPointerDown}
          onPointerMove={onRailPointerMove}
          onPointerUp={onRailPointerUp}
          onPointerCancel={onRailPointerUp}
          className={`pointer-events-auto bg-[#0071e3] text-white shadow-lg flex items-center justify-center active:bg-[#0062c4] ${
            railCollapsed ? 'w-6 h-10 rounded-xl' : 'w-9 h-6 rounded-xl mb-0.5'
          }`}
          style={{ touchAction: 'none' }}
        >
          {railCollapsed ? (
            locale === 'ar' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          )}
        </button>

        {!railCollapsed && (
          <div className="pointer-events-auto relative min-h-0 flex">
            {/* Flyouts (colour / font) open toward the middle of the screen */}
            {(showColorMenu || showFontMenu) && (
              <div
                className={`absolute top-0 z-50 bg-white/95 backdrop-blur-2xl border border-stone-200 shadow-2xl rounded-2xl p-2.5 ${
                  railPos.x + 22 > (canvasRootRef.current?.clientWidth ?? 0) / 2 ? 'right-full mr-2' : 'left-full ml-2'
                }`}
                style={{ width: 'min(232px, 62vw)' }}
              >
                {showColorMenu && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-5 gap-2 justify-items-center">
                      {(tool === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS).map((c) => {
                        const active = tool === 'highlighter' ? hlColor : penColor;
                        const label = locale === 'ar' && 'nameAr' in c ? (c as { nameAr: string }).nameAr : c.name;
                        return (
                          <button
                            key={c.value}
                            onClick={() => {
                              if (tool === 'highlighter') setHlColor(c.value);
                              else {
                                setPenColor(c.value);
                                if (tool === 'eraser' || tool === 'lasso') setTool('pen');
                              }
                              setShowColorMenu(false);
                            }}
                            className="w-8 h-8 rounded-full border border-black/15 active:scale-90 flex items-center justify-center"
                            style={{ backgroundColor: c.value }}
                            title={label}
                            aria-label={label}
                            aria-pressed={active === c.value}
                          >
                            {active === c.value && (
                              <Check className={`w-3.5 h-3.5 ${c.value === '#FFFFFF' || tool === 'highlighter' ? 'text-stone-800' : 'text-white'}`} />
                            )}
                          </button>
                        );
                      })}
                      <label
                        className="w-8 h-8 rounded-full border border-black/15 flex items-center justify-center cursor-pointer relative overflow-hidden bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-500"
                        title={locale === 'ar' ? 'لون مخصص' : 'Custom Ink Color'}
                      >
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => {
                            setCustomColor(e.target.value);
                            if (tool === 'highlighter') setHlColor(e.target.value);
                            else setPenColor(e.target.value);
                          }}
                          className="opacity-0 absolute inset-0 cursor-pointer"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-1 pt-2 border-t border-stone-200">
                      {([[1.8, 'Fine', 'رفيع'], [2.8, 'Med', 'وسط'], [4.5, 'Bold', 'عريض']] as const).map(([w, en, arl]) => (
                        <button
                          key={w}
                          onClick={() => setLineWidth(w)}
                          className={`flex-1 h-8 rounded-lg text-[11px] font-bold ${lineWidth === w ? 'bg-[#0071e3] text-white' : 'bg-stone-100 text-stone-700'}`}
                        >
                          {locale === 'ar' ? arl : en}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showFontMenu && (
                  <div className="space-y-2 text-xs">
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
                          className={`w-full text-start px-2.5 py-2 rounded-lg flex items-center justify-between text-xs ${
                            fontFamily === f.value ? 'bg-[#0071e3] text-white font-bold' : 'text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <span>{f.label}</span>
                          {fontFamily === f.value && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-stone-200 flex items-center justify-between gap-1">
                      {FONT_SIZES.map((sz) => (
                        <button
                          key={sz}
                          onClick={() => setFontSize(sz)}
                          className={`w-7 h-7 rounded-md text-[10px] font-mono flex items-center justify-center ${
                            fontSize === sz ? 'bg-[#0071e3] text-white font-bold' : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-stone-200 shadow-xl rounded-2xl p-0.5 flex flex-col items-center gap-0.5 overflow-y-auto overscroll-contain min-h-0 w-9 [&_button]:shrink-0">
              {(
                [
                  ['pen', Pen, t.pen],
                  ['highlighter', Highlighter, t.highlighter],
                  ['eraser', Eraser, t.eraser],
                  ['text', Type, locale === 'ar' ? 'نص' : 'Text'],
                  ['lasso', Scissors, t.lasso],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setTool(id);
                    if (id !== 'lasso') {
                      setLassoBox(null);
                      lassoBoxRef.current = null;
                    }
                  }}
                  title={label}
                  aria-label={label}
                  aria-pressed={tool === id}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    tool === id ? (id === 'highlighter' ? 'bg-amber-100 text-amber-800' : 'bg-[#0071e3] text-white') : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}

              <div className="w-5 h-px bg-stone-200 my-px" />

              <button
                onClick={() => {
                  setShowColorMenu((v) => !v);
                  setShowFontMenu(false);
                }}
                title={locale === 'ar' ? 'اللون والسماكة' : 'Colour & thickness'}
                aria-label={locale === 'ar' ? 'اللون والسماكة' : 'Colour & thickness'}
                className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-stone-100"
              >
                <span className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-black/20" style={{ backgroundColor: tool === 'highlighter' ? hlColor : penColor }} />
              </button>
              <button
                onClick={() => {
                  setShowFontMenu((v) => !v);
                  setShowColorMenu(false);
                }}
                title="Font"
                aria-label="Font"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-700 hover:bg-stone-100 font-serif text-sm font-semibold"
              >
                Aa
              </button>

              <div className="w-5 h-px bg-stone-200 my-px" />

              <button
                onClick={handleUndo}
                disabled={!canUndo || !!selectedPreviewVersion}
                title={t.undoStroke}
                aria-label={t.undoStroke}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-25"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo || !!selectedPreviewVersion}
                title={t.redoStroke}
                aria-label={t.redoStroke}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-25"
              >
                <Redo2 className="w-4 h-4" />
              </button>

              <div className="w-5 h-px bg-stone-200 my-px" />

              <button
                onClick={() => setInteractionMode(interactionMode === 'stylus' ? 'touch_nav' : 'stylus')}
                title={interactionMode === 'stylus' ? 'Pencil mode (finger scrolls) – tap for finger drawing' : 'Finger mode – tap for Pencil mode'}
                aria-label="Pencil or finger"
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${interactionMode === 'stylus' ? 'text-[#0071e3] bg-blue-50' : 'text-stone-600 hover:bg-stone-100'}`}
              >
                {interactionMode === 'stylus' ? <PenTool className="w-4 h-4" /> : <MousePointer className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsVersionModalOpen(true)}
                title={locale === 'ar' ? 'الإصدارات' : 'Versions'}
                aria-label={locale === 'ar' ? 'الإصدارات' : 'Versions'}
                className="relative w-8 h-8 rounded-xl flex items-center justify-center text-[#0071e3] hover:bg-blue-50"
              >
                <Clock className="w-4 h-4" />
                {versionsRef.current.length > 0 && (
                  <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0071e3] text-white text-[9px] font-mono font-bold flex items-center justify-center">
                    {versionsRef.current.length}
                  </span>
                )}
              </button>
              <button
                onClick={handleExtractSelection}
                title={lassoBox ? t.extractSelection : t.extractPage}
                aria-label={lassoBox ? t.extractSelection : t.extractPage}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#0071e3] text-white"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
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

      {/* Paper zoom: only the paper changes size, scrolling inside its frame */}
      <div
        className="absolute z-30 bottom-2 end-2 flex items-center rounded-full bg-white/80 backdrop-blur border border-stone-200 shadow-sm text-stone-700 opacity-80"
        style={{ touchAction: 'manipulation' }}
        dir="ltr"
      >
        <button type="button" aria-label={locale === 'ar' ? 'تصغير الورقة' : 'Zoom out'} disabled={zoom <= 1.001} onClick={() => applyZoom(zoom / 1.25)} className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs leading-none font-bold disabled:opacity-30 active:bg-stone-100">
          −
        </button>
        <button type="button" aria-label={locale === 'ar' ? 'ملاءمة العرض' : 'Fit to width'} onClick={() => applyZoom(1)} className="min-w-8 h-6 px-0.5 rounded-full text-[9px] font-semibold tabular-nums active:bg-stone-100">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label={locale === 'ar' ? 'تكبير الورقة' : 'Zoom in'} disabled={zoom >= ZOOM_MAX - 0.001} onClick={() => applyZoom(zoom * 1.25)} className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs leading-none font-bold disabled:opacity-30 active:bg-stone-100">
          +
        </button>
      </div>

      {/* Paper Canvas Viewport */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto p-2 sm:p-4 lg:p-5 flex flex-col select-none transition-colors duration-200 ${
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
        <div
          ref={zoomWrapRef}
          className="relative shrink-0 mx-auto"
          style={{
            width: (canvasWidth + 2) * scale,
            height: paperH != null ? paperH * scale : undefined,
          }}
        >
        {/* Page controls live inside the paper's header row, next to the title: no extra bar above the paper */}
        {!hideTools && (
          <div
            className="absolute z-20 flex items-center"
            style={{ top: 0, height: headerH * scale, [locale === 'ar' ? 'left' : 'right']: 8 }}
          >
            {/* phones: only the paper-style and orientation extras fold away; clock, colours, version and delete stay in the title row */}
            {!hasFixedPaper && (
              <button
                type="button"
                onClick={() => setShowPageOptions((v) => !v)}
                aria-expanded={showPageOptions}
                aria-label={locale === 'ar' ? 'خيارات الصفحة' : 'Page options'}
                className="sm:hidden h-7 w-7 me-1 inline-flex items-center justify-center rounded-full border shadow-2xs"
                style={{ backgroundColor: currentTheme.badgeBg, borderColor: currentTheme.badgeBorder, color: currentTheme.textColor }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
            <div
              className={`flex items-center rounded-xl [&_button]:min-h-0 max-sm:text-[10px] max-sm:[&_svg]:w-3 max-sm:[&_svg]:h-3 max-sm:scale-[0.72] ${locale === 'ar' ? 'max-sm:origin-left' : 'max-sm:origin-right'}`}
            >
              {/* Controls Group: 4 Paper Styles + 4 Paper Colors + Orientation + Version + Trash */}
              <div className="flex items-center gap-1.5 max-sm:gap-1 flex-wrap justify-end max-sm:max-w-[84vw]">
                <div
                  className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 max-sm:px-1.5 max-sm:py-0.5 rounded-lg border"
                  style={{ backgroundColor: currentTheme.badgeBg, borderColor: currentTheme.badgeBorder, color: currentTheme.isDark ? '#38bdf8' : '#0071e3' }}
                  title={liveCairoTime}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-semibold">{shortCairoClock}</span>
                </div>
                {!hasFixedPaper && (
                <button
                  onClick={handleStampCairoTime}
                  className={`flex items-center gap-1.5 px-2.5 py-1 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-lg text-xs font-bold shadow-2xs transition-all active:scale-95 ${showPageOptions ? '' : 'max-sm:hidden'}`}
                  title={locale === 'ar' ? 'ختم الوقت والتاريخ الآن' : 'Stamp current Cairo time and date into the page header'}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{locale === 'ar' ? 'ختم الوقت' : 'Stamp'}</span>
                </button>
                )}
                {/* 1. 4 Styles of Paper (Ruled Lines, Grid Boxes, Dot Grid, Blank Plain): hidden on planner pages, which have their own printed layout */}
                {!hasFixedPaper && (
                <div
                  className={`flex items-center gap-0.5 p-1 rounded-xl border transition-colors ${showPageOptions ? '' : 'max-sm:hidden'}`}
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
                )}

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
                            setPenColor(readStored(PEN_COLOR_KEY, DEFAULT_PEN_COLOR, PEN_COLORS.map((c) => c.value)));
                          }
                          if (onPaperColorChange) onPaperColorChange(cKey);
                        }}
                        className={`w-5 h-5 max-sm:w-4 max-sm:h-4 rounded-full border transition-all flex items-center justify-center shrink-0 ${
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

                {/* 3. Landscape / Portrait Orientation Toggle (planner pages keep the size of the printed page) */}
                {!hasFixedPaper && (
                <button
                  onClick={() => {
                    const next = orientation === 'landscape' ? 'portrait' : 'landscape';
                    setOrientation(next);
                    if (onOrientationChange) onOrientationChange(next);
                  }}
                  className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all shadow-2xs ${showPageOptions ? '' : 'max-sm:hidden'} ${
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
                )}

                {/* 4. Small Version Button */}
                <button
                  onClick={() => setIsVersionModalOpen(true)}
                  className={`text-xs font-mono flex items-center gap-1 px-2.5 py-1 max-sm:px-1.5 max-sm:py-0.5 rounded-lg border transition-colors ${
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
                    className="p-1.5 max-sm:p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                    title={locale === 'ar' ? 'حذف الصفحة' : 'Delete Page'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
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
            ref={headerRef}
            className={`${hasFixedPaper ? 'px-4 py-2 sm:px-6' : 'p-4 sm:p-6 pb-3'} relative z-10 font-sans select-none transition-colors duration-200`}
            style={{
              backgroundColor: currentTheme.headerBg,
              borderBottom: `1px solid ${currentTheme.headerBorder}`,
              color: currentTheme.textColor,
            }}
          >
            {!hasFixedPaper && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-2">
              <span className="font-mono text-[10px] tracking-wider uppercase font-bold" style={{ color: currentTheme.isDark ? '#38bdf8' : '#0071e3' }}>
                EXECUTIVE PLANNER · CAIRO BASELINE
              </span>
            </div>
            )}

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
                        if (!window.confirm(locale === 'ar' ? 'حذف هذه الملاحظة النصية؟' : 'Delete this text note?')) return;
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
