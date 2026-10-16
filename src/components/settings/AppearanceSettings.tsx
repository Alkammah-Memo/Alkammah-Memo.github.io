import React, { useSyncExternalStore } from 'react';
import { Palette, Check } from 'lucide-react';
import { Fold } from './Fold';
import { getTheme, setTheme, subscribeTheme } from '../../lib/theme';
import type { ThemeId, Wallpaper } from '../../lib/theme';

const WALLPAPERS: { id: Wallpaper; en: string; ar: string; css: string }[] = [
  { id: 'aurora', en: 'Aurora', ar: 'شفق', css: 'linear-gradient(135deg,#8ec5ff,#d9a7ff 55%,#ffb3c7)' },
  { id: 'sunset', en: 'Sunset', ar: 'غروب', css: 'linear-gradient(135deg,#ffc38a,#ff9db8 55%,#b79bff)' },
  { id: 'ocean', en: 'Ocean', ar: 'محيط', css: 'linear-gradient(135deg,#7fe0ff,#7fa8ff 55%,#7ff0d4)' },
  { id: 'graphite', en: 'Graphite', ar: 'جرافيت', css: 'linear-gradient(135deg,#c9d3e6,#d9d2ee 55%,#cfdde0)' },
  { id: 'dark', en: 'Dark', ar: 'داكن', css: 'linear-gradient(135deg,#1c3f78,#43266f 55%,#12101d)' },
];

export const AppearanceSettings: React.FC<{ ar: boolean }> = ({ ar }) => {
  const st = useSyncExternalStore(subscribeTheme, getTheme);
  const themes: { id: ThemeId; title: string; sub: string }[] = [
    { id: 'classic', title: ar ? 'كلاسيكي' : 'Classic', sub: ar ? 'الشكل الحالي، أبيض مسطح' : 'The current flat white look' },
    { id: 'glass', title: ar ? 'زجاج iOS' : 'iOS Glass', sub: ar ? 'زجاج شفاف وخلفية ناعمة وأشرطة عائمة' : 'Frosted glass, soft wallpaper, floating bars' },
  ];
  return (
    <Fold id="appearance" defaultOpen icon={<Palette className="w-5 h-5" />} title={ar ? 'المظهر' : 'Appearance'}>
      <p className="text-xs text-[#515154] mb-3">
        {ar ? 'يغيّر شكل التطبيق كله (الألوان والبطاقات والأشرطة والنوافذ) على هذا الجهاز فقط. ورقة الكتابة تبقى بألوانها لتظل الكتابة واضحة.' : 'Changes the look of the whole app (colours, cards, bars, windows) on this device only. The writing paper keeps its own colours so handwriting stays clear.'}
      </p>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={ar ? 'المظهر' : 'Theme'}>
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={st.theme === t.id}
            onClick={() => setTheme({ theme: t.id })}
            className={`text-start rounded-2xl border p-2.5 transition-colors ${st.theme === t.id ? 'border-[#0071e3] ring-2 ring-[#0071e3]/25' : 'border-[#d2d2d7] hover:bg-black/[0.03]'}`}
          >
            <div
              className="h-20 rounded-xl mb-2 relative overflow-hidden border border-black/5"
              style={{ background: t.id === 'glass' ? WALLPAPERS.find((w) => w.id === st.wallpaper)?.css : '#f5f5f7' }}
            >
              <div className={`absolute inset-x-2 top-2 h-4 ${t.id === 'glass' ? 'rounded-full bg-white/60 border border-white/80 backdrop-blur' : 'rounded bg-white border border-[#d2d2d7]'}`} />
              <div className={`absolute inset-x-2 top-8 bottom-2 ${t.id === 'glass' ? 'rounded-2xl bg-white/55 border border-white/80 backdrop-blur' : 'rounded-lg bg-white border border-[#d2d2d7]'}`} />
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-[#1d1d1f]">
              {st.theme === t.id && <Check className="w-4 h-4 text-[#0071e3]" />}
              {t.title}
            </div>
            <div className="text-[11px] text-[#6e6e73]">{t.sub}</div>
          </button>
        ))}
      </div>
      {st.theme === 'glass' && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-[#515154] mb-2">{ar ? 'الخلفية' : 'Wallpaper'}</div>
          <div className="flex flex-wrap gap-3">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setTheme({ wallpaper: w.id })}
                aria-label={ar ? w.ar : w.en}
                aria-pressed={st.wallpaper === w.id}
                className="flex flex-col items-center gap-1 min-w-14"
              >
                <span className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center ${st.wallpaper === w.id ? 'border-[#0071e3]' : 'border-white/80'}`} style={{ background: w.css }}>
                  {st.wallpaper === w.id && <Check className="w-4 h-4 text-white drop-shadow" />}
                </span>
                <span className="text-[11px] text-[#515154]">{ar ? w.ar : w.en}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Fold>
  );
};
