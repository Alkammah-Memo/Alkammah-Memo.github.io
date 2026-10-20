import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Briefcase, CalendarDays, Check, ChevronDown, KeyRound, Loader2, Sparkles, UserRound, X } from 'lucide-react';
import { getTeam, saveMyProfile, subscribeTeam } from '../../lib/team';
import { keyManager } from '../../lib/ai/keyManager';
import { getGoogleLink, loadGoogleIdentity, probeServer, subscribeGoogleLink } from '../../lib/googleCalendar';
import { getFeedState, subscribeFeed } from '../../lib/outlookFeed';
import { GeminiQuickKey } from '../settings/GeminiQuickKey';
import { OutlookQuickConnect } from '../settings/WorkCalendarSettings';

type SyncFn = (interactive: boolean) => Promise<{ added: number; updated: number; removed: number; email: string }>;
type StepId = 'name' | 'ai' | 'google' | 'outlook';
const HIDE_KEY = 'alkammah_setup_hidden';

const subscribeKeys = (l: () => void) => keyManager.subscribe(l);
const hasKey = () => keyManager.hasAnyKey();

/**
 * First-run card on the Today page: everything a new person needs, each step done right here in one or two taps.
 * It disappears by itself once all steps are done (or when hidden), and Settings keeps the same buttons for later.
 */
