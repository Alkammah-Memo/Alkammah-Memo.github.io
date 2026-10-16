import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Layers, RefreshCw, Loader2, Mic } from 'lucide-react';
import { keyManager } from '../../lib/ai/keyManager';
import { usage, fullQueue, runnableQueue, MODEL_TIERS, nextDailyReset, formatWait } from '../../lib/ai/modelQueue';
import type { Tier } from '../../lib/ai/modelQueue';
import { probeModelQueue } from '../../lib/ai/gemini';

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
    return () => clearInterval(t);
  }, []);

  const queue = fullQueue(now);
  const running = runnableQueue(now)[0];
  const slots = keyManager.getSettings().slots.filter((s) => s.key);
  const tierName = (t: Tier) => (t === 'high' ? (ar ? 'عالٍ' : 'High') : ar ? 'متوسط' : 'Mid');

  const runCheck = async () => {
    setProbing(true);
    try {
      await probeModelQueue();
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
    if (running && running.slot.id === slotId && running.model === model) return { text: ar ? 'يعمل الآن' : 'Running now', cls: 'bg-[#0071e3] text-white border-[#0071e3]' };
    return { text: ar ? 'جاهز · ينتظر دوره' : 'Ready · waits its turn', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  return (
    <section className="bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#0071e3]" />
          <h2 className="text-base font-bold">{ar ? 'طابور النماذج والاستهلاك' : 'Model queue and usage'}</h2>
        </div>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={probing || slots.length === 0}
          className="min-h-10 px-4 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-xs font-bold disabled:opacity-40 inline-flex items-center gap-2"
        >
          {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {ar ? 'تحقق الآن' : 'Check now'}
        </button>
      </div>
      <p className="text-xs text-[#515154] mb-4">
        {ar ? 'يبدأ بالمفتاح الأول: النماذج العالية ثم المتوسطة. إذا انتهت حصة نموذج انتقل للتالي، وعند انتهاء المفتاح ينتقل للمفتاح التالي. وإذا انتهت كل النماذج في كل المفاتيح يتكلم الجهاز بصوته ويخبرك متى تعود الخدمة.' : 'It starts on Key 1: High models first, then Mid. When a model is used up it moves to the next one, and when a key is finished it moves to the next key. If every model on every key is used up, the device voice speaks and tells you when Gemini returns.'}
      </p>

      <ol className="grid gap-1.5 mb-4 text-xs">
        {[
          ...slots.map((s, i) => ({ n: i + 1, text: ar ? `${s.label}: ${MODEL_TIERS.map((t) => `${tierName(t.id)} (${t.models.map((m) => m.replace('gemini-', '')).join('، ')})`).join(' ← ')}` : `${s.label}: ${MODEL_TIERS.map((t) => `${tierName(t.id)} (${t.models.map((m) => m.replace('gemini-', '')).join(', ')})`).join(' → ')}` })),
          { n: slots.length + 1, text: ar ? 'منخفض: صوت الجهاز (الأخير، يعمل فقط عندما تنتهي كل نماذج Gemini)' : 'Low: device voice (last, only when every Gemini model is used up)' },
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
                {rows.map((e) => {
                  const u = usage.get(slot.id, e.model);
                  const limit = usage.limitFor(e.model);
                  const st = status(slot.id, e.model);
                  const exhausted = u.blockKind === 'daily' && !!u.blockedUntil && u.blockedUntil > now;
                  const left = limit ? (exhausted ? 0 : Math.max(0, limit - u.answered)) : null;
                  const pct = limit ? Math.min(100, Math.round(((exhausted ? limit : u.answered) / limit) * 100)) : 0;
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
                        <span>{ar ? `أُجيب اليوم من هذا الجهاز: ${u.answered}` : `Answered today from this device: ${u.answered}`}</span>
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
          ? `هذه أرقام حقيقية وليست تقديرية: Google لا تنشر الحصة المتبقية عبر واجهتها، لذلك نعرض عدد الطلبات التي أجابت عنها فعلاً من هذا الجهاز اليوم، والحد اليومي وموعد العودة كما أبلغتنا Google بنفسها عند بلوغ الحد. المتبقي هو "حتى" لأن أجهزة أخرى قد تستخدم نفس المفاتيح. تُصفَّر العدادات عند منتصف الليل بتوقيت المحيط الهادئ (الساعة ${cairoClock(nextDailyReset(now))} بتوقيت القاهرة تقريباً). الصوت المباشر (Live) له حدوده الخاصة ولا يظهر هنا.`
          : `These are real numbers, not estimates. Google does not publish remaining quota through its API, so we show the requests Google actually answered from this device today, plus the daily limit and return time exactly as Google reports them when a limit is hit. "Left: up to" is an upper bound because other devices may use the same keys. Counters reset at midnight Pacific time (about ${cairoClock(nextDailyReset(now))} Cairo time). Live voice has its own limits and is not shown here.`}
      </p>
    </section>
  );
};
