import React from 'react';
import { fmt, getEgx30, getGold, getRates } from '../../lib/market';
import { Change, SourceLine, useLoad } from './parts';

/** three numbers every morning: dollar, gold (21K gram) and the EGX30 index, each with where it comes from */
export const MateSnapshot: React.FC<{ ar: boolean; compact?: boolean }> = ({ ar, compact }) => {
  const rates = useLoad((f) => getRates(f), []);
  const gold = useLoad((f) => getGold(f), []);
  const egx = useLoad((f) => getEgx30('1mo', f), []);
  const pts = egx.data?.data.points || [];
  const dayMove = pts.length > 1 ? ((pts[pts.length - 1][1] - pts[pts.length - 2][1]) / pts[pts.length - 2][1]) * 100 : null;
  const tiles = [
    { l: ar ? 'الدولار' : 'USD / EGP', v: fmt(rates.data?.data.EGP, 2), s: 'EGP', c: null as number | null },
    { l: ar ? 'ذهب عيار 21' : 'Gold 21K / g', v: fmt(gold.data?.data.gram21, 0), s: 'EGP', c: null },
    { l: 'EGX30', v: fmt(egx.data?.data.price, 0), s: '', c: dayMove },
  ];
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.l} className="rounded-2xl border border-stone-200 bg-white px-2 py-2.5 text-center min-w-0">
            <div className="text-[11px] text-stone-500 truncate">{t.l}</div>
            <div className="text-lg font-bold tabular-nums text-stone-900">{t.v}</div>
            <div className="h-4 text-[11px] text-stone-400">{t.c !== null ? <Change pct={t.c} className="text-[11px]" /> : t.s}</div>
          </div>
        ))}
      </div>
      {!compact && (
        <SourceLine
          ar={ar}
          sources={[ar ? 'ExchangeRate-API · gold-api.com · Yahoo Finance (EGX30)' : 'ExchangeRate-API · gold-api.com · Yahoo Finance (EGX30)']}
          onRefresh={() => {
            rates.reload();
            gold.reload();
            egx.reload();
          }}
          loading={rates.loading || gold.loading || egx.loading}
        />
      )}
    </div>
  );
};
