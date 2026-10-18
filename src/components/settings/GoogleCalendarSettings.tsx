import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CalendarDays, Loader2, RefreshCw, LogOut } from 'lucide-react';
import { Fold } from './Fold';
import { saveWorkEmailRemote } from '../../lib/cloud';
import { isEmail, getGoogleLink, setGoogleLink, subscribeGoogleLink, loadGoogleIdentity, tokenIsValid, probeServer, getServerState, disconnectGoogle } from '../../lib/googleCalendar';
import type { ServerState } from '../../lib/googleCalendar';

type SyncFn = (interactive: boolean) => Promise<{ added: number; updated: number; removed: number; email: string }>;

export const GoogleCalendarSettings: React.FC<{ ar: boolean; onSync?: SyncFn }> = ({ ar, onSync }) => {
  const link = useSyncExternalStore(subscribeGoogleLink, getGoogleLink);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [clientDraft, setClientDraft] = useState(link.clientId);
  const connected = !!link.email && !!link.lastSyncAt;
  const [server, setServer] = useState<ServerState>(getServerState());

  // load Google's sign-in library ahead of time so the tap can open the account chooser right away
  useEffect(() => {
    void loadGoogleIdentity().catch(() => undefined);
    void probeServer().then(setServer);
  }, []);

  const run = async (interactive: boolean) => {
    if (!onSync || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await onSync(interactive);
      setMsg({
        ok: true,
        text: ar
          ? `تمت المزامنة مع ${r.email}: ${r.added} جديد، ${r.updated} محدّث، ${r.removed} محذوف.`
          : `Synced with ${r.email}: ${r.added} new, ${r.updated} updated, ${r.removed} removed.`,
      });
    } catch (e) {
      const m = (e as Error)?.message || '';
      setMsg({
        ok: false,
        text:
          m === 'NO_CLIENT_ID'
            ? ar ? 'أدخل معرّف عميل Google (Client ID) أولاً.' : 'Enter the Google Client ID first.'
            : m === 'GOOGLE_SCOPES_MISSING' || /insufficient authentication scopes/i.test(m)
            ? ar ? 'لم تُمنح كل الصلاحيات. اضغط "مزامنة الآن" مجدداً وعلّم المربعين (عرض/تعديل التقويم والبريد) ثم "متابعة".' : 'Not every permission was granted. Tap "Sync now" again and tick BOTH boxes (see/edit calendar events, and your email), then Continue.'
            : m === 'GOOGLE_TOKEN_EXPIRED'
            ? ar ? 'انتهت صلاحية الدخول. اضغط "الدخول بحساب Google" مجدداً.' : 'The sign-in expired. Tap "Sign in with Google" again.'
            : m,
      });
    } finally {
      setBusy(false);
    }
  };

  const [workDraft, setWorkDraft] = useState(link.workEmail || '');
  useEffect(() => setWorkDraft(link.workEmail || ''), [link.workEmail]);
  const workBad = workDraft.trim() !== '' && !isEmail(workDraft);
  const saveWork = () => {
    const v = workDraft.trim();
    if (workBad) return;
    setGoogleLink({ workEmail: v, workEmailDone: undefined });
    void saveWorkEmailRemote(v);
    setMsg({ ok: true, text: v ? (ar ? 'تم الحفظ. ستُرسل الدعوات للاجتماعات القادمة عند المزامنة التالية.' : 'Saved. Invites for the upcoming meetings go out on the next sync.') : ar ? 'تمت إزالة بريد العمل.' : 'Work e-mail removed.' });
    if (v && connected) void run(false);
  };
  const saveClient = () => setGoogleLink({ clientId: clientDraft.trim() });

  return (
    <Fold id="google" icon={<CalendarDays className="w-5 h-5" />} title={ar ? 'تقويم Google' : 'Google Calendar'}>
      <p className="text-xs text-[#515154] mb-3">
        {ar
          ? 'سجّل الدخول بحساب Google (اختيار الحساب بضغطة) فيصبح التقويم مرآة في الاتجاهين: مواعيد Google تظهر هنا، وأي اجتماع تضيفه أو تعدّله أو تحذفه هنا يُضاف أو يُعدَّل أو يُحذف في تقويم Google (التقويم الرئيسي) خلال ثوانٍ.'
          : 'Sign in with Google (one tap to pick the account) and the calendar mirrors both ways: Google events appear here, and any meeting you add, change or delete here is added, changed or deleted in your main Google calendar within seconds.'}
      </p>

      <label className="block text-xs font-semibold text-[#515154]" htmlFor="gclient">
        {ar ? 'معرّف عميل Google (Client ID)' : 'Google Client ID'}
      </label>
      <div className="flex gap-2 mt-1">
        <input
          id="gclient"
          dir="ltr"
          value={clientDraft}
          onChange={(e) => setClientDraft(e.target.value)}
          onBlur={saveClient}
          placeholder="1234567890-abc.apps.googleusercontent.com"
          className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm font-mono focus:outline-none focus:border-[#0071e3]"
        />
      </div>
      <p className="text-[11px] text-[#6e6e73] mt-1">
        {ar ? 'معرّف عام وليس سراً. يُنشأ مرة واحدة في Google Cloud (OAuth، تطبيق ويب) مع إضافة https://alkammah-memo.github.io ضمن المصادر المسموحة.' : 'A public ID, not a secret. Created once in Google Cloud (OAuth, Web application) with https://alkammah-memo.github.io added as an authorized JavaScript origin.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            saveClient();
            void run(true);
          }}
          disabled={busy || !clientDraft.trim()}
          className="min-h-11 px-4 rounded-xl bg-[#0071e3] disabled:opacity-40 text-white text-sm font-bold inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
          {connected ? (ar ? 'تبديل الحساب' : 'Switch account') : ar ? 'الدخول بحساب Google' : 'Sign in with Google'}
        </button>
        {connected && (
          <>
            <button type="button" onClick={() => void run(true)} disabled={busy} className="min-h-11 px-4 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40">
              <RefreshCw className="w-4 h-4" />
              {ar ? 'مزامنة الآن' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={() => {
                void disconnectGoogle();
                setMsg(null);
              }}
              className="min-h-11 px-4 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-sm font-semibold inline-flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              {ar ? 'فصل' : 'Disconnect'}
            </button>
          </>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-[#e5e5ea] p-3">
        <label className="block text-xs font-bold text-[#1d1d1f]" htmlFor="gwork">
          {ar ? 'أضف اجتماعاتي إلى تقويم العمل (Outlook)' : 'Also put my meetings on my work calendar (Outlook)'}
        </label>
        <p className="text-[11px] text-[#6e6e73] mt-0.5">
          {ar
            ? 'أدخل بريد العمل. يُضاف كمدعو لكل اجتماع يُنشأ هنا، فيصل إلى Outlook كدعوة عادية وتظهر في تقويم العمل. ويُحدَّث عند تعديل الاجتماع هنا.'
            : 'Enter the work e-mail. It is added as a guest to every meeting made here, so it reaches Outlook as a normal invite and shows on the work calendar, and it updates when you edit the meeting here.'}
        </p>
        <div className="flex gap-2 mt-2">
          <input
            id="gwork"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="off"
            value={workDraft}
            onChange={(e) => setWorkDraft(e.target.value)}
            placeholder="name@company.com"
            className={`flex-1 min-w-0 h-11 px-3 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-[#0071e3]/20 ${workBad ? 'border-rose-400' : 'border-[#d2d2d7] focus:border-[#0071e3]'}`}
          />
          <button type="button" onClick={saveWork} disabled={workBad || workDraft.trim() === (link.workEmail || '')} className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40">
            {ar ? 'حفظ' : 'Save'}
          </button>
        </div>
        {workBad && <p className="text-[11px] text-rose-600 mt-1">{ar ? 'اكتب بريداً صحيحاً.' : 'Enter a valid e-mail address.'}</p>}
        {link.workEmail && link.workEmailDone === link.workEmail && <p className="text-[11px] text-emerald-700 mt-1">{ar ? 'مفعّل: الاجتماعات القادمة مدعوّة.' : 'Active: upcoming meetings are invited.'}</p>}
      </div>

      {connected && (
        <div className="mt-3 text-xs text-[#515154] space-y-1">
          <div>
            {ar ? 'الحساب' : 'Account'}: <span className="font-semibold text-[#1d1d1f]" dir="ltr">{link.email}</span>
          </div>
          <div>
            {ar ? 'آخر مزامنة' : 'Last sync'}: {link.lastSyncAt ? new Date(link.lastSyncAt).toLocaleString(ar ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo' }) : '-'} · {link.lastCount ?? 0} {ar ? 'حدث' : 'events'}
          </div>
          <div>
            {link.scopeV !== 2
              ? ar ? 'لتفعيل المزامنة في الاتجاهين اضغط "مزامنة الآن" ووافق على الصلاحية الجديدة (تعديل المواعيد).' : 'To turn on two-way sync, tap "Sync now" and approve the new permission (edit events).'
              : link.serverLinked
              ? ar ? 'دخول دائم: يتجدد تلقائياً دون أي ضغط، والمزامنة تعمل باستمرار في الاتجاهين.' : 'Permanent sign-in: it renews by itself with no taps, and two-way sync keeps running.'
              : tokenIsValid(link)
              ? ar ? 'المزامنة نشطة، لكن الدخول يدوم ساعة فقط (الدخول الدائم غير مُفعّل بعد).' : 'Sync is active, but this sign-in lasts only an hour (permanent sign-in is not set up yet).'
              : ar ? 'انتهى الدخول (يدوم ساعة). اضغط "مزامنة الآن" لتجديده.' : 'Sign-in expired (it lasts an hour). Tap "Sync now" to renew it.'}
          </div>
        </div>
      )}

      {server === 'unavailable' && (
        <p className="mt-3 text-xs rounded-xl px-3 py-2 border border-amber-200 bg-amber-50 text-amber-800">
          {ar ? 'الدخول الدائم يحتاج إعداداً لمرة واحدة على الخادم (وظيفة Supabase). حتى يتم، يلزم تجديد الدخول كل ساعة.' : 'Permanent sign-in needs a one-time server setup (a Supabase function). Until then the sign-in has to be renewed every hour.'}
        </p>
      )}
      {msg && <p className={`mt-3 text-sm rounded-xl px-3 py-2 border break-words ${msg.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200'}`}>{msg.text}</p>}
    </Fold>
  );
};
