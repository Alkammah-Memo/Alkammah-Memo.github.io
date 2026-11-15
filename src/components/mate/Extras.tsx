import React, { useEffect, useMemo, useState } from 'react';
import { Bell, MapPin, Plus, Search, Trash2, X } from 'lucide-react';
import { CURRENCIES, Place, findPlaces, fmt, getRates, getWeather, convert } from '../../lib/market';
import { WEATHER_CODES } from '../../lib/travelData';
import { METRICS, Metric, addAlert, clearHits, evaluateAlerts, removeAlert, setAlertActive, toggleWatch, toggleCity, useWatchState, metricValue } from '../../lib/marketWatch';
import { Card, ToolShell, ErrorBox, useLoad } from './parts';
import { upcomingHolidays } from '../../lib/holidays';

// ---------------------------------------------------------------- weather cities of the watchlist
const CityRow: React.FC<{ ar: boolean; city: { name: string; lat: number; lon: number } }> = ({ ar, city }) => {
  const wx = useLoad((f) => getWeather(city.lat, city.lon, f), [city.lat, city.lon]);
  const w = wx.data?.data;
  const c = w ? WEATHER_CODES[w.now.code] : undefined;
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="text-2xl w-8 text-center" aria-hidden>{c?.icon || '🌡️'}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold truncate">{city.name}</span>
        <span className="block text-xs text-stone-500 truncate">{c ? (ar ? c.ar : c.en) : wx.error ? '—' : '…'}</span>
      </span>
      {w && <span className="font-mono font-bold tabular-nums">{Math.round(w.now.temp)}°C</span>}
      <button type="button" onClick={() => toggleCity(city)} aria-label={ar ? 'إزالة' : 'Remove'} className="w-10 h-10 inline-flex items-center justify-center text-stone-400 rounded-lg active:bg-stone-100">
        <X className="w-4 h-4" />
      </button>
    </li>
  );
};

