import { supabase } from './cloud';

/**
 * Data for the CEO's Mate page. Every figure carries its source and the time it refers to, so nothing is shown without saying where it came from.
 * Direct from the provider (they allow browsers): ExchangeRate-API (rates), gold-api.com (gold spot), TradingView scanner (stock lists, delayed 15 min).
 * Through the `market-feed` server function (they do not allow browsers): Yahoo Finance history, Google News headlines, World Bank statistics.
 * Every answer is kept on the device for a few minutes; when a provider is down the last answer is shown, marked as old.
 */

export interface Stamped<T> {
  data: T;
  source: string;
  /** the time the figure refers to (ms) */
  asOf: number;
  /** true when the provider could not be reached and the last saved answer is shown */
  stale?: boolean;
}
export type Series = [number, number][];
export type Range = '1mo' | '3mo' | '1y' | '5y';
export const RANGES: { id: Range; en: string; ar: string }[] = [
  { id: '1mo', en: '1M', ar: 'شهر' },
  { id: '3mo', en: '3M', ar: '3 أشهر' },
  { id: '1y', en: '1Y', ar: 'سنة' },
  { id: '5y', en: '5Y', ar: '5 سنوات' },
];

const KEY = 'alkammah_mate_';
interface Saved<T> {
  at: number;
  value: T;
}
function readSaved<T>(key: string): Saved<T> | null {
  try {
    const raw = localStorage.getItem(KEY + key);
    return raw ? (JSON.parse(raw) as Saved<T>) : null;
  } catch {
    return null;
  }
}
function writeSaved<T>(key: string, value: T) {
  try {
    localStorage.setItem(KEY + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* storage full or blocked: the page still works, just without the offline copy */
  }
}

/** the fresh saved answer if young enough, else a new one; on failure the old one (marked stale) */
async function cached<D>(key: string, ttlMs: number, load: () => Promise<Stamped<D>>, force = false): Promise<Stamped<D>> {
  const saved = readSaved<Stamped<D>>(key);
  if (!force && saved && Date.now() - saved.at < ttlMs) return saved.value;
  try {
    const fresh = await load();
    writeSaved(key, fresh);
    return fresh;
  } catch (e) {
    if (saved) return { ...saved.value, stale: true };
    throw e;
  }
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function viaServer<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('NO_SERVER');
  const { data, error } = await supabase.functions.invoke('market-feed', { body });
  if (error) throw new Error(error.message || 'SERVER_FAILED');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ---------------------------------------------------------------- currencies
export const CURRENCIES: { code: string; en: string; ar: string }[] = [
  { code: 'EGP', en: 'Egyptian pound', ar: 'الجنيه المصري' },
  { code: 'USD', en: 'US dollar', ar: 'الدولار الأمريكي' },
  { code: 'EUR', en: 'Euro', ar: 'اليورو' },
  { code: 'GBP', en: 'British pound', ar: 'الجنيه الإسترليني' },
  { code: 'SAR', en: 'Saudi riyal', ar: 'الريال السعودي' },
  { code: 'AED', en: 'UAE dirham', ar: 'الدرهم الإماراتي' },
  { code: 'KWD', en: 'Kuwaiti dinar', ar: 'الدينار الكويتي' },
  { code: 'QAR', en: 'Qatari riyal', ar: 'الريال القطري' },
  { code: 'CNY', en: 'Chinese yuan', ar: 'اليوان الصيني' },
  { code: 'JPY', en: 'Japanese yen', ar: 'الين الياباني' },
  { code: 'CHF', en: 'Swiss franc', ar: 'الفرنك السويسري' },
  { code: 'TRY', en: 'Turkish lira', ar: 'الليرة التركية' },
  { code: 'INR', en: 'Indian rupee', ar: 'الروبية الهندية' },
  { code: 'RUB', en: 'Russian ruble', ar: 'الروبل الروسي' },
  { code: 'CAD', en: 'Canadian dollar', ar: 'الدولار الكندي' },
  { code: 'AUD', en: 'Australian dollar', ar: 'الدولار الأسترالي' },
];

export type Rates = Record<string, number>;

/** units of every currency per 1 US dollar */
export const getRates = (force = false): Promise<Stamped<Rates>> =>
  cached(
    'rates',
    30 * 60_000,
    async () => {
      const d = (await getJson('https://open.er-api.com/v6/latest/USD')) as { result: string; rates: Rates; time_last_update_unix: number };
      if (d.result !== 'success' || !d.rates?.EGP) throw new Error('RATES_FAILED');
      return { data: d.rates, source: 'ExchangeRate-API (open.er-api.com), daily market rates', asOf: d.time_last_update_unix * 1000 };
    },
    force
  );

export const convert = (amount: number, from: string, to: string, rates: Rates): number => (rates[from] && rates[to] ? (amount / rates[from]) * rates[to] : NaN);

interface Chart {
  symbol: string;
  name: string;
  currency: string;
  price: number | null;
  asOf: number;
  points: Series;
  source: string;
}
const chartCache = (symbol: string, range: Range, ttl = 10 * 60_000, force = false): Promise<Stamped<Chart>> =>
  cached(
    `chart_${symbol}_${range}`,
    ttl,
    async () => {
      const c = await viaServer<Chart>({ kind: 'chart', symbol, range, interval: range === '5y' ? '1wk' : '1d' });
      return { data: c, source: `${c.source} (market data)`, asOf: c.asOf || c.points[c.points.length - 1]?.[0] || Date.now() };
    },
    force
  );

export const getPairHistory = (from: string, to: string, range: Range, force = false): Promise<Stamped<Series>> =>
  chartCache(from === 'USD' ? `${to}=X` : `${from}${to}=X`, range, 10 * 60_000, force).then((r) => ({ ...r, data: r.data.points }));

// ---------------------------------------------------------------- gold (Egypt)
export const OUNCE_GRAMS = 31.1035;
export interface GoldNow {
  usdPerOunce: number;
  usdEgp: number;
  gram24: number;
  gram21: number;
  gram18: number;
  /** gold pound = 8 g of 21 carat */
  pound: number;
  ounceEgp: number;
}
export const goldFromSpot = (usdPerOunce: number, usdEgp: number): GoldNow => {
  const g24 = (usdPerOunce * usdEgp) / OUNCE_GRAMS;
  return { usdPerOunce, usdEgp, gram24: g24, gram21: g24 * 0.875, gram18: g24 * 0.75, pound: g24 * 0.875 * 8, ounceEgp: usdPerOunce * usdEgp };
};

export const getGold = (force = false): Promise<Stamped<GoldNow>> =>
  cached(
    'gold',
    5 * 60_000,
    async () => {
      const [spot, rates] = await Promise.all([getJson('https://api.gold-api.com/price/XAU') as Promise<{ price: number; updatedAt: string }>, getRates(force)]);
      if (!spot?.price) throw new Error('GOLD_FAILED');
      return {
        data: goldFromSpot(spot.price, rates.data.EGP),
        source: 'World gold price (gold-api.com) x USD/EGP (ExchangeRate-API), calculated per gram',
        asOf: Math.min(Date.parse(spot.updatedAt) || Date.now(), Date.now()),
      };
    },
    force
  );

/** price of 1 gram of 24 carat in EGP per day: world gold futures x the dollar rate of the same day */
export async function getGoldHistory(range: Range, force = false): Promise<Stamped<Series>> {
  const [gold, fx] = await Promise.all([chartCache('GC=F', range, 15 * 60_000, force), chartCache('EGP=X', range, 15 * 60_000, force)]);
  const day = (t: number) => Math.floor(t / 86_400_000);
  const fxByDay = new Map(fx.data.points.map(([t, v]) => [day(t), v]));
  let last = fx.data.points[0]?.[1] ?? 0;
  const out: Series = [];
  for (const [t, usd] of gold.data.points) {
    last = fxByDay.get(day(t)) ?? last;
    if (last) out.push([t, Math.round(((usd * last) / OUNCE_GRAMS) * 100) / 100]);
  }
  return { data: out, source: 'World gold futures (Yahoo Finance) x USD/EGP of the same day, 24 carat per gram', asOf: gold.asOf, stale: gold.stale || fx.stale };
}

// ---------------------------------------------------------------- stocks
export type Market = 'egypt' | 'global';
export interface Stock {
  symbol: string;
  exchange: string;
  name: string;
  price: number;
  changePct: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
  pe?: number;
  eps?: number;
  dividendYield?: number;
  high52?: number;
  low52?: number;
  perf1m?: number;
  perfYtd?: number;
  currency: string;
}
const COLUMNS = ['name', 'description', 'close', 'change', 'open', 'high', 'low', 'volume', 'market_cap_basic', 'sector', 'industry', 'price_earnings_ttm', 'earnings_per_share_basic_ttm', 'dividends_yield_recent', 'price_52_week_high', 'price_52_week_low', 'Perf.1M', 'Perf.YTD', 'currency', 'exchange'];
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function scan(market: 'egypt' | 'america', range: [number, number], filter: unknown[] = []): Promise<Stock[]> {
  const body = {
    filter,
    options: { lang: 'en' },
    markets: [market],
    symbols: { query: { types: ['stock'] }, tickers: [] },
    columns: COLUMNS,
    sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
    range,
  };
  const d = (await getJson(`https://scanner.tradingview.com/${market}/scan`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })) as { data: { s: string; d: unknown[] }[] };
  return (d.data || []).map((r) => {
    const v = r.d;
    return {
      symbol: String(v[0]),
      name: String(v[1] || v[0]),
      price: num(v[2]) ?? 0,
      changePct: num(v[3]) ?? 0,
      open: num(v[4]),
      high: num(v[5]),
      low: num(v[6]),
      volume: num(v[7]),
      marketCap: num(v[8]),
      sector: v[9] ? String(v[9]) : undefined,
      industry: v[10] ? String(v[10]) : undefined,
      pe: num(v[11]),
      eps: num(v[12]),
      dividendYield: num(v[13]),
      high52: num(v[14]),
      low52: num(v[15]),
      perf1m: num(v[16]),
      perfYtd: num(v[17]),
      currency: String(v[18] || ''),
      exchange: String(v[19] || r.s.split(':')[0]),
    };
  });
}

export const STOCK_SOURCE = 'TradingView market scanner (Egyptian Exchange / US markets), delayed about 15 minutes';

/** the 20 biggest listed companies by market value */
export const getTopStocks = (market: Market, force = false): Promise<Stamped<Stock[]>> =>
  cached(
    `top_${market}`,
    10 * 60_000,
    async () => ({ data: await scan(market === 'egypt' ? 'egypt' : 'america', [0, 20]), source: STOCK_SOURCE, asOf: Date.now() }),
    force
  );

/** every Egyptian listed stock (about 250), kept for local search by name or code */
const getAllEgypt = (): Promise<Stamped<Stock[]>> => cached('all_egypt', 30 * 60_000, async () => ({ data: await scan('egypt', [0, 300]), source: STOCK_SOURCE, asOf: Date.now() }));

export async function searchStocks(market: Market, q: string): Promise<Stock[]> {
  const needle = q.trim();
  if (!needle) return [];
  if (market === 'egypt') {
    const all = (await getAllEgypt()).data;
    const n = needle.toLowerCase();
    return all.filter((s) => s.symbol.toLowerCase().includes(n) || s.name.toLowerCase().includes(n)).slice(0, 25);
  }
  const [byName, byTicker] = await Promise.all([
    scan('america', [0, 15], [{ left: 'description', operation: 'match', right: needle }]),
    needle.length <= 6 ? scan('america', [0, 5], [{ left: 'name', operation: 'match', right: needle.toUpperCase() }]) : Promise.resolve([] as Stock[]),
  ]);
  const seen = new Set<string>();
  return [...byTicker, ...byName].filter((s) => (seen.has(s.symbol) ? false : (seen.add(s.symbol), true)));
}

export interface IndexQuote {
  price: number;
  changePct: number;
  /** performance over past periods, in % */
  perf: { id: '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y'; value: number }[];
}
/** the EGX30 index now and how it did over the past week, month, quarter, half year, this year and last year (no free daily history exists for it) */
export const getEgx30 = (force = false): Promise<Stamped<IndexQuote>> =>
  cached(
    'egx30',
    10 * 60_000,
    async () => {
      const body = { symbols: { tickers: ['EGX:EGX30'] }, columns: ['close', 'change', 'Perf.W', 'Perf.1M', 'Perf.3M', 'Perf.6M', 'Perf.YTD', 'Perf.Y'] };
      const d = (await getJson('https://scanner.tradingview.com/egypt/scan', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })) as { data: { d: unknown[] }[] };
      const v = d.data?.[0]?.d;
      if (!v || typeof v[0] !== 'number') throw new Error('EGX30_FAILED');
      const ids = ['1W', '1M', '3M', '6M', 'YTD', '1Y'] as const;
      return {
        data: { price: v[0] as number, changePct: num(v[1]) ?? 0, perf: ids.map((id, i) => ({ id, value: num(v[2 + i]) })).filter((p): p is { id: (typeof ids)[number]; value: number } => p.value !== undefined) },
        source: 'TradingView market scanner (EGX30 index), delayed about 15 minutes',
        asOf: Date.now(),
      };
    },
    force
  );
