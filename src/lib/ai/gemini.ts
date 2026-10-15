/**
 * Browser-side Gemini client. Replaces the old Express endpoints (/api/ai/*) so the app can be
 * hosted as a static site. Every call is wrapped in key failover (see keyManager.ts).
 */
import { GoogleGenAI, Type, Modality } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { keyManager, runWithFailover, classifyError, DEFAULT_MODELS } from './keyManager';
import type { ModelSettings } from './keyManager';
import {
  EXECUTIVE_TOOLS,
  WORKSTREAMS,
  chatSystemInstruction,
  SPERO_PERSONA,
  SPERO_TOOL_RULES,
  cairoNowLabel,
  cairoNowIsoLabel,
} from './tools';
import { pcmBase64ToWavBase64 } from './audioUtils';
import type { ExtractedCandidate } from '../../types';

const clients = new Map<string, GoogleGenAI>();
export function clientFor(apiKey: string): GoogleGenAI {
  let c = clients.get(apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey });
    clients.set(apiKey, c);
  }
  return c;
}

type GenParams = Omit<GenerateContentParameters, 'model'>;

/** Tries each model on the current key; a rejected key aborts the model loop so the next key can try. */
async function generate(models: string[], params: GenParams): Promise<GenerateContentResponse> {
  const unique = [...new Set(models.filter(Boolean))];
  return runWithFailover(async (apiKey) => {
    const ai = clientFor(apiKey);
    let lastError: unknown;
    for (const model of unique) {
      try {
        return await ai.models.generateContent({ ...params, model });
      } catch (err) {
        lastError = err;
        if (classifyError(err).kind === 'auth') throw err;
      }
    }
    throw lastError;
  });
}

const models = (): ModelSettings => keyManager.getSettings().models;

export interface FunctionCallResult {
  name: string;
  args: Record<string, unknown>;
}

function extractCalls(res: GenerateContentResponse): FunctionCallResult[] {
  return (res.functionCalls || []).map((fc) => ({
    name: String(fc.name || ''),
    args: (fc.args || {}) as Record<string, unknown>,
  }));
}

export async function chatWithAssistant(
  message: string,
  context: unknown
): Promise<{ content: string; functionCalls: FunctionCallResult[] }> {
  const m = models();
  const contextSummary = context ? `\n[Current Workspace Summary]: ${JSON.stringify(context)}` : '';
  const res = await generate([m.chat, ...m.chatFallbacks], {
    contents: `${message}${contextSummary}`,
    config: { systemInstruction: chatSystemInstruction(), tools: EXECUTIVE_TOOLS },
  });
  return { content: res.text || '', functionCalls: extractCalls(res) };
}

export async function transcribeAudio(audioBase64: string, mimeType?: string): Promise<string> {
  const m = models();
  const clean = audioBase64.replace(/^data:audio\/[\w.+-]+;base64,/, '');
  const res = await generate([m.transcribe, m.chat, ...m.chatFallbacks], {
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType || 'audio/webm', data: clean } },
        {
          text: 'Transcribe this executive audio accurately. The speaker may speak Arabic (Egyptian or Modern Standard), English, or mixed English and Arabic. Return only the verbatim transcription text.',
        },
      ],
    },
  });
  return res.text || '';
}

export interface VoiceFastResult {
  text: string;
  audio: string; // base64 WAV (empty when TTS unavailable)
  functionCalls: FunctionCallResult[];
}

export async function voiceFastQuery(
  query: string,
  locale: 'en' | 'ar',
  context: unknown
): Promise<VoiceFastResult> {
  const m = models();
  const prompt = `${SPERO_PERSONA}
التوقيت الحالي في القاهرة: ${cairoNowLabel()} (ISO محلي: ${cairoNowIsoLabel()}).
${SPERO_TOOL_RULES}
طلب القماح: "${query}"
${context ? `سياق النظام والمواعيد الحالية: ${JSON.stringify(context)}` : 'سياق النظام: لا توجد اجتماعات مسجلة حالياً.'}`;

  const res = await generate([m.chat, ...m.chatFallbacks], {
    contents: prompt,
    config: { temperature: 0.3, maxOutputTokens: 400, tools: EXECUTIVE_TOOLS },
  });

  const functionCalls = extractCalls(res);
  const text =
    res.text ||
    (functionCalls.length > 0
      ? 'تم تنفيذ الطلب وتسجيله، المهندس محمد.'
      : locale === 'ar'
      ? 'أهلاً بحضرتك، المهندس محمد. أنا في خدمتك.'
      : 'Understood, Eng. Mohamed. I am processing your request.');

  let audio = '';
  try {
    const tts = await generate([m.tts], {
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: m.voiceName || 'Zephyr' } } },
      },
    });
    const pcm = tts.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data || '';
    audio = pcm ? pcmBase64ToWavBase64(pcm, 24000) : '';
  } catch (err) {
    console.warn('[TTS] unavailable, falling back to browser speech:', err);
  }

  return { text, audio, functionCalls };
}

