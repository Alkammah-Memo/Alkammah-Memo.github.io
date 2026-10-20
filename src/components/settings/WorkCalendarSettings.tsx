import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Briefcase, ClipboardPaste, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Fold } from './Fold';
import { getFeedState, isFeedUrl, refreshFeed, setFeedUrl, subscribeFeed } from '../../lib/outlookFeed';
import { saveFeedUrlRemote } from '../../lib/cloud';
import { OUTLOOK_PUBLISH_URL, findOutlookIcsLink, openExternal, readClipboard } from '../../lib/quickConnect';

const explain = (code: string, ar: boolean): string => {
  if (code === 'link_not_allowed' || code === 'bad_link') return ar ? 'هذا ليس رابط تقويم .ics صالحاً من Outlook.' : 'That is not a valid Outlook .ics calendar link.';
  if (/fetch_failed_(404|410)/.test(code)) return ar ? 'لم يعد الرابط يعمل. انشر التقويم من Outlook مرة أخرى وانسخ الرابط الجديد.' : 'The link no longer works. Publish the calendar again in Outlook and copy the new link.';
  if (/fetch_failed_(401|403)/.test(code)) return ar ? 'رفضت Microsoft الرابط. تأكد أن التقويم منشور بصلاحية "عرض كل التفاصيل".' : 'Microsoft refused the link. Make sure the calendar is published with "Can view all details".';
  if (code === 'not_signed_in') return ar ? 'سجّل الدخول إلى التطبيق أولاً.' : 'Sign in to the app first.';
  if (code === 'not_a_calendar') return ar ? 'الرابط لا يحتوي تقويماً.' : 'The link does not contain a calendar.';
  if (/not found|404|Failed to send a request|FunctionsFetchError|FunctionsHttpError/i.test(code)) return ar ? 'الجزء الخاص بالخادم غير مفعّل بعد (الدالة calendar-feed).' : 'The server part is not switched on yet (the calendar-feed function).';
  return code;
};

/**
 * Two taps: "Open Outlook" (lands on Publish a calendar), then "Paste & connect" after copying the ICS link there.
 * Used in Settings and in the first-run setup guide. Saved on the account, so every device of this person gets it.
 */