export const getStockHistory = (symbol: string, range: Range): Promise<Stamped<Chart>> => chartCache(symbol, range);

// ---------------------------------------------------------------- commodities and economy
export const COMMODITIES: { symbol: string; en: string; ar: string; unit: string }[] = [
  { symbol: 'BZ=F', en: 'Brent crude oil', ar: 'خام برنت', unit: 'USD / barrel' },
  { symbol: 'CL=F', en: 'WTI crude oil', ar: 'خام غرب تكساس', unit: 'USD / barrel' },
  { symbol: 'HG=F', en: 'Copper', ar: 'النحاس', unit: 'USD / lb' },
  { symbol: 'ALI=F', en: 'Aluminium', ar: 'الألومنيوم', unit: 'USD / tonne' },
  { symbol: 'HRC=F', en: 'Steel (hot-rolled coil, US)', ar: 'الصلب (لفائف ساخنة، أمريكا)', unit: 'USD / short ton' },
  { symbol: 'NG=F', en: 'Natural gas', ar: 'الغاز الطبيعي', unit: 'USD / MMBtu' },
];
export const getCommodity = (symbol: string, range: Range = '1mo', force = false) => chartCache(symbol, range, 15 * 60_000, force);

export const INDICATORS: { id: string; en: string; ar: string; unit: string }[] = [
  { id: 'FP.CPI.TOTL.ZG', en: 'Inflation (consumer prices)', ar: 'التضخم (أسعار المستهلك)', unit: '%' },
  { id: 'NY.GDP.MKTP.KD.ZG', en: 'GDP growth', ar: 'نمو الناتج المحلي', unit: '%' },
  { id: 'SL.UEM.TOTL.ZS', en: 'Unemployment', ar: 'البطالة', unit: '%' },
  { id: 'FR.INR.LNDP', en: 'Lending rate minus deposit rate', ar: 'هامش الإقراض عن الإيداع', unit: 'pts' },
  { id: 'GC.DOD.TOTL.GD.ZS', en: 'Government debt (% of GDP)', ar: 'الدين الحكومي (% من الناتج)', unit: '%' },
];
export interface Indicator {
  indicator: string;
  name: string;
  rows: { year: number; value: number }[];
}
export const getIndicator = (id: string): Promise<Stamped<Indicator>> =>
  cached(`wb_${id}`, 12 * 3600_000, async () => {
    const d = await viaServer<Indicator & { source: string }>({ kind: 'worldbank', indicator: id });
    return { data: d, source: d.source, asOf: Date.now() };
  });

