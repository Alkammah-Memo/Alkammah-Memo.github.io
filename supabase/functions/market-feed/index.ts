// @ts-nocheck -- this file runs on Supabase Edge Functions (Deno), not in the browser build
// Supabase Edge Function for the "CEO's Mate" page. A browser may not call these public data providers itself
// (they do not allow it), so the server fetches them for the signed-in user and returns small, clean JSON.
//   { kind: 'chart',     symbol, range?, interval? }  -> price history from Yahoo Finance (market data, may be delayed)
//   { kind: 'news',      q, lang? }                    -> headlines from Google News search (title, source, link, time)
//   { kind: 'worldbank', indicator }                   -> Egypt yearly indicator from the World Bank (official statistics)
// Safety: only signed-in users, three fixed provider hosts, fixed parameters are validated, short timeout, small answers,
// results kept in memory for a few minutes so the free plan is never stressed. No secrets are needed. Deploy with "Verify JWT" ON.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const cache = new Map<string, { at: number; ttl: number; body: unknown }>();
const remember = (key: string, ttlMs: number, body: unknown) => {
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), ttl: ttlMs, body });
  return body;
};
const recall = (key: string) => {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < hit.ttl ? hit.body : null;
};

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; AlkammahMate/1.0)' };
const get = async (url: string, accept?: string) => {
  const res = await fetch(url, { headers: { ...UA, ...(accept ? { Accept: accept } : {}) }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`provider ${res.status}`);
  return res;
};

const SYMBOL = /^[A-Za-z0-9.^=\-]{1,20}$/;
const RANGES = ['5d', '1mo', '3mo', '6mo', '1y', '5y'];
const INTERVALS = ['1d', '1wk', '1mo'];
const INDICATORS = ['FP.CPI.TOTL.ZG', 'NY.GDP.MKTP.KD.ZG', 'SL.UEM.TOTL.ZS', 'FR.INR.LNDP', 'GC.DOD.TOTL.GD.ZS'];

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '').trim();
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who.user) return json({ error: 'not_signed_in' }, 401);

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || '');

    if (kind === 'chart') {
      const symbol = String(body.symbol || '');
      const range = RANGES.includes(body.range) ? body.range : '1mo';
      const interval = INTERVALS.includes(body.interval) ? body.interval : '1d';
      if (!SYMBOL.test(symbol)) return json({ error: 'bad_symbol' }, 400);
      const key = `c|${symbol}|${range}|${interval}`;
      const hit = recall(key);
      if (hit) return json(hit);
      const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, 'application/json');
      const d = await res.json();
      const r = d?.chart?.result?.[0];
      if (!r?.timestamp) return json({ error: 'no_data' }, 404);
      const closes = r.indicators?.quote?.[0]?.close || [];
      const points: [number, number][] = [];
      r.timestamp.forEach((t: number, i: number) => {
        if (typeof closes[i] === 'number') points.push([t * 1000, Math.round(closes[i] * 10000) / 10000]);
      });
      const m = r.meta || {};
      return json(remember(key, 5 * 60_000, { symbol, name: m.shortName || m.longName || symbol, currency: m.currency || '', price: m.regularMarketPrice ?? null, asOf: (m.regularMarketTime || 0) * 1000, points, source: 'Yahoo Finance' }));
    }

    if (kind === 'news') {
      const q = String(body.q || '').slice(0, 200);
      if (!q) return json({ error: 'bad_query' }, 400);
      const ar = body.lang === 'ar';
      const key = `n|${q}|${ar}`;
      const hit = recall(key);
      if (hit) return json(hit);
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${ar ? 'ar' : 'en-US'}&gl=EG&ceid=${ar ? 'EG:ar' : 'EG:en'}`;
      const xml = await (await get(url, 'application/rss+xml')).text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map((m) => {
        const b = m[1];
        const source = tag(b, 'source');
        let title = tag(b, 'title');
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
        const t = Date.parse(tag(b, 'pubDate'));
        return { title, source, link: tag(b, 'link'), at: Number.isFinite(t) ? t : 0 };
      });
      return json(remember(key, 10 * 60_000, { q, items, source: 'Google News' }));
    }

    if (kind === 'worldbank') {
      const indicator = String(body.indicator || '');
      if (!INDICATORS.includes(indicator)) return json({ error: 'bad_indicator' }, 400);
      const key = `w|${indicator}`;
      const hit = recall(key);
      if (hit) return json(hit);
      const d = await (await get(`https://api.worldbank.org/v2/country/EGY/indicator/${indicator}?format=json&per_page=12`, 'application/json')).json();
      const rows = (d?.[1] || []).filter((x: any) => typeof x.value === 'number').map((x: any) => ({ year: Number(x.date), value: Math.round(x.value * 100) / 100 }));
      return json(remember(key, 6 * 3600_000, { indicator, name: d?.[1]?.[0]?.indicator?.value || indicator, rows, source: 'World Bank (official statistics)' }));
    }

    return json({ error: 'bad_kind' }, 400);
  } catch (e) {
    return json({ error: 'provider_failed', detail: String((e as Error)?.message || e).slice(0, 120) }, 502);
  }
});