export const SetupGuide: React.FC<{ ar: boolean; onSyncGoogle?: SyncFn }> = ({ ar, onSyncGoogle }) => {
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const keyed = useSyncExternalStore(subscribeKeys, hasKey);
  const link = useSyncExternalStore(subscribeGoogleLink, getGoogleLink);
  const feed = useSyncExternalStore(subscribeFeed, getFeedState);
  const me = team.profiles.find((p) => p.user_id === team.meId);
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState<StepId | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [gMsg, setGMsg] = useState('');

  const done: Record<StepId, boolean> = {
    name: !!me?.display_name.trim(),
    ai: keyed,
    google: !!link.serverLinked || (!!link.email && !!link.lastSyncAt),
    outlook: !!feed.url,
  };
  const order: StepId[] = ['name', 'ai', 'google', 'outlook'];
  const left = order.filter((s) => !done[s]);
  const current = open ?? left[0] ?? null;

  // Google's sign-in library must be ready before the tap, so the account chooser opens straight away
  const needGoogle = !done.google && !hidden;
  useEffect(() => {
    if (!needGoogle) return;
    void loadGoogleIdentity().catch(() => undefined);
    void probeServer();
  }, [needGoogle]);

  if (!team.ready || !me || hidden || left.length === 0) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const connectGoogle = async () => {
    if (!onSyncGoogle) return;
    setBusy(true);
    setGMsg('');
    try {
      await onSyncGoogle(true);
    } catch (e) {
      const m = (e as Error)?.message || '';
      setGMsg(
        m === 'GOOGLE_SCOPES_MISSING'
          ? ar ? 'لم تُمنح كل الصلاحيات. اضغط مجدداً وعلّم كل المربعات ثم "متابعة".' : 'Not every permission was granted. Tap again, tick every box, then Continue.'
          : /access_denied|not completed the Google verification|403/i.test(m)
          ? ar ? 'رفضت Google الدخول: اطلب من مدير النظام إضافة بريدك في Google (Test users) أو نشر التطبيق.' : 'Google refused: ask the administrator to add your Gmail as a test user in Google, or to publish the app.'
          : m
      );
    } finally {
      setBusy(false);
    }
  };

  const steps: { id: StepId; icon: React.ReactNode; title: string; hint: string; body: React.ReactNode }[] = [
    {
      id: 'name',
      icon: <UserRound className="w-4 h-4" />,
      title: ar ? 'اسمك' : 'Your name',
      hint: ar ? 'ليناديك به سبيرو ويراه الفريق' : 'So Spero and the team know what to call you',
      body: (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            void saveMyProfile({ display_name: name.trim() }).finally(() => setBusy(false));
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            placeholder={ar ? 'مثال: م. أحمد سامي' : 'e.g. Eng. Ahmed Samy'}
            className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-[#d2d2d7] bg-white text-base sm:text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
          />
          <button type="submit" disabled={busy || !name.trim()} className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40">
            {ar ? 'حفظ' : 'Save'}
          </button>
        </form>
      ),
    },
    {
      id: 'ai',
      icon: <KeyRound className="w-4 h-4" />,
      title: ar ? 'تشغيل سبيرو (مفتاح مجاني)' : 'Switch on Spero (free key)',
      hint: ar ? 'خطوتان: احصل على المفتاح ثم الصقه' : 'Two taps: get the key, then paste it',
      body: <GeminiQuickKey ar={ar} />,
    },
    {
      id: 'google',
      icon: <CalendarDays className="w-4 h-4" />,
      title: ar ? 'ربط Google (Gmail والتقويم)' : 'Connect Google (Gmail calendar)',
      hint: ar ? 'ضغطة واحدة ثم اختر حسابك' : 'One tap, then pick your account',
      body: (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy || !onSyncGoogle}
            onClick={() => void connectGoogle()}
            className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
            {ar ? 'الدخول بحساب Google' : 'Sign in with Google'}
          </button>
          <p className="text-xs text-[#515154]">
            {ar ? 'علّم كل المربعات في نافذة Google ثم "متابعة". اجتماعاتك تتزامن في الاتجاهين.' : 'Tick every box in the Google window, then Continue. Your meetings sync both ways.'}
          </p>
          {gMsg && <p className="text-xs text-rose-700">{gMsg}</p>}
        </div>
      ),
    },
    {
      id: 'outlook',
      icon: <Briefcase className="w-4 h-4" />,
      title: ar ? 'تقويم العمل Outlook' : 'Outlook work calendar',
      hint: ar ? 'افتح Outlook، انسخ الرابط، ارجع والصقه' : 'Open Outlook, copy the link, come back and paste',
      body: <OutlookQuickConnect ar={ar} />,
    },
  ];

  return (
    <section className="mb-4 rounded-3xl border border-[#0071e3]/25 bg-gradient-to-b from-[#0071e3]/[0.06] to-white p-3 sm:p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-2xl bg-[#0071e3] text-white inline-flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-base text-[#1d1d1f]">{ar ? 'جهّز حسابك' : 'Get set up'}</h2>
          <p className="text-xs text-[#515154]">
            {ar ? `${order.length - left.length} من ${order.length} تمت · كل خطوة دقيقة واحدة` : `${order.length - left.length} of ${order.length} done · about a minute each`}
          </p>
        </div>
        <button type="button" onClick={hide} className="min-h-10 min-w-10 -m-1 inline-flex items-center justify-center text-[#6e6e73]" aria-label={ar ? 'إخفاء' : 'Hide'} title={ar ? 'إخفاء (موجود أيضاً في الإعدادات)' : 'Hide (also in Settings)'}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-[#e5e5ea] overflow-hidden">
        <div className="h-full bg-[#0071e3] transition-all" style={{ width: `${((order.length - left.length) / order.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => {
          const ok = done[s.id];
          const isOpen = !ok && current === s.id;
          return (
            <li key={s.id} className={`rounded-2xl border ${isOpen ? 'border-[#0071e3]/30 bg-white' : 'border-[#e5e5ea] bg-white/70'}`}>
              <button
                type="button"
                disabled={ok}
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="w-full flex items-center gap-3 px-3 min-h-14 text-start disabled:cursor-default"
              >
                <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-600 text-white' : 'bg-[#0071e3]/10 text-[#0071e3]'}`}>
                  {ok ? <Check className="w-4 h-4" /> : s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-bold ${ok ? 'text-[#6e6e73] line-through decoration-1' : 'text-[#1d1d1f]'}`}>{s.title}</span>
                  {!ok && <span className="block text-xs text-[#6e6e73] truncate">{s.hint}</span>}
                </span>
                {!ok && <ChevronDown className={`w-4 h-4 text-[#6e6e73] transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
              </button>
              {isOpen && <div className="px-3 pb-3">{s.body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