// ---------------------------------------------------------------- news
export interface Headline {
  title: string;
  source: string;
  link: string;
  at: number;
}
export type NewsTopic = 'industry' | 'land' | 'economy' | 'global' | 'shipping' | 'tenders';
export const NEWS_TOPICS: { id: NewsTopic; en: string; ar: string; q: { en: string; ar: string } }[] = [
  {
    id: 'industry',
    en: 'Egypt industry',
    ar: 'الصناعة في مصر',
    q: {
      en: '(Egypt OR Egyptian) (industrial OR industry OR factory OR factories OR manufacturing OR "industrial zone" OR SCZone OR "Suez Canal Economic Zone")',
      ar: 'مصر (الصناعة OR مصنع OR مصانع OR "المنطقة الاقتصادية لقناة السويس" OR "المناطق الصناعية")',
    },
  },
  {
    id: 'land',
    en: 'Land & investment',
    ar: 'الأراضي والاستثمار',
    q: {
      en: 'Egypt ("land allocation" OR "land acquisition" OR "land deal" OR "industrial land" OR "new capital" OR "Ras El Hekma" OR "investment authority" OR GAFI)',
      ar: 'مصر ("تخصيص أراضي" OR "أراضي صناعية" OR "الهيئة العامة للاستثمار" OR "رأس الحكمة" OR "العاصمة الإدارية")',
    },
  },
  {
    id: 'economy',
    en: 'Egypt economy',
    ar: 'الاقتصاد المصري',
    q: { en: 'Egypt economy (pound OR "central bank" OR inflation OR "interest rate" OR exports OR IMF)', ar: 'الاقتصاد المصري (الجنيه OR "البنك المركزي" OR التضخم OR "سعر الفائدة" OR الصادرات)' },
  },
  {
    id: 'global',
    en: 'Global manufacturing',
    ar: 'التصنيع عالمياً',
    q: { en: '(global manufacturing OR factories OR "supply chain" OR "industrial output" OR PMI OR "steel" OR "electric vehicles factory")', ar: '(التصنيع عالمياً OR "سلاسل الإمداد" OR "مؤشر مديري المشتريات" OR "مصانع السيارات الكهربائية")' },
  },
  {
    id: 'shipping',
    en: 'Shipping & Suez',
    ar: 'الشحن وقناة السويس',
    q: { en: '("Suez Canal" OR "container freight" OR "Red Sea shipping" OR "Egypt ports" OR Damietta OR "Sokhna port")', ar: '("قناة السويس" OR "الشحن البحري" OR "موانئ مصر" OR "ميناء دمياط" OR "ميناء السخنة")' },
  },
  {
    id: 'tenders',
    en: 'Tenders & announcements',
    ar: 'مناقصات وإعلانات',
    q: { en: 'Egypt (tender OR tenders OR "request for proposals" OR "investment opportunities" OR "bid") (industrial OR infrastructure OR port OR "special economic zone")', ar: 'مصر (مناقصة OR مناقصات OR "طرح" OR "فرص استثمارية") (صناعي OR "البنية التحتية" OR ميناء OR "المنطقة الاقتصادية")' },
  },
];
export const getNews = (topic: NewsTopic, ar: boolean, force = false): Promise<Stamped<Headline[]>> =>
  cached(
    `news_${topic}_${ar ? 'ar' : 'en'}`,
    10 * 60_000,
    async () => {
      const t = NEWS_TOPICS.find((x) => x.id === topic)!;
      const d = await viaServer<{ items: Headline[] }>({ kind: 'news', q: t.q[ar ? 'ar' : 'en'], lang: ar ? 'ar' : 'en' });
      const items = d.items.filter((h) => h.title).sort((a, b) => b.at - a.at);
      return { data: items, source: 'Google News (headlines from the publishers named on each line)', asOf: Date.now() };
    },
    force
  );

