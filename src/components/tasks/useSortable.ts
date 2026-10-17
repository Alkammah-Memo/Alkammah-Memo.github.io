import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Drag-and-drop (and arrow) re-ordering of a list, smooth on touch and mouse.
 * - drag the handle: the row follows the finger, the others slide out of the way (FLIP animation), the serial numbers follow live
 * - up/down buttons: the two rows swap places with the same slide animation
 * Rows are only moved visually while dragging; `onCommit` receives the final order once on release.
 */
export function useSortable(ids: string[], onCommit: (order: string[]) => void) {
  const [order, setOrder] = useState<string[]>(ids);
  const [dragId, setDragId] = useState<string | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const before = useRef<Map<string, number> | null>(null);
  const drag = useRef<{ id: string; grab: number; y: number; scroller: HTMLElement | null; raf: number | null } | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const key = ids.join('|');
  useEffect(() => {
    if (!drag.current) setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ref = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    []
  );

  const translateY = (el: HTMLElement) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    try {
      return new DOMMatrixReadOnly(t).m42;
    } catch {
      return 0;
    }
  };

  /** remember where every row is on screen right now (call just before the order changes) */
  const snapshot = () => {
    const m = new Map<string, number>();
    els.current.forEach((el, id) => m.set(id, el.getBoundingClientRect().top));
    before.current = m;
  };

  const placeDragged = () => {
    const d = drag.current;
    if (!d) return;
    const el = els.current.get(d.id);
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = '';
    const top = el.getBoundingClientRect().top;
    el.style.transform = `translateY(${d.y - d.grab - top}px)`;
  };

  // FLIP: after the order changed, slide every row from where it was to where it is now
  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (prev) {
      els.current.forEach((el, id) => {
        if (drag.current && drag.current.id === id) return;
        const was = prev.get(id);
        if (was === undefined) return;
        el.style.transition = 'none';
        el.style.transform = '';
        const dy = was - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        el.style.transform = `translateY(${dy}px)`;
        void el.offsetHeight; // commit the starting position
        el.style.transition = 'transform 260ms cubic-bezier(0.22, 0.8, 0.24, 1)';
        el.style.transform = '';
      });
    }
    placeDragged();
  }, [order]);

  const scrollParent = (el: HTMLElement | null): HTMLElement | null => {
    let p = el?.parentElement ?? null;
    while (p && p !== document.body) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
      p = p.parentElement;
    }
    return null; // the page itself scrolls
  };

  const reorderForPointer = () => {
    const d = drag.current;
    if (!d) return;
    const el = els.current.get(d.id);
    if (!el) return;
    const center = d.y - d.grab + el.offsetHeight / 2;
    const others = orderRef.current.filter((id) => id !== d.id && els.current.has(id));
    let idx = 0;
    for (const id of others) {
      const o = els.current.get(id) as HTMLElement;
      const mid = o.getBoundingClientRect().top - translateY(o) + o.offsetHeight / 2;
      if (mid < center) idx++;
    }
    const next = [...others.slice(0, idx), d.id, ...others.slice(idx)];
    // keep any ids that have no mounted row in their place (defensive)
    const missing = orderRef.current.filter((id) => !next.includes(id));
    const merged = [...next, ...missing];
    if (merged.join('|') !== orderRef.current.join('|')) {
      snapshot();
      setOrder(merged);
    }
  };

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = els.current.get(id);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const d = { id, grab: e.clientY - rect.top, y: e.clientY, scroller: scrollParent(el), raf: null as number | null };
    drag.current = d;
    setDragId(id);
    const startOrder = orderRef.current.join('|');

    const tick = () => {
      d.raf = null;
      const vh = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const edge = 70;
      let dy = 0;
      if (d.y < vh.top + edge) dy = -Math.ceil((vh.top + edge - d.y) / 6);
      else if (d.y > vh.bottom - edge) dy = Math.ceil((d.y - (vh.bottom - edge)) / 6);
      if (dy) {
        if (d.scroller) d.scroller.scrollTop += dy;
        else window.scrollBy(0, dy);
        reorderForPointer();
        placeDragged();
        d.raf = requestAnimationFrame(tick);
      }
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      d.y = ev.clientY;
      reorderForPointer();
      placeDragged();
      if (d.raf === null) d.raf = requestAnimationFrame(tick);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (d.raf !== null) cancelAnimationFrame(d.raf);
      // drop: slide the dragged row into its slot
      el.style.transition = 'transform 220ms cubic-bezier(0.22, 0.8, 0.24, 1)';
      el.style.transform = '';
      drag.current = null;
      setDragId(null);
      const finalOrder = orderRef.current;
      if (finalOrder.join('|') !== startOrder) commitRef.current(finalOrder);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const move = (id: string, dir: -1 | 1) => {
    const cur = orderRef.current;
    const i = cur.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    snapshot();
    setOrder(next);
    commitRef.current(next);
  };

  return { order, dragId, ref, startDrag, move };
}
