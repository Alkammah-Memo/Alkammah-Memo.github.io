/**
 * Vector re-creations of the executive's printed planner pages (daily, to-do list, monthly, minutes of meeting).
 * Drawn on a canvas whose logical size is 1450x1007 (the aspect of his planner pages). Pure drawing: no React, no state.
 */
import type { NotebookTemplate } from '../../types';
import {
  dayTitle,
  daySubtitle,
  isPlannerDay,
  isPlannerMonth,
  monthGrid,
  monthName,
  monthTitle,
} from '../../lib/planner';

export interface PlannerDrawOptions {
  isDark: boolean;
  locale: 'en' | 'ar';
  plannerDate?: string;
  title?: string;
  /** Text colour of the current paper theme */
  textColor: string;
  subtextColor: string;
}

const SANS = '"Helvetica Neue", Helvetica, Arial, "Cairo", sans-serif';

export const PLANNER_TEMPLATES: NotebookTemplate[] = ['planner_daily', 'planner_todo', 'planner_monthly', 'planner_mom'];
export const isPlannerTemplate = (t: NotebookTemplate | undefined): boolean => !!t && PLANNER_TEMPLATES.includes(t);

const T = {
  en: {
    mainFocus: 'MAIN FOCUS',
    goals: 'GOALS',
    todo: 'TO-DO LIST',
    notes: 'NOTES & IDEAS',
    notesCol: 'NOTES',
    week: 'WEEK',
    task: 'Task',
    taskUp: 'TASK',
    due: 'DUE DATE',
    dueMixed: 'Due Date',
    owner: 'OWNER',
    ownerMixed: 'Owner',
    todoTitle: 'TO-DO LIST',
    days: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  },
  ar: {
    mainFocus: 'التركيز الرئيسي',
    goals: 'الأهداف',
    todo: 'قائمة المهام',
    notes: 'ملاحظات وأفكار',
    notesCol: 'ملاحظات',
    week: 'الأسبوع',
    task: 'المهمة',
    taskUp: 'المهمة',
    due: 'تاريخ الاستحقاق',
    dueMixed: 'تاريخ الاستحقاق',
    owner: 'المسؤول',
    ownerMixed: 'المسؤول',
    todoTitle: 'قائمة المهام',
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  },
} as const;

interface Ink {
  strong: string;
  line: string;
  faint: string;
  fill: string;
  dot: string;
  label: string;
}

const inkFor = (isDark: boolean): Ink =>
  isDark
    ? {
        strong: 'rgba(255,255,255,0.55)',
        line: 'rgba(255,255,255,0.28)',
        faint: 'rgba(255,255,255,0.14)',
        fill: 'rgba(255,255,255,0.07)',
        dot: 'rgba(255,255,255,0.32)',
        label: 'rgba(255,255,255,0.85)',
      }
    : {
        strong: 'rgba(20,20,20,0.85)',
        line: 'rgba(40,40,40,0.34)',
        faint: 'rgba(40,40,40,0.17)',
        fill: 'rgba(40,40,40,0.065)',
        dot: 'rgba(40,40,40,0.34)',
        label: 'rgba(20,20,20,0.9)',
      };

const hline = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, color: string, w = 1) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  // half-pixel alignment keeps 1px lines crisp
  const yy = Math.round(y) + 0.5;
  ctx.moveTo(x0, yy);
  ctx.lineTo(x1, yy);
  ctx.stroke();
};

const vline = (ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, color: string, w = 1) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  const xx = Math.round(x) + 0.5;
  ctx.moveTo(xx, y0);
  ctx.lineTo(xx, y1);
  ctx.stroke();
};

const text = (
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { weight?: number | string; align?: CanvasTextAlign; italic?: boolean } = {}
) => {
  ctx.font = `${opts.italic ? 'italic ' : ''}${opts.weight ?? 400} ${size}px ${SANS}`;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
};

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke: string, fill?: string) => {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
};

