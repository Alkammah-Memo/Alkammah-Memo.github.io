/**
 * Private, on-device PDF planner import.
 *
 * Reads a GoodNotes-style planner PDF in the browser (nothing is uploaded), finds the pages that contain
 * handwriting, and renders them to JPEG so they can become notebook pages the owner can keep writing on.
 */
import type { PlannerImportPage } from '../types';

type PdfJs = typeof import('pdfjs-dist');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

let pdfjsPromise: Promise<PdfJs> | null = null;
async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string;
      lib.GlobalWorkerOptions.workerSrc = worker;
      return lib;
    })();
  }
  return pdfjsPromise;
}

export interface PlannerPdf {
  doc: PdfDoc;
  pageCount: number;
  /** year detected on the cover/calendar pages, falls back to the current year */
  year: number;
}

export interface ScannedPage {
  pageNumber: number;
  title: string;
  /** number of drawing operations: handwriting makes this large compared with the printed template */
  weight: number;
  hasWriting: boolean;
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export async function openPlannerPdf(file: File): Promise<PlannerPdf> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  let year = new Date().getFullYear();
  try {
    const first = await doc.getPage(Math.min(2, doc.numPages));
    const text = (await first.getTextContent()).items.map((i) => ('str' in i ? i.str : '') || '').join(' ');
    const m = text.match(/\b(20\d{2})\b/);
    if (m) year = Number(m[1]);
  } catch {
    /* keep default */
  }
  return { doc, pageCount: doc.numPages, year };
}

async function pageText(page: PdfDoc): Promise<string[]> {
  const content = await page.getTextContent();
  return content.items.map((i: { str?: string }) => ('str' in i ? String(i.str) : '').trim()).filter(Boolean);
}

/** Saturation of a '#rrggbb' colour; the printed template is grey/black, the owner's pens are strongly coloured. */
function saturation(hex: unknown): number {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return 0;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
}

/**
 * Looks at every page (fast, nothing is rendered) and flags the ones that carry handwriting:
 * ink is drawn with strongly coloured strokes, while the printed planner uses only greys.
 */
export async function scanPlannerPages(
  pdf: PlannerPdf,
  onProgress?: (done: number, total: number) => void
): Promise<ScannedPage[]> {
  const pdfjs = await loadPdfJs();
  const pages: ScannedPage[] = [];
  for (let n = 1; n <= pdf.pageCount; n++) {
    const page = await pdf.doc.getPage(n);
    let inkOps = 0;
    try {
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] === pdfjs.OPS.setStrokeRGBColor && saturation(ops.argsArray[i]?.[0]) > 0.45) inkOps++;
      }
    } catch {
      inkOps = 0;
    }
    const text = await pageText(page);
    pages.push({ pageNumber: n, title: guessTitle(text, n, pdf.year).title, weight: inkOps, hasWriting: n > 1 && inkOps > 0 });
    page.cleanup();
    if (onProgress && (n % 10 === 0 || n === pdf.pageCount)) onProgress(n, pdf.pageCount);
  }
  return pages;
}

const TAB_LABELS = new Set(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', '$']);

function guessTitle(text: string[], pageNumber: number, year: number): { title: string; plannerDate?: string } {
  const lines = text.filter((t) => !TAB_LABELS.has(t.toUpperCase()) && t.length > 1);
  const capital = (m: string) => `${m.charAt(0)}${m.slice(1).toLowerCase()}`;
  for (const line of lines) {
    const upper = line.toUpperCase().trim();
    const monthIdx = MONTHS.findIndex((m) => upper.startsWith(`${m} `));
    if (monthIdx < 0) continue;
    const rest = upper.slice(MONTHS[monthIdx].length).trim();
    const mm = String(monthIdx + 1).padStart(2, '0');
    const day = rest.match(/^(\d{1,2})$/);
    if (day) {
      const weekday = lines.find((l) => /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/.test(l.trim()));
      return {
        title: `${capital(MONTHS[monthIdx])} ${Number(day[1])}${weekday ? ` · ${weekday.split('•')[0].trim()}` : ''}`,
        plannerDate: `${year}-${mm}-${day[1].padStart(2, '0')}`,
      };
    }
    const yr = rest.match(/^(\d{4})$/);
    if (yr) return { title: `${capital(MONTHS[monthIdx])} ${yr[1]}`, plannerDate: `${yr[1]}-${mm}` };
  }
  const snippet = lines
    .join(' ')
    .replace(/[^\p{L}\p{N}\s/+&.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return { title: snippet ? `Page ${pageNumber} · ${snippet}` : `Page ${pageNumber}` };
}

/** Renders the chosen pages to JPEG notebook pages (sequentially, to keep memory low on an iPad). */
export async function renderPlannerPages(
  pdf: PlannerPdf,
  pageNumbers: number[],
  onProgress?: (done: number, total: number) => void
): Promise<PlannerImportPage[]> {
  const LOGICAL_WIDTH = 1450;
  const RENDER_WIDTH = 1800;
  const out: PlannerImportPage[] = [];
  for (let i = 0; i < pageNumbers.length; i++) {
    const n = pageNumbers[i];
    const page = await pdf.doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const text = await pageText(page);
    const guessed = guessTitle(text, n, pdf.year);
    out.push({
      title: guessed.title,
      plannerDate: guessed.plannerDate,
      template: 'planner_archive',
      backgroundImage: canvas.toDataURL('image/jpeg', 0.82),
      canvasSize: { width: LOGICAL_WIDTH, height: Math.round((LOGICAL_WIDTH * base.height) / base.width) },
      transcription: text.join(' ').slice(0, 4000),
    });
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    onProgress?.(i + 1, pageNumbers.length);
  }
  return out;
}
