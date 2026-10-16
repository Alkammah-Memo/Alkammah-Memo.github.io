/**
 * Browser-side Gemini client. Replaces the old Express endpoints (/api/ai/*) so the app can be
 * hosted as a static site. Every call is wrapped in key failover (see keyManager.ts).
 */
import { GoogleGenAI, Type, Modality, ThinkingLevel } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { keyManager, runWithFailover, classifyError, DEFAULT_MODELS } from './keyManager';
import type { ModelSettings } from './keyManager';
import {
  EXECUTIVE_FUNCTION_TOOLS,
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
    config: { systemInstruction: chatSystemInstruction(), tools: EXECUTIVE_FUNCTION_TOOLS },
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
    config: { temperature: 0.3, maxOutputTokens: 400, tools: EXECUTIVE_FUNCTION_TOOLS },
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


export interface VoiceTurn {
  role: 'user' | 'spero';
  text: string;
}

/** Cheapest capable model first: voice turns are short, so flash-lite is plenty and has the roomiest free limits. */
const ECONOMY_VOICE_MODEL = 'gemini-3.1-flash-lite';

/**
 * Economy voice turn. The phone does the listening and the speaking for free; this is ONE small text request
 * (two only when a tool ran and its result must be read back). Returns the sentence Spero should say.
 */
export async function economyVoiceTurn(
  query: string,
  locale: 'en' | 'ar',
  context: unknown,
  history: VoiceTurn[],
  execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<string> {
  const m = models();
  const order = [ECONOMY_VOICE_MODEL, ...m.chatFallbacks, m.chat];
  const systemInstruction = `${SPERO_PERSONA}
التوقيت الحالي في القاهرة: ${cairoNowLabel()} (ISO محلي: ${cairoNowIsoLabel()}).
${SPERO_TOOL_RULES}
قواعد المحادثة الصوتية: ردّي بجملة أو جملتين كحد أقصى، بلا قوائم ولا رموز، وبنبرة طبيعية مهذبة تُقرأ بصوت عالٍ. خاطبيه دائماً بـ "المهندس محمد" أو "حضرتك" فقط، ولا تقولي "بشمهندس" أو "يا". إذا طُلب اجتماع ولم يُذكر مع من أو موضوعه فاسألي عنه أولاً.
سياق النظام الحالي: ${JSON.stringify(context)}`;

  const contents: { role: string; parts: Record<string, unknown>[] }[] = [
    ...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: query }] },
  ];
  const config = { systemInstruction, temperature: 0.3, maxOutputTokens: 350, tools: EXECUTIVE_FUNCTION_TOOLS };

  // Voice needs speed: ask for minimal "thinking"; if a model rejects that setting, retry without it
  const gen = async (params: GenParams): Promise<GenerateContentResponse> => {
    try {
      return await generate(order, { ...params, config: { ...params.config, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } });
    } catch (err) {
      const kind = classifyError(err).kind;
      if (kind === 'bad_request' || kind === 'model') return generate(order, params);
      throw err;
    }
  };

  const first = await gen({ contents: contents as never, config });
  const calls = extractCalls(first);
  if (calls.length === 0) {
    return first.text || (locale === 'ar' ? 'تفضّل، المهندس محمد.' : 'Yes, Eng. Mohamed.');
  }

  const results: { name: string; response: Record<string, unknown> }[] = [];
  for (const call of calls) {
    try {
      results.push({ name: call.name, response: await execute(call.name, call.args) });
    } catch (err) {
      results.push({ name: call.name, response: { ok: false, error: (err as Error)?.message || String(err) } });
    }
  }

  const modelContent = first.candidates?.[0]?.content;
  const followUp = [
    ...contents,
    modelContent || { role: 'model', parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })) },
    { role: 'user', parts: results.map((r) => ({ functionResponse: { name: r.name, response: r.response } })) },
  ];
  const second = await gen({ contents: followUp as never, config });
  return second.text || (locale === 'ar' ? 'تم، المهندس محمد.' : 'Done, Eng. Mohamed.');
}