// ------------------------------------------------------------------------------------------------- daily
function drawDaily(ctx: CanvasRenderingContext2D, W: number, H: number, o: PlannerDrawOptions, ink: Ink) {
  const L = T[o.locale];
  const date = isPlannerDay(o.plannerDate) ? o.plannerDate : '';
  if (date) {
    text(ctx, dayTitle(date, o.locale), 40, 42, 27, o.textColor, { weight: 400 });
    text(ctx, daySubtitle(date, o.locale), 40, 70, 19, o.subtextColor);
  } else if (o.title) {
    text(ctx, o.title, 40, 42, 27, o.textColor);
  }

  // Timed agenda column: blank hour column + ruled half-hour lines
  const lx = 40;
  const lw = 426;
  const hourW = 66;
  const top = 95;
  const bottom = 975;
  const rows = 16;
  const rowH = (bottom - top) / rows;
  rect(ctx, lx, top, lw, bottom - top, ink.line);
  vline(ctx, lx + hourW, top, bottom, ink.line);
  for (let i = 1; i < rows; i++) {
    const y = top + i * rowH;
    hline(ctx, lx, lx + lw, y, ink.line);
  }
  for (let i = 0; i < rows; i++) {
    hline(ctx, lx + hourW, lx + lw, top + i * rowH + rowH / 2, ink.faint);
  }

  // Centre column
  const cx = 492;
  const cw = 428;
  text(ctx, L.mainFocus, cx, 100, 12.5, ink.label, { weight: 500 });
  ctx.fillStyle = ink.fill;
  ctx.fillRect(cx, 119, cw, 58);

  text(ctx, L.goals, cx, 208, 12.5, ink.label, { weight: 500 });
  const gTop = 223;
  const gH = 202;
  rect(ctx, cx, gTop, cw, gH, ink.line);
  for (let i = 1; i < 3; i++) hline(ctx, cx, cx + cw, gTop + (gH / 3) * i, ink.line);
  for (let i = 0; i < 3; i++) text(ctx, `${i + 1}.`, cx + 10, gTop + (gH / 3) * i + 16, 12.5, ink.label);

  text(ctx, L.todo, cx, 452, 12.5, ink.label, { weight: 500 });
  const tTop = 466;
  const tRows = 15;
  const tH = (973 - tTop) / tRows;
  for (let i = 0; i < tRows; i++) {
    const y = tTop + i * tH;
    ctx.fillStyle = ink.fill;
    ctx.fillRect(cx + 2, y + (tH - 20) / 2, 20, 20);
    hline(ctx, cx, cx + cw, y + tH, ink.line);
  }

  // Notes & ideas dot grid
  const nx = 947;
  const nRight = W - 40;
  text(ctx, L.notes, nx, 100, 12.5, ink.label, { weight: 500 });
  ctx.fillStyle = ink.dot;
  const step = 19.9;
  for (let y = 124; y <= 972; y += step) {
    for (let x = nx + 4; x <= nRight; x += step) {
      ctx.fillRect(Math.round(x) - 0.5, Math.round(y) - 0.5, 1.6, 1.6);
    }
  }
}

// ------------------------------------------------------------------------------------------------- to-do
function drawTodo(ctx: CanvasRenderingContext2D, W: number, H: number, o: PlannerDrawOptions, ink: Ink) {
  const L = T[o.locale];
  const left = 44;
  const right = W - 43;
  const hdrTop = 52;
  const hdrBottom = 100;
  const rowH = 62;
  const rows = 14;
  const bottom = hdrBottom + rows * rowH;

  text(ctx, L.todoTitle, left + 16, 15, 11.5, o.subtextColor, { weight: 500 });
  if (o.title) text(ctx, o.title, left + 16, 37, 26, o.textColor, { weight: 500 });

  // header row (light), heavy rule beneath
  ctx.fillStyle = ink.fill;
  ctx.fillRect(left, hdrTop, right - left, hdrBottom - hdrTop);
  hline(ctx, left, right, hdrTop, ink.faint);
  text(ctx, '#', left + 46, (hdrTop + hdrBottom) / 2, 14, o.subtextColor, { align: 'center', weight: 500 });
  // check mark glyph
  ctx.strokeStyle = ink.line;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(left + 107, 78);
  ctx.lineTo(left + 112, 83);
  ctx.lineTo(left + 121, 71);
  ctx.stroke();
  text(ctx, L.taskUp, left + 140, (hdrTop + hdrBottom) / 2, 12.5, o.subtextColor, { weight: 500 });
  // column order: Owner first, Due date last
  const ownerX = 1023;
  const dueX = 1228;
  text(ctx, L.owner, ownerX + 14, (hdrTop + hdrBottom) / 2, 12.5, o.subtextColor, { weight: 500 });
  text(ctx, L.due, dueX + 14, (hdrTop + hdrBottom) / 2, 12.5, o.subtextColor, { weight: 500 });
  hline(ctx, left, right, hdrBottom, ink.strong, 1.4);

  for (let i = 0; i < rows; i++) {
    const y = hdrBottom + i * rowH;
    hline(ctx, left, right, y + rowH, ink.faint);
    rect(ctx, left + 118, y + 22, 18, 18, ink.line, ink.fill);
  }
  vline(ctx, left + 92, hdrTop, bottom, ink.faint);
  vline(ctx, dueX, hdrTop, bottom, ink.faint);
  vline(ctx, ownerX, hdrTop, bottom, ink.faint);
}

