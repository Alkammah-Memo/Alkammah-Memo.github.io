import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Briefcase, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Fold } from './Fold';
import { getFeedState, isFeedUrl, refreshFeed, setFeedUrl, subscribeFeed } from '../../lib/outlookFeed';
import { saveFeedUrlRemote } from '../../lib/cloud';

const explain = (code: string, ar: boolean): string => {
  if (code === 'link_not_allowed' || code === 'bad_link') return ar ? 'هذا ليس رابط تقويم .ics صالحاً من Outlook.' : 'That is not a valid Outlook .ics calendar link.';
  if (/fetch_failed_(404|410)/.test(code)) return ar ? 'لم يعد الرابط يعمل. انشر التقويم من Outlook مرة أخرى وانسخ الرابط الجديد.' : 'The link no longer works. Publish the calendar again in Outlook and copy the new link.';
  if (/fetch_failed_(401|403)/.test(code)) return ar ? 'رفضت Microsoft الرابط. تأكد أن التقويم منشور بصلاحية "عرض كل التفاصيل".' : 'Microsoft refused the link. Make sure the calendar is published with "Can view all details".';
  if (code === 'not_signed_in') return ar ? 'سجّل الدخول إلى التطبيق أولاً.' : 'Sign in to the app first.';
  if (code === 'not_a_calendar') return ar ? 'الرابط لا يحتوي تقويماً.' : 'The link does not contain a calendar.';
  if (/not found|404|Failed to send a request|FunctionsFetchError|FunctionsHttpError/i.test(code)) return ar ? 'الجزء الخاص بالخادم غير مفعّل بعد (الدالة calendar-feed).' : 'The server part is not switched on yet (the calendar-feed function).';
  return code;
};

export const WorkCalendarSettings: React.FC<{ ar: boolean }> = ({ ar }) => {
  const feed = useSyncExternalStore(subscribeFeed, getFeedState);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!feed.url) setDraft('');
  }, [feed.url]);

  const bad = draft.trim() !== '' && !isFeedUrl(draft);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const list = await refreshFeed();
      setMsg({ ok: true, text: ar ? `تم. ${list.length} اجتماع من تقويم العمل.` : `Done. ${list.length} meetings read from the work calendar.` });
    } catch (e) {
      setMsg({ ok: false, text: explain((e as Error)?.message || '', ar) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (bad || !draft.trim()) return;
    setFeedUrl(draft.trim());
    void saveFeedUrlRemote(draft.trim());
    setDraft('');
    await run();
  };

  const remove = () => {
    setFeedUrl('');
    void saveFeedUrlRemote('');
    setMsg(null);
  };

  return (
    <Fold id="workcal" icon={<Briefcase className="w-5 h-5" />} title={ar ? 'تقويم العمل (Outlook)' : 'Work calendar (Outlook)'}>
      <p className="text-xs text-[#515154] mb-3">
        {ar
          ? 'اعرض اجتماعات Outlook هنا للقراءة فقط، بدون أي حساب Google. تظهر في التقويم والتنبيهات وتتحدّث تلقائياً.'
          : 'Show your Outlook meetings here, read-only, with no Google account involved. They appear in the calendar and the alerts and refresh by themselves.'}
      </p>
      <ol className="text-xs text-[#515154] list-decimal ps-5 space-y-0.5 mb-3">
        <li>{ar ? 'في Outlook على الويب: الإعدادات ← التقويم ← التقويمات المشتركة.' : 'In Outlook on the web: Settings → Calendar → Shared calendars.'}</li>
        <li>{ar ? 'تحت "نشر تقويم" اختر التقويم والصلاحية "عرض كل التفاصيل" ثم "نشر".' : 'Under "Publish a calendar" pick the calendar, choose "Can view all details", then Publish.'}</li>
        <li>{ar ? 'انسخ رابط ICS (ينتهي بـ calendar.ics) والصقه هنا.' : 'Copy the ICS link (it ends in calendar.ics) and paste it here.'}</li>
      </ol>

      {feed.url ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950 space-y-1">
          <div className="font-bold">{ar ? 'متصل' : 'Connected'}</div>
          <div>
            {ar ? 'آخر تحديث' : 'Last update'}: {feed.fetchedAt ? new Date(feed.fetchedAt).toLocaleString(ar ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo' }) : '-'} · {feed.count ?? 0} {ar ? 'اجتماع' : 'meetings'}
          </div>
          {feed.error && <div className="text-rose-700">{explain(feed.error, ar)}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => void run()} disabled={busy} className="min-h-10 px-3 rounded-xl bg-white border border-[#d2d2d7] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {ar ? 'تحديث الآن' : 'Refresh now'}
            </button>
            <button type="button" onClick={remove} className="min-h-10 px-3 rounded-xl bg-white border border-[#d2d2d7] text-xs font-semibold inline-flex items-center gap-1.5 text-rose-700">
              <Trash2 className="w-3.5 h-3.5" />
              {ar ? 'إزالة' : 'Remove'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              dir="ltr"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`flex-1 min-w-0 h-11 px-3 rounded-xl border bg-white text-xs outline-none focus:ring-2 focus:ring-[#0071e3]/20 ${bad ? 'border-rose-400' : 'border-[#d2d2d7] focus:border-[#0071e3]'}`}
            />
            <button type="button" onClick={() => void save()} disabled={busy || bad || !draft.trim()} className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40 inline-flex items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {ar ? 'ربط' : 'Connect'}
            </button>
          </div>
          {bad && <p className="text-[11px] text-rose-600 mt-1">{ar ? 'الصق رابط ICS الذي يبدأ بـ https وينتهي بـ .ics' : 'Paste the ICS link that starts with https and ends in .ics'}</p>}
        </div>
      )}
      {msg && <p className={`mt-2 text-xs rounded-xl p-2.5 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{msg.text}</p>}
      <p className="mt-3 text-[11px] text-[#8e8e93]">
        {ar ? 'الرابط سري: يُحفظ في حسابك الخاص فقط، ومن يملكه يرى تفاصيل التقويم. لإيقافه ألغِ النشر من Outlook.' : 'The link is secret: it is kept only in your private account, and anyone holding it can see the calendar details. To stop it, unpublish the calendar in Outlook.'}
      </p>
    </Fold>
  );
};
