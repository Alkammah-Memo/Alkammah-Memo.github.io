import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Save,
  Plug,
  Trash2,
  RefreshCw,
  Activity,
  LogOut,
  Cloud,
  CloudOff,
  SlidersHorizontal,
  ShieldCheck,
} from 'lucide-react';
import type { Locale } from '../../lib/translations';
import { keyManager, DEFAULT_MODELS, KEY_SLOT_COUNT } from '../../lib/ai/keyManager';
import type { GeminiSettings, KeySlot, ModelSettings } from '../../lib/ai/keyManager';
import { testGeminiKey, economyVoiceTurn, speedTestModels } from '../../lib/ai/gemini';
import type { SpeedRow } from '../../lib/ai/gemini';
import { ModelQueuePanel } from './ModelQueuePanel';
import { Fold } from './Fold';
import { SecuritySettings } from './SecuritySettings';
import { NotificationSettings } from './NotificationSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { GoogleCalendarSettings } from './GoogleCalendarSettings';
import { WorkCalendarSettings } from './WorkCalendarSettings';
import { CalendarGuide } from './CalendarGuide';
import { getVoiceEngine, setVoiceEngine } from '../../lib/ai/voiceEngine';
import type { VoiceEngine } from '../../lib/ai/voiceEngine';
import type { KeyTestResult } from '../../lib/ai/gemini';

interface SettingsViewProps {
  locale: Locale;
  isCloudConnected: boolean;
  isCloudConfigured: boolean;
  userEmail?: string | null;
  onSignOut?: () => void;
  onSyncGoogle?: (interactive: boolean) => Promise<{ added: number; updated: number; removed: number; email: string }>;
}

const useKeyManager = (): GeminiSettings => {
  const subscribe = (cb: () => void) => keyManager.subscribe(cb);
  return useSyncExternalStore(subscribe, () => keyManager.getSettings());
};

const useFailoverEvents = () => {
  const subscribe = (cb: () => void) => keyManager.subscribe(cb);
  return useSyncExternalStore(subscribe, () => keyManager.getEvents());
};

const maskKey = (key: string) => (key.length > 10 ? `${key.slice(0, 4)}••••••••${key.slice(-4)}` : key ? '••••••' : '');

