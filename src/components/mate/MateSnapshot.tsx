import React, { useEffect, useState } from 'react';
import { fmt, getEgx30, getRates, getWeather } from '../../lib/market';
import { WEATHER_CODES } from '../../lib/travelData';
import { useWatchCities } from '../../lib/marketWatch';
import { Change, SourceLine, useLoad } from './parts';

/** three numbers every morning: dollar, the weather of a watched city (tap to switch) and the EGX30 index, each with where it comes from */
export const MateSnapshot: React.FC<{ ar: boolean; compact?: boolean }> = ({ ar, compact }) => {
  const rates = useLoad((f) => getRates(f), []);
  const egx = useLoad((f) => getEgx30(f), []);
  const cities = useWatchCities();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (cities.length < 2) return;
    const t = setInterval(() => setI((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, [cities.length]);
  const city = cities.length ? cities[i % cities.length] : null;
  const wx = useLoad((f) => (city ? getWeather(city.lat, city.lon, f) : Promise.reject(new Error('NO_CITY'))), [city?.lat, city?.lon]);
  const dayMove = egx.data ? egx.data.data.changePct : null;
  const w = wx.data?.data;
  const code = w ? WEATHER_CODES[w.now.code] : undefined;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-stone-200 bg-white px-2 py-2.5 text-center min-w-0">
          <div className="text-[11px] text-stone-500 truncate">{ar ? 'الدولار' : 'USD / EGP'}</div>
          <div className="text-lg font-bold tabular-nums text-stone-900">{fmt(rates.data?.data.EGP, 2)}</div>
          <div className="h-4 text-[11px] text-stone-400">EGP</div>
        </div>
        <button
          type="button"
          onClick={() => setI((n) => n + 1)}
          disabled={cities.length < 2}
          aria-label={ar ? 'الطقس — المس لتغيير المدينة' : 'Weather — tap to switch city'}
          className="rounded-2xl border border-stone-200 bg-white px-2 py-2.5 text-center min-w-0 disabled:cursor-default"
        >
          <div className="text-[11px] text-stone-500 truncate">{city ? city.name : ar ? 'الطقس' : 'Weather'}{cities.length > 1 && <span className="text-stone-400"> · {(i % cities.length) + 1}/{cities.length}</span>}</div>
          <div className="text-lg font-bold tabular-nums text-stone-900">{w ? `${Math.round(w.now.temp)}°` : '—'}</div>
          <div className="h-4 text-[11px] text-stone-400 truncate">{code ? `${code.icon} ${ar ? code.ar : code.en}` : ''}</div>
        </button>
        <div className="rounded-2xl border border-stone-200 bg-white px-2 py-2.5 text-center min-w-0">
          <div className="text-[11px] text-stone-500 truncate">EGX30</div>
          <div className="text-lg font-bold tabular-nums text-stone-900">{fmt(egx.data?.data.price, 0)}</div>
          <div className="h-4 text-[11px] text-stone-400">{dayMove !== null ? <Change pct={dayMove} className="text-[11px]" /> : ''}</div>
        </div>
      </div>
      {!compact && (
        <SourceLine
          ar={ar}
          sources={['ExchangeRate-API · Open-Meteo · TradingView (EGX30)']}
          onRefresh={() => {
            rates.reload();
            wx.reload();
            egx.reload();
          }}
          loading={rates.loading || wx.loading || egx.loading}
        />
      )}
    </div>
  );
};
