/**
 * Reference information for the CEO's trips. It is written by hand (not downloaded), so the screens say "confirm before you travel".
 * Weather, prayer times and exchange rates are live; everything in this file changes rarely.
 */
export interface Country {
  id: string;
  en: string;
  ar: string;
  capital: { en: string; ar: string };
  lat: number;
  lon: number;
  tz: string;
  currency: string;
  language: { en: string; ar: string };
  /** phrasebook language code, if there is one for the local language */
  phrases?: string;
  voltage: string;
  plugs: string;
  /** main emergency numbers; empty when not sure */
  emergency: string;
  weekend: 'Fri–Sat' | 'Sat–Sun';
}

const C = (
  id: string, en: string, ar: string, capEn: string, capAr: string, lat: number, lon: number, tz: string, currency: string,
  langEn: string, langAr: string, phrases: string | undefined, voltage: string, plugs: string, emergency: string, weekend: Country['weekend']
): Country => ({ id, en, ar, capital: { en: capEn, ar: capAr }, lat, lon, tz, currency, language: { en: langEn, ar: langAr }, phrases, voltage, plugs, emergency, weekend });

export const COUNTRIES: Country[] = [
  C('eg', 'Egypt', 'مصر', 'Cairo', 'القاهرة', 30.0444, 31.2357, 'Africa/Cairo', 'EGP', 'Arabic', 'العربية', undefined, '220 V', 'C, F', '122 (police) · 123 (ambulance) · 180 (fire)', 'Fri–Sat'),
  C('sa', 'Saudi Arabia', 'السعودية', 'Riyadh', 'الرياض', 24.7136, 46.6753, 'Asia/Riyadh', 'SAR', 'Arabic', 'العربية', undefined, '230 V', 'G (also A, B)', '911', 'Fri–Sat'),
  C('ae', 'United Arab Emirates', 'الإمارات', 'Abu Dhabi', 'أبوظبي', 24.4539, 54.3773, 'Asia/Dubai', 'AED', 'Arabic, English', 'العربية والإنجليزية', undefined, '230 V', 'G', '999 (police) · 998 (ambulance)', 'Sat–Sun'),
  C('qa', 'Qatar', 'قطر', 'Doha', 'الدوحة', 25.2854, 51.531, 'Asia/Qatar', 'QAR', 'Arabic, English', 'العربية والإنجليزية', undefined, '240 V', 'G', '999', 'Fri–Sat'),
  C('kw', 'Kuwait', 'الكويت', 'Kuwait City', 'مدينة الكويت', 29.3759, 47.9774, 'Asia/Kuwait', 'KWD', 'Arabic', 'العربية', undefined, '240 V', 'G', '112', 'Fri–Sat'),
  C('om', 'Oman', 'عُمان', 'Muscat', 'مسقط', 23.588, 58.3829, 'Asia/Muscat', 'OMR', 'Arabic', 'العربية', undefined, '240 V', 'G', '9999', 'Fri–Sat'),
  C('bh', 'Bahrain', 'البحرين', 'Manama', 'المنامة', 26.2285, 50.586, 'Asia/Bahrain', 'BHD', 'Arabic', 'العربية', undefined, '230 V', 'G', '999', 'Fri–Sat'),
  C('jo', 'Jordan', 'الأردن', 'Amman', 'عمّان', 31.9454, 35.9284, 'Asia/Amman', 'JOD', 'Arabic', 'العربية', undefined, '230 V', 'C, D, F, G, J', '911', 'Fri–Sat'),
  C('iq', 'Iraq', 'العراق', 'Baghdad', 'بغداد', 33.3152, 44.3661, 'Asia/Baghdad', 'IQD', 'Arabic, Kurdish', 'العربية والكردية', undefined, '230 V', 'C, D, G', '', 'Fri–Sat'),
  C('ly', 'Libya', 'ليبيا', 'Tripoli', 'طرابلس', 32.8872, 13.1913, 'Africa/Tripoli', 'LYD', 'Arabic', 'العربية', undefined, '230 V', 'C, D, L', '', 'Fri–Sat'),
  C('ma', 'Morocco', 'المغرب', 'Rabat', 'الرباط', 34.0209, -6.8416, 'Africa/Casablanca', 'MAD', 'Arabic, French', 'العربية والفرنسية', 'fr', '220 V', 'C, E', '19 (police) · 15 (ambulance)', 'Sat–Sun'),
  C('tn', 'Tunisia', 'تونس', 'Tunis', 'تونس', 36.8065, 10.1815, 'Africa/Tunis', 'TND', 'Arabic, French', 'العربية والفرنسية', 'fr', '230 V', 'C, E', '197 (police) · 190 (ambulance)', 'Sat–Sun'),
  C('dz', 'Algeria', 'الجزائر', 'Algiers', 'الجزائر', 36.7538, 3.0588, 'Africa/Algiers', 'DZD', 'Arabic, French', 'العربية والفرنسية', 'fr', '230 V', 'C, F', '17 (police) · 14 (civil protection)', 'Fri–Sat'),
  C('dj', 'Djibouti', 'جيبوتي', 'Djibouti', 'جيبوتي', 11.8251, 42.5903, 'Africa/Djibouti', 'DJF', 'French, Arabic', 'الفرنسية والعربية', 'fr', '220 V', 'C, E', '17 (police) · 18 (fire)', 'Fri–Sat'),
  C('et', 'Ethiopia', 'إثيوبيا', 'Addis Ababa', 'أديس أبابا', 9.03, 38.74, 'Africa/Addis_Ababa', 'ETB', 'Amharic, English', 'الأمهرية والإنجليزية', undefined, '220 V', 'C, E, F, L', '', 'Sat–Sun'),
  C('ke', 'Kenya', 'كينيا', 'Nairobi', 'نيروبي', -1.2921, 36.8219, 'Africa/Nairobi', 'KES', 'Swahili, English', 'السواحيلية والإنجليزية', 'sw', '240 V', 'G', '999 · 112', 'Sat–Sun'),
  C('tz', 'Tanzania', 'تنزانيا', 'Dodoma', 'دودوما', -6.163, 35.7516, 'Africa/Dar_es_Salaam', 'TZS', 'Swahili, English', 'السواحيلية والإنجليزية', 'sw', '230 V', 'D, G', '112', 'Sat–Sun'),
  C('ng', 'Nigeria', 'نيجيريا', 'Abuja', 'أبوجا', 9.0765, 7.3986, 'Africa/Lagos', 'NGN', 'English', 'الإنجليزية', undefined, '230 V', 'D, G', '112 · 199', 'Sat–Sun'),
  C('za', 'South Africa', 'جنوب أفريقيا', 'Pretoria', 'بريتوريا', -25.7479, 28.2293, 'Africa/Johannesburg', 'ZAR', 'English (11 official languages)', 'الإنجليزية (11 لغة رسمية)', undefined, '230 V', 'C, M, N', '10111 (police) · 112 (mobile)', 'Sat–Sun'),
  C('tr', 'Türkiye', 'تركيا', 'Ankara', 'أنقرة', 39.9334, 32.8597, 'Europe/Istanbul', 'TRY', 'Turkish', 'التركية', 'tr', '230 V', 'C, F', '112', 'Sat–Sun'),
  C('ru', 'Russia', 'روسيا', 'Moscow', 'موسكو', 55.7558, 37.6173, 'Europe/Moscow', 'RUB', 'Russian', 'الروسية', 'ru', '230 V', 'C, F', '112', 'Sat–Sun'),
  C('cn', 'China', 'الصين', 'Beijing', 'بكين', 39.9042, 116.4074, 'Asia/Shanghai', 'CNY', 'Mandarin Chinese', 'الصينية (الماندرين)', 'zh', '220 V', 'A, C, I', '110 (police) · 120 (ambulance)', 'Sat–Sun'),
  C('in', 'India', 'الهند', 'New Delhi', 'نيودلهي', 28.6139, 77.209, 'Asia/Kolkata', 'INR', 'Hindi, English', 'الهندية والإنجليزية', 'hi', '230 V', 'C, D, M', '112', 'Sat–Sun'),
  C('jp', 'Japan', 'اليابان', 'Tokyo', 'طوكيو', 35.6762, 139.6503, 'Asia/Tokyo', 'JPY', 'Japanese', 'اليابانية', 'ja', '100 V', 'A, B', '110 (police) · 119 (ambulance/fire)', 'Sat–Sun'),
  C('kr', 'South Korea', 'كوريا الجنوبية', 'Seoul', 'سيول', 37.5665, 126.978, 'Asia/Seoul', 'KRW', 'Korean', 'الكورية', undefined, '220 V', 'C, F', '112 (police) · 119 (ambulance/fire)', 'Sat–Sun'),
  C('sg', 'Singapore', 'سنغافورة', 'Singapore', 'سنغافورة', 1.3521, 103.8198, 'Asia/Singapore', 'SGD', 'English, Mandarin, Malay', 'الإنجليزية والماندرين والملايو', undefined, '230 V', 'G', '999 (police) · 995 (ambulance)', 'Sat–Sun'),
  C('my', 'Malaysia', 'ماليزيا', 'Kuala Lumpur', 'كوالالمبور', 3.139, 101.6869, 'Asia/Kuala_Lumpur', 'MYR', 'Malay, English', 'الملايو والإنجليزية', undefined, '240 V', 'G', '999 · 112', 'Sat–Sun'),
  C('id', 'Indonesia', 'إندونيسيا', 'Jakarta', 'جاكرتا', -6.2088, 106.8456, 'Asia/Jakarta', 'IDR', 'Indonesian', 'الإندونيسية', undefined, '230 V', 'C, F', '112', 'Sat–Sun'),
  C('pk', 'Pakistan', 'باكستان', 'Islamabad', 'إسلام آباد', 33.6844, 73.0479, 'Asia/Karachi', 'PKR', 'Urdu, English', 'الأردية والإنجليزية', undefined, '230 V', 'C, D', '15 (police) · 1122 (rescue)', 'Sat–Sun'),
  C('gb', 'United Kingdom', 'المملكة المتحدة', 'London', 'لندن', 51.5074, -0.1278, 'Europe/London', 'GBP', 'English', 'الإنجليزية', undefined, '230 V', 'G', '999 · 112', 'Sat–Sun'),
  C('fr', 'France', 'فرنسا', 'Paris', 'باريس', 48.8566, 2.3522, 'Europe/Paris', 'EUR', 'French', 'الفرنسية', 'fr', '230 V', 'C, E', '112 · 15 (ambulance)', 'Sat–Sun'),
  C('de', 'Germany', 'ألمانيا', 'Berlin', 'برلين', 52.52, 13.405, 'Europe/Berlin', 'EUR', 'German', 'الألمانية', 'de', '230 V', 'C, F', '112', 'Sat–Sun'),
  C('it', 'Italy', 'إيطاليا', 'Rome', 'روما', 41.9028, 12.4964, 'Europe/Rome', 'EUR', 'Italian', 'الإيطالية', 'it', '230 V', 'C, F, L', '112', 'Sat–Sun'),
  C('es', 'Spain', 'إسبانيا', 'Madrid', 'مدريد', 40.4168, -3.7038, 'Europe/Madrid', 'EUR', 'Spanish', 'الإسبانية', 'es', '230 V', 'C, F', '112', 'Sat–Sun'),
  C('ch', 'Switzerland', 'سويسرا', 'Bern', 'برن', 46.948, 7.4474, 'Europe/Zurich', 'CHF', 'German, French, Italian', 'الألمانية والفرنسية والإيطالية', 'de', '230 V', 'C, J', '112 · 144 (ambulance)', 'Sat–Sun'),
  C('nl', 'Netherlands', 'هولندا', 'Amsterdam', 'أمستردام', 52.3676, 4.9041, 'Europe/Amsterdam', 'EUR', 'Dutch', 'الهولندية', undefined, '230 V', 'C, F', '112', 'Sat–Sun'),
  C('gr', 'Greece', 'اليونان', 'Athens', 'أثينا', 37.9838, 23.7275, 'Europe/Athens', 'EUR', 'Greek', 'اليونانية', undefined, '230 V', 'C, F', '112', 'Sat–Sun'),
  C('cy', 'Cyprus', 'قبرص', 'Nicosia', 'نيقوسيا', 35.1856, 33.3823, 'Asia/Nicosia', 'EUR', 'Greek, Turkish, English', 'اليونانية والتركية والإنجليزية', undefined, '240 V', 'G', '112', 'Sat–Sun'),
  C('us', 'United States', 'الولايات المتحدة', 'Washington, D.C.', 'واشنطن', 38.9072, -77.0369, 'America/New_York', 'USD', 'English', 'الإنجليزية', undefined, '120 V', 'A, B', '911', 'Sat–Sun'),
  C('ca', 'Canada', 'كندا', 'Ottawa', 'أوتاوا', 45.4215, -75.6972, 'America/Toronto', 'CAD', 'English, French', 'الإنجليزية والفرنسية', undefined, '120 V', 'A, B', '911', 'Sat–Sun'),
  C('br', 'Brazil', 'البرازيل', 'Brasília', 'برازيليا', -15.7939, -47.8828, 'America/Sao_Paulo', 'BRL', 'Portuguese', 'البرتغالية', 'pt', '127 / 220 V', 'N (also C)', '190 (police) · 192 (ambulance)', 'Sat–Sun'),
];