const INK_PROMPT = `You are an expert bilingual executive document transcriber for a CEO of an industrial / land-development group in Egypt. The page is a photo or export of his handwritten digital planner (Egyptian Arabic and English mixed on the same line, written in blue ink, with orange ink for status marks).

HOW HE WRITES (read the page the way he writes it):
- Page types: DAILY page (a time column on the left where he writes clock times like 11:00 or 4:00 beside an entry, a MAIN FOCUS box, three numbered GOALS boxes, a TO-DO LIST, and a notes area), MONTHLY calendar (short notes inside day cells; a long arrow across several days means a multi-day trip or event), TO-DO LIST pages by workstream (numbered rows: topic -> next action, a due date, and owner initials on the right) and MINUTES OF MEETING pages (a Task | owner | Due Date table).
- One numbered or circled/boxed line is ONE item. "A -> B" or "A <- B" means topic A with next action B (put the topic and action together in the title, keep the action in nextAction).
- A line STRUCK THROUGH (especially with an orange line) is COMPLETED: set statusHint to "Done". A word written as "ongoing" (often with a green highlight) means "In Progress". An orange arrow means carry-forward / needs follow up (statusHint "Pending" and mention it in nextAction if useful).
- A colour highlight (yellow or orange) around a date such as "29 sept" or "2 oct" marks the DUE DATE; resolve it to YYYY-MM-DD using the current Cairo date given below (the nearest sensible year).
- Short capital initials at the end of a row (SS, YA, MM, MK, AT, HA, AZ, MR, IS, MA, M.K., etc.) are the OWNERS: copy them exactly (comma separated when several); never expand initials into invented full names.
- A clock time next to an entry in the daily agenda belongs to a MEETING or call. Office hours are assumed: 1:00 to 6:00 without AM/PM means PM; 7:00 to 11:59 means AM unless marked.
- Friday and Saturday are the weekend.
- Key reference names that may appear: Ras El Hekma, New Capital, Minya & Fayoum, Qantara land (SCZone), Golden Triangle / Xingfa, Nasgoon, Sephora, Libya visit / MOU, SUMEC, Automotive City, Ghorfa deal, Port Said land, Djibouti / AGL, Sofaga, Damietta, ADP, DFS (project charter), Tanzania, OKO plan, 360 concept / sales center, Sadat, OIP, ODP, New Giza, CSEC, CMA / Logistics, OSS, CPC.

CRITICAL DISTINCTION BETWEEN MEETINGS AND TASKS:
- If the entry mentions a meeting, call, visit, appointment, discussion, signing, or has a specific clock time (e.g. "Walid meeting CRM 6:00 PM", "اجتماع الساعة العاشرة", "4:00 Arabia Group Mtg"):
  -> entryType: "meeting", suggestedMeetingDate (YYYY-MM-DD; resolve "today"/"tomorrow"/weekday names against the current Cairo date; on a daily page use the date printed at the top of the page), suggestedStartTime as 24-hour HH:MM, suggestedEndTime as 24-hour HH:MM (one hour after start when not written), suggestedAttendees (names/initials mentioned) and suggestedLocation (only if written).
- Otherwise it is a task/action item -> entryType: "task", with suggestedDueDate only if indicated.

RULES:
- DO NOT invent facts, names or dates. If something is unclear or illegible, list it in uncertainFields and lower confidenceScore.
- Keep the original language of each item (Arabic stays Arabic). Provide rawTextArabic and/or rawTextEnglish exactly as read.
- Extract every actionable item or note as its own candidate (do not merge numbered rows). Skip printed template labels (MAIN FOCUS, GOALS, TO-DO LIST, NOTES & IDEAS, WEEK n, etc.).

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
      statusHint: { type: Type.STRING, enum: ['Pending', 'In Progress', 'Done'] },
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
        { inlineData: { mimeType: /^data:(image\/[\w+.-]+);base64,/.exec(imageBase64)?.[1] || 'image/png', data: imageBase64.replace(/^data:image\/[\w+.-]+;base64,/, '') } },
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
      suggestedStatus: item.statusHint === 'Done' ? ('Done' as const) : item.statusHint === 'In Progress' ? ('In Progress' as const) : undefined,
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
