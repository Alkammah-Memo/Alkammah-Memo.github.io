/**
 * GeminiLiveSocket: a WebSocket-shaped adapter over the Gemini Live API that talks to Google directly
 * from the browser (no server proxy) and never gives up on the voice session.
 *
 * - Picks the healthiest of the configured keys; if a key hits a quota/auth/overload error, the
 *   session is silently re-established on the next key (and keeps retrying with back-off).
 * - Audio captured while reconnecting is buffered and flushed on reconnect.
 * - Recent conversation turns are replayed after a key switch so context survives the hand-over.
 *
 * Wire protocol (same JSON shape the voice modal already speaks):
 *   client -> socket : ArrayBuffer (PCM16 16kHz) | '{"text":"..."}' | '{"toolResponse":[{id,name,response}]}'
 *   socket -> client : {ready} {audio} {interrupted} {text} {userTranscript} {functionCalls:[{id,name,args}]}
 *                      {status:'connecting'|'reconnecting'|'connected', ...} {error} {closed}
 */
import { Modality } from '@google/genai';
import type { LiveServerMessage, Session } from '@google/genai';
import { clientFor } from './gemini';
import { keyManager, classifyError, NoKeysConfiguredError } from './keyManager';
import type { KeySlot } from './keyManager';
import { EXECUTIVE_FUNCTION_TOOLS, liveSystemInstruction } from './tools';
import { arrayBufferToBase64 } from './audioUtils';

export const LIVE_CONNECTING = 0;
export const LIVE_OPEN = 1;
export const LIVE_CLOSING = 2;
export const LIVE_CLOSED = 3;

const SETUP_TIMEOUT_MS = 10_000;
const MAX_BUFFERED_CHUNKS = 80;
const MAX_HISTORY_TURNS = 8;

interface EndInfo {
  error?: Error;
}

interface ActiveSession {
  session: Session;
  slot: KeySlot;
  seq: number;
  ended: Promise<EndInfo>;
  startedAt: number;
}

export interface LiveSocketOptions {
  /** Extra plain-text context (current meetings/tasks) appended to the system instruction. */
  getContext?: () => string;
  greeting?: string;
}

