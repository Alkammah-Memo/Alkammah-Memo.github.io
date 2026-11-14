/** Egyptian public holidays: fixed national dates, Coptic (Easter) and Islamic calendars. Islamic dates are expected dates (moon sighting). */
export interface Holiday {
  date: string;
  en: string;
  ar: string;
  approx?: boolean;
}
export const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const orthodoxEaster = (y: number): string => {
  const a = y % 4, b = y % 7, c = y % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(ymd(y, month, day), 13);
};
const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function holidaysOf(y: number): Holiday[] {
  const out: Holiday[] = [
    { date: ymd(y, 1, 7), en: 'Coptic Christmas', ar: 'عيد الميلاد المجيد' },
    { date: ymd(y, 1, 25), en: 'Revolution Day / Police Day', ar: 'عيد الثورة وعيد الشرطة' },
    { date: ymd(y, 4, 25), en: 'Sinai Liberation Day', ar: 'عيد تحرير سيناء' },
    { date: ymd(y, 5, 1), en: 'Labour Day', ar: 'عيد العمال' },
    { date: ymd(y, 6, 30), en: '30 June Revolution', ar: 'ثورة 30 يونيو' },
    { date: ymd(y, 7, 23), en: 'July 23 Revolution', ar: 'ثورة 23 يوليو' },
    { date: ymd(y, 10, 6), en: 'Armed Forces Day', ar: 'عيد القوات المسلحة' },
    { date: addDays(orthodoxEaster(y), 1), en: 'Sham El-Nessim', ar: 'شم النسيم' },
  ];
  for (let i = 0; i < 366; i++) {
    const date = addDays(ymd(y, 1, 1), i);
    if (!date.startsWith(String(y))) break;
    const p = Object.fromEntries(hijri.formatToParts(new Date(`${date}T12:00:00Z`)).map((x) => [x.type, x.value]));
    const m = Number(p.month), dd = Number(p.day);
    if (m === 1 && dd === 1) out.push({ date, en: 'Islamic New Year', ar: 'رأس السنة الهجرية', approx: true });
    if (m === 3 && dd === 12) out.push({ date, en: 'Prophet’s Birthday (Mawlid)', ar: 'المولد النبوي الشريف', approx: true });
    if (m === 10 && dd >= 1 && dd <= 3) out.push({ date, en: `Eid al-Fitr (day ${dd})`, ar: `عيد الفطر (اليوم ${dd})`, approx: true });
    if (m === 12 && dd === 9) out.push({ date, en: 'Arafat Day', ar: 'وقفة عرفات', approx: true });
    if (m === 12 && dd >= 10 && dd <= 13) out.push({ date, en: `Eid al-Adha (day ${dd - 9})`, ar: `عيد الأضحى (اليوم ${dd - 9})`, approx: true });
  }
  return out;
}

export function upcomingHolidays(today: string, count: number): Holiday[] {
  const y = Number(today.slice(0, 4));
  return [...holidaysOf(y), ...holidaysOf(y + 1)].filter((h) => h.date >= today).sort((p, q) => p.date.localeCompare(q.date)).slice(0, count);
}