export interface Phrase {
  en: string;
  ar: string;
}
export const PHRASES: Phrase[] = [
  { en: 'Hello', ar: 'مرحباً' },
  { en: 'Good evening', ar: 'مساء الخير' },
  { en: 'Goodbye', ar: 'مع السلامة' },
  { en: 'Thank you', ar: 'شكراً' },
  { en: 'Please', ar: 'من فضلك' },
  { en: 'Yes / No', ar: 'نعم / لا' },
  { en: 'Excuse me / Sorry', ar: 'عفواً / آسف' },
  { en: 'Pleased to meet you', ar: 'تشرفت بمعرفتك' },
  { en: 'How much is this?', ar: 'بكم هذا؟' },
  { en: "I don't understand", ar: 'لا أفهم' },
  { en: 'Do you speak English?', ar: 'هل تتحدث الإنجليزية؟' },
  { en: 'Where is the hotel?', ar: 'أين الفندق؟' },
  { en: 'Where is the airport?', ar: 'أين المطار؟' },
  { en: 'The bill, please', ar: 'الحساب من فضلك' },
  { en: 'Water, please', ar: 'ماء من فضلك' },
  { en: 'Help!', ar: 'النجدة!' },
  { en: 'Where is the toilet?', ar: 'أين دورة المياه؟' },
];

