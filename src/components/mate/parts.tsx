import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { RANGES, Range, Series, Stamped, fmt, timeAgo } from '../../lib/market';

/** loads something once and again on demand; keeps the last answer on screen while refreshing */
export function useLoad<T>(load: (force: boolean) => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const run = useRef(0);
  const go = useCallback(
    (force: boolean) => {
      const id = ++run.current;
      setLoading(true);
      setError('');
      load(force)
        .then((v) => run.current === id && setData(v))
        .catch((e: Error) => run.current === id && setError(e?.message === 'NO_SERVER' ? 'NO_SERVER' : 'FAILED'))
        .finally(() => run.current === id && setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );
  useEffect(() => go(false), [go]);
  return { data, loading, error, reload: () => go(true) };
}

export const ErrorBox: React.FC<{ ar: boolean; error: string; onRetry: () => void }> = ({ ar, error, onRetry }) => (
  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800 flex items-start gap-2">
    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
    <div className="flex-1">
      {error === 'NO_SERVER'
        ? ar ? 'هذه الأداة تحتاج الاتصال بالسحابة (سجّل الدخول).' : 'This tool needs the cloud connection (sign in).'
        : ar ? 'تعذّر جلب البيانات الآن. تحقق من الاتصال ثم أعد المحاولة.' : 'Could not load the data right now. Check the connection and try again.'}
    </div>
    <button type="button" onClick={onRetry} className="min-h-9 px-3 rounded-lg bg-white border border-red-200 font-semibold text-xs">
      {ar ? 'إعادة' : 'Retry'}
    </button>
  </div>
);

/** says where a figure comes from, when it refers to, and warns when it is an old saved copy */
export const SourceLine: React.FC<{ ar: boolean; stamped?: Pick<Stamped<unknown>, 'source' | 'asOf' | 'stale'> | null; sources?: string[]; onRefresh?: () => void; loading?: boolean }> = ({ ar, stamped, sources, onRefresh, loading }) => (
  <div className="flex items-start gap-2 text-[11px] leading-snug text-stone-500">
    <div className="flex-1 min-w-0">
      {(stamped ? [stamped.source] : sources || []).map((s) => (
        <div key={s}>
          <span className="font-semibold">{ar ? 'المصدر: ' : 'Source: '}</span>
          {s}
        </div>
      ))}
      {stamped && (
        <div>
          {ar ? 'البيانات بتاريخ: ' : 'Data as of: '}
          {new Date(stamped.asOf).toLocaleString(ar ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' })} ({timeAgo(stamped.asOf, ar)})
          {stamped.stale && <span className="ms-1 font-bold text-orange-600">{ar ? '· نسخة محفوظة قديمة، المصدر لا يستجيب' : '· old saved copy, the source is not answering'}</span>}
        </div>
      )}
    </div>
    {onRefresh && (
      <button type="button" onClick={onRefresh} aria-label={ar ? 'تحديث' : 'Refresh'} className="w-10 h-10 -my-2 shrink-0 inline-flex items-center justify-center rounded-xl text-stone-600 active:bg-stone-100">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      </button>
    )}
  </div>
);

export const Change: React.FC<{ pct: number | null | undefined; className?: string }> = ({ pct, className = '' }) => {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return <span className={`text-stone-400 ${className}`}>—</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-red-600'} ${className}`}>
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`bg-white rounded-3xl border border-[#d2d2d7] shadow-xs p-4 ${className}`}>{children}</section>
);

export const ToolShell: React.FC<{ title: string; ar: boolean; onBack: () => void; children: React.ReactNode }> = ({ title, ar, onBack, children }) => (
  <div className="max-w-3xl mx-auto space-y-3 pb-12">
    <div className="flex items-center gap-1">
      <button type="button" onClick={onBack} aria-label={ar ? 'رجوع' : 'Back'} className="w-11 h-11 -ms-2 inline-flex items-center justify-center rounded-xl text-[#0071e3] active:bg-stone-100">
        <ChevronLeft className={`w-6 h-6 ${ar ? 'rotate-180' : ''}`} />
      </button>
      <h1 className="text-xl font-bold text-[#1d1d1f]">{title}</h1>
    </div>
    {children}
  </div>
);

export const RangeChips: React.FC<{ value: Range; onChange: (r: Range) => void; ar: boolean }> = ({ value, onChange, ar }) => (
  <div className="inline-flex rounded-full bg-[#f5f5f7] p-0.5 border border-[#d2d2d7]/70" role="tablist">
    {RANGES.map((r) => (
      <button key={r.id} role="tab" aria-selected={value === r.id} onClick={() => onChange(r.id)} className={`min-h-9 px-3 rounded-full text-xs font-semibold ${value === r.id ? 'bg-[#0071e3] text-white' : 'text-[#515154]'}`}>
        {ar ? r.ar : r.en}
      </button>
    ))}
  </div>
);

export const ExternalLinkText: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#0071e3] font-semibold">
    {children}
    <ExternalLink className="w-3 h-3" />
  </a>
);

/** line chart with a touch / mouse readout; green when the period ended higher, red when lower */
export const TrendChart: React.FC<{ points: Series; ar: boolean; digits?: number; height?: number; unit?: string; scale?: number }> = ({ points, ar, digits = 2, height = 150, unit = '', scale = 1 }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div className="h-24 flex items-center justify-center text-xs text-stone-500">{ar ? 'لا توجد بيانات كافية للرسم' : 'Not enough data for a chart'}</div>;
  const vals = points.map((p) => p[1] * scale);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = height;
  const pad = 6;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? '#059669' : '#dc2626';
  const idx = hover ?? points.length - 1;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))));
  };
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="font-mono font-bold text-stone-900 tabular-nums">
          {fmt(vals[idx], digits)} {unit}
        </span>
        <span className="text-stone-500">{new Date(points[idx][0]).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Africa/Cairo' })}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y select-none" style={{ height }} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} role="img" aria-label={ar ? 'رسم الاتجاه' : 'Trend chart'}>
        <defs>
          <linearGradient id="mate-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${x(vals.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#mate-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1={x(idx)} x2={x(idx)} y1={0} y2={H} stroke={color} strokeOpacity="0.35" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <circle cx={x(idx)} cy={y(vals[idx])} r="4" fill="#fff" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-stone-500 tabular-nums mt-0.5">
        <span>
          {ar ? 'الأدنى ' : 'Low '}
          {fmt(min, digits)}
        </span>
        <span>
          {ar ? 'الأعلى ' : 'High '}
          {fmt(max, digits)}
        </span>
      </div>
    </div>
  );
};

export const Spark: React.FC<{ points: Series; width?: number; height?: number }> = ({ points, width = 72, height = 26 }) => {
  if (points.length < 2) return <span style={{ width }} />;
  const vals = points.map((p) => p[1]);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={vals[vals.length - 1] >= vals[0] ? '#059669' : '#dc2626'} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
};