// ------------------------------------------------------------------------------------------------- monthly
function drawMonthly(ctx: CanvasRenderingContext2D, W: number, H: number, o: PlannerDrawOptions, ink: Ink) {
  const L = T[o.locale];
  const ym = isPlannerMonth(o.plannerDate) ? o.plannerDate : '';
  if (ym) text(ctx, monthTitle(ym, o.locale), 40, 42, 27, o.textColor);
  else if (o.title) text(ctx, o.title, 40, 42, 27, o.textColor);

  const weeks = ym ? monthGrid(ym) : [];
  const nWeeks = Math.max(weeks.length, 5);
  const gx = 82;
  const gRight = 1228;
  const gTop = 118;
  const gBottom = 975;
  const colW = (gRight - gx) / 7;
  const rowH = (gBottom - gTop) / nWeeks;

  for (let c = 0; c < 7; c++) {
    text(ctx, L.days[c], gx + colW * c + colW / 2, 100, 12.5, ink.label, { align: 'center', weight: 500 });
  }

  // Friday + Saturday (Egyptian weekend): barely-there tint; he draws his own diagonals on top
  ctx.fillStyle = o.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(40,40,40,0.03)';
  ctx.fillRect(gx + colW * 5, gTop, colW * 2, gBottom - gTop);

  // week label column
  for (let r = 0; r < nWeeks; r++) {
    const y = gTop + r * rowH;
    ctx.fillStyle = ink.fill;
    ctx.fillRect(40, y + 1, 29, rowH - 8);
    const w = weeks[r];
    if (w) {
      ctx.save();
      ctx.translate(55, y + (rowH - 8) / 2);
      ctx.rotate(-Math.PI / 2);
      text(ctx, `${L.week} ${w.weekNumber}`, 0, 0, 11, ink.label, { align: 'center', weight: 500 });
      ctx.restore();
    }
  }

  // grid
  ctx.strokeStyle = ink.line;
  for (let r = 0; r <= nWeeks; r++) hline(ctx, gx, gRight, gTop + r * rowH, ink.line);
  for (let c = 0; c <= 7; c++) vline(ctx, gx + colW * c, gTop, gBottom, ink.line);
  for (let r = 0; r < weeks.length; r++) {
    weeks[r].cells.forEach((cell, c) => {
      text(ctx, String(cell.day), gx + colW * (c + 1) - 10, gTop + r * rowH + 17, 15, cell.inMonth ? o.textColor : o.subtextColor, {
        align: 'right',
        weight: 400,
      });
    });
  }

  // notes column
  const nx = 1246;
  const nRight = W - 40;
  text(ctx, L.notesCol, (nx + nRight) / 2, 100, 12.5, ink.label, { align: 'center', weight: 500 });
  ctx.fillStyle = ink.fill;
  ctx.fillRect(nx, gTop, nRight - nx, gBottom - gTop);
}

// ------------------------------------------------------------------------------------------------- minutes of meeting
function drawMom(ctx: CanvasRenderingContext2D, W: number, H: number, o: PlannerDrawOptions, ink: Ink) {
  const L = T[o.locale];
  // graph paper
  const cell = 24;
  const grid = o.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(120,100,60,0.13)';
  for (let x = 0; x <= W; x += cell) vline(ctx, x, 0, H, grid);
  for (let y = 0; y <= H; y += cell) hline(ctx, 0, W, y, grid);

  const blue = o.isDark ? 'rgba(120,160,235,0.7)' : 'rgba(60,100,200,0.55)';
  text(ctx, 'MoM', 60, 40, 34, o.textColor, { weight: 600, italic: true });
  if (isPlannerDay(o.plannerDate)) {
    const [y, m, d] = o.plannerDate.split('-').map(Number);
    text(ctx, `${d}-${monthName(m - 1, o.locale === 'ar' ? 'ar' : 'en').toLowerCase().replace(/^./, (c) => c.toUpperCase())}-${y}`, 230, 40, 26, o.textColor, { italic: true });
  }
  hline(ctx, 88, 715, 80, blue, 1.6);

  const ownerX = 845;
  const dueX = 1121;
  const right = W - 40;
  text(ctx, L.task, 150, 124, 25, o.textColor, { italic: o.locale === 'en' });
  text(ctx, L.ownerMixed, (ownerX + dueX) / 2, 124, 24, o.textColor, { align: 'center', italic: o.locale === 'en' });
  text(ctx, L.dueMixed, (dueX + right) / 2, 124, 24, o.textColor, { align: 'center', italic: o.locale === 'en' });
  hline(ctx, 140, right, 183, blue, 1.8);
  vline(ctx, ownerX, 96, H - 24, blue, 1.8);
  vline(ctx, dueX, 96, H - 24, blue, 1.8);
}

export function drawPlannerTemplate(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  template: NotebookTemplate,
  o: PlannerDrawOptions
): void {
  const ink = inkFor(o.isDark);
  ctx.save();
  ctx.lineCap = 'butt';
  switch (template) {
    case 'planner_daily':
      drawDaily(ctx, W, H, o, ink);
      break;
    case 'planner_todo':
      drawTodo(ctx, W, H, o, ink);
      break;
    case 'planner_monthly':
      drawMonthly(ctx, W, H, o, ink);
      break;
    case 'planner_mom':
      drawMom(ctx, W, H, o, ink);
      break;
    default:
      break;
  }
  ctx.restore();
}
