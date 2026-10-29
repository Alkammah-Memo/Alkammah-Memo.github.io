import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export interface PickOption {
  /** what is stored on the task */
  value: string;
  /** what the person sees */
  label: string;
  /** second line: role, stage, ... */
  hint?: string;
}

interface PickFieldProps {
  options: PickOption[];
  /** stored value; with `multiple` it is a comma separated list */
  value: string;
  onChange: (v: string) => void;
  multiple?: boolean;
  placeholder: string;
  emptyText: string;
  /** text for "use what I typed" (free entries stay allowed so old tasks keep working) */
  useTypedLabel: (typed: string) => string;
  ar: boolean;
  ariaLabel: string;
  mono?: boolean;
}

const split = (v: string) => v.split(/[,،]+/).map((x) => x.trim()).filter((x) => x && x !== 'Unassigned');
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Pick from the directory (people or projects) with one tap; typing filters the list.
 * Tapping outside closes it. Free text is still accepted so nothing typed before is lost.
 */
export const PickField: React.FC<PickFieldProps> = ({ options, value, onChange, multiple, placeholder, emptyText, useTypedLabel, ar, ariaLabel, mono }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const picked = multiple ? split(value) : value.trim() ? [value.trim()] : [];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const commit = (list: string[]) => onChange(multiple ? list.join(', ') : list[0] || '');
  const toggle = (v: string) => {
    const has = picked.some((x) => same(x, v));
    if (multiple) {
      commit(has ? picked.filter((x) => !same(x, v)) : [...picked, v]);
      setQ('');
    } else {
      commit(has ? [] : [v]);
      setQ('');
      setOpen(false);
    }
  };
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || `${o.label} ${o.value} ${o.hint || ''}`.toLowerCase().includes(needle));
  const typedIsNew = !!needle && !options.some((o) => same(o.value, q) || same(o.label, q)) && !picked.some((x) => same(x, q));
  const labelOf = (v: string) => options.find((o) => same(o.value, v))?.label;

  return (
    <div ref={box} className="relative min-w-0">
      <div
        className={`flex flex-wrap items-center gap-1 min-h-10 px-2 py-1 rounded-xl border bg-white ${open ? 'border-[#0071e3] ring-2 ring-[#0071e3]/15' : 'border-stone-300'}`}
        onClick={() => setOpen(true)}
      >
        {picked.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 max-w-full ps-2 pe-0.5 h-7 rounded-lg bg-[#0071e3]/10 text-[#0058b0] text-xs font-semibold">
            <span className="truncate">{multiple ? v : labelOf(v) || v}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); toggle(v); }} aria-label={ar ? `إزالة ${v}` : `Remove ${v}`} className="w-6 h-6 inline-flex items-center justify-center rounded-md">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <input
          value={q}
          aria-label={ariaLabel}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const first = shown[0];
              if (first && (!typedIsNew || shown.length === 1)) toggle(first.value);
              else if (typedIsNew) toggle(q.trim());
            } else if (e.key === 'Backspace' && !q && picked.length) toggle(picked[picked.length - 1]);
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={picked.length && multiple ? '' : placeholder}
          className={`flex-1 min-w-[6rem] h-7 bg-transparent text-base sm:text-xs outline-none ${mono ? 'font-mono' : ''} ${!multiple && picked.length ? 'hidden' : ''}`}
        />
        <ChevronDown className={`w-4 h-4 text-stone-400 ms-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white shadow-xl py-1" role="listbox">
          {shown.map((o) => {
            const on = picked.some((x) => same(x, o.value));
            return (
              <li key={o.value + o.label}>
                <button type="button" role="option" aria-selected={on} onClick={() => toggle(o.value)} className={`w-full min-h-11 px-3 flex items-center gap-2 text-start text-xs ${on ? 'bg-[#0071e3]/5' : 'active:bg-stone-100'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-stone-900 truncate">{o.label}</span>
                    {o.hint && <span className="block text-[11px] text-stone-500 truncate">{o.hint}</span>}
                  </span>
                  {on && <Check className="w-4 h-4 text-[#0071e3] shrink-0" />}
                </button>
              </li>
            );
          })}
          {typedIsNew && (
            <li>
              <button type="button" onClick={() => toggle(q.trim())} className="w-full min-h-11 px-3 text-start text-xs font-semibold text-[#0071e3] active:bg-stone-100">
                {useTypedLabel(q.trim())}
              </button>
            </li>
          )}
          {shown.length === 0 && !typedIsNew && <li className="px-3 py-3 text-xs text-stone-500">{emptyText}</li>}
        </ul>
      )}
    </div>
  );
};