type MessageHandler = ((ev: { data: string }) => void) | null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GeminiLiveSocket {
  readyState: number = LIVE_CONNECTING;
  binaryType: 'arraybuffer' | 'blob' = 'arraybuffer';
  onopen: (() => void) | null = null;
  onmessage: MessageHandler = null;
  onerror: ((ev: { message: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  private opts: LiveSocketOptions;
  private active: ActiveSession | null = null;
  private seq = 0;
  private userClosed = false;
  private hasOpened = false;
  private resumptionHandle: { slotId: number; handle: string } | null = null;
  private pendingAudio: string[] = [];
  private pendingText: string[] = [];
  private history: { role: 'user' | 'model'; text: string }[] = [];
  private currentUserText = '';
  private currentModelText = '';

  constructor(opts: LiveSocketOptions = {}) {
    this.opts = opts;
    // let the caller attach handlers before the first event fires
    queueMicrotask(() => void this.run());
  }

  // ------------------------------------------------------------------ public WebSocket-like API

  send(data: ArrayBuffer | ArrayBufferView | string): void {
    if (this.userClosed) return;
    if (typeof data === 'string') {
      this.handleClientJson(data);
      return;
    }
    const buf =
      data instanceof ArrayBuffer
        ? data
        : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    this.pushAudio(arrayBufferToBase64(buf));
  }

  close(): void {
    if (this.userClosed) return;
    this.userClosed = true;
    this.readyState = LIVE_CLOSING;
    const act = this.active;
    this.active = null;
    try {
      act?.session.close();
    } catch {
      /* ignore */
    }
    this.readyState = LIVE_CLOSED;
    this.onclose?.();
  }

  // ------------------------------------------------------------------ client -> Gemini

  private handleClientJson(raw: string) {
    let parsed: { audio?: string; text?: string; toolResponse?: { id?: string; name?: string; response?: unknown }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.audio) this.pushAudio(parsed.audio);
    if (parsed.text) this.sendText(parsed.text);
    if (parsed.toolResponse && this.active) {
      try {
        this.active.session.sendToolResponse({
          functionResponses: parsed.toolResponse.map((r) => ({
            id: r.id,
            name: r.name,
            response: (r.response && typeof r.response === 'object' ? r.response : { output: r.response ?? null }) as Record<string, unknown>,
          })),
        });
      } catch (err) {
        console.warn('[Live] tool response not delivered:', err);
      }
    }
  }

  private pushAudio(base64: string) {
    const act = this.active;
    if (act && this.readyState === LIVE_OPEN) {
      try {
        act.session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        return;
      } catch {
        /* fall through to buffering; the reconnect loop will flush */
      }
    }
    this.pendingAudio.push(base64);
    if (this.pendingAudio.length > MAX_BUFFERED_CHUNKS) this.pendingAudio.shift();
  }

  private sendText(text: string) {
    const act = this.active;
    this.rememberTurn('user', text);
    if (act && this.readyState === LIVE_OPEN) {
      try {
        act.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
        return;
      } catch {
        /* buffer below */
      }
    }
    this.pendingText.push(text);
  }

  private rememberTurn(role: 'user' | 'model', text: string) {
    if (!text.trim()) return;
    this.history.push({ role, text: text.trim() });
    if (this.history.length > MAX_HISTORY_TURNS) this.history.shift();
  }

  // ------------------------------------------------------------------ Gemini -> client

  private emit(payload: Record<string, unknown>) {
    if (this.userClosed) return;
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  private onServerMessage(msg: LiveServerMessage, seq: number) {
    if (seq !== this.seq || this.userClosed) return;

    if (msg.sessionResumptionUpdate?.newHandle && msg.sessionResumptionUpdate.resumable !== false) {
      const slotId = this.active?.slot.id;
      if (slotId) this.resumptionHandle = { slotId, handle: msg.sessionResumptionUpdate.newHandle };
    }

    if (msg.goAway) {
      // The server will drop us soon: roll over to a fresh session now, before audio is lost.
      keyManager.logEvent(this.active?.slot.id ?? null, 'info', 'Live session rotating (server go-away)');
      try {
        this.active?.session.close();
      } catch {
        /* ignore */
      }
      return;
    }

    const sc = msg.serverContent;
    if (sc?.interrupted) {
      this.flushModelTurn();
      this.emit({ interrupted: true });
    }

    for (const part of sc?.modelTurn?.parts || []) {
      if (part.inlineData?.data) this.emit({ audio: part.inlineData.data });
    }

    if (sc?.outputTranscription?.text) {
      this.currentModelText += sc.outputTranscription.text;
      this.emit({ text: sc.outputTranscription.text });
    }
    if (sc?.inputTranscription?.text) {
      this.currentUserText += sc.inputTranscription.text;
      this.emit({ userTranscript: this.currentUserText });
    }
    if (sc?.turnComplete) {
      if (this.currentUserText) {
        this.rememberTurn('user', this.currentUserText);
        this.currentUserText = '';
      }
      this.flushModelTurn();
    }

    const calls = msg.toolCall?.functionCalls;
    if (calls && calls.length > 0) {
      this.emit({
        functionCalls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args || {} })),
      });
    }
  }

  private flushModelTurn() {
    if (this.currentModelText) {
      this.rememberTurn('model', this.currentModelText);
      this.currentModelText = '';
    }
  }

  // ------------------------------------------------------------------ connection loop

  private buildSystemInstruction(): string {
    const ctx = this.opts.getContext?.();
    return ctx ? `${liveSystemInstruction()}\n\nسياق النظام الحالي (حقيقي، لا تضيفي عليه):\n${ctx}` : liveSystemInstruction();
  }

  private async openSession(slot: KeySlot): Promise<ActiveSession> {
    const ai = clientFor(slot.key);
    const seq = ++this.seq;
    const models = keyManager.getSettings().models;
    const resume = this.resumptionHandle && this.resumptionHandle.slotId === slot.id ? this.resumptionHandle.handle : undefined;

    let resolveSetup!: () => void;
    let rejectSetup!: (e: Error) => void;
    const setup = new Promise<void>((res, rej) => {
      resolveSetup = res;
      rejectSetup = rej;
    });
    let setupDone = false;
    let resolveEnd!: (e: EndInfo) => void;
    const ended = new Promise<EndInfo>((res) => (resolveEnd = res));

    const session = await ai.live.connect({
      model: models.live,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: models.voiceName || 'Zephyr' } } },
        tools: EXECUTIVE_FUNCTION_TOOLS,
        systemInstruction: this.buildSystemInstruction(),
        sessionResumption: resume ? { handle: resume } : {},
      },
      callbacks: {
        onopen: () => undefined,
        onmessage: (m) => {
          if (m.setupComplete && !setupDone) {
            setupDone = true;
            resolveSetup();
          }
          this.onServerMessage(m, seq);
        },
        onerror: (e) => {
          const err = new Error((e as ErrorEvent)?.message || 'Live connection error');
          if (!setupDone) rejectSetup(err);
          resolveEnd({ error: err });
        },
        onclose: (e) => {
          const ce = e as CloseEvent | undefined;
          const abnormal = ce && ce.code !== 1000 && ce.code !== 1005;
          const err = abnormal ? new Error(`Live closed (${ce.code}) ${ce.reason || ''}`.trim()) : undefined;
          if (!setupDone) rejectSetup(err || new Error('Live connection closed before setup completed'));
          resolveEnd({ error: err });
        },
      },
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        setup,
        new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error('Live setup timed out')), SETUP_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      try {
        session.close();
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }

    return { session, slot, seq, ended, startedAt: Date.now() };
  }

  private async run() {
    let failStreak = 0;
    while (!this.userClosed) {
      if (!keyManager.hasAnyKey()) {
        this.emit({ error: new NoKeysConfiguredError().message, fatal: true });
        this.onerror?.({ message: 'NO_GEMINI_KEYS' });
        this.close();
        return;
      }

      this.emit({ status: this.hasOpened ? 'reconnecting' : 'connecting', attempt: failStreak });

      let connected: ActiveSession | null = null;
      let lastErr: unknown = null;
      for (const slot of keyManager.getCandidateSlots()) {
        if (this.userClosed) return;
        try {
          connected = await this.openSession(slot);
          keyManager.reportSuccess(slot.id);
          break;
        } catch (err) {
          lastErr = err;
          keyManager.reportFailure(slot.id, classifyError(err));
        }
      }

      if (this.userClosed) {
        try {
          connected?.session.close();
        } catch {
          /* ignore */
        }
        return;
      }

      if (!connected) {
        failStreak++;
        const message = classifyError(lastErr).message;
        this.emit({ status: 'reconnecting', attempt: failStreak, error: message });
        if (failStreak === 1 || failStreak % 5 === 0) this.onerror?.({ message });
        await sleep(Math.min(8000, 800 * 2 ** Math.min(failStreak, 4)));
        continue;
      }

      this.active = connected;
      this.readyState = LIVE_OPEN;
      const firstTime = !this.hasOpened;
      this.hasOpened = true;
      this.emit({ status: 'connected', slot: connected.slot.id, label: connected.slot.label });

      if (firstTime) {
        this.onopen?.();
        this.emit({ ready: true, status: 'connected' });
      }

      this.afterConnect(connected, firstTime);

      const end = await connected.ended;
      if (this.active?.seq === connected.seq) this.active = null;
      if (this.userClosed) return;

      this.readyState = LIVE_CONNECTING;
      const lived = Date.now() - connected.startedAt;
      if (end.error) {
        const c = classifyError(end.error);
        keyManager.reportFailure(connected.slot.id, c);
        this.emit({ interrupted: true });
        this.emit({ status: 'reconnecting', attempt: 0, error: c.message });
      }
      failStreak = lived > 5000 ? 0 : failStreak + 1;
      if (failStreak > 0) await sleep(Math.min(4000, 400 * failStreak));
    }
  }

  private afterConnect(act: ActiveSession, firstTime: boolean) {
    try {
      if (firstTime) {
        const greeting =
          this.opts.greeting ||
          'بدأ المهندس محمد القماح للتو جلسة التحدث الصوتي معكِ يا سبيرو. رحّبي به بجملة رسمية موجزة بالعربية الفصحى المبسّطة (مثل: "مساء الخير المهندس محمد، أنا في خدمتك. كيف يمكنني مساعدتك؟")، وإن وُجدت اجتماعات قريبة في سياق النظام فاذكري أقربها بدقة بصيغة المخاطَب المذكر ("لديك اجتماع..." وليس "لديّ")، وإن لم توجد فلا تختلقي أي اجتماع.';
        act.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: greeting }] }], turnComplete: true });
      } else if (this.history.length > 0 && !(this.resumptionHandle && this.resumptionHandle.slotId === act.slot.id)) {
        // New key => new session: replay the recent turns so the conversation continues naturally.
        act.session.sendClientContent({
          turns: this.history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
          turnComplete: false,
        });
      }

      const texts = this.pendingText.splice(0);
      for (const t of texts) {
        act.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true });
      }
      const chunks = this.pendingAudio.splice(0);
      for (const c of chunks) {
        act.session.sendRealtimeInput({ audio: { data: c, mimeType: 'audio/pcm;rate=16000' } });
      }
    } catch (err) {
      console.warn('[Live] post-connect flush failed:', err);
    }
  }
}
