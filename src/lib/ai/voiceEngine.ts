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