export interface Language {
  code: string;
  speech: string;
  en: string;
  ar: string;
  /** one entry per PHRASES item: [written form, how to pronounce it] */
  words: [string, string][];
}
export const LANGUAGES: Language[] = [
  {
    code: 'zh', speech: 'zh-CN', en: 'Chinese (Mandarin)', ar: 'الصينية (الماندرين)',
    words: [['你好', 'nǐ hǎo (nee how)'], ['晚上好', 'wǎnshang hǎo (wahn-shahng how)'], ['再见', 'zàijiàn (dzai-jyen)'], ['谢谢', 'xièxie (shyeh-shyeh)'], ['请', 'qǐng (ching)'], ['是 / 不是', 'shì / bú shì (shr / boo shr)'], ['打扰一下 / 对不起', 'dǎrǎo yíxià / duìbuqǐ (dah-row ee-shyah / dway-boo-chee)'], ['很高兴认识您', 'hěn gāoxìng rènshi nín (hun gow-shing run-shr neen)'], ['这个多少钱？', 'zhège duōshao qián? (juh-guh dwoh-shaow chyen)'], ['我不明白', 'wǒ bù míngbai (woh boo ming-bye)'], ['您会说英语吗？', 'nín huì shuō yīngyǔ ma? (neen hway shwoh ying-yoo mah)'], ['酒店在哪里？', 'jiǔdiàn zài nǎlǐ? (jyoh-dyen dzai nah-lee)'], ['机场在哪里？', 'jīchǎng zài nǎlǐ? (jee-chahng dzai nah-lee)'], ['请买单', 'qǐng mǎidān (ching my-dan)'], ['请给我水', 'qǐng gěi wǒ shuǐ (ching gay woh shway)'], ['救命！', 'jiùmìng! (jyoh-ming)'], ['洗手间在哪里？', 'xǐshǒujiān zài nǎlǐ? (shee-shoh-jyen dzai nah-lee)']],
  },
  {
    code: 'ru', speech: 'ru-RU', en: 'Russian', ar: 'الروسية',
    words: [['Здравствуйте', 'zdrAstvuyte (ZDRAST-vooy-tye)'], ['Добрый вечер', 'dobry vecher (DOH-bry VYE-cher)'], ['До свидания', 'do svidaniya (da svee-DAH-nya)'], ['Спасибо', 'spasibo (spa-SEE-ba)'], ['Пожалуйста', 'pozhaluysta (pa-ZHAL-sta)'], ['Да / Нет', 'da / nyet (dah / nyet)'], ['Извините', 'izvinite (eez-vee-NEE-tye)'], ['Приятно познакомиться', 'priyatno poznakomitsya (pree-YAT-na paz-na-KOH-mit-sa)'], ['Сколько это стоит?', 'skolko eto stoit? (SKOL-ka E-ta STOH-eet)'], ['Я не понимаю', 'ya ne ponimayu (ya nye pa-nee-MA-yu)'], ['Вы говорите по-английски?', 'vy govorite po-angliyski? (vy ga-va-REE-tye pa-an-GLEE-skee)'], ['Где отель?', 'gde otel? (gdye a-TEL)'], ['Где аэропорт?', 'gde aeroport? (gdye a-e-ra-PORT)'], ['Счёт, пожалуйста', 'schyot, pozhaluysta (shchot pa-ZHAL-sta)'], ['Воду, пожалуйста', 'vodu, pozhaluysta (VO-doo pa-ZHAL-sta)'], ['Помогите!', 'pomogite! (pa-ma-GEE-tye)'], ['Где туалет?', 'gde tualet? (gdye too-a-LYET)']],
  },
  {
    code: 'tr', speech: 'tr-TR', en: 'Turkish', ar: 'التركية',
    words: [['Merhaba', 'mer-ha-BA'], ['İyi akşamlar', 'ee-YEE ak-sham-LAR'], ['Hoşça kalın', 'hosh-CHA ka-LUN'], ['Teşekkür ederim', 'te-shek-KUR e-de-RIM'], ['Lütfen', 'LOOT-fen'], ['Evet / Hayır', 'e-VET / HAH-yur'], ['Pardon / Özür dilerim', 'par-DON / uh-ZUR dee-le-RIM'], ['Tanıştığımıza memnun oldum', 'ta-nuh-shtuh-uh-muh-ZA mem-NOON ol-DUM'], ['Bu ne kadar?', 'boo ne ka-DAR'], ['Anlamıyorum', 'an-la-muh-yo-RUM'], ['İngilizce biliyor musunuz?', 'in-gee-LEEZ-je bee-lee-YOR moo-soo-NOOZ'], ['Otel nerede?', 'o-TEL ne-re-DE'], ['Havalimanı nerede?', 'HA-va-lee-ma-nuh ne-re-DE'], ['Hesap, lütfen', 'he-SAP LOOT-fen'], ['Su, lütfen', 'SOO LOOT-fen'], ['İmdat!', 'eem-DAT'], ['Tuvalet nerede?', 'too-va-LET ne-re-DE']],
  },
  {
    code: 'fr', speech: 'fr-FR', en: 'French', ar: 'الفرنسية',
    words: [['Bonjour', 'bon-ZHOOR'], ['Bonsoir', 'bon-SWAHR'], ['Au revoir', 'oh ruh-VWAHR'], ['Merci', 'mehr-SEE'], ["S'il vous plaît", 'seel voo PLEH'], ['Oui / Non', 'wee / nohn'], ['Excusez-moi / Pardon', 'ex-kew-zay MWAH / par-DOHN'], ['Enchanté', 'on-shon-TAY'], ['Combien ça coûte ?', 'kom-BYAN sah KOOT'], ['Je ne comprends pas', 'zhuh nuh kom-PRON pah'], ['Parlez-vous anglais ?', 'par-lay-VOO on-GLAY'], ["Où est l'hôtel ?", 'oo eh lo-TEL'], ["Où est l'aéroport ?", 'oo eh la-ay-ro-POR'], ["L'addition, s'il vous plaît", 'la-dee-SYON seel voo PLEH'], ["De l'eau, s'il vous plaît", 'duh LOH seel voo PLEH'], ['Au secours !', 'oh suh-KOOR'], ['Où sont les toilettes ?', 'oo son lay twa-LET']],
  },
  {
    code: 'de', speech: 'de-DE', en: 'German', ar: 'الألمانية',
    words: [['Guten Tag', 'GOO-ten TAHK'], ['Guten Abend', 'GOO-ten AH-bent'], ['Auf Wiedersehen', 'owf VEE-der-zay-en'], ['Danke', 'DAHN-keh'], ['Bitte', 'BIT-teh'], ['Ja / Nein', 'yah / nine'], ['Entschuldigung', 'ent-SHOOL-dee-goong'], ['Freut mich', 'froyt mikh'], ['Was kostet das?', 'vahs KOS-tet dahs'], ['Ich verstehe nicht', 'ikh fer-SHTAY-eh nikht'], ['Sprechen Sie Englisch?', 'SHPREKH-en zee ENG-lish'], ['Wo ist das Hotel?', 'voh ist dahs ho-TEL'], ['Wo ist der Flughafen?', 'voh ist dair FLOOK-hah-fen'], ['Die Rechnung, bitte', 'dee REKH-noong BIT-teh'], ['Wasser, bitte', 'VAHS-ser BIT-teh'], ['Hilfe!', 'HIL-feh'], ['Wo ist die Toilette?', 'voh ist dee toy-LET-teh']],
  },
  {
    code: 'it', speech: 'it-IT', en: 'Italian', ar: 'الإيطالية',
    words: [['Buongiorno', 'bwon-JOR-no'], ['Buonasera', 'bwo-na-SE-ra'], ['Arrivederci', 'ar-ree-ve-DER-chee'], ['Grazie', 'GRAH-tsyeh'], ['Per favore', 'per fa-VO-re'], ['Sì / No', 'see / no'], ['Scusi / Mi dispiace', 'SKOO-zee / mee dees-PYAH-che'], ['Piacere', 'pya-CHE-re'], ['Quanto costa?', 'KWAN-to KOS-ta'], ['Non capisco', 'non ka-PEES-ko'], ['Parla inglese?', 'PAR-la een-GLE-ze'], ["Dov'è l'hotel?", 'do-VE lo-TEL'], ["Dov'è l'aeroporto?", 'do-VE la-e-ro-POR-to'], ['Il conto, per favore', 'eel KON-to per fa-VO-re'], ['Acqua, per favore', 'AK-kwa per fa-VO-re'], ['Aiuto!', 'a-YOO-to'], ["Dov'è il bagno?", 'do-VE eel BAH-nyo']],
  },
  {
    code: 'es', speech: 'es-ES', en: 'Spanish', ar: 'الإسبانية',
    words: [['Hola', 'OH-la'], ['Buenas tardes', 'BWE-nas TAR-des'], ['Adiós', 'a-DYOS'], ['Gracias', 'GRA-syas'], ['Por favor', 'por fa-VOR'], ['Sí / No', 'see / no'], ['Perdón / Disculpe', 'per-DON / dees-KOOL-peh'], ['Mucho gusto', 'MOO-cho GOOS-to'], ['¿Cuánto cuesta?', 'KWAN-to KWES-ta'], ['No entiendo', 'no en-TYEN-do'], ['¿Habla inglés?', 'AH-bla een-GLES'], ['¿Dónde está el hotel?', 'DON-de es-TA el o-TEL'], ['¿Dónde está el aeropuerto?', 'DON-de es-TA el a-e-ro-PWER-to'], ['La cuenta, por favor', 'la KWEN-ta por fa-VOR'], ['Agua, por favor', 'A-gwa por fa-VOR'], ['¡Ayuda!', 'a-YOO-da'], ['¿Dónde está el baño?', 'DON-de es-TA el BA-nyo']],
  },
  {
    code: 'pt', speech: 'pt-BR', en: 'Portuguese (Brazil)', ar: 'البرتغالية (البرازيل)',
    words: [['Olá', 'oh-LAH'], ['Boa noite', 'BOH-ah NOY-chee'], ['Tchau / Adeus', 'chow / a-DEH-oos'], ['Obrigado', 'oh-bree-GAH-doo'], ['Por favor', 'poor fa-VOR'], ['Sim / Não', 'seem / nowng'], ['Com licença / Desculpe', 'kong lee-SEN-sa / des-KOOL-pee'], ['Prazer em conhecê-lo', 'pra-ZER eng ko-nye-SAY-loo'], ['Quanto custa?', 'KWAN-too KOOS-ta'], ['Não entendo', 'nowng en-TEN-doo'], ['O senhor fala inglês?', 'oo sen-YOR FA-la een-GLESS'], ['Onde fica o hotel?', 'ON-jee FEE-ka oo oh-TEL'], ['Onde fica o aeroporto?', 'ON-jee FEE-ka oo a-eh-ro-PORT-oo'], ['A conta, por favor', 'a KON-ta poor fa-VOR'], ['Água, por favor', 'AH-gwa poor fa-VOR'], ['Socorro!', 'so-KO-hoo'], ['Onde fica o banheiro?', 'ON-jee FEE-ka oo ban-YAY-roo']],
  },
  {
    code: 'hi', speech: 'hi-IN', en: 'Hindi', ar: 'الهندية',
    words: [['नमस्ते', 'namaste (na-mas-TAY)'], ['शुभ संध्या', 'shubh sandhya (shoobh SUN-dhya)'], ['अलविदा', 'alvida (al-vi-DAA)'], ['धन्यवाद', 'dhanyavaad (dhun-ya-VAAD)'], ['कृपया', 'kripya (KRIP-ya)'], ['हाँ / नहीं', 'haan / nahin (haan / na-HEEN)'], ['माफ़ कीजिए', 'maaf kijiye (maaf KEE-ji-yay)'], ['आपसे मिलकर खुशी हुई', 'aapse milkar khushi hui (aap-SAY mil-KAR KHOO-shee HOO-ee)'], ['यह कितने का है?', 'yeh kitne ka hai? (yay KIT-nay ka hai)'], ['मुझे समझ नहीं आया', 'mujhe samajh nahin aaya (moo-JAY sa-MUJ na-HEEN AA-ya)'], ['क्या आप अंग्रेज़ी बोलते हैं?', 'kya aap angrezi bolte hain? (kya aap ung-RAY-zee BOL-tay hain)'], ['होटल कहाँ है?', 'hotel kahaan hai? (ho-TEL ka-HAAN hai)'], ['हवाई अड्डा कहाँ है?', 'havai adda kahaan hai? (ha-VAI UD-da ka-HAAN hai)'], ['बिल दीजिए', 'bill dijiye (bill DEE-ji-yay)'], ['पानी दीजिए', 'paani dijiye (PAA-nee DEE-ji-yay)'], ['बचाओ!', 'bachao! (ba-CHAO)'], ['शौचालय कहाँ है?', 'shauchalay kahaan hai? (show-cha-LAY ka-HAAN hai)']],
  },
  {
    code: 'ja', speech: 'ja-JP', en: 'Japanese', ar: 'اليابانية',
    words: [['こんにちは', 'konnichiwa (kon-nee-chee-wah)'], ['こんばんは', 'konbanwa (kon-ban-wah)'], ['さようなら', 'sayonara (sah-yoh-nah-rah)'], ['ありがとうございます', 'arigatō gozaimasu (ah-ree-gah-toh go-zai-mahs)'], ['お願いします', 'onegaishimasu (oh-neh-gai-shee-mahs)'], ['はい / いいえ', 'hai / iie (hai / ee-eh)'], ['すみません', 'sumimasen (soo-mee-mah-sen)'], ['はじめまして', 'hajimemashite (hah-jee-meh-mah-shee-teh)'], ['いくらですか？', 'ikura desu ka? (ee-koo-rah dess kah)'], ['わかりません', 'wakarimasen (wah-kah-ree-mah-sen)'], ['英語を話せますか？', 'eigo o hanasemasu ka? (ay-go oh hah-nah-seh-mahs kah)'], ['ホテルはどこですか？', 'hoteru wa doko desu ka? (ho-teh-roo wah doh-koh dess kah)'], ['空港はどこですか？', 'kūkō wa doko desu ka? (koo-koh wah doh-koh dess kah)'], ['お会計をお願いします', 'okaikei o onegaishimasu (oh-kai-kay oh oh-neh-gai-shee-mahs)'], ['お水をください', 'omizu o kudasai (oh-mee-zoo oh koo-dah-sai)'], ['助けて！', 'tasukete! (tah-soo-keh-teh)'], ['トイレはどこですか？', 'toire wa doko desu ka? (toy-reh wah doh-koh dess kah)']],
  },
  {
    code: 'sw', speech: 'sw-KE', en: 'Swahili', ar: 'السواحيلية',
    words: [['Hujambo', 'hoo-JAM-bo'], ['Habari za jioni', 'ha-BA-ree za JEE-oh-nee'], ['Kwaheri', 'kwa-HE-ree'], ['Asante', 'a-SAN-teh'], ['Tafadhali', 'ta-fad-HA-lee'], ['Ndiyo / Hapana', 'n-DEE-yo / ha-PA-na'], ['Samahani', 'sa-ma-HA-nee'], ['Nafurahi kukutana nawe', 'na-foo-RA-hee koo-koo-TA-na NA-weh'], ['Hii ni bei gani?', 'hee-ee nee BAY GA-nee'], ['Sielewi', 'see-eh-LE-wee'], ['Unazungumza Kiingereza?', 'oo-na-zoon-GOOM-za kee-een-ge-RE-za'], ['Hoteli iko wapi?', 'ho-TE-lee EE-ko WA-pee'], ['Uwanja wa ndege uko wapi?', 'oo-WAN-ja wa N-DE-ge OO-ko WA-pee'], ['Naomba bili', 'na-OM-ba BEE-lee'], ['Naomba maji', 'na-OM-ba MA-jee'], ['Msaada!', 'm-sa-A-da'], ['Choo kiko wapi?', 'CHO-o KEE-ko WA-pee']],
  },
];

