import React, { useEffect, useState } from 'react';
import { ChevronDown, Search, Star } from 'lucide-react';
import { COMMODITIES, INDICATORS, Market, NEWS_TOPICS, NewsTopic, Range, Stock, changePct, fmt, fmtBig, getCommodity, getEgx30, getIndicator, getNews, getStockHistory, getTopStocks, searchStocks, STOCK_SOURCE, timeAgo } from '../../lib/market';
import { isWatched, toggleWatch, useWatchlist } from '../../lib/marketWatch';
import { Card, Change, ErrorBox, ExternalLinkText, RangeChips, SourceLine, Spark, ToolShell, TrendChart, useLoad } from './parts';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-2 py-1.5 text-sm border-b border-stone-100 last:border-0">
    <span className="text-stone-500">{label}</span>
    <span className="font-semibold tabular-nums text-end">{value}</span>
  </div>
);

const StockDetail: React.FC<{ s: Stock; market: Market; ar: boolean }> = ({ s, market, ar }) => {
  const [range, setRange] = useState<Range>('3mo');
  const watch = useWatchlist();
  const sym = market === 'global' ? s.symbol : '';
  const hist = useLoad(() => (sym ? getStockHistory(sym, range) : Promise.reject(new Error('NONE'))), [sym, range]);
  return (
    <div className="px-3 pb-3 space-y-2">
      <div className="grid grid-cols-2 gap-x-4">
        <Row label={ar ? 'الافتتاح' : 'Open'} value={fmt(s.open)} />
        <Row label={ar ? 'الأعلى اليوم' : 'Day high'} value={fmt(s.high)} />
        <Row label={ar ? 'الأدنى اليوم' : 'Day low'} value={fmt(s.low)} />
        <Row label={ar ? 'حجم التداول' : 'Volume'} value={fmtBig(s.volume)} />
        <Row label={ar ? 'القيمة السوقية' : 'Market cap'} value={`${fmtBig(s.marketCap)} ${s.currency}`} />
        <Row label="P/E" value={fmt(s.pe, 1)} />
        <Row label={ar ? 'ربحية السهم' : 'EPS'} value={fmt(s.eps)} />
        <Row label={ar ? 'عائد التوزيعات' : 'Dividend yield'} value={s.dividendYield !== undefined ? `${fmt(s.dividendYield)}%` : '—'} />
        <Row label={ar ? 'أعلى 52 أسبوع' : '52-week high'} value={fmt(s.high52)} />
        <Row label={ar ? 'أدنى 52 أسبوع' : '52-week low'} value={fmt(s.low52)} />
        <Row label={ar ? 'أداء شهر' : '1-month'} value={s.perf1m !== undefined ? `${fmt(s.perf1m)}%` : '—'} />
        <Row label={ar ? 'منذ بداية العام' : 'Year to date'} value={s.perfYtd !== undefined ? `${fmt(s.perfYtd)}%` : '—'} />
      </div>
      {(s.sector || s.industry) && (
        <div className="text-xs text-stone-600">
          {ar ? 'القطاع: ' : 'Sector: '}
          {[s.sector, s.industry].filter(Boolean).join(' · ')}
        </div>
      )}
      {sym ? (
        <div>
          <RangeChips value={range} onChange={setRange} ar={ar} />
          <div className="mt-2">{hist.error ? <div className="text-xs text-stone-500">{ar ? 'لا يوجد رسم لهذا السهم.' : 'No chart available for this stock.'}</div> : hist.data ? <TrendChart points={hist.data.data.points} ar={ar} unit={s.currency} /> : <div className="h-32" />}</div>
          {hist.data && <SourceLine ar={ar} stamped={hist.data} />}
        </div>
      ) : (
        <p className="text-[11px] text-stone-500">{ar ? 'لا يتوفر مصدر مجاني موثوق لتاريخ أسعار الأسهم المصرية؛ يظهر مؤشر EGX30 أعلاه بالرسم، وللسهم القيم الحالية والأداء خلال شهر وخلال العام.' : 'No reliable free source exists for Egyptian stock price history; the EGX30 index above has a chart, and each stock shows current values and 1-month / year-to-date performance.'}</p>
      )}
      <button type="button" onClick={() => toggleWatch('stock', `${market}:${s.symbol}`, s.name)} className={`min-h-10 px-3 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 ${isWatched(watch, 'stock', `${market}:${s.symbol}`) ? 'border-[#0071e3] text-[#0071e3] bg-[#0071e3]/5' : 'border-stone-300 text-stone-700'}`}>
        <Star className={`w-4 h-4 ${isWatched(watch, 'stock', `${market}:${s.symbol}`) ? 'fill-[#0071e3]' : ''}`} />
        {isWatched(watch, 'stock', `${market}:${s.symbol}`) ? (ar ? 'في قائمة المتابعة' : 'On my watchlist') : ar ? 'أضف للمتابعة' : 'Add to watchlist'}
      </button>
    </div>
  );
};