const INK_PROMPT = `You are an expert bilingual executive document transcriber and assistant specializing in executive planners, meetings, industrial projects, land concessions, and infrastructure development.
Examine this handwritten or typed note snippet carefully. It may contain Arabic handwriting, English handwriting, or mixed Arabic/English.
Key reference contexts include:
- Ras El Hekma, SCZone Qantara land, New Capital, Minya & Fayoum, Golden Triangle / Xingfa, Libya MOU / visit, SUMEC agreement, Automotive City, Port Said land, Djibouti / AGL, Safaga, Tanzania.
- Handwritten aliases and initials: SS, YA, MM, MK, AT, HA, MA, IS, Eng. Ahmed Elsewedy.
- Numbered rows, arrows pointing to next actions, terms like "ongoing" or "on hold", and owner initials at the right.

CRITICAL DISTINCTION BETWEEN MEETINGS AND TASKS:
- If the note mentions a meeting, appointment, discussion session, conference, call, interview, or includes a specific clock time (e.g. "Walid meeting CRM 6:00 PM", "meeting tomorrow at 3pm", "اجتماع الساعة العاشرة", "call with X"):
  -> entryType: "meeting".
  -> suggestedMeetingDate (YYYY-MM-DD; resolve "today"/"tomorrow"/weekday names against the current Cairo date given below),
     suggestedStartTime as 24-hour HH:MM (6:00 PM becomes 18:00), suggestedEndTime as 24-hour HH:MM (one hour after start when not written),
     suggestedAttendees (names/aliases mentioned) and suggestedLocation (only if written).
- Otherwise, if it is a general to-do, action item, deliverable or milestone without a scheduled time:
  -> entryType: "task", with suggestedDueDate (YYYY-MM-DD) only if indicated.

- DO NOT invent facts or expand unverified initials into made-up full names. If something is unclear, list it in uncertainFields.
- Extract every actionable item or note as a structured candidate.

Return JSON adhering strictly to the schema.`;

const INK_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      entryType: { type: Type.STRING, enum: ['task', 'meeting'] },
      rawTextArabic: { type: Type.STRING },
      rawTextEnglish: { type: Type.STRING },
      suggestedTitle: { type: Type.STRING },
      suggestedWorkstream: { type: Type.STRING, enum: WORKSTREAMS },
      suggestedDepartment: { type: Type.STRING },
      suggestedProject: { type: Type.STRING },
      suggestedOwnerAlias: { type: Type.STRING },
      suggestedDueDate: { type: Type.STRING },
      suggestedMeetingDate: { type: Type.STRING },
      suggestedStartTime: { type: Type.STRING },
      suggestedEndTime: { type: Type.STRING },
      suggestedAttendees: { type: Type.ARRAY, items: { type: Type.STRING } },
      suggestedLocation: { type: Type.STRING },
      suggestedNextAction: { type: Type.STRING },
      confidenceScore: { type: Type.NUMBER },
      uncertainFields: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['suggestedTitle', 'suggestedWorkstream', 'confidenceScore', 'uncertainFields'],
  },
};

