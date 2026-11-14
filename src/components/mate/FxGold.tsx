import React, { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { CURRENCIES, Range, changePct, convert, fmt, getGold, getGoldHistory, getPairHistory, getRates } from '../../lib/market';
import { Card, Change, ErrorBox, RangeChips, SourceLine, ToolShell, TrendChart, useLoad } from './parts';

const SHOWN = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'CNY', 'QAR'];

export const CurrencyTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [amount, setAmount] = useState('1');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('EGP');
  const [range, setRange] = useState<Range>('3mo');
  const rates = useLoad((f) => getRates(f), []);
  const hist = useLoad((f) => getPairHistory(from, to, range, f), [from, to, range]);
  const n = parseFloat(amount.replace(/,/g, ''));
  const result = rates.data && Number.isFinite(n) ? convert(n, from, to, rates.data.data) : NaN;
  const name = (c: string) => CURRENCIES.find((x) => x.code === c)?.[ar ? 'ar' : 'en'] || c;
  const pair = (a: string, b: string) => (rates.data ? convert(1, a, b, rates.data.data) : NaN);
  const move = hist.data ? changePct(hist.data.data) : null;

  return (
    <ToolShell title={ar ? 'العملات' : 'Currency'} ar={ar} onBack={onBack}>
      {rates.error && <ErrorBox ar={ar} error={rates.error} onRetry={rates.reload} />}
      <Card>
        <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{ar ? 'الحاسبة' : 'Calculator'}</div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <label className="block min-w-0">
            <span className="text-[11px] text-stone-500">{ar ? 'من' : 'From'}</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-11 px-2 rounded-xl border border-stone-300 text-sm bg-white">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label={ar ? 'تبديل' : 'Swap'} className="w-11 h-11 rounded-xl border border-stone-300 inline-flex items-center justify-center text-[#0071e3]">
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          <label className="block min-w-0">
            <span className="text-[11px] text-stone-500">{ar ? 'إلى' : 'To'}</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-11 px-2 rounded-xl border border-stone-300 text-sm bg-white">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label={ar ? 'المبلغ' : 'Amount'}
          className="mt-2 w-full h-12 px-3 rounded-xl border border-stone-300 text-xl font-bold tabular-nums"
        />
        <div className="mt-3 rounded-2xl bg-[#0071e3]/8 border border-[#0071e3]/20 px-3 py-3">
          <div className="text-xs text-stone-600">
            {fmt(n, 2)} {from} =
          </div>
          <div className="text-2xl font-bold text-[#0058b0] tabular-nums break-all">
            {Number.isFinite(result) ? fmt(result, result < 1 ? 4 : 2) : '—'} <span className="text-base">{to}</span>
          </div>
          <div className="text-[11px] text-stone-500">
            1 {from} = {fmt(pair(from, to), pair(from, to) < 1 ? 4 : 2)} {to} · {name(from)} → {name(to)}
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">{ar ? 'الجنيه المصري مقابل' : 'Egyptian pound per'}</div>
        <div className="grid grid-cols-2 gap-2">
          {SHOWN.map((c) => (
            <button key={c} type="button" onClick={() => { setFrom(c); setTo('EGP'); }} className={`rounded-2xl border px-3 py-2 text-start ${from === c && to === 'EGP' ? 'border-[#0071e3] bg-[#0071e3]/5' : 'border-stone-200'}`}>
              <div className="text-[11px] text-stone-500">1 {c}</div>
              <div className="text-base font-bold tabular-nums">
                {fmt(pair(c, 'EGP'), 2)} <span className="text-xs font-semibold text-stone-500">EGP</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {ar ? 'الاتجاه' : 'Trend'} · {from}/{to}
            </div>
            <div className="text-sm">
              <Change pct={move} /> <span className="text-xs text-stone-500">{ar ? 'خلال الفترة' : 'over the period'}</span>
            </div>
          </div>
          <RangeChips value={range} onChange={setRange} ar={ar} />
        </div>
        <div className="mt-2">{hist.error ? <ErrorBox ar={ar} error={hist.error} onRetry={hist.reload} /> : hist.data ? <TrendChart points={hist.data.data} ar={ar} digits={from === to ? 2 : 4} /> : <div className="h-36" />}</div>
      </Card>

      <SourceLine ar={ar} stamped={rates.data} sources={undefined} onRefresh={() => { rates.reload(); hist.reload(); }} loading={rates.loading || hist.loading} />
      {hist.data && <SourceLine ar={ar} stamped={{ ...hist.data }} />}
      <p className="text-[11px] text-stone-500">{ar ? 'هذه أسعار السوق المرجعية وليست سعراً رسمياً للبنك المركزي المصري؛ البنك المركزي لا يتيح خدمة بيانات مفتوحة. للسعر الرسمي راجع موقع البنك المركزي المصري.' : 'These are market reference rates, not the official Central Bank of Egypt (CBE) rate: the CBE offers no open data service. For the official rate check the CBE website.'}</p>
    </ToolShell>
  );
};

const CARATS = [
  { k: 24, f: 1 },
  { k: 21, f: 0.875 },
  { k: 18, f: 0.75 },
];

export const GoldTool: React.FC<{ ar: boolean; onBack: () => void }> = ({ ar, onBack }) => {
  const [carat, setCarat] = useState(21);
  const [range, setRange] = useState<Range>('3mo');
  const gold = useLoad((f) => getGold(f), []);
  const hist = useLoad((f) => getGoldHistory(range, f), [range]);
  const g = gold.data?.data;
  const factor = CARATS.find((c) => c.k === carat)!.f;
  const move = useMemo(() => (hist.data ? changePct(hist.data.data) : null), [hist.data]);
  const rows = g
    ? [
        { l: ar ? 'عيار 24 (جرام)' : '24 carat (gram)', v: g.gram24 },
        { l: ar ? 'عيار 21 (جرام)' : '21 carat (gram)', v: g.gram21 },
        { l: ar ? 'عيار 18 (جرام)' : '18 carat (gram)', v: g.gram18 },
        { l: ar ? 'الجنيه الذهب (8 جم عيار 21)' : 'Gold pound (8 g, 21 carat)', v: g.pound },
        { l: ar ? 'الأونصة' : 'Ounce', v: g.ounceEgp },
      ]
    : [];
  return (
    <ToolShell title={ar ? 'الذهب في مصر' : 'Gold in Egypt'} ar={ar} onBack={onBack}>
      {gold.error && <ErrorBox ar={ar} error={gold.error} onRetry={gold.reload} />}
      <Card>
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li key={r.l} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-stone-700">{r.l}</span>
              <span className="font-mono font-bold tabular-nums text-stone-900">
                {fmt(r.v, 0)} <span className="text-xs font-semibold text-stone-500">EGP</span>
              </span>
            </li>
          ))}
        </ul>
        {g && (
          <p className="mt-2 text-[11px] text-stone-500">
            {ar ? 'الحساب: ' : 'Calculation: '}
            ${fmt(g.usdPerOunce, 2)} / oz × {fmt(g.usdEgp, 2)} EGP ÷ 31.1035 g
          </p>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">{ar ? 'اتجاه سعر الجرام' : 'Gram price trend'}</div>
            <div className="text-sm">
              <Change pct={move} />
            </div>
          </div>
          <RangeChips value={range} onChange={setRange} ar={ar} />
        </div>
        <div className="mt-2 inline-flex rounded-full bg-[#f5f5f7] p-0.5 border border-[#d2d2d7]/70">
          {CARATS.map((c) => (
            <button key={c.k} onClick={() => setCarat(c.k)} className={`min-h-9 px-3.5 rounded-full text-xs font-semibold ${carat === c.k ? 'bg-[#0071e3] text-white' : 'text-[#515154]'}`}>
              {ar ? `عيار ${c.k}` : `${c.k}K`}
            </button>
          ))}
        </div>
        <div className="mt-2">{hist.error ? <ErrorBox ar={ar} error={hist.error} onRetry={hist.reload} /> : hist.data ? <TrendChart points={hist.data.data} ar={ar} digits={0} unit="EGP" scale={factor} /> : <div className="h-36" />}</div>
      </Card>
      <SourceLine ar={ar} stamped={gold.data} onRefresh={() => { gold.reload(); hist.reload(); }} loading={gold.loading || hist.loading} />
      {hist.data && <SourceLine ar={ar} stamped={hist.data} />}
      <p className="text-[11px] text-stone-500">
        {ar ? 'لا توجد واجهة رسمية لأسعار الذهب المحلية في مصر، لذلك يُحسب السعر من السعر العالمي وسعر الدولار. أسعار محلات الصاغة تتضمن المصنعية وقد تختلف قليلاً.' : 'Egypt has no official gold-price service, so the price is calculated from the world gold price and the dollar rate. Jewellers add making charges and may differ slightly.'}
      </p>
    </ToolShell>
  );
};
