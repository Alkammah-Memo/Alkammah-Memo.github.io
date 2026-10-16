import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  ar: boolean;
  title: string;
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app delete confirmation (the browser's confirm() is unreliable on iPad home-screen apps). */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ open, ar, title, detail, confirmLabel, onConfirm, onCancel }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      dir={ar ? 'rtl' : 'ltr'}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-[#d2d2d7]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#1d1d1f]">{title}</div>
            {detail && <div className="mt-1 text-xs text-[#515154] break-words line-clamp-3">{detail}</div>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 px-4 rounded-xl border border-[#d2d2d7] bg-white text-xs font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7]">
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
          <button type="button" autoFocus onClick={onConfirm} className="min-h-11 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white">
            {confirmLabel || (ar ? 'نعم، احذف' : 'Yes, delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
