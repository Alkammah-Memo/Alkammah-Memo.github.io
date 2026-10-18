import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { getCairoDateString } from '../../lib/cairoTime';

/**
 * One cell for a date and its time. Tap it: pick the day, press OK, then pick the time (with a Back button if the
 * day was wrong). Also works date-only (filters, follow-up dates) and time-only (a meeting's end time).
 * Values are plain strings, "YYYY-MM-DD" and "HH:mm" (24 h), exactly like the old inputs.
 */
export interface DateTimeValue {
  date: string;
  time: string;
}

interface Props {
  mode?: 'datetime' | 'date' | 'time';
  date?: string;
  time?: string;
  onChange: (v: DateTimeValue) => void;
  locale: 'en' | 'ar';
  /** allow saving a date without a time (tasks) */
  timeOptional?: boolean;
  /** allow emptying the field */
  clearable?: boolean;
  placeholder?: string;
  title?: string;
  className?: string;
  ariaLabel?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const parseYmd = (s?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

export function formatDateLabel(date: string | undefined, locale: 'en' | 'ar', withWeekday = true): string {
  const p = parseYmd(date);
  if (!p) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc(p.y, p.m, p.d));
}

export function formatTimeLabel(time: string | undefined, locale: 'en' | 'ar'): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || '');
  if (!m) return '';
  const h = +m[1];
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? (locale === 'ar' ? 'ص' : 'AM') : locale === 'ar' ? 'م' : 'PM';
  return `${h12}:${m[2]} ${suffix}`;
}

