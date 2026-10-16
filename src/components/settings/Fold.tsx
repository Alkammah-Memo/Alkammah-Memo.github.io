import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const key = (id: string) => `alkammah_fold_${id}`;

/** A settings card that folds away to just its title, so the page stays short on a phone. The choice is remembered. */
export const Fold: React.FC<{
  id: string;
  icon: React.ReactNode;
  title: string;
  /** small element shown on the header's right (a status chip or button) */
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ id, icon, title, right, defaultOpen = false, children }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key(id));
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key(id), o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };
  return (
    <section className="settings-card bg-white rounded-3xl border border-[#d2d2d7] shadow-xs">
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex-1 min-w-0 min-h-11 flex items-center gap-2 text-start"
        >
          <span className="shrink-0 text-[#0071e3]">{icon}</span>
          <span className="text-base font-bold truncate">{title}</span>
          <ChevronDown className={`w-4 h-4 text-[#6e6e73] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {right}
      </div>
      {open && <div className="px-4 pb-4 sm:px-6 sm:pb-6 -mt-1">{children}</div>}
    </section>
  );
};