export async function extractInkCandidates(
  imageBase64: string,
  pageId: string,
  boundingBox?: { x: number; y: number; width: number; height: number }
): Promise<ExtractedCandidate[]> {
  const m = models();
  const res = await generate([m.vision, m.chat, ...m.chatFallbacks], {
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: imageBase64.replace(/^data:image\/\w+;base64,/, '') } },
        { text: `${INK_PROMPT}\n\nCurrent Cairo date/time: ${cairoNowIsoLabel()}` },
      ],
    },
    config: { responseMimeType: 'application/json', responseSchema: INK_SCHEMA },
  });

  let parsed: Record<string, unknown>[] = [];
  try {
    const raw = JSON.parse(res.text || '[]');
    parsed = Array.isArray(raw) ? raw : [];
  } catch {
    parsed = [];
  }

  return parsed.map((item, idx) => {
    const isMeeting = item.entryType === 'meeting';
    const uncertain = Array.isArray(item.uncertainFields) ? (item.uncertainFields as string[]) : [];
    if (isMeeting && !item.suggestedStartTime && !uncertain.includes('time')) uncertain.push('time');
    return {
      id: `cand-${Date.now()}-${idx}`,
      pageId: pageId || 'unknown',
      entryType: isMeeting ? 'meeting' : 'task',
      boundingBox: boundingBox || { x: 0, y: 0, width: 100, height: 100 },
      rawTextArabic: String(item.rawTextArabic || ''),
      rawTextEnglish: String(item.rawTextEnglish || ''),
      suggestedTitle: String(item.suggestedTitle || (isMeeting ? 'Executive Meeting' : 'Extracted Action Item')),
      suggestedWorkstream: (item.suggestedWorkstream as ExtractedCandidate['suggestedWorkstream']) ||
        (isMeeting ? 'Executive Meetings & Decisions' : 'Commercial + New Lands'),
      suggestedDepartment: String(item.suggestedDepartment || 'Executive Office'),
      suggestedProject: String(item.suggestedProject || ''),
      suggestedOwnerAlias: String(item.suggestedOwnerAlias || 'Unassigned'),
      suggestedDueDate: item.suggestedDueDate ? String(item.suggestedDueDate) : undefined,
      suggestedMeetingDate: item.suggestedMeetingDate
        ? String(item.suggestedMeetingDate)
        : item.suggestedDueDate
        ? String(item.suggestedDueDate)
        : undefined,
      suggestedStartTime: String(item.suggestedStartTime || '10:00'),
      suggestedEndTime: String(item.suggestedEndTime || '11:00'),
      suggestedAttendees: Array.isArray(item.suggestedAttendees) ? (item.suggestedAttendees as string[]) : [],
      suggestedLocation: String(item.suggestedLocation || ''),
      suggestedNextAction: String(item.suggestedNextAction || ''),
      confidenceScore: typeof item.confidenceScore === 'number' ? item.confidenceScore : 0.7,
      uncertainFields: uncertain,
      status: 'pending_review' as const,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Key testing (Settings page)
// ---------------------------------------------------------------------------------------------

export interface KeyTestResult {
  ok: boolean;
  rest: { ok: boolean; message: string; model?: string; latencyMs?: number };
  live: { ok: boolean; message: string; latencyMs?: number };
}

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

/** Verifies one key end to end: a real generateContent call and a Live API handshake. */
export async function testGeminiKey(apiKey: string, m: ModelSettings = DEFAULT_MODELS): Promise<KeyTestResult> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const result: KeyTestResult = {
    ok: false,
    rest: { ok: false, message: 'Not tested' },
    live: { ok: false, message: 'Not tested' },
  };

  const candidates = [...new Set([m.chat, ...m.chatFallbacks].filter(Boolean))];
  let lastRestError = '';
  for (const model of candidates) {
    const started = performance.now();
    try {
      const res = await withTimeout(
        ai.models.generateContent({ model, contents: 'Reply with the single word: OK', config: { maxOutputTokens: 16 } }),
        15000,
        'Request'
      );
      if (res.text !== undefined) {
        result.rest = {
          ok: true,
          message: model === m.chat ? 'Connected' : `Connected using fallback model ${model}`,
          model,
          latencyMs: Math.round(performance.now() - started),
        };
        break;
      }
    } catch (err) {
      const c = classifyError(err);
      lastRestError = c.message;
      if (c.kind === 'auth' || c.kind === 'quota') {
        result.rest = { ok: false, message: c.message };
        break; // another model will not fix a bad or exhausted key
      }
      result.rest = { ok: false, message: c.message };
    }
  }
  if (!result.rest.ok && !result.rest.message) result.rest.message = lastRestError || 'Request failed';

  if (result.rest.ok) {
    const started = performance.now();
    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          let sessionRef: { close: () => void } | null = null;
          let settled = false;
          const finish = (err?: unknown) => {
            if (settled) return;
            settled = true;
            try {
              sessionRef?.close();
            } catch {
              /* ignore */
            }
            err ? reject(err) : resolve();
          };
          ai.live
            .connect({
              model: m.live,
              config: { responseModalities: [Modality.AUDIO] },
              callbacks: {
                onopen: () => undefined,
                onmessage: (msg) => {
                  if (msg.setupComplete) finish();
                },
                onerror: (e) => finish(new Error((e as ErrorEvent)?.message || 'Live connection error')),
                onclose: (e) => finish(new Error((e as CloseEvent)?.reason || 'Live connection closed before setup')),
              },
            })
            .then((s) => {
              sessionRef = s;
              if (settled) {
                try {
                  s.close();
                } catch {
                  /* ignore */
                }
              }
            })
            .catch((e) => finish(e));
        }),
        12000,
        'Live handshake'
      );
      result.live = { ok: true, message: 'Live voice connected', latencyMs: Math.round(performance.now() - started) };
    } catch (err) {
      result.live = { ok: false, message: classifyError(err).message };
    }
  } else {
    result.live = { ok: false, message: 'Skipped (key failed the basic request)' };
  }

  result.ok = result.rest.ok;
  return result;
}
