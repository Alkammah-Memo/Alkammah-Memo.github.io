import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CalendarClock, AlertTriangle, BellRing, CheckCheck, X } from 'lucide-react';
import type { Meeting, Task } from '../../types';
import type { Locale } from '../../lib/translations';
import { buildNotifications, notifPrefs, loadRead, saveRead, loadSeen, saveSeen } from '../../lib/notifications';
import type { AppNotification } from '../../lib/notifications';

interface Props {
  meetings: Meeting[];
  tasks: Task[];
  locale: Locale;
  onOpenMeeting: (m: Meeting) => void;
  onOpenTask: (t: Task) => void;
}

const KIND_STYLE = {
  meeting: { icon: CalendarClock, tone: 'text-[#0071e3] bg-[#0071e3]/10', bar: 'bg-[#0071e3]' },
  overdue: { icon: AlertTriangle, tone: 'text-rose-600 bg-rose-50', bar: 'bg-rose-500' },
  followup: { icon: BellRing, tone: 'text-amber-600 bg-amber-50', bar: 'bg-amber-500' },
} as const;

/** Bell with an unread badge, a list panel and a pop-up alert. Unread items are highlighted, read ones are grayed out. */
export const NotificationCenter: React.FC<Props> = ({ meetings, tasks, locale, onOpenMeeting, onOpenTask }) => {
  const ar = locale === 'ar';
  const prefs = useSyncExternalStore(notifPrefs.subscribe, notifPrefs.get);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(loadRead);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  const list = useMemo(() => buildNotifications(meetings, tasks, prefs, now), [meetings, tasks, prefs, now]);
  const unread = list.filter((n) => !read.has(n.id));

  const describe = (n: AppNotification): string => {
    if (n.kind === 'meeting') {
      if ((n.minutes ?? 0) > 0) return ar ? `يبدأ خلال ${n.minutes} دقيقة` : `Starts in ${n.minutes} min`;
      return ar ? 'الاجتماع جارٍ الآن' : 'In progress now';
    }
    if (n.kind === 'overdue') return ar ? `متأخرة · موعدها ${n.date}` : `Overdue · was due ${n.date}`;
    return ar ? `تذكير متابعة · ${n.date}` : `Follow-up reminder · ${n.date}`;
  };
  const kindLabel = (k: AppNotification['kind']) => (k === 'meeting' ? (ar ? 'اجتماع' : 'Meeting') : k === 'overdue' ? (ar ? 'مهمة متأخرة' : 'Overdue task') : ar ? 'تذكير' : 'Reminder');

  // Pop up when something new appears while the app is open (what was already there on load only fills the bell)
  useEffect(() => {
    const first = seen.current === null;
    if (first) seen.current = loadSeen();
    const fresh = list.filter((n) => !seen.current!.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.current!.add(n.id));
    saveSeen(seen.current!);
    const loud = fresh.filter((n) => !read.has(n.id) && (n.kind === 'meeting' || !first));
    if (loud.length === 0) return;
    setToast(loud[0]);
    if (prefs.system && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(loud[0].title, { body: describe(loud[0]), tag: loud[0].id });
      } catch {
        /* some browsers only allow this from a service worker */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  const markRead = (ids: string[]) => {
    const next = new Set(read);
    ids.forEach((i) => next.add(i));
    setRead(next);
    saveRead(next);
  };

  const go = (n: AppNotification) => {
    markRead([n.id]);
    setOpen(false);
    setToast(null);
    if (n.kind === 'meeting') {
      const m = meetings.find((x) => x.id === n.refId);
      if (m) onOpenMeeting(m);
    } else {
      const t = tasks.find((x) => x.id === n.refId);
      if (t) onOpenTask(t);
    }
  };

  const edge = ar ? 'left-2' : 'right-2';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ar ? `الإشعارات${unread.length ? `، ${unread.length} جديد` : ''}` : `Notifications${unread.length ? `, ${unread.length} new` : ''}`}
        aria-expanded={open}
        className="relative p-2.5 sm:p-2 text-[#515154] hover:text-[#1d1d1f] rounded-xl hover:bg-black/5 transition-colors flex"
      >
        <Bell className={`w-4 h-4 ${unread.length > 0 ? 'notif-bell text-[#0071e3]' : ''}`} />
        {unread.length > 0 && (
          <span className="notif-pop absolute top-0.5 end-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[450]" onClick={() => setOpen(false)}>
            <div
              className={`notif-panel absolute top-[4.4rem] ${edge} w-[min(94vw,24rem)] max-h-[min(75dvh,34rem)] flex flex-col rounded-3xl border border-white/60 bg-white/90 backdrop-blur-2xl shadow-2xl overflow-hidden`}
              onClick={(e) => e.stopPropagation()}
              dir={ar ? 'rtl' : 'ltr'}
              role="dialog"
              aria-label={ar ? 'الإشعارات' : 'Notifications'}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#ececf0]">
                <div className="text-sm font-bold">{ar ? 'الإشعارات' : 'Notifications'}</div>
                <div className="flex items-center gap-1">
                  {unread.length > 0 && (
                    <button type="button" onClick={() => markRead(list.map((n) => n.id))} className="min-h-9 px-2.5 inline-flex items-center gap-1 text-xs font-semibold text-[#0071e3] rounded-lg hover:bg-[#0071e3]/10">
                      <CheckCheck className="w-3.5 h-3.5" />
                      {ar ? 'تحديد الكل كمقروء' : 'Mark all read'}
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(false)} aria-label={ar ? 'إغلاق' : 'Close'} className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg hover:bg-black/5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto overscroll-contain p-2 space-y-1.5">
                {list.length === 0 && (
                  <div className="py-10 text-center text-sm text-[#6e6e73]">{ar ? 'لا توجد إشعارات. كل شيء تحت السيطرة.' : 'Nothing needs you right now.'}</div>
                )}
                {list.map((n, i) => {
                  const st = KIND_STYLE[n.kind];
                  const Icon = st.icon;
                  const isNew = !read.has(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => go(n)}
                      style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                      className={`notif-item w-full min-h-14 flex items-start gap-3 text-start rounded-2xl px-3 py-2.5 border transition-colors ${
                        isNew ? 'bg-[#0071e3]/[0.06] border-[#0071e3]/25 hover:bg-[#0071e3]/10' : 'bg-[#f5f5f7]/70 border-transparent hover:bg-[#ececf0] opacity-60 grayscale'
                      }`}
                    >
                      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${st.tone}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6e6e73]">
                          {kindLabel(n.kind)}
                          {isNew && <span className="notif-dot w-1.5 h-1.5 rounded-full bg-[#0071e3]" />}
                        </span>
                        <span className={`block text-sm truncate ${isNew ? 'font-bold text-[#1d1d1f]' : 'font-medium text-[#515154]'}`}>{n.title}</span>
                        <span className="block text-xs text-[#515154]">{describe(n)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}

      {toast &&
        createPortal(
          <button
            type="button"
            onClick={() => go(toast)}
            dir={ar ? 'rtl' : 'ltr'}
            className="notif-toast fixed z-[460] top-3 left-1/2 -translate-x-1/2 w-[min(94vw,26rem)] flex items-center gap-3 text-start rounded-2xl border border-white/60 bg-white/90 backdrop-blur-2xl shadow-2xl px-3.5 py-3"
          >
            <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${KIND_STYLE[toast.kind].tone}`}>
              {React.createElement(KIND_STYLE[toast.kind].icon, { className: 'w-4.5 h-4.5' })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-[#6e6e73]">{kindLabel(toast.kind)}</span>
              <span className="block text-sm font-bold text-[#1d1d1f] truncate">{toast.title}</span>
              <span className="block text-xs text-[#515154]">{describe(toast)}</span>
            </span>
            <span
              role="button"
              aria-label={ar ? 'إغلاق' : 'Dismiss'}
              onClick={(e) => {
                e.stopPropagation();
                setToast(null);
              }}
              className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg hover:bg-black/5"
            >
              <X className="w-4 h-4" />
            </span>
          </button>,
          document.body
        )}
    </>
  );
};
