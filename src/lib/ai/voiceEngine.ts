/** Which voice engine Spero uses. "economy" costs nothing and lasts for hours; "live" is the natural Gemini Live voice and uses far more quota. */
export type VoiceEngine = 'economy' | 'live';

const KEY = 'alkammah_voice_engine';

export function getVoiceEngine(): VoiceEngine {
  try {
    return localStorage.getItem(KEY) === 'live' ? 'live' : 'economy';
  } catch {
    return 'economy';
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
