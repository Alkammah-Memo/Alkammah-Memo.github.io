import React, { useEffect, useMemo, useState } from 'react';
import { Compass, MapPin, Star, Plus, RotateCcw, Search, Trash2, Volume2 } from 'lucide-react';
import { COUNTRIES, Country, LANGUAGES, PHRASES, WEATHER_CODES, hoursFromCairo, qiblaBearing } from '../../lib/travelData';
import { Place, convert, findPlaces, fmt, getPrayerTimes, getRates, getWeather } from '../../lib/market';
import { isCityWatched, toggleCity, useWatchCities } from '../../lib/marketWatch';
import { Card, ErrorBox, SourceLine, ToolShell, useLoad } from './parts';

const DEST_KEY = 'alkammah_mate_dest';
interface Dest {
  countryId: string | null;
  place: Place;
}
const placeOf = (c: Country, ar: boolean): Place => ({ name: ar ? c.capital.ar : c.capital.en, country: ar ? c.ar : c.en, lat: c.lat, lon: c.lon, tz: c.tz });
const readDest = (): Dest | null => {
  try {
    return JSON.parse(localStorage.getItem(DEST_KEY) || 'null') as Dest | null;
  } catch {
    return null;
  }
};

export const TravelTool: React.FC<{ ar: boolean; onBack: () => void; onOpenPhrases: (lang: string) => void }> = ({ ar, onBack, onOpenPhrases }) => {
  const [dest, setDest] = useState<Dest>(() => readDest() || { countryId: 'cn', place: placeOf(COUNTRIES.find((c) => c.id === 'cn')!, false) });
  const cities = useWatchCities();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const country = COUNTRIES.find((c) => c.id === dest.countryId) || null;
  const save = (d: Dest) => {
    setDest(d);
    try {
      localStorage.setItem(DEST_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  };
  const wx = useLoad((f) => getWeather(dest.place.lat, dest.place.lon, f), [dest.place.lat, dest.place.lon]);
  const rates = useLoad((f) => getRates(f), []);
  const tz = wx.data?.data.tz || dest.place.tz;
  const today = (() => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.day}-${p.month}-${p.year}`;
  })();
  const pray = useLoad((f) => getPrayerTimes(dest.place.lat, dest.place.lon, today, f), [dest.place.lat, dest.place.lon, today]);
  const bearing = qiblaBearing(dest.place.lat, dest.place.lon);
  const diff = hoursFromCairo(tz);
  const local = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const rate = country && rates.data ? convert(1, country.currency, 'EGP', rates.data.data) : NaN;
  const lang = country?.phrases ? LANGUAGES.find((l) => l.code === country.phrases) : undefined;

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setFound(null);
      setSearching(true);
      try {
        setFound(await findPlaces(q.trim(), ar));
      } catch {
        setFound([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q, ar]);

  const wmo = (code: number) => WEATHER_CODES[code] || { en: '—', ar: '—', icon: '🌡️' };
  const w = wx.data?.data;
  return (
    <ToolShell title={ar ? 'السفر' : 'Travel'} ar={ar} onBack={onBack}>
      <Card>
        <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{ar ? 'الوجهة' : 'Destination'}</div>
        <select
          value={dest.countryId || ''}
          onChange={(e) => {
            const c = COUNTRIES.find((x) => x.id === e.target.value);
            if (c) save({ countryId: c.id, place: placeOf(c, ar) });
          }}
          aria-label={ar ? 'الدولة' : 'Country'}
          className="mt-2 w-full h-12 px-3 rounded-xl border border-stone-300 text-base bg-white"
        >
          {!dest.countryId && <option value="">{ar ? 'مدينة مختارة' : 'Chosen city'}</option>}
          {[...COUNTRIES].sort((a, b) => (ar ? a.ar.localeCompare(b.ar, 'ar') : a.en.localeCompare(b.en))).map((c) => (
            <option key={c.id} value={c.id}>
              {ar ? c.ar : c.en}
            </option>
          ))}
        </select>
        <div className="relative mt-2">
          <Search className="w-4 h-4 text-stone-400 absolute start-3 top-4" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={ar ? 'أو ابحث عن أي مدينة في العالم' : 'Or search any city in the world'} className="w-full h-12 ps-9 pe-3 rounded-xl border border-stone-300 text-base sm:text-sm bg-white" />
        </div>
        {q.trim().length >= 2 && (
          <ul className="mt-2 rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
            {searching && <li className="px-3 py-3 text-sm text-stone-500">{ar ? 'جارٍ البحث…' : 'Searching…'}</li>}
            {found?.length === 0 && !searching && <li className="px-3 py-3 text-sm text-stone-500">{ar ? 'لا نتائج.' : 'No results.'}</li>}
            {found?.map((p, i) => (
              <li key={`${p.lat}${p.lon}${i}`}>
                <button type="button" onClick={() => { save({ countryId: COUNTRIES.find((c) => c.en === p.country || c.ar === p.country)?.id || null, place: p }); setQ(''); setFound(null); }} className="w-full min-h-12 px-3 flex items-center gap-2 text-start active:bg-stone-50">
                  <MapPin className="w-4 h-4 text-[#0071e3]" />
                  <span className="text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-stone-500">{p.country}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-bold">{dest.place.name}</div>
            <div className="text-xs text-stone-500">{dest.place.country}</div>
            <button type="button" onClick={() => toggleCity(dest.place)} className={`mt-2 min-h-10 px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 ${isCityWatched(cities, dest.place) ? 'border-[#0071e3] text-[#0071e3] bg-[#0071e3]/5' : 'border-stone-300 text-stone-700'}`}>
              <Star className={`w-4 h-4 ${isCityWatched(cities, dest.place) ? 'fill-[#0071e3]' : ''}`} />
              {isCityWatched(cities, dest.place) ? (ar ? 'في طقس المتابعة' : 'On my weather list') : ar ? 'أضف لطقس المتابعة' : 'Add to weather list'}
            </button>
          </div>
          <div className="text-end">
            <div className="font-mono text-xl font-bold tabular-nums">{local}</div>
            <div className="text-[11px] text-stone-500">{diff === 0 ? (ar ? 'نفس توقيت القاهرة' : 'Same as Cairo') : ar ? `${Math.abs(diff)} ساعة ${diff > 0 ? 'قبل' : 'بعد'} القاهرة` : `${Math.abs(diff)} h ${diff > 0 ? 'ahead of' : 'behind'} Cairo`}</div>
          </div>
        </div>
        {wx.error && <div className="mt-2"><ErrorBox ar={ar} error={wx.error} onRetry={wx.reload} /></div>}
        {w && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-5xl" aria-hidden>{wmo(w.now.code).icon}</span>
              <div>
                <div className="text-3xl font-bold tabular-nums">{Math.round(w.now.temp)}°C</div>
                <div className="text-sm text-stone-600">{ar ? wmo(w.now.code).ar : wmo(w.now.code).en}</div>
              </div>
              <div className="ms-auto text-xs text-stone-600 text-end space-y-0.5">
                <div>{ar ? 'الإحساس' : 'Feels'} {Math.round(w.now.feels)}°</div>
                <div>{ar ? 'الرطوبة' : 'Humidity'} {w.now.humidity}%</div>
                <div>{ar ? 'الرياح' : 'Wind'} {Math.round(w.now.wind)} km/h</div>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-stone-100">
              {w.days.map((d, i) => (
                <li key={d.date} className="flex items-center gap-2 py-2">
                  <span className="w-14 text-xs font-semibold text-stone-600">{i === 0 ? (ar ? 'اليوم' : 'Today') : new Date(`${d.date}T12:00:00Z`).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' })}</span>
                  <span className="text-xl" aria-hidden>{wmo(d.code).icon}</span>
                  <span className="flex-1 text-xs text-stone-500 truncate">{ar ? wmo(d.code).ar : wmo(d.code).en}</span>
                  <span className="text-xs text-sky-700 tabular-nums w-10 text-end">{d.rain}%💧</span>
                  <span className="font-mono text-sm font-bold tabular-nums w-16 text-end">
                    {Math.round(d.max)}° <span className="text-stone-400 font-normal">{Math.round(d.min)}°</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-2"><SourceLine ar={ar} stamped={wx.data} onRefresh={wx.reload} loading={wx.loading} /></div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500 flex-1">{ar ? 'مواقيت الصلاة والقبلة' : 'Prayer times & Qibla'}</div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
            <Compass className="w-4 h-4 text-[#0071e3]" style={{ transform: `rotate(${bearing - 45}deg)` }} />
            {Math.round(bearing)}° {ar ? 'من الشمال' : 'from north'}
          </div>
        </div>
        {pray.error ? <ErrorBox ar={ar} error={pray.error} onRetry={pray.reload} /> : pray.data && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([['Fajr', 'الفجر'], ['Sunrise', 'الشروق'], ['Dhuhr', 'الظهر'], ['Asr', 'العصر'], ['Maghrib', 'المغرب'], ['Isha', 'العشاء']] as const).map(([k, a]) => (
              <div key={k} className="rounded-xl border border-stone-200 py-2 text-center">
                <div className="text-[11px] text-stone-500">{ar ? a : k}</div>
                <div className="font-mono font-bold tabular-nums">{pray.data!.data[k]}</div>
              </div>
            ))}
          </div>
        )}
        {pray.data && <div className="mt-2"><SourceLine ar={ar} stamped={pray.data} /></div>}
        <p className="mt-1 text-[11px] text-stone-500">{ar ? 'التوقيت المحلي للوجهة. اتجاه القبلة تقريبي بالبوصلة؛ راجع إعلان المسجد أو الفندق.' : 'Local time at the destination. The Qibla bearing is approximate; confirm with the hotel or a local mosque.'}</p>
      </Card>

      {country && (
        <Card>
          <div className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-1">{ar ? 'معلومات سريعة' : 'Quick facts'}</div>
          <ul className="divide-y divide-stone-100 text-sm">
            {[
              [ar ? 'العملة' : 'Currency', `${country.currency}${Number.isFinite(rate) ? ` · 1 ${country.currency} = ${fmt(rate, rate < 1 ? 4 : 2)} EGP` : ''}`],
              [ar ? 'اللغة' : 'Language', ar ? country.language.ar : country.language.en],
              [ar ? 'الكهرباء' : 'Power', `${country.voltage} · ${ar ? 'قوابس' : 'plugs'} ${country.plugs}`],
              [ar ? 'الطوارئ' : 'Emergency', country.emergency || (ar ? 'تحقق عند الوصول' : 'check on arrival')],
              [ar ? 'عطلة نهاية الأسبوع' : 'Weekend', country.weekend === 'Fri–Sat' ? (ar ? 'الجمعة والسبت' : 'Friday–Saturday') : ar ? 'السبت والأحد' : 'Saturday–Sunday'],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3 py-2">
                <span className="text-stone-500">{k}</span>
                <span className="font-semibold text-end">{v}</span>
              </li>
            ))}
          </ul>
          {lang && (
            <button type="button" onClick={() => onOpenPhrases(lang.code)} className="mt-2 w-full min-h-12 rounded-xl bg-[#0071e3]/10 text-[#0058b0] text-sm font-bold">
              {ar ? `عبارات مفيدة بـ${lang.ar}` : `Useful phrases in ${lang.en}`}
            </button>
          )}
          <p className="mt-2 text-[11px] text-stone-500">{ar ? 'معلومات مرجعية مكتوبة يدوياً وقد تتغير؛ تأكد منها قبل السفر (وكذلك التأشيرات ومتطلبات الدخول من السفارة).' : 'Reference information entered by hand, it can change; confirm before you travel (and check visas and entry rules with the embassy).'}</p>
        </Card>
      )}
    </ToolShell>
  );
};

const speak = (text: string, lang: string) => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* no speech on this device */
  }
};

export const PhrasebookTool: React.FC<{ ar: boolean; onBack: () => void; initial?: string }> = ({ ar, onBack, initial }) => {
  const [code, setCode] = useState(initial || 'zh');
  const lang = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return (
    <ToolShell title={ar ? 'عبارات مفيدة' : 'Useful phrases'} ar={ar} onBack={onBack}>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {LANGUAGES.map((l) => (
          <button key={l.code} onClick={() => setCode(l.code)} className={`min-h-10 px-3.5 rounded-full whitespace-nowrap text-xs font-semibold border ${code === l.code ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-stone-200 text-stone-700'}`}>
            {ar ? l.ar : l.en}
          </button>
        ))}
      </div>
      <Card className="!p-2">
        <ul>
          {PHRASES.map((p, i) => {
            const [text, say] = lang.words[i];
            return (
              <li key={p.en} className="flex items-center gap-2 px-2 py-3 border-b border-stone-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-stone-500">{ar ? p.ar : p.en}</div>
                  <div className="text-xl font-bold text-stone-900 break-words" lang={lang.speech}>{text}</div>
                  <div className="text-xs text-[#0058b0] font-medium break-words">{say}</div>
                </div>
                {canSpeak && (
                  <button type="button" onClick={() => speak(text.replace(/\s*\/\s*/g, ', '), lang.speech)} aria-label={ar ? 'استمع' : 'Listen'} className="w-12 h-12 shrink-0 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] inline-flex items-center justify-center active:bg-[#0071e3]/20">
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-[11px] text-stone-500">{ar ? 'النطق بالحروف اللاتينية تقريبي؛ زر الصوت يقرأ العبارة بصوت الجهاز (يحتاج أن تكون اللغة مثبتة على الجهاز).' : 'The Latin spelling of the sound is approximate; the speaker button reads the phrase with the device’s own voice (the language must be installed on the device).'}</p>
    </ToolShell>
  );
};

// ---------------------------------------------------------------- trip checklist
const CHECK_KEY = 'alkammah_mate_checklist';
const DEFAULTS: { en: string; ar: string }[] = [
  { en: 'Passport valid for 6+ months', ar: 'جواز سفر ساري 6 أشهر على الأقل' },
  { en: 'Visa / entry permission', ar: 'التأشيرة / تصريح الدخول' },
  { en: 'Flight and hotel confirmations', ar: 'تأكيدات الطيران والفندق' },
  { en: 'Meeting schedule and contacts', ar: 'جدول الاجتماعات وأرقام التواصل' },
  { en: 'Documents and presentations (offline copy)', ar: 'المستندات والعروض (نسخة بدون إنترنت)' },
  { en: 'Phone, laptop, iPad and chargers', ar: 'الهاتف واللابتوب والآيباد والشواحن' },
  { en: 'Power adapter for the destination', ar: 'محوّل كهرباء للوجهة' },
  { en: 'Roaming / local SIM or eSIM', ar: 'تجوال أو شريحة محلية / eSIM' },
  { en: 'Cash in local currency and cards', ar: 'نقد بالعملة المحلية وبطاقات' },
  { en: 'Medicines and prescriptions', ar: 'الأدوية والوصفات' },
  { en: 'Travel insurance', ar: 'تأمين السفر' },
  { en: 'Business cards and gifts', ar: 'بطاقات العمل والهدايا' },
  { en: 'Clothes for the weather and dress code', ar: 'ملابس مناسبة للطقس وللبروتوكول' },
  { en: 'Driver / pick-up arranged', ar: 'ترتيب السائق / الاستقبال' },
];
interface Item {
  id: string;
  text: string;
  done: boolean;
}
export const ChecklistTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const fresh = (): Item[] => DEFAULTS.map((d, i) => ({ id: `d${i}`, text: ar ? d.ar : d.en, done: false }));
  const [items, setItems] = useState<Item[]>(() => {
    try {
      const raw = localStorage.getItem(CHECK_KEY);
      if (raw) return JSON.parse(raw) as Item[];
    } catch {
      /* ignore */
    }
    return fresh();
  });
  const [text, setText] = useState('');
  const commit = (next: Item[]) => {
    setItems(next);
    try {
      localStorage.setItem(CHECK_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const left = items.filter((i) => !i.done).length;
  const progress = useMemo(() => (items.length ? ((items.length - left) / items.length) * 100 : 0), [items.length, left]);
  return (
    <ToolShell title={ar ? 'قائمة السفر' : 'Trip checklist'} ar={ar} onBack={onBack}>
      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">{ar ? `${items.length - left} من ${items.length}` : `${items.length - left} of ${items.length} ready`}</span>
          <button type="button" onClick={() => commit(items.map((i) => ({ ...i, done: false })))} className="min-h-9 px-2 text-xs font-semibold text-[#0071e3] inline-flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" />
            {ar ? 'رحلة جديدة (إلغاء التحديد)' : 'New trip (untick all)'}
          </button>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>
        <ul className="mt-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-1 border-b border-stone-100 last:border-0">
              <button type="button" role="checkbox" aria-checked={i.done} onClick={() => commit(items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} className="flex-1 min-w-0 min-h-12 flex items-center gap-3 text-start">
                <span className={`w-6 h-6 rounded-md border-2 shrink-0 inline-flex items-center justify-center text-white text-sm ${i.done ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 bg-white'}`}>{i.done ? '✓' : ''}</span>
                <span className={`text-sm ${i.done ? 'line-through text-stone-400' : 'text-stone-900'}`}>{i.text}</span>
              </button>
              <button type="button" onClick={() => commit(items.filter((x) => x.id !== i.id))} aria-label={ar ? 'حذف' : 'Delete'} className="w-10 h-10 shrink-0 inline-flex items-center justify-center text-stone-400 rounded-lg active:bg-stone-100">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            commit([...items, { id: `c${Date.now()}`, text: text.trim(), done: false }]);
            setText('');
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ar ? 'أضف بنداً' : 'Add an item'} className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-stone-300 text-base sm:text-sm" />
          <button type="submit" disabled={!text.trim()} className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40 inline-flex items-center gap-1">
            <Plus className="w-4 h-4" />
            {ar ? 'إضافة' : 'Add'}
          </button>
        </form>
      </Card>
      <p className="text-[11px] text-stone-500">{ar ? 'القائمة محفوظة على هذا الجهاز.' : 'The list is saved on this device.'}</p>
    </ToolShell>
  );
};