export const OutlookQuickConnect: React.FC<{ ar: boolean; onDone?: () => void }> = ({ ar, onDone }) => {
  const [opened, setOpened] = useState(false);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const connect = async (link: string) => {
    setBusy(true);
    setMsg(null);
    setFeedUrl(link);
    void saveFeedUrlRemote(link);
    try {
      const list = await refreshFeed();
      setMsg({ ok: true, text: ar ? `تم الربط. ${list.length} اجتماع من تقويم العمل.` : `Connected. ${list.length} meetings read from your work calendar.` });
      onDone?.();
    } catch (e) {
      setMsg({ ok: false, text: explain((e as Error)?.message || '', ar) });
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    setMsg(null);
    try {
      const link = findOutlookIcsLink(await readClipboard());
      if (!link) {
        setManual(true);
        setMsg({ ok: false, text: ar ? 'لم أجد رابط تقويم في الحافظة. انسخ رابط ICS من Outlook ثم اضغط مجدداً، أو الصقه في الخانة.' : 'No calendar link was found on the clipboard. Copy the ICS link in Outlook and tap again, or paste it in the box.' });
        return;
      }
      await connect(link);
    } catch {
      setManual(true);
    }
  };

  const typed = findOutlookIcsLink(draft) || (isFeedUrl(draft) ? draft.trim() : null);
  const step = 'flex items-start gap-3 rounded-2xl border p-3';
  const num = 'w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold';
  return (
    <div className="space-y-2.5">
      <div className={`${step} ${opened ? 'border-emerald-200 bg-emerald-50/50' : 'border-[#e5e5ea] bg-white'}`}>
        <span className={`${num} ${opened ? 'bg-emerald-600 text-white' : 'bg-[#0071e3] text-white'}`}>1</span>
        <div className="flex-1 min-w-0 space-y-2">
          <button
            type="button"
            onClick={() => {
              setOpened(true);
              openExternal(OUTLOOK_PUBLISH_URL);
            }}
            className="w-full sm:w-auto min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            {ar ? 'افتح Outlook' : 'Open Outlook'}
          </button>
          <p className="text-xs text-[#515154] leading-relaxed">
            {ar
              ? 'تحت "نشر تقويم": اختر "التقويم"، ثم "يمكنه عرض كل التفاصيل"، ثم "نشر". اضغط رابط ICS واختر "نسخ".'
              : 'Under "Publish a calendar": choose Calendar, then "Can view all details", then Publish. Tap the ICS link and choose Copy.'}
          </p>
          <p className="text-[11px] text-[#8e8e93]">
            {ar ? 'إن فتح تطبيق Outlook بدلاً من الموقع: اضغط مطولاً على الزر واختر "فتح في علامة تبويب جديدة".' : 'If the Outlook app opens instead of the website: press and hold the button and choose "Open in New Tab".'}
          </p>
        </div>
      </div>

      <div className={`${step} ${opened ? 'border-[#0071e3]/40 bg-[#0071e3]/5' : 'border-[#e5e5ea] bg-white'}`}>
        <span className={`${num} bg-[#0071e3] text-white`}>2</span>
        <div className="flex-1 min-w-0 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void paste()}
            className={`w-full sm:w-auto min-h-11 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${opened ? 'bg-[#1d1d1f] text-white animate-[pulse_2s_ease-in-out_3]' : 'bg-white border border-[#d2d2d7] text-[#1d1d1f]'}`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
            {ar ? 'الصق الرابط واربط' : 'Paste link & connect'}
          </button>
          <p className="text-xs text-[#515154]">{ar ? 'ارجع إلى هنا بعد النسخ واضغط هذا الزر. الباقي تلقائي.' : 'Come back here after copying and tap this. The rest is automatic.'}</p>
          {manual && (
            <div className="flex gap-2">
              <input
                dir="ltr"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-[#d2d2d7] bg-white text-base sm:text-xs outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
              />
              <button type="button" onClick={() => typed && void connect(typed)} disabled={busy || !typed} className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40">
                {ar ? 'ربط' : 'Connect'}
              </button>
            </div>
          )}
        </div>
      </div>
      {msg && <p className={`text-xs rounded-xl p-2.5 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{msg.text}</p>}
    </div>
  );
};

export const WorkCalendarSettings: React.FC<{ ar: boolean }> = ({ ar }) => {
  const feed = useSyncExternalStore(subscribeFeed, getFeedState);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setMsg(null), [feed.url]);

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

  const remove = () => {
    setFeedUrl('');
    void saveFeedUrlRemote('');
    setMsg(null);
  };

  return (
    <Fold id="workcal" icon={<Briefcase className="w-5 h-5" />} title={ar ? 'تقويم العمل (Outlook)' : 'Work calendar (Outlook)'}>
      <p className="text-xs text-[#515154] mb-3">
        {ar
          ? 'اعرض اجتماعات Outlook هنا للقراءة فقط. تظهر في التقويم والتنبيهات وتتحدّث تلقائياً على كل أجهزتك.'
          : 'Show your Outlook meetings here, read-only. They appear in the calendar and the alerts and refresh by themselves on all your devices.'}
      </p>

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
        <OutlookQuickConnect ar={ar} />
      )}
      {msg && <p className={`mt-2 text-xs rounded-xl p-2.5 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{msg.text}</p>}
      <p className="mt-3 text-[11px] text-[#8e8e93]">
        {ar ? 'الرابط سري: يُحفظ في حسابك الخاص فقط، ومن يملكه يرى تفاصيل التقويم. لإيقافه ألغِ النشر من Outlook.' : 'The link is secret: it is kept only in your private account, and anyone holding it can see the calendar details. To stop it, unpublish the calendar in Outlook.'}
      </p>
    </Fold>
  );
};