/** straight-line bearing from a place to the Kaaba, in degrees clockwise from north (Qibla direction) */
export function qiblaBearing(lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const kLat = 21.4225 * rad;
  const kLon = 39.8262 * rad;
  const p = lat * rad;
  const dl = kLon - lon * rad;
  const y = Math.sin(dl);
  const x = Math.cos(p) * Math.tan(kLat) - Math.sin(p) * Math.cos(dl);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

export const WEATHER_CODES: Record<number, { en: string; ar: string; icon: string }> = {
  0: { en: 'Clear sky', ar: 'سماء صافية', icon: '☀️' },
  1: { en: 'Mostly clear', ar: 'صافٍ غالباً', icon: '🌤️' },
  2: { en: 'Partly cloudy', ar: 'غائم جزئياً', icon: '⛅' },
  3: { en: 'Overcast', ar: 'غائم', icon: '☁️' },
  45: { en: 'Fog', ar: 'ضباب', icon: '🌫️' },
  48: { en: 'Freezing fog', ar: 'ضباب متجمد', icon: '🌫️' },
  51: { en: 'Light drizzle', ar: 'رذاذ خفيف', icon: '🌦️' },
  53: { en: 'Drizzle', ar: 'رذاذ', icon: '🌦️' },
  55: { en: 'Heavy drizzle', ar: 'رذاذ كثيف', icon: '🌧️' },
  56: { en: 'Freezing drizzle', ar: 'رذاذ متجمد', icon: '🌧️' },
  57: { en: 'Freezing drizzle', ar: 'رذاذ متجمد', icon: '🌧️' },
  61: { en: 'Light rain', ar: 'مطر خفيف', icon: '🌦️' },
  63: { en: 'Rain', ar: 'مطر', icon: '🌧️' },
  65: { en: 'Heavy rain', ar: 'مطر غزير', icon: '🌧️' },
  66: { en: 'Freezing rain', ar: 'مطر متجمد', icon: '🌧️' },
  67: { en: 'Freezing rain', ar: 'مطر متجمد', icon: '🌧️' },
  71: { en: 'Light snow', ar: 'ثلج خفيف', icon: '🌨️' },
  73: { en: 'Snow', ar: 'ثلج', icon: '🌨️' },
  75: { en: 'Heavy snow', ar: 'ثلج كثيف', icon: '❄️' },
  77: { en: 'Snow grains', ar: 'حبيبات ثلج', icon: '🌨️' },
  80: { en: 'Light showers', ar: 'زخات خفيفة', icon: '🌦️' },
  81: { en: 'Showers', ar: 'زخات مطر', icon: '🌧️' },
  82: { en: 'Violent showers', ar: 'زخات عنيفة', icon: '⛈️' },
  85: { en: 'Snow showers', ar: 'زخات ثلج', icon: '🌨️' },
  86: { en: 'Heavy snow showers', ar: 'زخات ثلج كثيفة', icon: '❄️' },
  95: { en: 'Thunderstorm', ar: 'عاصفة رعدية', icon: '⛈️' },
  96: { en: 'Thunderstorm with hail', ar: 'عاصفة رعدية مع برد', icon: '⛈️' },
  99: { en: 'Thunderstorm with hail', ar: 'عاصفة رعدية مع برد', icon: '⛈️' },
};

/** hours between Cairo and a time zone right now (DST aware) */
export const hoursFromCairo = (tz: string): number => {
  const now = new Date();
  const wall = (z: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(now).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  };
  return Math.round(((wall(tz) - wall('Africa/Cairo')) / 3_600_000) * 2) / 2;
};


/**
 * Popular business cities, searchable offline and in Arabic or with common spellings.
 * [English name, Arabic name, country (English), lat, lon, timezone, extra spellings]
 */
export const CITIES: [string, string, string, number, number, string, string][] = [
  ['Cairo', 'القاهرة', 'Egypt', 30.0444, 31.2357, 'Africa/Cairo', 'kairo qahira el cairo'],
  ['Giza', 'الجيزة', 'Egypt', 30.0131, 31.2089, 'Africa/Cairo', 'gizeh'],
  ['Alexandria', 'الإسكندرية', 'Egypt', 31.2001, 29.9187, 'Africa/Cairo', 'iskandariya alex اسكندرية'],
  ['New Administrative Capital', 'العاصمة الإدارية الجديدة', 'Egypt', 30.0197, 31.7555, 'Africa/Cairo', 'nac new capital'],
  ['Port Said', 'بورسعيد', 'Egypt', 31.2653, 32.3019, 'Africa/Cairo', 'bur said'],
  ['Sharm El Sheikh', 'شرم الشيخ', 'Egypt', 27.9158, 34.33, 'Africa/Cairo', 'sharm'],
  ['Hurghada', 'الغردقة', 'Egypt', 27.2579, 33.8116, 'Africa/Cairo', 'ghardaqa'],
  ['Ain Sokhna', 'العين السخنة', 'Egypt', 29.6, 32.3167, 'Africa/Cairo', 'sokhna sukhna'],
  ['Luxor', 'الأقصر', 'Egypt', 25.6872, 32.6396, 'Africa/Cairo', 'aqsur'],
  ['Aswan', 'أسوان', 'Egypt', 24.0889, 32.8998, 'Africa/Cairo', ''],
  ['Dar es Salaam', 'دار السلام', 'Tanzania', -6.7924, 39.2083, 'Africa/Dar_es_Salaam', 'das es salam das esalam dar es salam dar al salam daressalam dar salaam das salam dsm'],
  ['Dodoma', 'دودوما', 'Tanzania', -6.163, 35.7516, 'Africa/Dar_es_Salaam', ''],
  ['Nairobi', 'نيروبي', 'Kenya', -1.2921, 36.8219, 'Africa/Nairobi', ''],
  ['Addis Ababa', 'أديس أبابا', 'Ethiopia', 9.03, 38.74, 'Africa/Addis_Ababa', 'addis'],
  ['Kampala', 'كمبالا', 'Uganda', 0.3476, 32.5825, 'Africa/Kampala', ''],
  ['Lagos', 'لاغوس', 'Nigeria', 6.5244, 3.3792, 'Africa/Lagos', 'lagos'],
  ['Abuja', 'أبوجا', 'Nigeria', 9.0765, 7.3986, 'Africa/Lagos', ''],
  ['Johannesburg', 'جوهانسبرغ', 'South Africa', -26.2041, 28.0473, 'Africa/Johannesburg', 'joburg'],
  ['Cape Town', 'كيب تاون', 'South Africa', -33.9249, 18.4241, 'Africa/Johannesburg', ''],
  ['Casablanca', 'الدار البيضاء', 'Morocco', 33.5731, -7.5898, 'Africa/Casablanca', ''],
  ['Algiers', 'الجزائر', 'Algeria', 36.7538, 3.0588, 'Africa/Algiers', 'alger'],
  ['Tunis', 'تونس', 'Tunisia', 36.8065, 10.1815, 'Africa/Tunis', ''],
  ['Tripoli', 'طرابلس', 'Libya', 32.8872, 13.1913, 'Africa/Tripoli', ''],
  ['Khartoum', 'الخرطوم', 'Sudan', 15.5007, 32.5599, 'Africa/Khartoum', ''],
  ['Djibouti', 'جيبوتي', 'Djibouti', 11.5721, 43.1456, 'Africa/Djibouti', ''],
  ['Riyadh', 'الرياض', 'Saudi Arabia', 24.7136, 46.6753, 'Asia/Riyadh', ''],
  ['Jeddah', 'جدة', 'Saudi Arabia', 21.4858, 39.1925, 'Asia/Riyadh', 'jedda'],
  ['Dammam', 'الدمام', 'Saudi Arabia', 26.4207, 50.0888, 'Asia/Riyadh', ''],
  ['Dubai', 'دبي', 'United Arab Emirates', 25.2048, 55.2708, 'Asia/Dubai', ''],
  ['Abu Dhabi', 'أبوظبي', 'United Arab Emirates', 24.4539, 54.3773, 'Asia/Dubai', ''],
  ['Doha', 'الدوحة', 'Qatar', 25.2854, 51.531, 'Asia/Qatar', ''],
  ['Kuwait City', 'مدينة الكويت', 'Kuwait', 29.3759, 47.9774, 'Asia/Kuwait', 'kuwait'],
  ['Manama', 'المنامة', 'Bahrain', 26.2285, 50.586, 'Asia/Bahrain', ''],
  ['Muscat', 'مسقط', 'Oman', 23.588, 58.3829, 'Asia/Muscat', ''],
  ['Baghdad', 'بغداد', 'Iraq', 33.3152, 44.3661, 'Asia/Baghdad', ''],
  ['Amman', 'عمّان', 'Jordan', 31.9454, 35.9284, 'Asia/Amman', 'aman'],
  ['Beirut', 'بيروت', 'Lebanon', 33.8938, 35.5018, 'Asia/Beirut', ''],
  ['Istanbul', 'إسطنبول', 'Türkiye', 41.0082, 28.9784, 'Europe/Istanbul', 'istanbul'],
  ['Ankara', 'أنقرة', 'Türkiye', 39.9334, 32.8597, 'Europe/Istanbul', ''],
  ['London', 'لندن', 'United Kingdom', 51.5072, -0.1276, 'Europe/London', ''],
  ['Paris', 'باريس', 'France', 48.8566, 2.3522, 'Europe/Paris', ''],
  ['Berlin', 'برلين', 'Germany', 52.52, 13.405, 'Europe/Berlin', ''],
  ['Frankfurt', 'فرانكفورت', 'Germany', 50.1109, 8.6821, 'Europe/Berlin', ''],
  ['Madrid', 'مدريد', 'Spain', 40.4168, -3.7038, 'Europe/Madrid', ''],
  ['Rome', 'روما', 'Italy', 41.9028, 12.4964, 'Europe/Rome', ''],
  ['Milan', 'ميلانو', 'Italy', 45.4642, 9.19, 'Europe/Rome', ''],
  ['Zurich', 'زيورخ', 'Switzerland', 47.3769, 8.5417, 'Europe/Zurich', ''],
  ['Geneva', 'جنيف', 'Switzerland', 46.2044, 6.1432, 'Europe/Zurich', ''],
  ['Moscow', 'موسكو', 'Russia', 55.7558, 37.6173, 'Europe/Moscow', ''],
  ['New York', 'نيويورك', 'United States', 40.7128, -74.006, 'America/New_York', 'nyc'],
  ['Washington', 'واشنطن', 'United States', 38.9072, -77.0369, 'America/New_York', 'dc'],
  ['Los Angeles', 'لوس أنجلوس', 'United States', 34.0522, -118.2437, 'America/Los_Angeles', 'la'],
  ['Houston', 'هيوستن', 'United States', 29.7604, -95.3698, 'America/Chicago', ''],
  ['Toronto', 'تورونتو', 'Canada', 43.6532, -79.3832, 'America/Toronto', ''],
  ['Sao Paulo', 'ساو باولو', 'Brazil', -23.5505, -46.6333, 'America/Sao_Paulo', 'são paulo'],
  ['Beijing', 'بكين', 'China', 39.9042, 116.4074, 'Asia/Shanghai', 'peking'],
  ['Shanghai', 'شنغهاي', 'China', 31.2304, 121.4737, 'Asia/Shanghai', 'shanghai shangai'],
  ['Shenzhen', 'شنتشن', 'China', 22.5431, 114.0579, 'Asia/Shanghai', 'shenzen'],
  ['Guangzhou', 'قوانغتشو', 'China', 23.1291, 113.2644, 'Asia/Shanghai', 'canton guangjou جوانزو غوانغتشو'],
  ['Hong Kong', 'هونغ كونغ', 'China', 22.3193, 114.1694, 'Asia/Hong_Kong', 'hongkong هونج كونج'],
  ['Chengdu', 'تشنغدو', 'China', 30.5728, 104.0668, 'Asia/Shanghai', ''],
  ['Wuhan', 'ووهان', 'China', 30.5928, 114.3055, 'Asia/Shanghai', ''],
  ['Hangzhou', 'هانغتشو', 'China', 30.2741, 120.1551, 'Asia/Shanghai', ''],
  ['Tianjin', 'تيانجين', 'China', 39.3434, 117.3616, 'Asia/Shanghai', ''],
  ['Xi\'an', 'شيان', 'China', 34.3416, 108.9398, 'Asia/Shanghai', 'xian'],
  ['Suzhou', 'سوتشو', 'China', 31.2989, 120.5853, 'Asia/Shanghai', ''],
  ['Nanjing', 'نانجينغ', 'China', 32.0603, 118.7969, 'Asia/Shanghai', ''],
  ['Qingdao', 'تشينغداو', 'China', 36.0671, 120.3826, 'Asia/Shanghai', ''],
  ['Dalian', 'داليان', 'China', 38.914, 121.6147, 'Asia/Shanghai', ''],
  ['Xiamen', 'شيامن', 'China', 24.4798, 118.0894, 'Asia/Shanghai', ''],
  ['Tokyo', 'طوكيو', 'Japan', 35.6762, 139.6503, 'Asia/Tokyo', ''],
  ['Osaka', 'أوساكا', 'Japan', 34.6937, 135.5023, 'Asia/Tokyo', ''],
  ['Seoul', 'سيول', 'South Korea', 37.5665, 126.978, 'Asia/Seoul', ''],
  ['Singapore', 'سنغافورة', 'Singapore', 1.3521, 103.8198, 'Asia/Singapore', ''],
  ['Kuala Lumpur', 'كوالالمبور', 'Malaysia', 3.139, 101.6869, 'Asia/Kuala_Lumpur', ''],
  ['Jakarta', 'جاكرتا', 'Indonesia', -6.2088, 106.8456, 'Asia/Jakarta', ''],
  ['Bangkok', 'بانكوك', 'Thailand', 13.7563, 100.5018, 'Asia/Bangkok', ''],
  ['Mumbai', 'مومباي', 'India', 19.076, 72.8777, 'Asia/Kolkata', 'bombay'],
  ['New Delhi', 'نيودلهي', 'India', 28.6139, 77.209, 'Asia/Kolkata', 'delhi'],
  ['Karachi', 'كراتشي', 'Pakistan', 24.8607, 67.0011, 'Asia/Karachi', ''],
  ['Sydney', 'سيدني', 'Australia', -33.8688, 151.2093, 'Australia/Sydney', ''],
];
