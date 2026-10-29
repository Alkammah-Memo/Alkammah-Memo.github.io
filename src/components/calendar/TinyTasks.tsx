import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Clock, RotateCcw, Trash2, X, Zap } from 'lucide-react';
import { Task } from '../../types';
import { Locale } from '../../lib/translations';
import { DateTimeField, formatDateLabel, formatTimeLabel } from '../common/DateTimeField';
import { getCairoDateString, getCairoTimeString, isTaskOverdue } from '../../lib/cairoTime';
import { useCairoClock } from '../../lib/useCairoClock';

/** A quick action (stored as a task flagged isTiny, but never shown among tasks) is only a title, a comment and a date: the date is picked for you (15 minutes from now) and can be changed */
export const TINY_MINUTES = 15;
const autoDue = () => {
  const d = new Date(Date.now() + TINY_MINUTES * 60_000);
  return { date: getCairoDateString(d), time: getCairoTimeString(d) };
};

interface TinyModalProps {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  /** the quick action being edited (null = new one) */
  editing?: Task | null;
  onSave: (title: string, comment: string, date: string, time: string, id?: string) => void;
}

export const TinyTaskModal: React.FC<TinyModalProps> = ({ open, locale, onClose, onSave, editing }) => {
  const ar = locale === 'ar';
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const first = useRef<HTMLInputElement>(null);
  const [due, setDue] = useState(autoDue);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title || '');
    setComment(editing?.description || '');
    setDue(editing?.dueDate ? { date: editing.dueDate.slice(0, 10), time: editing.dueTime || '09:00' } : autoDue());
    const id = window.setTimeout(() => first.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, editing?.id]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4" dir={ar ? 'rtl' : 'ltr'} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSave(title.trim(), comment.trim(), due.date, due.time, editing?.id);
          onClose();
        }}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-stone-200 p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        role="dialog"
        aria-modal="true"
        aria-label={ar ? 'إجراء سريع' : 'Quick action'}
      >
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 inline-flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </span>
          <h2 className="flex-1 font-bold text-base text-stone-900">{ar ? 'إجراء سريع' : 'Quick action'}</h2>
          <button type="button" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} className="w-10 h-10 -me-2 inline-flex items-center justify-center text-stone-500 rounded-lg active:bg-stone-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          ref={first}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          placeholder={ar ? 'ما المطلوب؟' : 'What needs doing?'}
          className="w-full h-11 px-3 rounded-xl border border-stone-300 text-base sm:text-sm focus:outline-none focus:border-orange-400"
        />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={ar ? 'تعليق (اختياري)' : 'Comment (optional)'}
          className="w-full px-3 py-2 rounded-xl border border-stone-300 text-base sm:text-sm focus:outline-none focus:border-orange-400 resize-none"
        />
        <div>
          <span className="block text-xs font-semibold text-stone-700 mb-1">
            {ar ? `الموعد (تلقائي: بعد ${TINY_MINUTES} دقيقة)` : `Due (auto: in ${TINY_MINUTES} minutes)`}
          </span>
          <DateTimeField locale={locale} date={due.date} time={due.time} onChange={(v) => setDue({ date: v.date || due.date, time: v.time || due.time })} />
        </div>
        <button type="submit" disabled={!title.trim()} className="w-full min-h-12 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-40 active:bg-orange-600">
          {editing ? (ar ? 'حفظ' : 'Save') : ar ? 'إضافة' : 'Add'}
        </button>
      </form>
    </div>,
    document.body
  );
};

interface ListProps {
  tasks: Task[];
  locale: Locale;
  onSetStatus: (id: string, status: Task['status']) => void;
  onDelete: (id: string) => void;
  onOpen: (t: Task) => void;
}

/** The tiny-task list: open ones first (soonest due), finished ones folded below */
export const TinyTaskList: React.FC<ListProps> = ({ tasks, locale, onSetStatus, onDelete, onOpen }) => {
  const ar = locale === 'ar';
  const [open, setOpen] = useState(true);
  const [showDone, setShowDone] = useState(false);
  useCairoClock(); // re-render each minute so "overdue" flips on time
  const mine = tasks.filter((t) => t.isTiny && !t.isArchived);
  const key = (t: Task) => `${(t.dueDate || '').slice(0, 10)}T${t.dueTime || '00:00'}`;
  const openOnes = mine.filter((t) => t.status !== 'Closed').sort((a, b) => key(a).localeCompare(key(b)));
  const doneOnes = mine.filter((t) => t.status === 'Closed').sort((a, b) => key(b).localeCompare(key(a)));
  if (mine.length === 0) return null;

  const row = (t: Task) => {
    const done = t.status === 'Closed';
    const late = isTaskOverdue(t.dueDate, t.dueTime, t.status);
    return (
      <li key={t.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-xl ${late ? 'bg-red-50' : ''}`}>
        <button
          type="button"
          onClick={() => onSetStatus(t.id, done ? 'Pending' : 'Closed')}
          aria-label={done ? (ar ? 'إعادة فتح' : 'Reopen') : ar ? 'إنجاز' : 'Mark done'}
          className={`mt-0.5 w-10 h-10 shrink-0 rounded-xl border inline-flex items-center justify-center ${done ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-stone-300 text-transparent active:bg-stone-100'}`}
        >
          <Check className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-start py-1">
          <span className={`block text-sm font-semibold break-words ${done ? 'line-through text-stone-400' : 'text-stone-900'}`}>{t.title}</span>
          {t.description && <span className="block text-xs text-stone-500 break-words">{t.description}</span>}
          {t.dueDate && (
            <span className={`block mt-0.5 font-mono text-[11px] tabular-nums ${late ? 'text-red-600 font-bold' : 'text-stone-500'}`}>
              {late ? (ar ? '⚠ متأخرة · ' : '⚠ Overdue · ') : ''}
              {formatDateLabel(t.dueDate, locale, false)}
              {t.dueTime ? ` · ${formatTimeLabel(t.dueTime, locale)}` : ''}
            </span>
          )}
        </button>
        <button type="button" onClick={() => onDelete(t.id)} aria-label={ar ? 'حذف' : 'Delete'} className="w-10 h-10 shrink-0 inline-flex items-center justify-center text-stone-400 rounded-lg active:bg-stone-100">
          <Trash2 className="w-4 h-4" />
        </button>
      </li>
    );
  };

  return (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full min-h-12 px-4 flex items-center gap-2 text-start">
        <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 inline-flex items-center justify-center">
          <Zap className="w-4 h-4" />
        </span>
        <span className="flex-1 font-bold text-sm text-stone-900">
          {ar ? 'الإجراءات السريعة' : 'Quick actions'} <span className="font-mono text-xs text-stone-500">({openOnes.length})</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-2 pb-2">
          {openOnes.length === 0 ? (
            <p className="px-3 py-2 text-xs text-stone-500">{ar ? 'لا إجراءات سريعة مفتوحة.' : 'No open quick actions.'}</p>
          ) : (
            <ul>{openOnes.map(row)}</ul>
          )}
          {doneOnes.length > 0 && (
            <>
              <button type="button" onClick={() => setShowDone((v) => !v)} className="mt-1 min-h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                <RotateCcw className="w-3.5 h-3.5" />
                {ar ? `المنجزة (${doneOnes.length})` : `Finished (${doneOnes.length})`}
              </button>
              {showDone && <ul>{doneOnes.map(row)}</ul>}
            </>
          )}
        </div>
      )}
    </section>
  );
};
