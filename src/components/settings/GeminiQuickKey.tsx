import React, { useState } from 'react';
import { ClipboardPaste, ExternalLink, Loader2 } from 'lucide-react';
import { AI_STUDIO_KEYS_URL, findGeminiKey, openExternal, readClipboard } from '../../lib/quickConnect';
import { keyManager } from '../../lib/ai/keyManager';
import { testGeminiKey } from '../../lib/ai/gemini';

/**
 * Two taps to a working Spero: "Get my free key" opens Google AI Studio (already signed in with Google), where one tap
 * creates a key and one tap copies it; back here "Paste & test" checks it with a real request and saves it to the account.
 * Google does not let any app create these keys on someone's behalf without full control of their Google Cloud, so the
 * copy happens on Google's own page, and the key never passes through anything but this device and the person's account.
 */
export const GeminiQuickKey: React.FC<{ ar: boolean; onDone?: () => void }> = ({ ar, onDone }) => {
  const [opened, setOpened] = useState(false);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const applyKey = async (key: string) => {
    const settings = keyManager.getSettings();
    if (settings.slots.some((s) => s.key === key)) {
      setMsg({ ok: true, text: ar ? 'هذا المفتاح مضاف بالفعل.' : 'This key is already added.' });
      onDone?.();
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await testGeminiKey(key, settings.models);
      if (!res.rest.ok) {
        setMsg({ ok: false, text: (ar ? 'رفضت Google هذا المفتاح: ' : 'Google did not accept this key: ') + res.rest.message });
        return;
      }
      const slot = settings.slots.find((s) => !s.key) || settings.slots[settings.slots.length - 1];
      const now = new Date().toISOString();
      await keyManager.save({
        ...settings,
        slots: settings.slots.map((s) =>
          s.id === slot.id ? { ...s, key, status: 'ok' as const, message: res.rest.message, testedAt: now, cooldownUntil: undefined } : s
        ),
      });
      setMsg({
        ok: true,
        text: res.live.ok
          ? ar ? 'تم! المفتاح يعمل للمحادثة والصوت المباشر، ومحفوظ في حسابك على كل أجهزتك.' : 'Done! The key works for chat and live voice, and is saved to your account on all your devices.'
          : ar ? 'تم حفظ المفتاح ويعمل للمحادثة. الصوت المباشر لم يستجب الآن وسيُعاد تلقائياً.' : 'Key saved and working for chat. Live voice did not answer just now; it will retry by itself.',
      });
      onDone?.();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    setMsg(null);
    try {
      const key = findGeminiKey(await readClipboard());
      if (!key) {
        setManual(true);
        setMsg({ ok: false, text: ar ? 'لم أجد مفتاحاً في الحافظة. اضغط "نسخ" بجوار المفتاح في Google ثم اضغط هنا مجدداً، أو الصقه في الخانة.' : 'No key was found on the clipboard. Tap Copy next to the key in Google and tap here again, or paste it in the box.' });
        return;
      }
      await applyKey(key);
    } catch {
      setManual(true);
    }
  };

  const typed = findGeminiKey(draft);
  const step = 'flex items-start gap-3 rounded-2xl border p-3';
  const num = 'w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold text-white';
  return (
    <div className="space-y-2.5">
      <div className={`${step} ${opened ? 'border-emerald-200 bg-emerald-50/50' : 'border-[#e5e5ea] bg-white'}`}>
        <span className={`${num} ${opened ? 'bg-emerald-600' : 'bg-[#0071e3]'}`}>1</span>
        <div className="flex-1 min-w-0 space-y-2">
          <button
            type="button"
            onClick={() => {
              setOpened(true);
              openExternal(AI_STUDIO_KEYS_URL);
            }}
            className="w-full sm:w-auto min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            {ar ? 'احصل على مفتاحي المجاني' : 'Get my free key'}
          </button>
          <p className="text-xs text-[#515154] leading-relaxed">
            {ar
              ? 'في صفحة Google: اضغط "Create API key" (أو "إنشاء مفتاح")، ثم "نسخ". مجاني ولا يحتاج بطاقة دفع.'
              : 'On the Google page: tap "Create API key", then Copy. It is free and needs no payment card.'}
          </p>
        </div>
      </div>

      <div className={`${step} ${opened ? 'border-[#0071e3]/40 bg-[#0071e3]/5' : 'border-[#e5e5ea] bg-white'}`}>
        <span className={`${num} bg-[#0071e3]`}>2</span>
        <div className="flex-1 min-w-0 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void paste()}
            className={`w-full sm:w-auto min-h-11 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${opened ? 'bg-[#1d1d1f] text-white animate-[pulse_2s_ease-in-out_3]' : 'bg-white border border-[#d2d2d7] text-[#1d1d1f]'}`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
            {busy ? (ar ? 'جارٍ الاختبار…' : 'Testing…') : ar ? 'الصق المفتاح واختبره' : 'Paste key & test'}
          </button>
          <p className="text-xs text-[#515154]">{ar ? 'ارجع بعد النسخ واضغط هنا. يُختبر المفتاح ويُحفظ تلقائياً.' : 'Come back after copying and tap here. The key is tested and saved automatically.'}</p>
          {manual && (
            <div className="flex gap-2">
              <input
                dir="ltr"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="AIza…"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-[#d2d2d7] bg-white text-base sm:text-xs font-mono outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
              />
              <button type="button" onClick={() => typed && void applyKey(typed)} disabled={busy || !typed} className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40">
                {ar ? 'حفظ' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
      {msg && <p className={`text-xs rounded-xl p-2.5 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{msg.text}</p>}
    </div>
  );
};
