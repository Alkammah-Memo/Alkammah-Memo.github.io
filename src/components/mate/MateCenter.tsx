import React, { useEffect, useState } from 'react';
import { Banknote, Bell, CalendarHeart, Clock, Coins, Factory, Landmark, Languages, ListChecks, Newspaper, Plane, Ruler, TrendingUp } from 'lucide-react';
import { evaluateAlerts, useWatchState } from '../../lib/marketWatch';
import { CurrencyTool, GoldTool } from './FxGold';
import { CommoditiesTool, EconomyTool, NewsTool, StocksTool } from './StocksNews';
import { AlertsTool, ClocksTool, ConverterTool, HolidaysTool } from './Extras';
import { MateSnapshot } from './MateSnapshot';
import { ChecklistTool, PhrasebookTool, TravelTool } from './Travel';

export type MateTool = 'currency' | 'gold' | 'stocks' | 'news' | 'commodities' | 'economy' | 'alerts' | 'clocks' | 'holidays' | 'converter' | 'travel' | 'phrases' | 'checklist';

const TILES: { id: MateTool; en: string; ar: string; hint: { en: string; ar: string }; icon: React.ReactNode; tone: string }[] = [
  { id: 'travel', en: 'Travel', ar: 'السفر', hint: { en: 'Weather, prayer times, time & facts', ar: 'الطقس والصلاة والتوقيت ومعلومات' }, icon: <Plane className="w-8 h-8" />, tone: 'bg-cyan-50 text-cyan-700' },
  { id: 'phrases', en: 'Useful phrases', ar: 'عبارات مفيدة', hint: { en: 'Translation, sound & pronunciation', ar: 'ترجمة ونطق وصوت' }, icon: <Languages className="w-8 h-8" />, tone: 'bg-lime-50 text-lime-700' },
  { id: 'checklist', en: 'Trip checklist', ar: 'قائمة السفر', hint: { en: 'Never forget the essentials', ar: 'لا تنسَ الأساسيات' }, icon: <ListChecks className="w-8 h-8" />, tone: 'bg-fuchsia-50 text-fuchsia-700' },
  { id: 'currency', en: 'Currency', ar: 'العملات', hint: { en: 'Dollar, euro, riyal… and a calculator', ar: 'الدولار واليورو والريال… وحاسبة' }, icon: <Banknote className="w-8 h-8" />, tone: 'bg-emerald-50 text-emerald-700' },
  { id: 'gold', en: 'Gold', ar: 'الذهب', hint: { en: 'Egypt gram prices and trend', ar: 'أسعار الجرام في مصر والاتجاه' }, icon: <Coins className="w-8 h-8" />, tone: 'bg-amber-50 text-amber-700' },
  { id: 'stocks', en: 'Stocks', ar: 'الأسهم', hint: { en: 'EGX top 20, search, global', ar: 'أكبر 20 سهماً، بحث، عالمي' }, icon: <TrendingUp className="w-8 h-8" />, tone: 'bg-sky-50 text-sky-700' },
  { id: 'news', en: 'News', ar: 'الأخبار', hint: { en: 'Industry, land, shipping, tenders', ar: 'صناعة، أراضٍ، شحن، مناقصات' }, icon: <Newspaper className="w-8 h-8" />, tone: 'bg-violet-50 text-violet-700' },
  { id: 'commodities', en: 'Commodities', ar: 'السلع', hint: { en: 'Oil, copper, aluminium, steel', ar: 'النفط والنحاس والألومنيوم والصلب' }, icon: <Factory className="w-8 h-8" />, tone: 'bg-orange-50 text-orange-700' },
  { id: 'economy', en: 'Economy', ar: 'الاقتصاد', hint: { en: 'Inflation, growth, debt', ar: 'التضخم والنمو والدين' }, icon: <Landmark className="w-8 h-8" />, tone: 'bg-rose-50 text-rose-700' },
  { id: 'alerts', en: 'Alerts & watchlist', ar: 'تنبيهات ومتابعة', hint: { en: 'Tell me when a price moves', ar: 'نبّهني عند تحرك السعر' }, icon: <Bell className="w-8 h-8" />, tone: 'bg-red-50 text-red-700' },
  { id: 'clocks', en: 'World clock', ar: 'ساعات العالم', hint: { en: 'Partners’ local times', ar: 'توقيت الشركاء' }, icon: <Clock className="w-8 h-8" />, tone: 'bg-indigo-50 text-indigo-700' },
  { id: 'holidays', en: 'Holidays', ar: 'الإجازات', hint: { en: 'Egyptian and Islamic holidays', ar: 'الإجازات المصرية والإسلامية' }, icon: <CalendarHeart className="w-8 h-8" />, tone: 'bg-teal-50 text-teal-700' },
  { id: 'converter', en: 'Converter', ar: 'محوّل الوحدات', hint: { en: 'Feddan, m², tonne, barrel', ar: 'فدان، م²، طن، برميل' }, icon: <Ruler className="w-8 h-8" />, tone: 'bg-stone-100 text-stone-700' },
];