const WeatherWatch: React.FC<{ ar: boolean }> = ({ ar }) => {
  const st = useWatchState();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setFound(null);
      try {
        setFound(await findPlaces(q.trim(), ar));
      } catch {
        setFound([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q, ar]);
  return (
    <Card>
      <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{ar ? 'قائمة الطقس' : 'Weather cities'}</div>
      <p className="mt-1 text-xs text-stone-500">{ar ? 'تظهر في بطاقة «السوق الآن» وتتبدّل تلقائياً.' : 'Shown in the “Markets now” card, which rotates through them.'}</p>
      <ul className="mt-1 divide-y divide-stone-100">
        {st.cities.length === 0 && <li className="py-2 text-sm text-stone-500">{ar ? 'لا مدن. ابحث لإضافة مدينة.' : 'No cities yet. Search to add one.'}</li>}
        {st.cities.map((c) => (
          <CityRow key={`${c.lat}${c.lon}`} ar={ar} city={c} />
        ))}
      </ul>
      <div className="relative mt-2">
        <Search className="w-4 h-4 text-stone-400 absolute start-3 top-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={ar ? 'ابحث عن مدينة لإضافتها' : 'Search a city to add'} className="w-full h-12 ps-9 pe-3 rounded-xl border border-stone-300 text-base sm:text-sm bg-white" />
      </div>
      {found && (
        <ul className="mt-2 rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
          {found.length === 0 && <li className="px-3 py-3 text-sm text-stone-500">{ar ? 'لا نتائج.' : 'No results.'}</li>}
          {found.map((p, i) => (
            <li key={`${p.lat}${p.lon}${i}`}>
              <button type="button" onClick={() => { if (!st.cities.some((c) => Math.abs(c.lat - p.lat) < 0.05 && Math.abs(c.lon - p.lon) < 0.05)) toggleCity(p); setQ(''); setFound(null); }} className="w-full min-h-12 px-3 flex items-center gap-2 text-start active:bg-stone-50">
                <MapPin className="w-4 h-4 text-[#0071e3]" />
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="text-xs text-stone-500">{p.country}</span>
                <Plus className="w-4 h-4 ms-auto text-stone-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------- watchlist + alerts
export const AlertsTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const st = useWatchState();
  const [metric, setMetric] = useState<Metric>('USDEGP');
  const [op, setOp] = useState<'above' | 'below'>('above');
  const [value, setValue] = useState('');
  const [now, setNow] = useState<number | null>(null);
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const rates = useLoad((f) => getRates(f), []);
  useEffect(() => {
    let alive = true;
    void metricValue(metric).then((v) => alive && setNow(v));
    return () => {
      alive = false;
    };
  }, [metric]);
  const meta = METRICS.find((m) => m.id === metric)!;
  const num = parseFloat(value.replace(/,/g, ''));
  return (
    <ToolShell title={ar ? 'المتابعة والتنبيهات' : 'Watchlist & alerts'} ar={ar} onBack={onBack}>
      {st.hits.length > 0 && (
        <Card className="!border-orange-300 !bg-orange-50">
          <div className="flex items-center gap-2 text-sm font-bold text-orange-800">
            <Bell className="w-4 h-4" />
            {ar ? 'تنبيهات تحققت' : 'Alerts that fired'}
            <button type="button" onClick={clearHits} className="ms-auto min-h-9 px-3 text-xs font-semibold rounded-lg bg-white border border-orange-200">
              {ar ? 'مسح' : 'Clear'}
            </button>
          </div>
          <ul className="mt-1 text-sm text-orange-900 space-y-1">
            {st.hits.map((h) => (
              <li key={h.id}>• {h.text}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{ar ? 'تنبيه جديد' : 'New alert'}</div>
        <div className="mt-2 grid grid-cols-1 min-[420px]:grid-cols-[1fr_auto] gap-2">
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="h-11 px-2 rounded-xl border border-stone-300 text-sm bg-white">
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {ar ? m.ar : m.en}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-xl border border-stone-300 overflow-hidden h-11">
            {(['above', 'below'] as const).map((o) => (
              <button key={o} type="button" onClick={() => setOp(o)} className={`px-3 text-sm font-semibold ${op === o ? 'bg-[#0071e3] text-white' : 'bg-white text-stone-700'}`}>
                {o === 'above' ? (ar ? 'يتجاوز' : 'Goes above') : ar ? 'ينزل عن' : 'Falls below'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={now ? `${ar ? 'الآن' : 'Now'}: ${fmt(now, 2)}` : meta.unit} className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-stone-300 text-base tabular-nums" />
          <button
            type="button"
            disabled={!Number.isFinite(num)}
            onClick={() => {
              addAlert({ metric, op, value: num });
              setValue('');
              void evaluateAlerts(ar);
            }}
            className="min-h-11 px-4 rounded-xl bg-[#0071e3] text-white text-sm font-bold disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {ar ? 'إضافة' : 'Add'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          {ar ? 'تُفحص التنبيهات كل 10 دقائق ما دام التطبيق مفتوحاً، ولا تصل والتطبيق مغلق.' : 'Alerts are checked every 10 minutes while the app is open; they do not arrive while the app is closed.'}
        </p>
        {perm === 'default' && (
          <button type="button" onClick={() => void Notification.requestPermission().then(setPerm)} className="mt-2 min-h-10 px-3 rounded-xl border border-stone-300 text-sm font-semibold">
            {ar ? 'السماح بإشعارات الجهاز' : 'Allow device notifications'}
          </button>
        )}
        <ul className="mt-3 divide-y divide-stone-100">
          {st.alerts.length === 0 && <li className="py-2 text-sm text-stone-500">{ar ? 'لا توجد تنبيهات.' : 'No alerts yet.'}</li>}
          {st.alerts.map((a) => {
            const m = METRICS.find((x) => x.id === a.metric)!;
            return (
              <li key={a.id} className="flex items-center gap-2 py-2">
                <button type="button" role="switch" aria-checked={a.active} onClick={() => setAlertActive(a.id, !a.active)} className={`w-12 h-7 rounded-full p-0.5 shrink-0 ${a.active ? 'bg-emerald-500' : 'bg-stone-300'}`}>
                  <span className={`block w-6 h-6 rounded-full bg-white transition-transform ${a.active ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
                </button>
                <span className="flex-1 min-w-0 text-sm">
                  {ar ? m.ar : m.en} <b>{a.op === 'above' ? (ar ? 'يتجاوز' : 'above') : ar ? 'ينزل عن' : 'below'}</b> <span className="font-mono tabular-nums">{a.value}</span>
                </span>
                <button type="button" onClick={() => removeAlert(a.id)} aria-label={ar ? 'حذف' : 'Delete'} className="w-10 h-10 shrink-0 inline-flex items-center justify-center text-stone-400 rounded-lg active:bg-stone-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{ar ? 'قائمة المتابعة' : 'Watchlist'}</div>
        {rates.error && <ErrorBox ar={ar} error={rates.error} onRetry={rates.reload} />}
        <ul className="mt-1 divide-y divide-stone-100">
          {st.watch.length === 0 && <li className="py-2 text-sm text-stone-500">{ar ? 'أضف عملات أو أسهماً من صفحاتها.' : 'Add currencies or stocks from their pages.'}</li>}
          {st.watch.map((w) => {
            const [a, b] = w.id.split('/');
            const v = w.kind === 'pair' && rates.data ? convert(1, a, b, rates.data.data) : null;
            return (
              <li key={w.kind + w.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{w.kind === 'pair' ? w.label : w.id.split(':')[1]}</span>
                  {w.kind === 'stock' && <span className="block text-xs text-stone-500 truncate">{w.label}</span>}
                </span>
                {v !== null && <span className="font-mono font-bold tabular-nums">{fmt(v, v < 1 ? 4 : 2)}</span>}
                <button type="button" onClick={() => toggleWatch(w.kind, w.id, w.label)} aria-label={ar ? 'إزالة' : 'Remove'} className="w-10 h-10 inline-flex items-center justify-center text-stone-400 rounded-lg active:bg-stone-100">
                  <X className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['EUR/EGP', 'GBP/EGP', 'SAR/EGP', 'AED/EGP', 'CNY/EGP'].filter((p) => !st.watch.some((w) => w.id === p)).map((p) => (
            <button key={p} type="button" onClick={() => toggleWatch('pair', p, p)} className="min-h-9 px-3 rounded-full border border-stone-300 text-xs font-semibold">
              + {p}
            </button>
          ))}
        </div>
      </Card>
      <WeatherWatch ar={ar} />
    </ToolShell>
  );
};

// ---------------------------------------------------------------- world clock
const CITIES: { id: string; en: string; ar: string; tz: string }[] = [
  { id: 'cairo', en: 'Cairo', ar: 'القاهرة', tz: 'Africa/Cairo' },
  { id: 'riyadh', en: 'Riyadh', ar: 'الرياض', tz: 'Asia/Riyadh' },
  { id: 'dubai', en: 'Dubai', ar: 'دبي', tz: 'Asia/Dubai' },
  { id: 'doha', en: 'Doha', ar: 'الدوحة', tz: 'Asia/Qatar' },
  { id: 'kuwait', en: 'Kuwait', ar: 'الكويت', tz: 'Asia/Kuwait' },
  { id: 'istanbul', en: 'Istanbul', ar: 'إسطنبول', tz: 'Europe/Istanbul' },
  { id: 'moscow', en: 'Moscow', ar: 'موسكو', tz: 'Europe/Moscow' },
  { id: 'london', en: 'London', ar: 'لندن', tz: 'Europe/London' },
  { id: 'frankfurt', en: 'Frankfurt', ar: 'فرانكفورت', tz: 'Europe/Berlin' },
  { id: 'mumbai', en: 'Mumbai', ar: 'مومباي', tz: 'Asia/Kolkata' },
  { id: 'beijing', en: 'Beijing', ar: 'بكين', tz: 'Asia/Shanghai' },
  { id: 'tokyo', en: 'Tokyo', ar: 'طوكيو', tz: 'Asia/Tokyo' },
  { id: 'newyork', en: 'New York', ar: 'نيويورك', tz: 'America/New_York' },
  { id: 'la', en: 'Los Angeles', ar: 'لوس أنجلوس', tz: 'America/Los_Angeles' },
];
const CITY_KEY = 'alkammah_mate_cities';
export const ClocksTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CITY_KEY) || '') as string[];
    } catch {
      return ['cairo', 'riyadh', 'dubai', 'london', 'beijing', 'newyork'];
    }
  });
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);
  const save = (next: string[]) => {
    setIds(next);
    try {
      localStorage.setItem(CITY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const d = new Date(tick);
  const cairoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
  return (
    <ToolShell title={ar ? 'ساعات العالم' : 'World clock'} ar={ar} onBack={onBack}>
      <Card className="!p-2">
        <ul>
          {ids.map((id) => {
            const c = CITIES.find((x) => x.id === id);
            if (!c) return null;
            const time = new Intl.DateTimeFormat('en-GB', { timeZone: c.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
            const hour = Number(time.slice(0, 2));
            const day = new Intl.DateTimeFormat('en-CA', { timeZone: c.tz }).format(d);
            const open = hour >= 9 && hour < 17;
            return (
              <li key={id} className="flex items-center gap-3 px-2 min-h-14 border-b border-stone-100 last:border-0">
                <span className={`w-2.5 h-2.5 rounded-full ${open ? 'bg-emerald-500' : 'bg-stone-300'}`} title={open ? (ar ? 'ساعات العمل' : 'Office hours') : ar ? 'خارج ساعات العمل' : 'Outside office hours'} />
                <span className="flex-1">
                  <span className="block text-sm font-bold">{ar ? c.ar : c.en}</span>
                  <span className="block text-[11px] text-stone-500">
                    {day === cairoDay ? (ar ? 'نفس اليوم' : 'Same day') : day > cairoDay ? (ar ? 'غداً' : 'Tomorrow') : ar ? 'أمس' : 'Yesterday'}
                    {id !== 'cairo' && ` · ${ar ? 'الفرق' : 'diff'} ${Math.round((new Date(d.toLocaleString('en-US', { timeZone: c.tz })).getTime() - new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).getTime()) / 3600000 * 10) / 10}h`}
                  </span>
                </span>
                <span className="font-mono text-xl font-bold tabular-nums">{time}</span>
                {id !== 'cairo' && (
                  <button type="button" onClick={() => save(ids.filter((x) => x !== id))} aria-label={ar ? 'إزالة' : 'Remove'} className="w-10 h-10 inline-flex items-center justify-center text-stone-400 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="flex flex-wrap gap-1.5">
        {CITIES.filter((c) => !ids.includes(c.id)).map((c) => (
          <button key={c.id} type="button" onClick={() => save([...ids, c.id])} className="min-h-9 px-3 rounded-full border border-stone-300 text-xs font-semibold">
            + {ar ? c.ar : c.en}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-stone-500">{ar ? 'النقطة الخضراء: الساعة بين 9 صباحاً و5 مساءً في تلك المدينة.' : 'Green dot: it is between 9:00 and 17:00 in that city.'}</p>
    </ToolShell>
  );
};

// ---------------------------------------------------------------- holidays
export const HolidaysTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  const list = useMemo(() => upcomingHolidays(today, 14), [today]);
  const days = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return (
    <ToolShell title={ar ? 'الإجازات الرسمية' : 'Public holidays'} ar={ar} onBack={onBack}>
      <Card className="!p-2">
        <ul>
          {list.map((h) => {
            const dt = new Date(`${h.date}T12:00:00Z`);
            const dow = dt.getUTCDay();
            return (
              <li key={h.date + h.en} className="flex items-center gap-3 px-2 min-h-14 border-b border-stone-100 last:border-0">
                <span className="w-12 text-center">
                  <span className="block text-lg font-bold leading-none tabular-nums">{dt.getUTCDate()}</span>
                  <span className="block text-[10px] uppercase text-stone-500">{dt.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { month: 'short', timeZone: 'UTC' })}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{ar ? h.ar : h.en}</span>
                  <span className="block text-[11px] text-stone-500">
                    {dt.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { weekday: 'long', timeZone: 'UTC' })}
                    {(dow === 5 || dow === 6) && ` · ${ar ? 'يوافق عطلة الأسبوع' : 'falls on the weekend'}`}
                    {h.approx && ` · ${ar ? 'تقريبي (رؤية الهلال)' : 'expected (moon sighting)'}`}
                  </span>
                </span>
                <span className="text-xs font-semibold text-[#0071e3] tabular-nums">{days(h.date) === 0 ? (ar ? 'اليوم' : 'Today') : ar ? `بعد ${days(h.date)} يوم` : `in ${days(h.date)} d`}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-[11px] text-stone-500">{ar ? 'المصدر: حساب تقويمي للإجازات الثابتة والتقويمين الهجري والقبطي. تواريخ الأعياد الهجرية متوقعة وقد تختلف يوماً بحسب إعلان دار الإفتاء، وقد يُنقل بعضها رسمياً إلى الخميس.' : 'Source: calculated from the fixed national dates and the Islamic and Coptic calendars. Islamic dates are expected dates and can differ by a day with the official announcement; some are officially moved to a Thursday.'}</p>
    </ToolShell>
  );
};

// ---------------------------------------------------------------- converters
type Unit = { id: string; en: string; ar: string; f: number };
const GROUPS: { id: string; en: string; ar: string; units: Unit[] }[] = [
  {
    id: 'area',
    en: 'Area',
    ar: 'المساحة',
    units: [
      { id: 'm2', en: 'Square metre (m²)', ar: 'متر مربع', f: 1 },
      { id: 'feddan', en: 'Feddan', ar: 'فدان', f: 4200.83 },
      { id: 'qirat', en: 'Qirat (1/24 feddan)', ar: 'قيراط', f: 4200.83 / 24 },
      { id: 'sahm', en: 'Sahm (1/24 qirat)', ar: 'سهم', f: 4200.83 / 576 },
      { id: 'ha', en: 'Hectare', ar: 'هكتار', f: 10000 },
      { id: 'acre', en: 'Acre', ar: 'إيكر', f: 4046.8564 },
      { id: 'km2', en: 'Square kilometre', ar: 'كيلومتر مربع', f: 1_000_000 },
      { id: 'ft2', en: 'Square foot', ar: 'قدم مربع', f: 0.09290304 },
    ],
  },
  {
    id: 'length',
    en: 'Length',
    ar: 'الطول',
    units: [
      { id: 'm', en: 'Metre', ar: 'متر', f: 1 },
      { id: 'km', en: 'Kilometre', ar: 'كيلومتر', f: 1000 },
      { id: 'mi', en: 'Mile', ar: 'ميل', f: 1609.344 },
      { id: 'nm', en: 'Nautical mile', ar: 'ميل بحري', f: 1852 },
      { id: 'ft', en: 'Foot', ar: 'قدم', f: 0.3048 },
    ],
  },
  {
    id: 'weight',
    en: 'Weight',
    ar: 'الوزن',
    units: [
      { id: 'kg', en: 'Kilogram', ar: 'كيلوجرام', f: 1 },
      { id: 't', en: 'Tonne', ar: 'طن', f: 1000 },
      { id: 'lb', en: 'Pound (lb)', ar: 'رطل (باوند)', f: 0.45359237 },
      { id: 'st', en: 'Short ton (US)', ar: 'طن أمريكي', f: 907.18474 },
      { id: 'oz', en: 'Ounce', ar: 'أونصة', f: 0.028349523 },
    ],
  },
  {
    id: 'volume',
    en: 'Volume / oil',
    ar: 'الحجم والنفط',
    units: [
      { id: 'm3', en: 'Cubic metre', ar: 'متر مكعب', f: 1 },
      { id: 'l', en: 'Litre', ar: 'لتر', f: 0.001 },
      { id: 'bbl', en: 'Barrel (oil)', ar: 'برميل', f: 0.158987294928 },
      { id: 'gal', en: 'US gallon', ar: 'جالون أمريكي', f: 0.003785411784 },
    ],
  },
];
export const ConverterTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [g, setG] = useState('area');
  const group = GROUPS.find((x) => x.id === g)!;
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('feddan');
  const n = parseFloat(amount.replace(/,/g, ''));
  const base = Number.isFinite(n) ? n * (group.units.find((u) => u.id === from)?.f || 1) : NaN;
  return (
    <ToolShell title={ar ? 'محوّل الوحدات' : 'Unit converter'} ar={ar} onBack={onBack}>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {GROUPS.map((x) => (
          <button key={x.id} onClick={() => { setG(x.id); setFrom(x.units[x.id === 'area' ? 1 : 0].id); }} className={`min-h-10 px-4 rounded-full whitespace-nowrap text-sm font-semibold border ${g === x.id ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-stone-200 text-stone-700'}`}>
            {ar ? x.ar : x.en}
          </button>
        ))}
      </div>
      <Card>
        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 px-3 rounded-xl border border-stone-300 text-xl font-bold tabular-nums min-w-0" aria-label={ar ? 'الكمية' : 'Amount'} />
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 px-2 rounded-xl border border-stone-300 text-sm bg-white min-w-0">
            {group.units.map((u) => (
              <option key={u.id} value={u.id}>
                {ar ? u.ar : u.en}
              </option>
            ))}
          </select>
        </div>
        <ul className="mt-3 divide-y divide-stone-100">
          {group.units.filter((u) => u.id !== from).map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-stone-700">{ar ? u.ar : u.en}</span>
              <span className="font-mono font-bold tabular-nums">{Number.isFinite(base) ? (base / u.f).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}</span>
            </li>
          ))}
        </ul>
      </Card>
      {g === 'area' && <p className="text-[11px] text-stone-500">{ar ? 'الفدان = 24 قيراطاً = 4200.83 م²، والقيراط = 24 سهماً.' : '1 feddan = 24 qirat = 4,200.83 m²; 1 qirat = 24 sahm.'}</p>}
    </ToolShell>
  );
};
