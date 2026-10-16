import React, { useEffect, useRef } from 'react';
import type { NotebookPage } from '../../types';
import { PLANNER_CANVAS } from '../../lib/planner';
import { drawPlannerTemplate, isPlannerTemplate } from './plannerTemplates';
import { PAPER_THEMES, paintStroke } from './NotebookCanvas';

/** Logical paper size of a page (same rules as the writing canvas) */
export function pageLogicalSize(p: NotebookPage): { w: number; h: number } {
  if (p.canvasSize) return { w: p.canvasSize.width, h: p.canvasSize.height };
  if (isPlannerTemplate(p.template)) return { w: PLANNER_CANVAS.width, h: PLANNER_CANVAS.height };
  return p.orientation === 'portrait' ? { w: 1100, h: 1450 } : { w: 1450, h: 950 };
}

const PREVIEW_PX = 440;

/**
 * Small picture of what is on a page (paper, printed layout, handwriting and typed notes).
 * Drawn only when the card scrolls into view, so a notebook with dozens of imported pages stays light.
 */
export const PagePreview: React.FC<{ page: NotebookPage; locale: 'en' | 'ar' }> = ({ page, locale }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { w: W, h: H } = pageLogicalSize(page);
  const visibleRef = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      const pw = PREVIEW_PX;
      const ph = Math.round((PREVIEW_PX * H) / W);
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const theme = PAPER_THEMES[page.paperColor || 'cream'] || PAPER_THEMES.cream;
      const paint = (img: HTMLImageElement | null) => {
        if (cancelled) return;
        ctx.setTransform(pw / W, 0, 0, pw / W, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);
        const topMargin = 120;
        const bottomMargin = 40;
        if (isPlannerTemplate(page.template)) {
          drawPlannerTemplate(ctx, W, H, page.template, {
            isDark: theme.isDark,
            locale,
            plannerDate: page.plannerDate,
            title: page.title,
            textColor: theme.textColor,
            subtextColor: theme.subtextColor,
          });
        } else if (page.template === 'planner_archive') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, W, H);
          if (img) ctx.drawImage(img, 0, 0, W, H);
        } else {
          const style = page.paperStyle || 'ruled';
          ctx.save();
          if (style === 'ruled') {
            ctx.strokeStyle = theme.ruledLine;
            ctx.lineWidth = 1.6;
            for (let y = topMargin; y < H - bottomMargin; y += 34) {
              ctx.beginPath();
              ctx.moveTo(35, y);
              ctx.lineTo(W - 35, y);
              ctx.stroke();
            }
          } else if (style === 'grid') {
            ctx.strokeStyle = theme.gridLine;
            ctx.lineWidth = 1.4;
            for (let y = topMargin; y <= H - bottomMargin; y += 32) {
              ctx.beginPath();
              ctx.moveTo(32, y);
              ctx.lineTo(W - 32, y);
              ctx.stroke();
            }
            for (let x = 32; x <= W - 32; x += 32) {
              ctx.beginPath();
              ctx.moveTo(x, topMargin);
              ctx.lineTo(x, H - bottomMargin);
              ctx.stroke();
            }
          } else if (style === 'dotted') {
            ctx.fillStyle = theme.dotColor;
            for (let y = topMargin; y <= H - bottomMargin; y += 28) {
              for (let x = 35; x <= W - 35; x += 28) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
            }
          }
          ctx.strokeStyle = theme.marginLine;
          ctx.lineWidth = 2;
          if (style === 'ruled') {
            ctx.beginPath();
            ctx.moveTo(85, topMargin - 20);
            ctx.lineTo(85, H - 30);
            ctx.stroke();
          }
          const dateX = Math.round(W * 0.74);
          ctx.beginPath();
          ctx.moveTo(dateX, topMargin - 20);
          ctx.lineTo(dateX, H - 30);
          ctx.stroke();
          ctx.restore();
        }
        for (const stroke of page.strokes || []) {
          if (stroke.tool === 'eraser') continue;
          paintStroke(ctx, stroke, theme);
        }
        for (const note of page.textNotes || []) {
          ctx.save();
          ctx.font = `${note.fontSize}px ${note.fontFamily}`;
          ctx.fillStyle = note.color;
          ctx.textBaseline = 'top';
          note.text.split('\n').forEach((line, i) => ctx.fillText(line, note.x, note.y + i * note.fontSize * 1.25));
          ctx.restore();
        }
      };
      if (page.template === 'planner_archive' && page.backgroundImage) {
        paint(null);
        const img = new Image();
        img.onload = () => paint(img);
        img.src = page.backgroundImage;
      } else {
        paint(null);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis && !visibleRef.current) {
          visibleRef.current = true;
          draw();
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(wrap);
    if (visibleRef.current) draw();
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [page, W, H, locale]);

  return (
    <div ref={wrapRef} className="w-full bg-white" style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} className="w-full h-full block" aria-hidden="true" />
    </div>
  );
};