export const SettingsView: React.FC<SettingsViewProps> = ({
  locale,
  isCloudConnected,
  isCloudConfigured,
  userEmail,
  onSignOut,
  onSyncGoogle,
}) => {
  const ar = locale === 'ar';
  const saved = useKeyManager();
  const events = useFailoverEvents();

  const [draftSlots, setDraftSlots] = useState<KeySlot[]>(saved.slots);
  const [draftModels, setDraftModels] = useState<ModelSettings>(saved.models);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [testing, setTesting] = useState<Record<number, boolean>>({});
  const [results, setResults] = useState<Record<number, KeyTestResult | { error: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showModels, setShowModels] = useState(false);
  const [engine, setEngine] = useState<VoiceEngine>(() => getVoiceEngine());
  const [speedRows, setSpeedRows] = useState<SpeedRow[] | null>(null);
  const [speedBusy, setSpeedBusy] = useState(false);
  const runSpeedTest = async () => {
    setSpeedBusy(true);
    setSpeedRows(null);
    try {
      setSpeedRows(await speedTestModels(['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest', saved.models.transcribe]));
    } finally {
      setSpeedBusy(false);
    }
  };
  const [voiceTestText, setVoiceTestText] = useState('');
  const [voiceTestState, setVoiceTestState] = useState<{ busy: boolean; reply?: string; error?: string; secs?: number }>({ busy: false });
  const runVoiceTest = async () => {
    const q = voiceTestText.trim();
    if (!q || voiceTestState.busy) return;
    setVoiceTestState({ busy: true });
    const started = Date.now();
    try {
      // Test mode: the assistant may "use" a tool, but nothing in the workspace is changed
      const reply = await economyVoiceTurn(q, ar ? 'ar' : 'en', { meetings: [], tasks: [] }, [], async () => ({ ok: true, note: 'Test mode: nothing was changed.' }));
      setVoiceTestState({ busy: false, reply, secs: Math.round((Date.now() - started) / 100) / 10 });
    } catch (err) {
      setVoiceTestState({ busy: false, error: (err as Error)?.message || String(err), secs: Math.round((Date.now() - started) / 100) / 10 });
    }
  };
  const [now, setNow] = useState(Date.now());

  // Re-hydrate the form if settings arrive from the cloud (e.g. after sign-in on another device)
  useEffect(() => {
    setDraftSlots(saved.slots);
    setDraftModels(saved.models);
  }, [saved.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const dirty = useMemo(
    () =>
      JSON.stringify(draftSlots.map((s) => [s.id, s.label, s.key])) !==
        JSON.stringify(saved.slots.map((s) => [s.id, s.label, s.key])) ||
      JSON.stringify(draftModels) !== JSON.stringify(saved.models),
    [draftSlots, draftModels, saved]
  );

  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const s of draftSlots) {
      const k = s.key.trim();
      if (!k) continue;
      if (seen.has(k)) dup.add(k);
      seen.add(k);
    }
    return dup;
  }, [draftSlots]);

  const updateSlot = (id: number, patch: Partial<KeySlot>) => {
    setDraftSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    if (patch.key !== undefined) {
      setResults((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const slots = draftSlots.map((s) => {
        const previous = saved.slots.find((p) => p.id === s.id);
        const changed = previous?.key !== s.key.trim();
        return {
          ...s,
          key: s.key.trim(),
          label: s.label.trim() || `Key ${s.id}`,
          status: changed ? ('untested' as const) : s.status,
          message: changed ? undefined : s.message,
          cooldownUntil: changed ? undefined : s.cooldownUntil,
        };
      });
      await keyManager.save({ ...saved, slots, models: draftModels });
      setSaveMessage({
        ok: true,
        text: isCloudConfigured
          ? ar
            ? 'تم حفظ المفاتيح ومزامنتها مع حسابك.'
            : 'Keys saved and synced to your account.'
          : ar
          ? 'تم حفظ المفاتيح على هذا الجهاز.'
          : 'Keys saved on this device.',
      });
    } catch (err) {
      // Local copy is already stored; only the cloud mirror failed
      setSaveMessage({
        ok: false,
        text:
          (ar ? 'تم الحفظ محلياً لكن تعذرت المزامنة السحابية: ' : 'Saved on this device, but cloud sync failed: ') +
          ((err as Error)?.message || String(err)),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (slot: KeySlot) => {
    const key = slot.key.trim();
    if (!key) return;
    setTesting((p) => ({ ...p, [slot.id]: true }));
    try {
      const res = await testGeminiKey(key, draftModels);
      setResults((p) => ({ ...p, [slot.id]: res }));
      // Only record health for a key that is actually the saved one
      if (saved.slots.find((s) => s.id === slot.id)?.key === key) {
        keyManager.recordTestResult(slot.id, res.ok, res.rest.message);
      }
    } catch (err) {
      setResults((p) => ({ ...p, [slot.id]: { error: (err as Error)?.message || String(err) } }));
    } finally {
      setTesting((p) => ({ ...p, [slot.id]: false }));
    }
  };

  const handleTestAll = async () => {
    for (const s of draftSlots) if (s.key.trim()) await handleTest(s);
  };

  const handleClear = (slot: KeySlot) => {
    updateSlot(slot.id, { key: '' });
  };

  const active = keyManager.getActiveSlot();
  const configuredCount = saved.slots.filter((s) => s.key).length;

  const statusChip = (slot: KeySlot) => {
    const saveSlot = saved.slots.find((s) => s.id === slot.id);
    const cooling = saveSlot?.cooldownUntil && saveSlot.cooldownUntil > now;
    if (!slot.key.trim()) {
      return { text: ar ? 'فارغ' : 'Empty', cls: 'bg-stone-100 text-stone-500 border-stone-200', icon: null };
    }
    if (cooling) {
      const secs = Math.ceil((saveSlot!.cooldownUntil! - now) / 1000);
      return {
        text: ar ? `استراحة ${secs}ث` : `Resting ${secs}s`,
        cls: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: <AlertTriangle className="w-3 h-3" />,
      };
    }
    if (saveSlot?.status === 'ok') {
      return {
        text: ar ? 'يعمل' : 'Working',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <CheckCircle2 className="w-3 h-3" />,
      };
    }
    if (saveSlot?.status === 'limited') {
      return {
        text: ar ? 'حد الاستخدام' : 'Rate limited',
        cls: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: <AlertTriangle className="w-3 h-3" />,
      };
    }
    if (saveSlot?.status === 'error') {
      return { text: ar ? 'خطأ' : 'Error', cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: <XCircle className="w-3 h-3" /> };
    }
    return { text: ar ? 'لم يُختبر' : 'Not tested', cls: 'bg-sky-50 text-sky-700 border-sky-200', icon: null };
  };

  const kindLabel = (k: string) =>
    ({
      quota: ar ? 'حد الاستخدام' : 'Quota',
      auth: ar ? 'مفتاح مرفوض' : 'Key rejected',
      overloaded: ar ? 'خدمة مشغولة' : 'Busy',
      network: ar ? 'شبكة' : 'Network',
      switch: ar ? 'تحويل' : 'Switch',
      recovered: ar ? 'تعافى' : 'Recovered',
      model: ar ? 'نموذج' : 'Model',
      info: ar ? 'معلومة' : 'Info',
    } as Record<string, string>)[k] || k;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">{ar ? 'الإعدادات' : 'Settings'}</h1>
        <p className="text-sm text-[#515154] mt-1">
          {ar
            ? 'إدارة مفاتيح Gemini للمساعد الصوتي. لو أي مفتاح وصل للحد أو تعطل، النظام بيحوّل تلقائياً للمفتاح التالي ويفضل يحاول بدون انقطاع.'
            : 'Manage the Gemini keys that power the voice agent. If any key hits a limit or fails, the system switches to the next key automatically and keeps retrying, so the voice agent never goes down.'}
        </p>
      </div>

      <AppearanceSettings ar={ar} />

      {/* Voice engine */}
      <Fold id="voice" defaultOpen icon={<Activity className="w-5 h-5" />} title={ar ? 'محرك الصوت' : 'Voice engine'}>
        <p className="text-xs text-[#515154] mb-3">
          {ar
            ? 'الأساسي هو الصوت المباشر (Gemini Live). عندما تنتهي حصته على كل المفاتيح يتحول سبيرو تلقائياً إلى الصوت الاقتصادي، ثم إلى صوت الجهاز عند انتهاء كل شيء. يمكنك تثبيت الاقتصادي فقط إن أردت.'
            : 'Live voice (Gemini Live) is the default. When it is used up on every key, Spero switches to Economy by itself, then to the device voice when everything is used up. You can pin Economy only if you prefer.'}
        </p>
        <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label={ar ? 'محرك الصوت' : 'Voice engine'}>
          {(
            [
              ['live', ar ? 'مباشر (الأساسي)' : 'Live (default)', ar ? 'صوت طبيعي وسريع، ويتحول تلقائياً للاقتصادي عند انتهاء حصته.' : 'Natural and fast. Switches to Economy by itself when its quota is used up.'],
              ['economy', ar ? 'اقتصادي فقط' : 'Economy only', ar ? 'يبقى على الاقتصادي دائماً. الصوت من الجهاز ويكفي ساعات.' : 'Always stays on Economy. Voice comes from the device and lasts hours.'],
            ] as const
          ).map(([id, title, sub]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={engine === id}
              onClick={() => {
                setEngine(id);
                setVoiceEngine(id);
              }}
              className={`min-h-16 p-3.5 rounded-2xl border text-start transition-colors ${
                engine === id ? 'border-[#0071e3] bg-blue-50' : 'border-[#d2d2d7] bg-white hover:bg-[#f5f5f7]'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-[#1d1d1f]">
                <span className={`w-4 h-4 rounded-full border-2 ${engine === id ? 'border-[#0071e3] bg-[#0071e3]' : 'border-[#c7c7cc]'}`} />
                {title}
              </div>
              <div className="text-xs text-[#515154] mt-1">{sub}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[#ececf0]">
          <label className="block text-xs font-semibold text-[#515154] mb-1.5" htmlFor="voice-test">
            {ar ? 'اختبار الصوت الاقتصادي (كتابةً، بلا تغيير في بياناتك)' : 'Test the Economy voice (typed, changes nothing in your data)'}
          </label>
          <div className="flex gap-2">
            <input
              id="voice-test"
              value={voiceTestText}
              onChange={(e) => setVoiceTestText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runVoiceTest();
              }}
              placeholder={ar ? 'مثال: مرحباً سبيرو' : 'e.g. Hello Spero'}
              className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm focus:outline-none focus:border-[#0071e3]"
            />
            <button
              type="button"
              onClick={() => void runVoiceTest()}
              disabled={voiceTestState.busy || !voiceTestText.trim()}
              className="min-h-11 px-4 rounded-xl bg-[#0071e3] disabled:opacity-40 text-white text-sm font-bold"
            >
              {voiceTestState.busy ? (ar ? 'جارٍ...' : 'Testing…') : ar ? 'اختبار' : 'Test'}
            </button>
          </div>
          {voiceTestState.reply && <p className="mt-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 break-words">{voiceTestState.reply} <span className="font-mono text-[11px] opacity-70">({voiceTestState.secs}s)</span></p>}
          {voiceTestState.error && <p className="mt-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 break-words">{voiceTestState.error}</p>}
        </div>
        <div className="mt-4 pt-4 border-t border-[#ececf0]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#515154]">{ar ? 'اختبار سرعة النماذج (نص وصوت)' : 'Model speed test (text and audio)'}</span>
            <button type="button" onClick={() => void runSpeedTest()} disabled={speedBusy} className="min-h-10 px-4 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7] text-xs font-bold disabled:opacity-40">
              {speedBusy ? (ar ? 'جارٍ القياس...' : 'Measuring…') : ar ? 'ابدأ' : 'Run'}
            </button>
          </div>
          {speedRows && (
            <ul className="mt-2 space-y-1 text-xs font-mono">
              {speedRows.map((r) => (
                <li key={r.model} className="flex justify-between gap-2 bg-[#f5f5f7] rounded-lg px-3 py-1.5">
                  <span className="truncate">{r.model}</span>
                  <span className="shrink-0">{r.error ? `✗ ${r.error}` : `text ${r.textSecs}s · audio ${r.audioSecs}s`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Fold>

      {/* Gemini Keys */}
      <Fold
        id="keys"
        defaultOpen
        icon={<KeyRound className="w-5 h-5" />}
        title={ar ? 'مفاتيح Gemini' : 'Gemini API Keys'}
        right={
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-xl bg-[#f5f5f7] border border-[#d2d2d7]/70">
            <Activity className="w-3.5 h-3.5 text-[#0071e3]" />
            <span>
              {active
                ? ar
                  ? `المفتاح النشط: ${active.label}`
                  : `Active: ${active.label}`
                : configuredCount === 0
                ? ar
                  ? 'لا توجد مفاتيح'
                  : 'No keys configured'
                : ar
                ? 'كل المفاتيح في استراحة، بنعيد المحاولة'
                : 'All keys resting, retrying'}
            </span>
          </div>
        }
      >
        <div className="space-y-4">
          {draftSlots.map((slot) => {
            const chip = statusChip(slot);
            const res = results[slot.id];
            const isActive = active?.id === slot.id && !!slot.key;
            const isDuplicate = slot.key.trim() && duplicateKeys.has(slot.key.trim());
            const shown = revealed[slot.id];
            return (
              <div
                key={slot.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  isActive ? 'border-[#0071e3]/50 bg-[#0071e3]/[0.03]' : 'border-[#d2d2d7] bg-[#fafafa]'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-[#1d1d1f] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {slot.id}
                  </span>
                  <input
                    value={slot.label}
                    onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                    maxLength={30}
                    aria-label={ar ? 'اسم المفتاح' : 'Key name'}
                    className="flex-1 min-w-[120px] bg-transparent text-sm font-semibold outline-none border-b border-transparent focus:border-[#0071e3]"
                  />
                  {isActive && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#0071e3] bg-[#0071e3]/10 px-2 py-0.5 rounded-full">
                      {ar ? 'نشط' : 'In use'}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${chip.cls}`}>
                    {chip.icon}
                    {chip.text}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type={shown ? 'text' : 'password'}
                      value={slot.key}
                      onChange={(e) => updateSlot(slot.id, { key: e.target.value })}
                      placeholder={ar ? 'الصق مفتاح Gemini هنا (AIza...)' : 'Paste Gemini API key (AIza...)'}
                      autoComplete="off"
                      spellCheck={false}
                      dir="ltr"
                      className="w-full h-11 pl-3 pr-10 rounded-xl border border-[#d2d2d7] bg-white text-sm font-mono outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealed((p) => ({ ...p, [slot.id]: !p[slot.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-800"
                      aria-label={shown ? 'Hide key' : 'Show key'}
                    >
                      {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTest(slot)}
                      disabled={!slot.key.trim() || testing[slot.id]}
                      className="h-11 px-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-[#d2d2d7] text-sm font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40 transition-colors"
                    >
                      {testing[slot.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4 text-[#0071e3]" />}
                      {ar ? 'اختبار الاتصال' : 'Test connection'}
                    </button>
                    <button
                      onClick={() => handleClear(slot)}
                      disabled={!slot.key}
                      className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-white border border-[#d2d2d7] text-stone-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                      aria-label={ar ? 'مسح المفتاح' : 'Clear key'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isDuplicate && (
                  <p className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {ar ? 'نفس المفتاح مكرر. استخدم مفاتيح من مشاريع مختلفة للحصول على حدود استخدام مستقلة.' : 'This key is duplicated. Use keys from different projects so each has its own quota.'}
                  </p>
                )}

                {slot.key && !res && (
                  <p className="mt-2 text-[11px] text-stone-500 font-mono" dir="ltr">
                    {maskKey(slot.key)}
                    {saved.slots.find((s) => s.id === slot.id)?.message ? ` · ${saved.slots.find((s) => s.id === slot.id)?.message}` : ''}
                  </p>
                )}

                {res && 'error' in res && (
                  <div className="mt-3 text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3">{res.error}</div>
                )}
                {res && !('error' in res) && (
                  <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
                    <div
                      className={`rounded-xl border p-3 ${
                        res.rest.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        {res.rest.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {ar ? 'الذكاء الاصطناعي (نص)' : 'AI requests'}
                      </div>
                      <div className="mt-1 break-words">{res.rest.message}</div>
                      {res.rest.ok && (
                        <div className="mt-1 font-mono opacity-70">
                          {res.rest.model} · {res.rest.latencyMs}ms
                        </div>
                      )}
                    </div>
                    <div
                      className={`rounded-xl border p-3 ${
                        res.live.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : res.rest.ok
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-stone-50 border-stone-200 text-stone-700'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        {res.live.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {ar ? 'الصوت المباشر (Live)' : 'Live voice'}
                      </div>
                      <div className="mt-1 break-words">{res.live.message}</div>
                      {res.live.ok && <div className="mt-1 font-mono opacity-70">{res.live.latencyMs}ms</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-[#0071e3] hover:bg-[#0062c4] text-white text-sm font-bold shadow-xs disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {ar ? 'حفظ' : 'Save'}
          </button>
          <button
            onClick={handleTestAll}
            disabled={!draftSlots.some((s) => s.key.trim()) || Object.values(testing).some(Boolean)}
            className="h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-white border border-[#d2d2d7] text-sm font-semibold hover:bg-[#f5f5f7] disabled:opacity-40 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-[#0071e3]" />
            {ar ? 'اختبار كل المفاتيح' : 'Test all keys'}
          </button>
          {dirty && !saving && (
            <span className="text-xs text-amber-700">{ar ? 'تغييرات غير محفوظة' : 'Unsaved changes'}</span>
          )}
          {saveMessage && (
            <span className={`text-xs ${saveMessage.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{saveMessage.text}</span>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-stone-500 flex gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {ar
            ? `المفاتيح محفوظة بشكل خاص في حسابك (محمية بصلاحيات على مستوى الصف) وعلى هذا الجهاز. استخدم حتى ${KEY_SLOT_COUNT} مفاتيح من مشاريع Google مختلفة.`
            : `Keys are stored privately in your account (protected by row-level security) and on this device. Use up to ${KEY_SLOT_COUNT} keys from different Google projects so quotas are independent.`}
        </p>
      </Fold>

      <GoogleCalendarSettings ar={ar} onSync={onSyncGoogle} />
      <WorkCalendarSettings ar={ar} />
      <CalendarGuide ar={ar} />

      <NotificationSettings ar={ar} />

      {/* Model queue and usage */}
      <ModelQueuePanel ar={ar} />

      {/* Failover monitor */}
      <Fold
        id="failover"
        icon={<Activity className="w-5 h-5" />}
        title={ar ? 'سجل التحويل التلقائي' : 'Automatic failover log'}
        right={
          <button onClick={() => keyManager.clearCooldowns()} className="min-h-10 px-2 text-xs font-semibold text-[#0071e3] hover:underline shrink-0">
            {ar ? 'إنهاء الاستراحة' : 'End resting'}
          </button>
        }
      >
        {events.length === 0 ? (
          <p className="text-sm text-stone-500">
            {ar ? 'لا أحداث بعد. هتظهر هنا أي مرة النظام يحوّل فيها لمفتاح تاني.' : 'No events yet. Any time the system switches keys, it will appear here.'}
          </p>
        ) : (
          <ul className="divide-y divide-[#ececf0] max-h-64 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="py-2 flex items-start gap-2 text-xs">
                <span className="font-mono text-stone-400 shrink-0">
                  {new Date(e.at).toLocaleTimeString(ar ? 'ar-EG' : 'en-GB', { hour12: false, timeZone: 'Africa/Cairo' })}
                </span>
                <span className="font-semibold shrink-0 px-1.5 rounded bg-[#f5f5f7] border border-[#d2d2d7]/70">{kindLabel(e.kind)}</span>
                <span className="text-[#1d1d1f] break-words">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Fold>

      {/* Models */}
      <section className="bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-5 sm:p-6">
        <button onClick={() => setShowModels((v) => !v)} className="w-full flex items-center justify-between">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-[#0071e3]" />
            <span className="text-base font-bold">{ar ? 'النماذج (متقدم)' : 'Models (advanced)'}</span>
          </span>
          <span className="text-xs text-[#0071e3] font-semibold">{showModels ? (ar ? 'إخفاء' : 'Hide') : ar ? 'عرض' : 'Show'}</span>
        </button>
        {showModels && (
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {(
              [
                ['chat', ar ? 'نموذج المحادثة' : 'Chat model'],
                ['vision', ar ? 'نموذج قراءة الخط' : 'Handwriting (vision) model'],
                ['transcribe', ar ? 'نموذج التفريغ الصوتي' : 'Transcription model'],
                ['tts', ar ? 'نموذج النطق' : 'Speech (TTS) model'],
                ['live', ar ? 'نموذج الصوت المباشر' : 'Live voice model'],
                ['voiceName', ar ? 'اسم الصوت' : 'Voice name'],
              ] as [keyof ModelSettings, string][]
            ).map(([field, label]) => (
              <label key={field} className="block text-xs font-semibold text-[#515154]">
                {label}
                <input
                  value={draftModels[field] as string}
                  onChange={(e) => setDraftModels((m) => ({ ...m, [field]: e.target.value }))}
                  dir="ltr"
                  className="mt-1 w-full h-10 px-3 rounded-xl border border-[#d2d2d7] bg-white text-sm font-mono outline-none focus:border-[#0071e3]"
                />
              </label>
            ))}
            <label className="block text-xs font-semibold text-[#515154] sm:col-span-2">
              {ar ? 'نماذج احتياطية للمحادثة (مفصولة بفاصلة)' : 'Chat fallback models (comma separated)'}
              <input
                value={draftModels.chatFallbacks.join(', ')}
                onChange={(e) =>
                  setDraftModels((m) => ({
                    ...m,
                    chatFallbacks: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
                dir="ltr"
                className="mt-1 w-full h-10 px-3 rounded-xl border border-[#d2d2d7] bg-white text-sm font-mono outline-none focus:border-[#0071e3]"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                onClick={() => setDraftModels(DEFAULT_MODELS)}
                className="text-xs font-semibold text-[#0071e3] hover:underline"
              >
                {ar ? 'استعادة الافتراضي' : 'Restore defaults'}
              </button>
              <span className="text-xs text-stone-500 ms-3">
                {ar ? 'اضغط حفظ بعد التعديل.' : 'Press Save after editing.'}
              </span>
            </div>
          </div>
        )}
      </section>

      <SecuritySettings ar={ar} userEmail={userEmail} />

      {/* Account */}
      <section className="bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isCloudConnected ? <Cloud className="w-5 h-5 text-emerald-600" /> : <CloudOff className="w-5 h-5 text-stone-500" />}
          <div>
            <div className="text-sm font-bold">
              {isCloudConnected ? (ar ? 'المزامنة السحابية نشطة' : 'Cloud sync active') : ar ? 'وضع محلي' : 'Local mode'}
            </div>
            <div className="text-xs text-stone-500">
              {userEmail ||
                (isCloudConfigured
                  ? ar
                    ? 'غير مسجل الدخول'
                    : 'Not signed in'
                  : ar
                  ? 'Supabase غير مُعد، البيانات على هذا الجهاز فقط'
                  : 'Supabase not configured, data stays on this device')}
            </div>
          </div>
        </div>
        {userEmail && onSignOut && (
          <button
            onClick={onSignOut}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-white border border-[#d2d2d7] text-sm font-semibold hover:bg-[#f5f5f7]"
          >
            <LogOut className="w-4 h-4" />
            {ar ? 'تسجيل الخروج' : 'Sign out'}
          </button>
        )}
      </section>
    </div>
  );
};
