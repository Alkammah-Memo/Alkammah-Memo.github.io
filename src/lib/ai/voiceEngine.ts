/** Which voice engine Spero uses. "live" (default) is the natural Gemini Live voice; when every Live key is used up, Spero switches to "economy" by itself. */
export type VoiceEngine = 'economy' | 'live';

// new key: everyone starts on Live again (the old key held the previous Economy default)
const KEY = 'alkammah_voice_engine_v2';

export function getVoiceEngine(): VoiceEngine {
  try {
    return localStorage.getItem(KEY) === 'economy' ? 'economy' : 'live';
  } catch {
    return 'live';
  }
}

export function setVoiceEngine(engine: VoiceEngine): void {
  try {
    localStorage.setItem(KEY, engine);
  } catch {
    /* ignore */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Makes a model reply fit for speaking aloud: no markdown symbols, no lists, and at most ~3 short sentences. */
export function cleanForSpeech(text: string, maxChars = 320): string {
  let t = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>~|]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('؟'), cut.lastIndexOf('?'), cut.lastIndexOf('!'), cut.lastIndexOf('،'));
  t = (end > 40 ? cut.slice(0, end + 1) : cut).trim();
  return t;
}

const LANG_KEY = 'alkammah_voice_lang';
export type VoiceLang = 'ar' | 'en';

/** Language the CEO speaks to Spero in (speech recognition accepts one language at a time). Arabic by default. */
export function getVoiceLang(): VoiceLang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export function setVoiceLang(l: VoiceLang): void {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* ignore */
  }
}

/** True when most letters in the text are Arabic, so the right voice can be chosen whatever the app language is. */
export function looksArabic(text: string): boolean {
  const letters = String(text).match(/\p{L}/gu) || [];
  if (letters.length === 0) return false;
  const arabic = letters.filter((c) => /[\u0600-\u06FF]/.test(c)).length;
  return arabic / letters.length > 0.3;
}
