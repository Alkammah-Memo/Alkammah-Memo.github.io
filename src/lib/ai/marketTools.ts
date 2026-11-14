import { COMMODITIES, INDICATORS, NEWS_TOPICS, NewsTopic, changePct, convert, fmt, findPlaces, getCommodity, getEgx30, getGold, getIndicator, getNews, getPrayerTimes, getRates, getWeather, searchStocks } from '../market';
import type { Market, Place } from '../market';
import { COUNTRIES, LANGUAGES, PHRASES, WEATHER_CODES, hoursFromCairo, qiblaBearing } from '../travelData';
import { upcomingHolidays } from '../holidays';
import { METRICS, Metric, addAlert, getWatchState, removeAlert } from '../marketWatch';
import { getCairoDateString } from '../cairoTime';

/**
 * Spero's tools for the CEO's Mate page: the same live data the screens show (with the source of each figure),
 * so she can answer "what is the dollar today", "weather in Beijing", "how do I say thank you in Turkish" and so on.
 * Returns undefined when the name is not one of these tools.
 */
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const fail = (error: string) => ({ ok: false, error });
const iso = (ms: number) => new Date(ms).toISOString();

export async function runMarketTool(name: string, args: Record<string, unknown>, ar: boolean): Promise<Record<string, unknown> | undefined> {
  if (name === 'getMarketSnapshot') {
    const [rates, gold, egx, news] = await Promise.all([
      getRates().catch(() => null),
      getGold().catch(() => null),
      getEgx30().catch(() => null),
      args.topic ? getNews(String(args.topic) as NewsTopic, ar).catch(() => null) : Promise.resolve(null),
    ]);
    if (!rates && !gold && !egx && !news) return fail('Market data could not be reached right now.');
    return {
      ok: true,
      usdEgp: rates ? { value: round(rates.data.EGP), source: rates.source, asOf: iso(rates.asOf) } : 'unavailable',
      goldEgyptPerGram: gold ? { gram24: Math.round(gold.data.gram24), gram21: Math.round(gold.data.gram21), gram18: Math.round(gold.data.gram18), goldPound8g21k: Math.round(gold.data.pound), worldOunceUsd: round(gold.data.usdPerOunce), source: gold.source } : 'unavailable',
      egx30: egx ? { value: Math.round(egx.data.price), dayChangePct: round(egx.data.changePct), performancePct: Object.fromEntries(egx.data.perf.map((p) => [p.id, round(p.value)])), source: egx.source } : 'unavailable',
      headlines: news ? news.data.slice(0, 6).map((h) => ({ title: h.title, source: h.source })) : undefined,
      note: 'Rates are market reference rates, not the official CBE rate. Stock prices are delayed about 15 minutes.',
      where: "CEO's Mate page",
    };
  }

  if (name === 'convertCurrency') {
    const amount = Number(args.amount ?? 1);
    const from = String(args.from || '').toUpperCase();
    const to = String(args.to || 'EGP').toUpperCase();
    if (!Number.isFinite(amount) || !from) return fail('Say the amount and the currency codes, for example 100 USD to EGP.');
    const r = await getRates().catch(() => null);
    if (!r) return fail('Exchange rates could not be reached right now.');
    const v = convert(amount, from, to, r.data);
    if (!Number.isFinite(v)) return fail(`Unknown currency code: ${from} or ${to}.`);
    return { ok: true, amount, from, to, result: round(v, v < 1 ? 4 : 2), oneUnitRate: round(convert(1, from, to, r.data), 4), source: r.source, asOf: iso(r.asOf), note: 'Market reference rate, not the official Central Bank of Egypt rate.' };
  }

  if (name === 'getStockInfo') {
    const q = String(args.query || '').trim();
    if (!q) return fail('Say the company name or stock code.');
    const market: Market = args.market === 'global' ? 'global' : 'egypt';
    let list = await searchStocks(market, q).catch(() => []);
    let used: Market = market;
    if (list.length === 0 && !args.market) {
      list = await searchStocks('global', q).catch(() => []);
      used = 'global';
    }
    if (list.length === 0) return fail(`No listed stock matched "${q}".`);
    return {
      ok: true,
      market: used === 'egypt' ? 'Egyptian Exchange (EGX)' : 'US markets',
      results: list.slice(0, 3).map((s) => ({
        code: s.symbol, name: s.name, price: s.price, currency: s.currency, dayChangePct: round(s.changePct), high: s.high, low: s.low, volume: s.volume, marketCap: s.marketCap,
        peRatio: s.pe !== undefined ? round(s.pe, 1) : undefined, dividendYieldPct: s.dividendYield !== undefined ? round(s.dividendYield) : undefined,
        week52High: s.high52, week52Low: s.low52, oneMonthPct: s.perf1m !== undefined ? round(s.perf1m) : undefined, yearToDatePct: s.perfYtd !== undefined ? round(s.perfYtd) : undefined, sector: s.sector,
      })),
      source: 'TradingView market scanner, delayed about 15 minutes',
      note: 'For information only, not investment advice.',
    };
  }

  if (name === 'getCommodityPrices') {
    const rows = await Promise.all(COMMODITIES.map((c) => getCommodity(c.symbol, '1mo').then((r) => ({ name: c.en, unit: c.unit, price: r.data.price, oneMonthChangePct: (() => { const x = changePct(r.data.points); return x === null ? undefined : round(x); })() })).catch(() => null)));
    const ok = rows.filter(Boolean);
    if (ok.length === 0) return fail('Commodity prices could not be reached right now.');
    return { ok: true, commodities: ok, source: 'Yahoo Finance (world futures prices, may be delayed)', note: 'No free source exists for Egyptian rebar or cement prices; steel is a US benchmark.' };
  }

  if (name === 'getEconomyIndicators') {
    const rows = await Promise.all(INDICATORS.map((i) => getIndicator(i.id).then((r) => ({ indicator: i.en, unit: i.unit, latestYear: r.data.rows[0]?.year, value: r.data.rows[0]?.value })).catch(() => null)));
    const ok = rows.filter(Boolean);
    if (ok.length === 0) return fail('Economic statistics could not be reached right now.');
    return { ok: true, egypt: ok, source: 'World Bank (official yearly statistics, normally a year or more behind)', note: 'The current Central Bank of Egypt policy rate is not available through an open service; see cbe.org.eg.' };
  }

  if (name === 'getNewsHeadlines') {
    const topic = NEWS_TOPICS.find((t) => t.id === args.topic)?.id || 'industry';
    const n = await getNews(topic, ar).catch(() => null);
    if (!n) return fail('News could not be reached right now.');
    return { ok: true, topic, headlines: n.data.slice(0, 8).map((h) => ({ title: h.title, source: h.source, hoursAgo: h.at ? Math.round((Date.now() - h.at) / 3_600_000) : undefined })), source: n.source };
  }

  if (name === 'getTravelInfo') {
    const q = norm(args.place);
    if (!q) return fail('Say the country or city.');
    const country = COUNTRIES.find((c) => [c.en, c.ar, c.capital.en, c.capital.ar].some((x) => norm(x) === q)) || COUNTRIES.find((c) => [c.en, c.ar, c.capital.en, c.capital.ar].some((x) => norm(x).includes(q) || q.includes(norm(x))));
    let place: Place | null = country ? { name: country.capital.en, country: country.en, lat: country.lat, lon: country.lon, tz: country.tz } : null;
    if (!place) place = (await findPlaces(String(args.place), false).catch(() => []))[0] || null;
    if (!place) return fail(`Could not find "${args.place}".`);
    const wx = await getWeather(place.lat, place.lon).catch(() => null);
    const tz = wx?.data.tz || place.tz;
    const dmy = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()).replace(/\//g, '-');
    const pray = await getPrayerTimes(place.lat, place.lon, dmy).catch(() => null);
    const lang = country?.phrases ? LANGUAGES.find((l) => l.code === country.phrases) : undefined;
    const desc = (c: number) => WEATHER_CODES[c]?.en || '';
    return {
      ok: true,
      place: place.name,
      country: place.country,
      localTime: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()),
      hoursFromCairo: hoursFromCairo(tz),
      weather: wx ? { nowC: Math.round(wx.data.now.temp), feelsC: Math.round(wx.data.now.feels), condition: desc(wx.data.now.code), humidityPct: wx.data.now.humidity, windKmh: Math.round(wx.data.now.wind), forecast: wx.data.days.slice(0, 5).map((d) => ({ date: d.date, condition: desc(d.code), maxC: Math.round(d.max), minC: Math.round(d.min), rainChancePct: d.rain })), source: wx.source } : 'unavailable',
      prayerTimesLocal: pray ? { ...pray.data, source: pray.source } : 'unavailable',
      qiblaDegreesFromNorth: Math.round(qiblaBearing(place.lat, place.lon)),
      facts: country ? { currency: country.currency, language: country.language.en, voltage: country.voltage, plugTypes: country.plugs, emergency: country.emergency || 'check on arrival', weekend: country.weekend, phrasebook: lang ? lang.en : 'none' } : undefined,
      note: 'Facts are hand-entered reference information; confirm visas and entry rules with the embassy.',
      where: "CEO's Mate > Travel",
    };
  }

  if (name === 'getPhrases') {
    const l = norm(args.language);
    const lang = LANGUAGES.find((x) => x.code === l || norm(x.en).includes(l) || x.ar.includes(String(args.language)) || (l === 'mandarin' && x.code === 'zh') || (l === 'brazilian' && x.code === 'pt'));
    if (!lang) return fail(`No phrasebook for "${args.language}". Available: ${LANGUAGES.map((x) => x.en).join(', ')}.`);
    const want = norm(args.phrase);
    const idx = want ? PHRASES.findIndex((p) => norm(p.en).includes(want) || p.ar.includes(String(args.phrase)) || want.includes(norm(p.en))) : -1;
    const row = (i: number) => ({ meaning: PHRASES[i].en, written: lang.words[i][0], pronunciation: lang.words[i][1] });
    return { ok: true, language: lang.en, ...(idx >= 0 ? { phrase: row(idx) } : { phrases: PHRASES.map((_, i) => row(i)) }), note: 'Pronunciation is approximate; the phrase can be played aloud on the Useful phrases page.', where: "CEO's Mate > Useful phrases" };
  }

  if (name === 'getHolidays') {
    const today = getCairoDateString();
    return { ok: true, upcoming: upcomingHolidays(today, Math.min(Number(args.count) || 6, 12)).map((h) => ({ date: h.date, name: h.en, expectedDate: h.approx || undefined })), note: 'Islamic dates are expected dates and may differ by a day with the official announcement.' };
  }

  if (name === 'manageMarketAlerts') {
    const action = String(args.action || 'list');
    const st = getWatchState();
    if (action === 'add') {
      const metric = String(args.metric || '').toUpperCase() as Metric;
      const value = Number(args.value);
      if (!METRICS.some((m) => m.id === metric) || !Number.isFinite(value)) return fail('Say what to watch (USDEGP, GOLD21, GOLD24 or EGX30), above or below, and the number.');
      addAlert({ metric, op: args.direction === 'below' ? 'below' : 'above', value });
      return { ok: true, added: { metric, direction: args.direction === 'below' ? 'below' : 'above', value }, note: 'Alerts are checked every 10 minutes while the app is open.' };
    }
    if (action === 'remove') {
      const hit = st.alerts.find((a) => a.id === args.id || (args.metric && a.metric === String(args.metric).toUpperCase() && (args.value === undefined || a.value === Number(args.value))));
      if (!hit) return fail('No matching alert.');
      removeAlert(hit.id);
      return { ok: true, removed: { metric: hit.metric, direction: hit.op, value: hit.value } };
    }
    return { ok: true, alerts: st.alerts.map((a) => ({ id: a.id, metric: a.metric, direction: a.op, value: a.value, active: a.active })), recentlyFired: st.hits.slice(0, 5).map((h) => h.text), watchlist: st.watch.map((w) => w.label) };
  }

  void fmt;
  return undefined;
}