export const MateCenter: React.FC<{ ar: boolean }> = ({ ar }) => {
  const [tool, setTool] = useState<MateTool | null>(null);
  const [phraseLang, setPhraseLang] = useState<string | undefined>(undefined);
  const st = useWatchState();
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [tool]);
  const back = () => setTool(null);
  if (tool === 'currency') return <CurrencyTool ar={ar} onBack={back} />;
  if (tool === 'gold') return <GoldTool ar={ar} onBack={back} />;
  if (tool === 'stocks') return <StocksTool ar={ar} onBack={back} />;
  if (tool === 'news') return <NewsTool ar={ar} onBack={back} />;
  if (tool === 'commodities') return <CommoditiesTool ar={ar} onBack={back} />;
  if (tool === 'economy') return <EconomyTool ar={ar} onBack={back} />;
  if (tool === 'alerts') return <AlertsTool ar={ar} onBack={back} />;
  if (tool === 'clocks') return <ClocksTool ar={ar} onBack={back} />;
  if (tool === 'holidays') return <HolidaysTool ar={ar} onBack={back} />;
  if (tool === 'converter') return <ConverterTool ar={ar} onBack={back} />;
  if (tool === 'travel') return <TravelTool ar={ar} onBack={back} onOpenPhrases={(l) => { setPhraseLang(l); setTool('phrases'); }} />;
  if (tool === 'phrases') return <PhrasebookTool ar={ar} onBack={back} initial={phraseLang} />;
  if (tool === 'checklist') return <ChecklistTool ar={ar} onBack={back} />;
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-[#1d1d1f]">{ar ? 'رفيق المدير' : 'CEO’s Mate'}</h1>
        <p className="text-sm text-[#86868b]">{ar ? 'الأسواق والأخبار والأدوات في مكان واحد. كل رقم يذكر مصدره.' : 'Markets, news and tools in one place. Every figure names its source.'}</p>
      </div>
      {st.hits.length > 0 && (
        <button type="button" onClick={() => setTool('alerts')} className="w-full text-start rounded-2xl border border-orange-300 bg-orange-50 px-3 py-3 text-sm text-orange-900 flex items-center gap-2">
          <Bell className="w-4 h-4 shrink-0" />
          <span className="flex-1">{st.hits[0].text}</span>
          <span className="font-bold text-xs">{ar ? 'التنبيهات' : 'Alerts'}</span>
        </button>
      )}
      <MateSnapshot ar={ar} />
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <button key={t.id} type="button" onClick={() => { setPhraseLang(undefined); setTool(t.id); }} className="text-start rounded-3xl border border-[#d2d2d7] bg-white shadow-xs p-4 min-h-36 flex flex-col gap-2 active:scale-[0.98] transition-transform">
            <span className={`w-14 h-14 rounded-2xl inline-flex items-center justify-center ${t.tone}`}>{t.icon}</span>
            <span className="text-base font-bold text-[#1d1d1f] leading-tight">{ar ? t.ar : t.en}</span>
            <span className="text-xs text-stone-500 leading-snug">{ar ? t.hint.ar : t.hint.en}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** keeps the price alerts checked every 10 minutes while the app is open (mounted once in the app) */
export const MateAlertsWatcher: React.FC<{ ar: boolean }> = ({ ar }) => {
  useEffect(() => {
    const run = () => void evaluateAlerts(ar);
    const first = setTimeout(run, 8_000);
    const every = setInterval(run, 10 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [ar]);
  return null;
};