// ---------------------------------------------------------------- small helpers used by the screens
export const changePct = (points: Series): number | null => {
  if (points.length < 2) return null;
  const first = points[0][1];
  return first ? ((points[points.length - 1][1] - first) / first) * 100 : null;
};
export const fmt = (n: number | undefined | null, digits = 2): string => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—');
export const fmtBig = (n: number | undefined): string => {
  if (typeof n !== 'number') return '—';
  const a = Math.abs(n);
  return a >= 1e12 ? `${(n / 1e12).toFixed(2)} T` : a >= 1e9 ? `${(n / 1e9).toFixed(2)} B` : a >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n.toLocaleString('en-US');
};
export const timeAgo = (ms: number, ar: boolean): string => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (m < 1) return ar ? 'الآن' : 'just now';
  if (m < 60) return ar ? `منذ ${m} د` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return ar ? `منذ ${h} س` : `${h} h ago`;
  const d = Math.round(h / 24);
  return ar ? `منذ ${d} يوم` : `${d} d ago`;
};

// ---------------------------------------------------------------- travel: weather, places, prayer times
export interface Place {
  name: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
}
export async function findPlaces(q: string, ar: boolean): Promise<Place[]> {
  const d = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${ar ? 'ar' : 'en'}`)) as { results?: { name: string; country?: string; latitude: number; longitude: number; timezone: string }[] };
  return (d.results || []).map((r) => ({ name: r.name, country: r.country || '', lat: r.latitude, lon: r.longitude, tz: r.timezone }));
}

export interface Weather {
  now: { temp: number; feels: number; code: number; wind: number; humidity: number };
  days: { date: string; code: number; max: number; min: number; rain: number; sunrise: string; sunset: string }[];
  tz: string;
}
export const getWeather = (lat: number, lon: number, force = false): Promise<Stamped<Weather>> =>
  cached(
    `wx_${lat.toFixed(2)}_${lon.toFixed(2)}`,
    30 * 60_000,
    async () => {
      const d = (await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7`
      )) as {
        timezone: string;
        current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number; time: string };
        daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; sunrise: string[]; sunset: string[] };
      };
      return {
        data: {
          tz: d.timezone,
          now: { temp: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code, wind: d.current.wind_speed_10m, humidity: d.current.relative_humidity_2m },
          days: d.daily.time.map((t, i) => ({ date: t, code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i], rain: d.daily.precipitation_probability_max[i] ?? 0, sunrise: d.daily.sunrise[i], sunset: d.daily.sunset[i] })),
        },
        source: 'Open-Meteo weather forecast (national weather models)',
        asOf: Date.now(),
      };
    },
    force
  );

export type Prayers = Record<'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha', string>;
export const getPrayerTimes = (lat: number, lon: number, dateDmy: string, force = false): Promise<Stamped<Prayers>> =>
  cached(
    `pray_${lat.toFixed(2)}_${lon.toFixed(2)}_${dateDmy}`,
    6 * 3600_000,
    async () => {
      const d = (await getJson(`https://api.aladhan.com/v1/timings/${dateDmy}?latitude=${lat}&longitude=${lon}&method=5`)) as { data: { timings: Record<string, string> } };
      const t = d.data.timings;
      const clean = (s: string) => s.slice(0, 5);
      return { data: { Fajr: clean(t.Fajr), Sunrise: clean(t.Sunrise), Dhuhr: clean(t.Dhuhr), Asr: clean(t.Asr), Maghrib: clean(t.Maghrib), Isha: clean(t.Isha) }, source: 'Aladhan prayer times (Egyptian General Authority of Survey method)', asOf: Date.now() };
    },
    force
  );
