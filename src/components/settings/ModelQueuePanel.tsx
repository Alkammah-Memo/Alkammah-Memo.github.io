import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Layers, RefreshCw, Loader2, Mic } from 'lucide-react';
import { Fold } from './Fold';
import { keyManager } from '../../lib/ai/keyManager';
import { usage, fullQueue, runnableQueue, MODEL_TIERS, nextDailyReset, formatWait } from '../../lib/ai/modelQueue';
import type { Tier } from '../../lib/ai/modelQueue';
import { probeModelQueue } from '../../lib/ai/gemini';
import { syncSharedQuota } from '../../lib/cloud';
import { getVoiceEngine } from '../../lib/ai/voiceEngine';

const TIER_STYLE: Record<Tier, string> = {
  high: 'bg-[#0071e3]/10 text-[#0058b0] border-[#0071e3]/25',
  mid: 'bg-violet-50 text-violet-700 border-violet-200',
};

const cairoClock = (at: number) => new Date(at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });

/** Shows, per key, every model in the order it is used, with real status and real usage numbers. */
export const ModelQueuePanel: React.FC<{ ar: boolean }> = ({ ar }) => {
  useSyncExternalStore(usage.subscribe, usage.getVersion);
  useSyncExternalStore(keyManager.subscribe.bind(keyManager), () => keyManager.getSettings());
  const [now, setNow] = useState(Date.now());
  const [probing, setProbing] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    // other devices may have learned that a model is used up: pull that in so every device shows the same status
    void syncSharedQuota().catch(() => undefined);
    return () => clearInterval(t);
  }, []);

  const queue = fullQueue(now);
  const slots = keyManager.getSettings().slots.filter((s) => s.key);
  const running = runnableQueue(now)[0];
  const liveModel = keyManager.getSettings().models.live;
  const liveRunning = slots.find((sl) => !usage.isBlocked(sl.id, liveModel));
  // while Live voice is available it is the one in use; Economy waits behind it
  const liveInUse = getVoiceEngine() === 'live' && !!liveRunning;
  const tierName = (t: Tier) => (t === 'high' ? (ar ? 'عالٍ' : 'High') : ar ? 'متوسط' : 'Mid');

  const runCheck = async () => {
    setProbing(true);
    try {
      await probeModelQueue();
      void syncSharedQuota().catch(() => undefined);
    } finally {
      setProbing(false);
    }
  };

  const status = (slotId: number, model: string): { text: string; cls: string } => {
    const u = usage.get(slotId, model);
    if (u.blockedUntil && u.blockedUntil > now) {
      const wait = formatWait(u.blockedUntil - now, ar);
      if (u.blockKind === 'daily') return { text: ar ? `انتهت حصة اليوم · تعود بعد ${wait}` : `Used up today · back in ${wait}`, cls: 'bg-rose-50 text-rose-700 border-rose-200' };
      if (u.blockKind === 'minute') return { text: ar ? `حد الدقيقة · بعد ${wait}` : `Rate limit · back in ${wait}`, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
      if (u.blockKind === 'missing') return { text: ar ? 'غير متاح لهذا المفتاح' : 'Not available for this key', cls: 'bg-[#f5f5f7] text-[#6e6e73] border-[#d2d2d7]' };
      return { text: ar ? `مشغول · إعادة بعد ${wait}` : `Busy · retry in ${wait}`, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    if (running && running.slot.id === slotId && running.model === model) {
      return liveInUse
        ? { text: ar ? 'التالي إن انتهى المباشر' : 'Next if Live is used up', cls: 'bg-[#0071e3]/10 text-[#0058b0] border-[#0071e3]/30' }
        : { text: ar ? 'يعمل الآن' : 'Running now', cls: 'bg-[#0071e3] text-white border-[#0071e3]' };
    }
    return { text: ar ? 'جاهز · ينتظر دوره' : 'Ready · waits its turn', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  return (
    <Fold
      id="queue"
      icon={<Layers className="w-5 h-5" />}
      title={ar ? 'طابور النماذج والاستهلاك' : 'Model queue and usage'}
      right={
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={probing || slots.length === 0}
          className="min-h-10 px-3 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-xs font-bold disabled:opacity-40 inline-flex items-center gap-2 shrink-0"
        >
          {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="max-sm:hidden">{ar ? 'تحقق الآن' : 'Check now'}</span>
        </button>
      }
    >
      <p className="text-xs text-[#515154] mb-4">
        {ar ? 'الصوت المباشر هو الأساسي. إذا انتهى على كل المفاتيح يتحول سبيرو تلقائياً إلى الاقتصادي: المفتاح الأول (العالي ثم المتوسط) ثم الثاني ثم الثالث. وإذا انتهى كل شيء يتكلم الجهاز بصوته ويخبرك متى تعود الخدمة.' : 'Live voice is used first. If it is used up on every key, Spero switches to Economy by itself: Key 1 (High, then Mid), then Key 2, then Key 3. If everything is used up, the device voice speaks and tells you when Gemini returns.'}
      </p>

      <ol className="grid gap-1.5 mb-4 text-xs">
        {[
          { n: 1, text: ar ? `الصوت المباشر (${liveModel}): ${slots.map((s) => s.label).join(' ← ')}` : `Live voice (${liveModel}): ${slots.map((s) => s.label).join(' → ')}` },
          ...slots.map((s, i) => ({ n: i + 2, text: ar ? `الاقتصادي، ${s.label}: ${MODEL_TIERS.map((t) => `${tierName(t.id)} (${t.models.map((m) => m.replace('gemini-', '')).join('، ')})`).join(' ← ')}` : `Economy, ${s.label}: ${MODEL_TIERS.map((t) => `${tierName(t.id)} (${t.models.map((m) => m.replace('gemini-', '')).join(', ')})`).join(' → ')}` })),
          { n: slots.length + 2, text: ar ? 'منخفض: صوت الجهاز (الأخير، يعمل فقط عندما تنتهي كل نماذج Gemini)' : 'Low: device voice (last, only when every Gemini model is used up)' },
        ].map((r) => (
          <li key={r.n} className="flex items-start gap-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-[#1d1d1f] text-white text-[11px] font-bold flex items-center justify-center">{r.n}</span>
            <span className="text-[#1d1d1f] pt-0.5 break-words min-w-0">{r.text}</span>
          </li>
        ))}
      </ol>

      {slots.length === 0 && <p className="text-sm text-[#515154]">{ar ? 'أضف مفتاح Gemini أولاً.' : 'Add a Gemini key first.'}</p>}

      <div className="space-y-3">
        {slots.map((slot) => {
          const rows = queue.filter((e) => e.slot.id === slot.id);
          return (
            <div key={slot.id} className="rounded-2xl border border-[#d2d2d7] p-3 sm:p-4">
              <div className="text-sm font-bold mb-2">{slot.label}</div>
              <div className="space-y-2">
                {(() => {
                  const u = usage.get(slot.id, liveModel);
                  const blocked = !!u.blockedUntil && u.blockedUntil > now;
                  const wait = blocked ? formatWait((u.blockedUntil as number) - now, ar) : '';
                  const inUse = liveInUse && liveRunning?.id === slot.id;
                  const chip = blocked
                    ? u.blockKind === 'missing'
                      ? { text: ar ? 'غير متاح لهذا المفتاح' : 'Not available for this key', cls: 'bg-[#f5f5f7] text-[#6e6e73] border-[#d2d2d7]' }
                      : { text: ar ? `غير متاح الآن · بعد ${wait}` : `Unavailable · back in ${wait}`, cls: u.blockKind === 'daily' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200' }
                    : inUse
                    ? { text: ar ? 'يعمل الآن' : 'Running now', cls: 'bg-[#0071e3] text-white border-[#0071e3]' }
                    : { text: ar ? 'جاهز · ينتظر دوره' : 'Ready · waits its turn', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                  return (
                    <div className="rounded-xl bg-[#f5f5f7] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 bg-teal-50 text-teal-700 border-teal-200">{ar ? 'مباشر' : 'Live'}</span>
                          <span className="text-xs font-mono font-semibold truncate">{liveModel}</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.text}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#515154]">
                        {ar ? `جلسات اليوم (كل أجهزتك): ${usage.answeredAll(slot.id, liveModel)} · حد الصوت المباشر لا تنشره Google إلا عند بلوغه` : `Sessions today (all your devices): ${usage.answeredAll(slot.id, liveModel)} · Google only reports the Live limit when it is reached`}
                      </div>
                    </div>
                  );
                })()}
                {rows.map((e) => {
                  const u = usage.get(slot.id, e.model);
                  const answered = usage.answeredAll(slot.id, e.model);
                  const limit = usage.limitFor(e.model);
                  const st = status(slot.id, e.model);
                  const exhausted = u.blockKind === 'daily' && !!u.blockedUntil && u.blockedUntil > now;
                  const left = limit ? (exhausted ? 0 : Math.max(0, limit - answered)) : null;
                  const pct = limit ? Math.min(100, Math.round(((exhausted ? limit : answered) / limit) * 100)) : 0;
                  return (
                    <div key={e.model} className="rounded-xl bg-[#f5f5f7] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${TIER_STYLE[e.tier]}`}>{tierName(e.tier)}</span>
                          <span className="text-xs font-mono font-semibold truncate">{e.model}</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.text}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-[#d2d2d7]/70 overflow-hidden" aria-hidden>
                        <div className={`h-full rounded-full ${exhausted ? 'bg-rose-500' : 'bg-[#0071e3]'}`} style={{ width: `${limit ? pct : 0}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-[#515154] flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{ar ? `أُجيب اليوم (كل أجهزتك): ${answered}` : `Answered today (all your devices): ${answered}`}</span>
                        {limit ? (
                          <span className="font-semibold text-[#1d1d1f]">{ar ? `الحد اليومي من Google: ${limit} · المتبقي حتى ${left}` : `Google daily limit: ${limit} · left: up to ${left}`}</span>
                        ) : (
                          <span>{ar ? 'الحد اليومي: لم يُبلغ عنه Google بعد' : 'Daily limit: Google has not reported it yet'}</span>
                        )}
                        {u.lastMs ? <span>{ar ? `آخر رد: ${(u.lastMs / 1000).toFixed(1)} ث` : `Last reply: ${(u.lastMs / 1000).toFixed(1)}s`}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="rounded-2xl border border-dashed border-[#c7c7cc] p-3 sm:p-4 flex items-start gap-3">
          <span className="w-8 h-8 shrink-0 rounded-full bg-[#f5f5f7] flex items-center justify-center">
            <Mic className="w-4 h-4 text-[#515154]" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold flex flex-wrap items-center gap-2">
              {ar ? 'منخفض: صوت الجهاز' : 'Low: device voice'}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${runnableQueue(now).length === 0 && slots.length > 0 ? 'bg-[#0071e3] text-white border-[#0071e3]' : 'bg-[#f5f5f7] text-[#6e6e73] border-[#d2d2d7]'}`}>
                {runnableQueue(now).length === 0 && slots.length > 0 ? (ar ? 'يعمل الآن' : 'Running now') : ar ? 'احتياطي أخير' : 'Last resort'}
              </span>
            </div>
            <p className="text-xs text-[#515154] mt-1">
              {ar ? 'الجهاز يسمع وينطق لكنه لا يستطيع التفكير. عند انتهاء كل النماذج ينطق رسالة واضحة بموعد عودة أول نموذج.' : 'The device can listen and speak but cannot think. When every model is used up it speaks a clear message with the time the first model returns.'}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-[#6e6e73]">
        {ar
          ? `هذه أرقام حقيقية وليست تقديرية: Google لا تنشر الحصة المتبقية عبر واجهتها، لذلك نعرض عدد الطلبات التي أجابت عنها فعلاً من هذا الجهاز اليوم، والحد اليومي وموعد العودة كما أبلغتنا Google بنفسها عند بلوغ الحد. المتبقي هو "حتى" لأن جهازاً غير متصل أو لم يُزامن بعد قد يكون استخدم نفس المفاتيح. تُصفَّر العدادات عند منتصف الليل بتوقيت المحيط الهادئ (الساعة ${cairoClock(nextDailyReset(now))} بتوقيت القاهرة تقريباً).`
          : `These are real numbers, not estimates. Google does not publish remaining quota through its API, so we show the requests Google actually answered from your devices today (shared through your account), plus the daily limit and return time exactly as Google reports them when a limit is hit. "Left: up to" is an upper bound because a device that is offline or not synced yet may have used the same keys. Counters reset at midnight Pacific time (about ${cairoClock(nextDailyReset(now))} Cairo time).`}
      </p>
    </Fold>
  );
};