export const StocksTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [market, setMarket] = useState<Market>('egypt');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('3mo');
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const top = useLoad((f) => getTopStocks(market, f), [market]);
  const found = useLoad(() => (query ? searchStocks(market, query) : Promise.resolve(null)), [market, query]);
  const egx = useLoad((f) => getEgx30(f), []);
  const index = useLoad((f) => (market === 'global' ? getCommodityIndex(range, f) : Promise.resolve(null)), [market, range]);
  const list = query ? found.data || [] : top.data?.data || [];
  const idxMove = market === 'egypt' ? egx.data?.data.changePct ?? null : index.data ? changePct(index.data.data.points) : null;
  return (
    <ToolShell title={ar ? 'الأسهم' : 'Stocks'} ar={ar} onBack={onBack}>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-[#f5f5f7] p-1 border border-[#d2d2d7]/70" role="tablist">
        {([['egypt', ar ? 'البورصة المصرية' : 'Egypt (EGX)'], ['global', ar ? 'عالمي (أمريكا)' : 'Global (US)']] as [Market, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={market === k} onClick={() => { setMarket(k); setOpen(null); setQ(''); }} className={`min-h-11 rounded-full text-sm font-semibold ${market === k ? 'bg-[#0071e3] text-white' : 'text-[#515154]'}`}>
            {label}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{market === 'egypt' ? 'EGX30' : 'S&P 500'}</div>
            <div className="text-xl font-bold tabular-nums">{market === 'egypt' ? fmt(egx.data?.data.price, 0) : index.data ? fmt(index.data.data.price, 0) : '—'}</div>
            <Change pct={idxMove} />
            <span className="ms-1 text-[11px] text-stone-500">{market === 'egypt' ? (ar ? 'اليوم' : 'today') : ''}</span>
          </div>
          {market === 'global' && <RangeChips value={range} onChange={setRange} ar={ar} />}
        </div>
        {market === 'egypt' ? (
          <>
            {egx.error ? (
              <div className="mt-2"><ErrorBox ar={ar} error={egx.error} onRetry={egx.reload} /></div>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(egx.data?.data.perf || []).map((p) => (
                  <div key={p.id} className="rounded-xl border border-stone-200 py-2 text-center">
                    <div className="text-[11px] text-stone-500">{p.id === '1W' ? (ar ? 'أسبوع' : '1 week') : p.id === '1M' ? (ar ? 'شهر' : '1 month') : p.id === '3M' ? (ar ? '3 أشهر' : '3 months') : p.id === '6M' ? (ar ? '6 أشهر' : '6 months') : p.id === 'YTD' ? (ar ? 'منذ يناير' : 'This year') : ar ? 'سنة' : '1 year'}</div>
                    <Change pct={p.value} className="text-sm" />
                  </div>
                ))}
              </div>
            )}
            {egx.data && <div className="mt-2"><SourceLine ar={ar} stamped={egx.data} /></div>}
            <p className="mt-1 text-[11px] text-stone-500">{ar ? 'لا يوجد مصدر مجاني لرسم يومي لمؤشر EGX30، لذلك يظهر أداؤه خلال فترات مختلفة.' : 'No free source has a daily chart of the EGX30, so its performance over different periods is shown instead.'}</p>
          </>
        ) : (
          <>
            <div className="mt-2">{index.error ? <ErrorBox ar={ar} error={index.error} onRetry={index.reload} /> : index.data ? <TrendChart points={index.data.data.points} ar={ar} digits={0} height={120} /> : <div className="h-28" />}</div>
            {index.data && <SourceLine ar={ar} stamped={index.data} />}
          </>
        )}
      </Card>

      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute start-3 top-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={ar ? 'ابحث باسم الشركة أو الرمز' : 'Search a company name or code'} className="w-full h-12 ps-9 pe-3 rounded-2xl border border-stone-300 bg-white text-base sm:text-sm" />
      </div>

      <Card className="!p-2">
        <div className="px-2 pt-1 pb-2 text-xs font-bold uppercase tracking-wide text-stone-500">
          {query ? (ar ? 'نتائج البحث' : 'Search results') : ar ? 'أكبر 20 شركة بالقيمة السوقية' : 'Top 20 by market value'}
        </div>
        {top.error && !query && <ErrorBox ar={ar} error={top.error} onRetry={top.reload} />}
        {query && found.loading && <div className="px-2 py-4 text-sm text-stone-500">{ar ? 'جارٍ البحث…' : 'Searching…'}</div>}
        {query && !found.loading && list.length === 0 && <div className="px-2 py-4 text-sm text-stone-500">{ar ? 'لا نتائج.' : 'No results.'}</div>}
        <ul>
          {list.map((s, i) => {
            const id = `${market}:${s.symbol}`;
            const on = open === id;
            return (
              <li key={id} className="border-b border-stone-100 last:border-0">
                <button type="button" onClick={() => setOpen(on ? null : id)} aria-expanded={on} className="w-full min-h-14 px-2 flex items-center gap-2 text-start">
                  {!query && <span className="w-5 text-xs font-mono text-stone-400 tabular-nums">{i + 1}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-stone-900">{s.symbol}</span>
                    <span className="block text-xs text-stone-500 truncate">{s.name}</span>
                  </span>
                  <span className="text-end">
                    <span className="block text-sm font-bold tabular-nums">
                      {fmt(s.price)} <span className="text-[10px] font-semibold text-stone-500">{s.currency}</span>
                    </span>
                    <Change pct={s.changePct} className="text-xs" />
                  </span>
                  <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${on ? 'rotate-180' : ''}`} />
                </button>
                {on && <StockDetail s={s} market={market} ar={ar} />}
              </li>
            );
          })}
        </ul>
      </Card>
      <SourceLine ar={ar} stamped={top.data} sources={top.data ? undefined : [STOCK_SOURCE]} onRefresh={() => { top.reload(); index.reload(); egx.reload(); }} loading={top.loading} />
      <p className="text-[11px] text-stone-500">{ar ? 'الأسعار متأخرة نحو 15 دقيقة، وللمعلومة فقط وليست نصيحة استثمارية. البورصة المصرية لا تتيح خدمة بيانات مفتوحة مجانية.' : 'Prices are delayed about 15 minutes, for information only, not investment advice. The Egyptian Exchange offers no free open data service.'}</p>
    </ToolShell>
  );
};

const getCommodityIndex = (range: Range, force: boolean) => getCommodity('^GSPC', range, force);

export const NewsTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [topic, setTopic] = useState<NewsTopic>('industry');
  const news = useLoad((f) => getNews(topic, ar, f), [topic, ar]);
  return (
    <ToolShell title={ar ? 'الأخبار' : 'News'} ar={ar} onBack={onBack}>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {NEWS_TOPICS.map((t) => (
          <button key={t.id} onClick={() => setTopic(t.id)} className={`min-h-10 px-3.5 rounded-full whitespace-nowrap text-xs font-semibold border ${topic === t.id ? 'bg-[#0071e3] border-[#0071e3] text-white' : 'bg-white border-stone-200 text-stone-700'}`}>
            {ar ? t.ar : t.en}
          </button>
        ))}
      </div>
      {news.error && <ErrorBox ar={ar} error={news.error} onRetry={news.reload} />}
      <Card className="!p-2">
        {news.loading && !news.data && <div className="px-2 py-6 text-sm text-stone-500">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>}
        <ul>
          {(news.data?.data || []).map((h) => (
            <li key={h.link} className="border-b border-stone-100 last:border-0">
              <a href={h.link} target="_blank" rel="noopener noreferrer" className="block px-2 py-3 active:bg-stone-50">
                <span className="block text-sm font-semibold text-stone-900 leading-snug">{h.title}</span>
                <span className="block mt-1 text-[11px] text-stone-500">
                  <span className="font-semibold text-[#0071e3]">{h.source || '—'}</span> · {h.at ? timeAgo(h.at, ar) : ''}
                </span>
              </a>
            </li>
          ))}
          {news.data && news.data.data.length === 0 && <li className="px-2 py-6 text-sm text-stone-500">{ar ? 'لا أخبار حالياً.' : 'No headlines right now.'}</li>}
        </ul>
      </Card>
      <SourceLine ar={ar} stamped={news.data} onRefresh={news.reload} loading={news.loading} />
      <p className="text-[11px] text-stone-500">{ar ? 'العناوين تُجمع من ناشرين مختلفين، وكل خبر يفتح موقع الناشر. لا تُعدّل هنا.' : 'Headlines are collected from different publishers; each one opens the publisher’s own page and is not edited here.'}</p>
    </ToolShell>
  );
};

export const CommoditiesTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('3mo');
  const all = useLoad(
    async (f) => {
      const res = await Promise.all(COMMODITIES.map((c) => getCommodity(c.symbol, '3mo', f).then((r) => [c.symbol, r] as const).catch(() => [c.symbol, null] as const)));
      return Object.fromEntries(res);
    },
    []
  );
  const detail = useLoad((f) => (open ? getCommodity(open, range, f) : Promise.resolve(null)), [open, range]);
  const any = all.data ? Object.values(all.data).find(Boolean) : null;
  return (
    <ToolShell title={ar ? 'السلع والمواد الخام' : 'Commodities'} ar={ar} onBack={onBack}>
      {all.error && <ErrorBox ar={ar} error={all.error} onRetry={all.reload} />}
      <Card className="!p-2">
        <ul>
          {COMMODITIES.map((c) => {
            const r = all.data?.[c.symbol];
            const on = open === c.symbol;
            return (
              <li key={c.symbol} className="border-b border-stone-100 last:border-0">
                <button type="button" onClick={() => setOpen(on ? null : c.symbol)} aria-expanded={on} className="w-full min-h-16 px-2 flex items-center gap-2 text-start">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-stone-900">{ar ? c.ar : c.en}</span>
                    <span className="block text-[11px] text-stone-500">{c.unit}</span>
                  </span>
                  {r ? <Spark points={r.data.points} /> : null}
                  <span className="text-end w-24">
                    <span className="block text-sm font-bold tabular-nums">{r ? fmt(r.data.price) : all.loading ? '…' : ar ? 'غير متاح' : 'n/a'}</span>
                    {r && <Change pct={changePct(r.data.points)} className="text-xs" />}
                  </span>
                </button>
                {on && (
                  <div className="px-2 pb-3">
                    <RangeChips value={range} onChange={setRange} ar={ar} />
                    <div className="mt-2">{detail.data ? <TrendChart points={detail.data.data.points} ar={ar} unit={detail.data.data.currency} /> : <div className="h-32" />}</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <SourceLine ar={ar} stamped={any} onRefresh={all.reload} loading={all.loading} />
      <p className="text-[11px] text-stone-500">{ar ? 'عقود آجلة عالمية (قد تتأخر). لا توجد مصادر مجانية لأسعار حديد التسليح والأسمنت في مصر؛ الصلب المعروض هو مؤشر أمريكي للاسترشاد بالاتجاه فقط.' : 'World futures prices (may be delayed). No free source exists for Egyptian rebar or cement prices; the steel shown is a US benchmark, useful for direction only.'}</p>
    </ToolShell>
  );
};

export const EconomyTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const all = useLoad(async () => {
    const res = await Promise.all(INDICATORS.map((i) => getIndicator(i.id).then((r) => [i.id, r] as const).catch(() => [i.id, null] as const)));
    return Object.fromEntries(res);
  }, []);
  const any = all.data ? Object.values(all.data).find(Boolean) : null;
  return (
    <ToolShell title={ar ? 'مؤشرات الاقتصاد' : 'Economy'} ar={ar} onBack={onBack}>
      {all.error && <ErrorBox ar={ar} error={all.error} onRetry={all.reload} />}
      <Card className="!p-2">
        <ul>
          {INDICATORS.map((i) => {
            const r = all.data?.[i.id];
            const rows = r?.data.rows || [];
            const latest = rows[0];
            const max = Math.max(1, ...rows.map((x) => Math.abs(x.value)));
            return (
              <li key={i.id} className="border-b border-stone-100 last:border-0 px-2 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-stone-900">{ar ? i.ar : i.en}</span>
                  <span className="font-mono text-lg font-bold tabular-nums">{latest ? `${fmt(latest.value, 1)}${i.unit === '%' ? '%' : ''}` : all.loading ? '…' : '—'}</span>
                </div>
                {latest && <div className="text-[11px] text-stone-500">{ar ? `آخر بيان: عام ${latest.year}` : `Latest: ${latest.year}`}</div>}
                <div className="mt-1.5 flex items-end gap-1 h-10" aria-hidden>
                  {[...rows].reverse().map((x) => (
                    <div key={x.year} title={`${x.year}: ${x.value}`} className="flex-1 rounded-t bg-[#0071e3]/70" style={{ height: `${Math.max(8, (Math.abs(x.value) / max) * 100)}%` }} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <SourceLine ar={ar} stamped={any} onRefresh={all.reload} loading={all.loading} />
      <p className="text-[11px] text-stone-500">
        {ar ? 'إحصاءات سنوية رسمية من البنك الدولي، وتتأخر عادةً عن الواقع. سعر الفائدة الحالي للبنك المركزي المصري غير متاح عبر خدمة مفتوحة؛ راجعه هنا: ' : 'Official yearly statistics from the World Bank, normally a year or more behind. The current CBE policy rate is not available through an open service; check it here: '}
        <ExternalLinkText href="https://www.cbe.org.eg/en/monetary-policy/key-interest-rates">cbe.org.eg</ExternalLinkText>
      </p>
    </ToolShell>
  );
};