const QUICK_TIMES = ['09:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

export const DateTimeField: React.FC<Props> = ({
  mode = 'datetime',
  date = '',
  time = '',
  onChange,
  locale,
  timeOptional = false,
  clearable = false,
  placeholder,
  title,
  className,
  ariaLabel,
}) => {
  const ar = locale === 'ar';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'date' | 'time'>('date');
  const [dDate, setDDate] = useState(date);
  const [dTime, setDTime] = useState(time);
  const today = getCairoDateString();
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const p = parseYmd(date) || parseYmd(today)!;
    return { y: p.y, m: p.m };
  });

  const openPicker = () => {
    const p = parseYmd(date) || parseYmd(today)!;
    setDDate(date);
    setDTime(time);
    setView({ y: p.y, m: p.m });
    setStep(mode === 'time' ? 'time' : 'date');
    setOpen(true);
  };
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const commit = (v: DateTimeValue) => {
    onChange(v);
    close();
  };

  // ----- the cell
  const hasValue = mode === 'time' ? !!time : !!date;
  const label =
    mode === 'time'
      ? formatTimeLabel(time, locale)
      : mode === 'date'
      ? formatDateLabel(date, locale)
      : [formatDateLabel(date, locale), time ? formatTimeLabel(time, locale) : ''].filter(Boolean).join(' · ');
  const Icon = mode === 'time' ? Clock : CalendarDays;
  const cellText = hasValue ? label : placeholder || (ar ? 'اختر' : 'Select');

  // ----- calendar grid
  const cells = useMemo(() => {
    const first = utc(view.y, view.m, 1).getUTCDay(); // 0 = Sunday
    const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
    const out: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { weekday: 'narrow', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => f.format(utc(2024, 1, 7 + i))); // 7 Jan 2024 was a Sunday
  }, [ar]);
  const monthNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { month: 'long', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => f.format(utc(2024, i + 1, 1)));
  }, [ar]);
  const years = useMemo(() => {
    const cur = parseYmd(today)!.y;
    const lo = Math.min(cur - 3, view.y);
    const hi = Math.max(cur + 8, view.y);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [today, view.y]);
  const shift = (delta: number) =>
    setView((v) => {
      const t = v.y * 12 + (v.m - 1) + delta;
      return { y: Math.floor(t / 12), m: (t % 12) + 1 };
    });

  // ----- time pieces (12 h wheel built from buttons)
  const tm = /^(\d{1,2}):(\d{2})/.exec(dTime);
  const hour24 = tm ? +tm[1] : 9;
  const minute = tm ? +tm[2] : 0;
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const setTime = (h12: number, min: number, pm: boolean) => setDTime(`${pad((h12 % 12) + (pm ? 12 : 0))}:${pad(min)}`);
  const minutes = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => i * 5);
    return base.includes(minute) ? base : [...base, minute].sort((a, b) => a - b);
  }, [minute]);

  const pill = (active: boolean) =>
    `min-h-11 rounded-xl text-sm font-semibold transition-colors ${active ? 'bg-[#0071e3] text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 active:bg-stone-300'}`;

  const heading =
    title || (mode === 'time' ? (ar ? 'اختر الوقت' : 'Pick a time') : step === 'date' ? (ar ? 'اختر اليوم' : 'Pick a date') : ar ? 'اختر الوقت' : 'Pick a time');

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        className={
          className ||
          'w-full min-w-0 box-border px-3 py-1.5 min-h-9 rounded-xl border border-stone-300 text-xs bg-white text-start focus:outline-none focus:border-[#0071e3] flex items-center gap-2'
        }
      >
        <Icon className="w-3.5 h-3.5 shrink-0 text-[#0071e3]" />
        <span className={`truncate ${hasValue ? 'text-stone-900 font-medium' : 'text-stone-400'}`}>{cellText}</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4" onClick={close} dir={ar ? 'rtl' : 'ltr'}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label={heading}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm max-h-[96dvh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 text-[#1d1d1f]"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="text-base font-bold truncate">{heading}</div>
                  {mode === 'datetime' && (
                    <div className="text-[11px] text-stone-500 mt-0.5">
                      {ar ? `الخطوة ${step === 'date' ? '1' : '2'} من 2` : `Step ${step === 'date' ? 1 : 2} of 2`}
                    </div>
                  )}
                </div>
                <button type="button" onClick={close} aria-label={ar ? 'إغلاق' : 'Close'} className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl hover:bg-stone-100">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {step === 'date' && mode !== 'time' && (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <button type="button" onClick={() => shift(-1)} aria-label={ar ? 'الشهر السابق' : 'Previous month'} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200">
                      <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                    </button>
                    <select
                      value={view.m}
                      onChange={(e) => setView((v) => ({ ...v, m: +e.target.value }))}
                      aria-label={ar ? 'الشهر' : 'Month'}
                      className="flex-1 min-w-0 h-11 rounded-xl border border-stone-200 bg-white px-2 text-sm font-semibold"
                    >
                      {monthNames.map((n, i) => (
                        <option key={n} value={i + 1}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <select
                      value={view.y}
                      onChange={(e) => setView((v) => ({ ...v, y: +e.target.value }))}
                      aria-label={ar ? 'السنة' : 'Year'}
                      className="w-[5.2rem] h-11 rounded-xl border border-stone-200 bg-white px-2 text-sm font-semibold"
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => shift(1)} aria-label={ar ? 'الشهر التالي' : 'Next month'} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200">
                      <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-stone-400 mb-1" dir="ltr">
                    {weekdays.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1" dir="ltr">
                    {cells.map((d, i) => {
                      if (d === null) return <div key={i} />;
                      const v = ymd(view.y, view.m, d);
                      const sel = v === dDate;
                      const isToday = v === today;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setDDate(v)}
                          aria-pressed={sel}
                          className={`h-11 rounded-xl text-sm font-semibold transition-colors ${
                            sel ? 'bg-[#0071e3] text-white shadow-sm' : isToday ? 'bg-[#0071e3]/10 text-[#0071e3] ring-1 ring-[#0071e3]/40' : 'hover:bg-stone-100 text-stone-800'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const p = parseYmd(today)!;
                        setDDate(today);
                        setView({ y: p.y, m: p.m });
                      }}
                      className="min-h-10 px-3 rounded-xl text-sm font-semibold text-[#0071e3] hover:bg-[#0071e3]/10"
                    >
                      {ar ? 'اليوم' : 'Today'}
                    </button>
                    {clearable && (
                      <button type="button" onClick={() => commit({ date: '', time: '' })} className="min-h-10 px-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50">
                        {ar ? 'مسح' : 'Clear'}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={close} className="flex-1 min-h-12 rounded-2xl bg-stone-100 text-sm font-bold hover:bg-stone-200">
                      {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      disabled={!dDate}
                      onClick={() => (mode === 'date' ? commit({ date: dDate, time: '' }) : setStep('time'))}
                      className="flex-1 min-h-12 rounded-2xl bg-[#0071e3] text-white text-sm font-bold hover:bg-[#0062c4] disabled:opacity-40"
                    >
                      {mode === 'date' ? (ar ? 'تم' : 'OK') : ar ? 'موافق، التالي' : 'OK, pick time'}
                    </button>
                  </div>
                </>
              )}

              {step === 'time' && (
                <>
                  {mode === 'datetime' && (
                    <button
                      type="button"
                      onClick={() => setStep('date')}
                      className="w-full min-h-11 mb-3 px-3 inline-flex items-center gap-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-sm font-semibold text-start"
                    >
                      <ChevronLeft className="w-4 h-4 rtl:rotate-180 shrink-0" />
                      <CalendarDays className="w-4 h-4 text-[#0071e3] shrink-0" />
                      <span className="flex-1 truncate">{formatDateLabel(dDate, locale)}</span>
                      <span className="text-xs text-[#0071e3] font-bold">{ar ? 'تغيير اليوم' : 'Change day'}</span>
                    </button>
                  )}

                  <div className="text-center text-3xl font-bold tabular-nums mb-3" dir="ltr">
                    {dTime || !timeOptional ? formatTimeLabel(dTime || '09:00', 'en') : <span className="text-stone-300">{ar ? 'بدون وقت' : 'No time'}</span>}
                  </div>

                  <div className="text-[11px] font-bold text-stone-400 mb-1">{ar ? 'الساعة' : 'Hour'}</div>
                  <div className="grid grid-cols-6 gap-1.5 mb-3" dir="ltr">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <button key={h} type="button" onClick={() => setTime(h, minute, isPm)} className={pill(!!dTime && hour12 === h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] font-bold text-stone-400 mb-1">{ar ? 'الدقيقة' : 'Minute'}</div>
                  <div className="grid grid-cols-6 gap-1.5 mb-3" dir="ltr">
                    {minutes.map((mi) => (
                      <button key={mi} type="button" onClick={() => setTime(hour12, mi, isPm)} className={pill(!!dTime && minute === mi)}>
                        {pad(mi)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mb-3" dir="ltr">
                    <button type="button" onClick={() => setTime(hour12, minute, false)} className={pill(!!dTime && !isPm)}>
                      {ar ? 'ص' : 'AM'}
                    </button>
                    <button type="button" onClick={() => setTime(hour12, minute, true)} className={pill(!!dTime && isPm)}>
                      {ar ? 'م' : 'PM'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3" dir="ltr">
                    {QUICK_TIMES.map((q) => (
                      <button key={q} type="button" onClick={() => setDTime(q)} className={`px-3 min-h-9 rounded-full text-xs font-semibold ${dTime === q ? 'bg-[#0071e3] text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                        {formatTimeLabel(q, 'en')}
                      </button>
                    ))}
                    {timeOptional && (
                      <button type="button" onClick={() => setDTime('')} className={`px-3 min-h-9 rounded-full text-xs font-semibold ${!dTime ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                        {ar ? 'بدون وقت' : 'No time'}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {mode === 'datetime' ? (
                      <button type="button" onClick={() => setStep('date')} className="flex-1 min-h-12 rounded-2xl bg-stone-100 text-sm font-bold hover:bg-stone-200">
                        {ar ? 'رجوع' : 'Back'}
                      </button>
                    ) : (
                      <button type="button" onClick={close} className="flex-1 min-h-12 rounded-2xl bg-stone-100 text-sm font-bold hover:bg-stone-200">
                        {ar ? 'إلغاء' : 'Cancel'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => commit({ date: mode === 'time' ? date : dDate, time: dTime || (timeOptional ? '' : '09:00') })}
                      className="flex-1 min-h-12 rounded-2xl bg-[#0071e3] text-white text-sm font-bold hover:bg-[#0062c4]"
                    >
                      {ar ? 'تم' : 'Done'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
