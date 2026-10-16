import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Locale } from '../../lib/translations';
import { VoiceDebugMonitor, SpeechEvent } from './VoiceDebugMonitor';
import { GeminiLiveSocket, LIVE_OPEN, LIVE_CONNECTING } from '../../lib/ai/liveSocket';
import { voiceFastQuery, economyVoiceTurn, transcribeAudio } from '../../lib/ai/gemini';
import type { VoiceTurn } from '../../lib/ai/gemini';
import { getVoiceEngine, getSpeechRecognitionCtor, cleanForSpeech, getVoiceLang, setVoiceLang, looksArabic } from '../../lib/ai/voiceEngine';
import type { VoiceLang } from '../../lib/ai/voiceEngine';
import { getCairoDateString } from '../../lib/cairoTime';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  Send,
  Shield,
  ShieldCheck,
  UserCheck,
  Minimize2,
  Maximize2,
  Sparkles,
  Square,
  GripHorizontal,
  Terminal,
  Copy,
  Check,
  Download,
  Bug,
  Trash2,
  MoreHorizontal,
  Activity,
} from 'lucide-react';

export interface VoiceDebugLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  category: 'WebSocket' | 'AudioStream' | 'ToolCall' | 'GeminiLive' | 'SpeechTTS';
  message: string;
  details?: Record<string, unknown> | string;
}

interface LiveVoiceModalProps {
  isOpen?: boolean;
  locale: Locale;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meetings?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks?: any[];
  onExecuteToolAction?: (toolName: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onClose?: () => void;
  /** hide the floating bubble (e.g. on the assistant page, which has its own voice button) unless a session is running */
  hideBubble?: boolean;
}

// On phones the fixed bottom tab bar occupies the lower edge; keep the floating bubble above it
function bottomNavInset(): number {
  return typeof window !== 'undefined' && window.innerWidth < 640 ? 72 : 0;
}

// Resample Float32 audio buffer to target 16000Hz for live voice streaming
function downsampleTo16k(input: Float32Array, currentRate: number): Float32Array {
  if (currentRate === 16000) return input;
  const ratio = currentRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origIndex = i * ratio;
    const index1 = Math.floor(origIndex);
    const index2 = Math.min(index1 + 1, input.length - 1);
    const fraction = origIndex - index1;
    result[i] = input[index1] * (1 - fraction) + input[index2] * fraction;
  }
  return result;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen = false,
  locale,
  meetings = [],
  tasks = [],
  onExecuteToolAction,
  onClose,
  hideBubble = false,
}) => {
  // Session active state (controls live audio / WebSocket regardless of whether modal window is open or minimized)
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [isWindowOpen, setIsWindowOpen] = useState<boolean>(isOpen);

  const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'idle'>('idle');
  const [micActive, setMicActive] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [typedInput, setTypedInput] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isProcessingQuery, setIsProcessingQuery] = useState<boolean>(false);

  // Diagnostic Error Logs & Audio Stream Logger State
  const [debugLogs, setDebugLogs] = useState<VoiceDebugLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('spero_voice_debug_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [debugCategoryFilter, setDebugCategoryFilter] = useState<string>('All');
  const [copiedLogSuccess, setCopiedLogSuccess] = useState<boolean>(false);

  // Real-time Voice Debug Monitor Modal State & Speech Events (Utterance vs Interruption tracker)
  const [isVoiceDebugMonitorOpen, setIsVoiceDebugMonitorOpen] = useState<boolean>(false);
  const [speechEvents, setSpeechEvents] = useState<SpeechEvent[]>([]);
  const [micDbfsState, setMicDbfsState] = useState<number>(-90);

  const addSpeechEvent = useCallback((
    type: SpeechEvent['type'],
    message: string,
    details?: Record<string, unknown> | string
  ) => {
    const now = Date.now();
    setSpeechEvents((prev) => {
      const prevTime = prev[0]?.timeMs || now;
      const deltaMs = now - prevTime;
      const entry: SpeechEvent = {
        id: `ev-${now}-${Math.random().toString(36).substring(2, 6)}`,
        type,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3,
        }),
        timeMs: now,
        deltaFromPrev: prev.length > 0 ? `+${deltaMs}ms` : undefined,
        message,
        details,
      };
      return [entry, ...prev].slice(0, 120);
    });
  }, []);

  const addDebugLog = useCallback((
    level: VoiceDebugLogEntry['level'],
    category: VoiceDebugLogEntry['category'],
    message: string,
    details?: Record<string, unknown> | string
  ) => {
    const entry: VoiceDebugLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      level,
      category,
      message,
      details,
    };
    setDebugLogs((prev) => {
      const next = [entry, ...prev].slice(0, 150);
      try {
        localStorage.setItem('spero_voice_debug_logs', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Near-Voice Focus (Meeting Mode) - Listens only to Mohamed in front of the device, blocks distant meeting chatter
  const [nearVoiceFocus, setNearVoiceFocus] = useState<boolean>(false);
  const nearVoiceFocusRef = useRef<boolean>(true);
  useEffect(() => {
    nearVoiceFocusRef.current = nearVoiceFocus;
  }, [nearVoiceFocus]);

  const [nearVoiceDetected, setNearVoiceDetected] = useState<boolean>(false);
  const lastNearVoiceTimeRef = useRef<number>(0);

  const wsRef = useRef<GeminiLiveSocket | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [voiceLang, setVoiceLangState] = useState<VoiceLang>(() => getVoiceLang());
  const changeVoiceLang = (l: VoiceLang) => {
    setVoiceLang(l);
    setVoiceLangState(l);
    // restart listening in the new language
    try {
      recognitionRef.current?.abort?.();
    } catch {
      /* ignore */
    }
  };
  // Economy engine (device speech in and out, one small text request per turn) and idle auto-stop
  const economyHistoryRef = useRef<VoiceTurn[]>([]);
  const economyBusyRef = useRef<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const meetingsRef = useRef<any[]>([]);
  const tasksRef = useRef<any[]>([]);
  meetingsRef.current = meetings;
  tasksRef.current = tasks;
  const [reconnectNote, setReconnectNote] = useState<string>('');
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformAnimRef = useRef<number | null>(null);
  const activeRef = useRef<boolean>(false);
  const isAiSpeakingRef = useRef<boolean>(false);
  const lastAiSpeechTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const currentAudioPlayingRef = useRef<HTMLAudioElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wavePhaseRef = useRef<number>(0);
  const userInterruptionFramesRef = useRef<number>(0);

  // Debounced speech completion timer to prevent state flapping between audio chunks
  const speechCompletionTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Throttling refs for 60fps audio level state updates to eliminate React re-render lag
  const lastAudioLevelUpdateRef = useRef<number>(0);
  const lastAudioLevelValRef = useRef<number>(0);

  // Stop active AI speech audio output immediately without triggering stale onended callbacks
  const stopAiPlayback = useCallback(() => {
    if (speechCompletionTimerRef.current) {
      clearTimeout(speechCompletionTimerRef.current);
      speechCompletionTimerRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
      } catch {}
    });
    activeSourcesRef.current.clear();
    if (audioContextOutRef.current) {
      nextStartTimeRef.current = audioContextOutRef.current.currentTime;
    }
    if (currentAudioPlayingRef.current) {
      try {
        currentAudioPlayingRef.current.pause();
      } catch {}
      currentAudioPlayingRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    isAiSpeakingRef.current = false;
    userInterruptionFramesRef.current = 0;
    setStatus('listening');
  }, []);

  // Draggable bubble state with screen boundary clamping & persistent storage
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('spero_voice_agent_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const maxX = typeof window !== 'undefined' ? window.innerWidth - (window.innerWidth < 640 ? 60 : 76) : 300;
          const maxY = typeof window !== 'undefined' ? window.innerHeight - 124 - bottomNavInset() : 600;
          return {
            x: Math.min(Math.max(16, parsed.x), Math.max(16, maxX)),
            y: Math.min(Math.max(16, parsed.y), Math.max(16, maxY)),
          };
        }
      }
    } catch {}
    return {
      x: typeof window !== 'undefined' ? window.innerWidth - 84 : 300,
      y: typeof window !== 'undefined' ? window.innerHeight - 136 - bottomNavInset() : 600,
    };
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    moved: boolean;
  }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
    moved: false,
  });

  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef<number>(0);

  // Sync external isOpen prop
  useEffect(() => {
    if (isOpen) {
      setIsWindowOpen(true);
      if (!activeRef.current) {
        setIsSessionActive(true);
        initLiveSession();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep bubble within viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      setBubblePos((prev) => ({
        x: Math.min(Math.max(16, prev.x), window.innerWidth - (window.innerWidth < 640 ? 60 : 76)),
        y: Math.min(Math.max(16, prev.y), window.innerHeight - 124 - bottomNavInset()),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Stop microphone capture safely
  const stopMicrophone = useCallback(() => {
    if (waveformAnimRef.current) {
      cancelAnimationFrame(waveformAnimRef.current);
      waveformAnimRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
    if (audioContextInRef.current) {
      try {
        audioContextInRef.current.close();
      } catch {}
      audioContextInRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (currentAudioPlayingRef.current) {
      try {
        currentAudioPlayingRef.current.pause();
      } catch {}
      currentAudioPlayingRef.current = null;
    }
    setMicActive(false);
    setAudioLevel(0);
    setNearVoiceDetected(false);
  }, []);

  // Terminate voice session completely
  const terminateSession = useCallback(() => {
    activeRef.current = false;
    stopAiPlayback();
    stopMicrophone();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    setIsSessionActive(false);
    setStatus('idle');
  }, [stopMicrophone, stopAiPlayback]);

  // Stop automatically when nobody has spoken for a while, so an idle microphone never burns quota
  useEffect(() => {
    if (!isSessionActive) return;
    lastActivityRef.current = Date.now();
    const timer = setInterval(() => {
      if (!activeRef.current || nearVoiceFocusRef.current) return;
      if (Date.now() - lastActivityRef.current > 150_000) {
        setReconnectNote(locale === 'ar' ? 'تم إيقاف الجلسة تلقائياً لعدم وجود حديث. اضغط للتحدث مجدداً.' : 'Session stopped automatically after a quiet spell. Tap to talk again.');
        terminateSession();
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [isSessionActive, terminateSession, locale]);

  // Dynamic Siri Animated Waveform Visualizer Loop (runs in background and updates audioLevel at 60fps)
  const startWaveformVisualizer = (analyser: AnalyserNode) => {
    const bufferLength = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      if (!activeRef.current) return;

      analyser.getByteFrequencyData(freqData);

      // Compute average frequency power
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += freqData[i];
      }
      const avgPower = sum / bufferLength;
      const normalizedLevel = Math.min(100, Math.round((avgPower / 128) * 100));

      // Throttled React state update (~10fps max) to prevent UI freezing & frame drops
      const nowTime = performance.now();
      if (nowTime - lastAudioLevelUpdateRef.current > 75 && Math.abs(normalizedLevel - lastAudioLevelValRef.current) >= 2) {
        lastAudioLevelUpdateRef.current = nowTime;
        lastAudioLevelValRef.current = normalizedLevel;
        setAudioLevel(normalizedLevel);
      }

      // Render to canvas if modal window is currently open
      const canvas = waveformCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Increment wave phase for fluid animation
          wavePhaseRef.current += 0.045 + (normalizedLevel / 100) * 0.08;
          const phase = wavePhaseRef.current;

          const width = canvas.width;
          const height = canvas.height;
          const centerY = height / 2;

          ctx.clearRect(0, 0, width, height);

          // Base amplitude scales with microphone level + ambient idle wave
          const isAudible = normalizedLevel > 3;
          const ampBase = isAudible ? Math.max(6, (normalizedLevel / 100) * (height * 0.44)) : 3.5;

          // Draw multi-layered Siri harmonic waves with vibrant gradient glows
          const waves = [
            {
              color: 'rgba(0, 113, 227, 0.85)',
              glow: 'rgba(0, 113, 227, 0.45)',
              speed: 1.0,
              freq: 0.022,
              amp: ampBase * 1.0,
              lineWidth: 2.4,
            },
            {
              color: 'rgba(76, 154, 255, 0.7)',
              glow: 'rgba(76, 154, 255, 0.4)',
              speed: -1.3,
              freq: 0.018,
              amp: ampBase * 0.85,
              lineWidth: 2.0,
            },
            {
              color: 'rgba(11, 42, 92, 0.6)',
              glow: 'rgba(11, 42, 92, 0.3)',
              speed: 0.8,
              freq: 0.026,
              amp: ampBase * 0.75,
              lineWidth: 2.2,
            },
            {
              color: 'rgba(143, 200, 255, 0.9)',
              glow: 'rgba(143, 200, 255, 0.5)',
              speed: -0.9,
              freq: 0.03,
              amp: ampBase * 0.6,
              lineWidth: 1.8,
            },
          ];

          waves.forEach((w) => {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = w.color;
            ctx.shadowColor = w.glow;
            ctx.shadowBlur = isAudible ? 14 : 6;
            ctx.lineWidth = w.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let x = 0; x < width; x += 3) {
              const envelope = Math.sin((x / width) * Math.PI);
              const yOffset =
                Math.sin(x * w.freq + phase * w.speed) *
                Math.cos(x * 0.01 + phase * 0.5) *
                w.amp *
                envelope;

              const y = centerY + yOffset;
              if (x === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }

            ctx.stroke();
            ctx.restore();
          });
        }
      }

      waveformAnimRef.current = requestAnimationFrame(render);
    };

    render();
  };

  // Start microphone capture with Near-Field Voice Gate & High-Pass Noise Rejection
  const startMicrophoneStream = async (ws?: GeminiLiveSocket | null) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setMicActive(false);
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            channelCount: 1,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextInRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);

      // 120Hz High-pass filter to reject table thumps and low-frequency rumble
      const highPassFilter = audioCtx.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.value = 120;
      source.connect(highPassFilter);

      // Web Audio Analyser for dynamic Siri wave visualizer
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      highPassFilter.connect(analyser);
      analyserRef.current = analyser;

      startWaveformVisualizer(analyser);

      // Audio processor for live streaming chunks to Gemini Live API
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (!activeRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Near-Voice Proximity Gate calculation (RMS -> dBFS)
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);
        const dBFS = 20 * Math.log10(rms + 1e-6);

        // Periodically update mic dBFS for VoiceDebugMonitor
        if (Math.random() < 0.1) {
          setMicDbfsState(Math.round(dBFS));
        }

        // Voice detection threshold (-50 dBFS: normal speech level on web mics)
        const isNearSpeaker = dBFS > -50;
        const now = Date.now();

        if (isNearSpeaker) {
          lastNearVoiceTimeRef.current = now;
          setNearVoiceDetected(true);
        } else if (now - lastNearVoiceTimeRef.current > 750) {
          setNearVoiceDetected(false);
        }

        // ECHO SUPPRESSION & Conversational Interruption
        // Strict mute of microphone stream to Gemini when AI is actively speaking
        const isAiSpeaking = isAiSpeakingRef.current || now - lastAiSpeechTimeRef.current < 250;

        if (isAiSpeaking) {
          // If user speaks loud and intentional into mic (dBFS > -16) for 2 consecutive frames (~160ms), trigger AI interruption
          if (dBFS > -16) {
            userInterruptionFramesRef.current += 1;
            if (userInterruptionFramesRef.current >= 2) {
              stopAiPlayback();
              userInterruptionFramesRef.current = 0;
              addSpeechEvent('USER_INTERRUPTION', `User voice interrupted playback (${Math.round(dBFS)} dBFS)`);
              addDebugLog('WARN', 'AudioStream', 'User voice interruption triggered');
            } else {
              return;
            }
          } else {
            userInterruptionFramesRef.current = 0;
            return; // Block speaker audio bleed-through from reaching Gemini API
          }
        } else {
          userInterruptionFramesRef.current = 0;
        }

        // Meeting mode isolation: only attenuate extreme silence below -58 dBFS when NearVoiceFocus is ON
        if (nearVoiceFocusRef.current && dBFS < -58 && now - lastNearVoiceTimeRef.current > 600) {
          return;
        }

        const dataToSend = inputData;

        // Resample and convert to PCM16
        const resampled = downsampleTo16k(dataToSend, audioCtx.sampleRate);
        const pcm16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
          const s = Math.max(-1, Math.min(1, resampled[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Stream raw PCM audio to WebSocket
        const targetWs = ws || wsRef.current;
        if (targetWs && targetWs.readyState === LIVE_OPEN) {
          targetWs.send(pcm16.buffer);
        }
      };

      setMicActive(true);
      setStatus('listening');

      // Browser Web Speech Recognition for instant local visual UI text feedback ONLY
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = locale === 'ar' ? 'ar-EG' : 'en-US';

          rec.onresult = (event: any) => {
            if (!activeRef.current) return;
            const nowTime = Date.now();

            // Ignore speech recognition while AI is speaking
            if (isAiSpeakingRef.current || nowTime - lastAiSpeechTimeRef.current < 250) {
              return;
            }

            if (nearVoiceFocusRef.current && nowTime - lastNearVoiceTimeRef.current > 900) {
              return;
            }

            const current = event.resultIndex;
            const transcript = event.results[current][0].transcript;
            setUserTranscript(transcript);

            // In live streaming mode, audio is handled via PCM WebSocket streaming.
            // DO NOT trigger duplicate fast voice query from interim SpeechRecognition!
            if (event.results[current].isFinal) {
              addSpeechEvent('USER_SPEECH_DETECTED', `Recognized speech: "${transcript}"`);
            }
          };

          rec.onerror = () => {};
          rec.start();
          recognitionRef.current = rec;
        } catch {}
      }
    } catch (err) {
      console.warn('Microphone stream initialization warning:', err);
      setMicActive(false);
      setStatus('listening');
    }
  };

  // Helper to execute tool calls returned from server or WebSocket
  const executeToolSafely = async (toolName: string, args: Record<string, unknown>) => {
    if (!onExecuteToolAction) return;
    try {
      addDebugLog('INFO', 'ToolCall', `Executing action ${toolName}...`, args);
      const res = await onExecuteToolAction(toolName, args);
      addDebugLog('SUCCESS', 'ToolCall', `Action ${toolName} executed successfully`, res);
      return res;
    } catch (err: unknown) {
      addDebugLog('ERROR', 'ToolCall', `Failed executing action ${toolName}`, err instanceof Error ? err.message : String(err));
    }
  };

  const buildMeetingContext = () =>
    (meetingsRef.current || [])
      .filter((m) => new Date(m.end || m.start).getTime() >= Date.now() - 24 * 3600 * 1000)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 12)
      .map((m) => ({
        id: m.id,
        title: m.title,
        startCairo: new Date(m.start).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false }),
        endCairo: new Date(m.end).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false }),
      }));

  const buildTaskContext = () =>
    (tasksRef.current || [])
      .filter((t) => !t.isArchived && t.status !== 'Done' && t.status !== 'Closed')
      .slice(0, 20)
      .map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.ownerAlias, due: t.dueDate }));

  const buildLiveContext = () =>
    `اليوم (القاهرة): ${getCairoDateString()}\nالاجتماعات: ${JSON.stringify(buildMeetingContext())}\nالمهام المفتوحة: ${JSON.stringify(buildTaskContext())}`;

  // Direct fast voice executive fallback query
  const handleFastVoiceQuery = async (queryText: string) => {
    if (isProcessingQuery || !queryText.trim()) return;
    setIsProcessingQuery(true);
    setStatus('connecting');
    addDebugLog('INFO', 'SpeechTTS', `User voice query: "${queryText}"`);

    try {
      const data = await voiceFastQuery(queryText, locale, {
        meetings: buildMeetingContext(),
        tasks: buildTaskContext(),
      });
      const reply = data.text || (locale === 'ar' ? 'تم تنفيذ الأمر، المهندس محمد.' : 'Understood, done.');
      setLastTranscript(reply);
      setStatus('speaking');
      addDebugLog('SUCCESS', 'GeminiLive', `Spero reply received: "${reply}"`);

      for (const call of data.functionCalls) {
        await executeToolSafely(call.name, call.args);
      }

      // Speech completes smoothly whether inside the window or minimized in the bubble!
      if (data.audio) {
        if (currentAudioPlayingRef.current) {
          currentAudioPlayingRef.current.pause();
        }
        isAiSpeakingRef.current = true;
        lastAiSpeechTimeRef.current = Date.now();
        const audioEl = new Audio(`data:audio/wav;base64,${data.audio}`);
        currentAudioPlayingRef.current = audioEl;
        audioEl.onended = () => {
          lastAiSpeechTimeRef.current = Date.now();
          setTimeout(() => {
            isAiSpeakingRef.current = false;
            setStatus('listening');
            setIsProcessingQuery(false);
          }, 400);
        };
        audioEl.onerror = () => {
          fallbackSpeechSynthesis(reply);
        };
        await audioEl.play().catch(() => {
          fallbackSpeechSynthesis(reply);
        });
      } else {
        fallbackSpeechSynthesis(reply);
      }
    } catch (err) {
      addDebugLog('ERROR', 'GeminiLive', 'Fast voice query failed', err instanceof Error ? err.message : String(err));
      setStatus('listening');
      setIsProcessingQuery(false);
    }
  };

  const fallbackSpeechSynthesis = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      isAiSpeakingRef.current = true;
      lastAiSpeechTimeRef.current = Date.now();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US';
      utterance.rate = 1.05;
      utterance.onend = () => {
        lastAiSpeechTimeRef.current = Date.now();
        setTimeout(() => {
          isAiSpeakingRef.current = false;
          setStatus('listening');
          setIsProcessingQuery(false);
        }, 400);
      };
      utterance.onerror = () => {
        isAiSpeakingRef.current = false;
        setStatus('listening');
        setIsProcessingQuery(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        isAiSpeakingRef.current = false;
        setStatus('listening');
        setIsProcessingQuery(false);
      }, 3000);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Economy voice: the phone listens and speaks (free); Gemini only sees short text. Lasts for hours.
  // ---------------------------------------------------------------------------------------------
  // Some browsers (for example Chrome on iPhone) have no usable device speech recognition: remember that and use Live voice there
  const srBlocked = () => {
    try {
      return localStorage.getItem('alkammah_sr_blocked') === '1';
    } catch {
      return false;
    }
  };

  const speakEconomy = (text: string) => {
    const resume = () => {
      isAiSpeakingRef.current = false;
      lastAiSpeechTimeRef.current = Date.now();
      economyBusyRef.current = false;
      if (activeRef.current) {
        setStatus('listening');
        listenNext();
      }
    };
    if (!('speechSynthesis' in window)) {
      setTimeout(resume, 1500);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      // The voice follows the language of the reply itself (Spero answers in Arabic even when the app is in English)
      const arabic = looksArabic(text);
      const voices = window.speechSynthesis.getVoices();
      const byLang = (prefix: string) => voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix));
      const picked = arabic
        ? byLang('ar-eg')[0] || byLang('ar-sa')[0] || byLang('ar')[0] || null
        : byLang('en-gb')[0] || byLang('en-us')[0] || byLang('en')[0] || null;
      utterance.voice = picked;
      utterance.lang = picked?.lang || (arabic ? 'ar-SA' : 'en-US');
      if (arabic && !picked) {
        setReconnectNote(locale === 'ar' ? 'لا يوجد صوت عربي مثبّت على هذا الجهاز، فسيُقرأ الرد بصوت آخر. يمكنك إضافته من إعدادات الجهاز > اللغات.' : 'No Arabic voice is installed on this device, so the reply may sound wrong. Add one in the device language settings.');
      }
      utterance.rate = 1;
      utterance.onend = resume;
      utterance.onerror = resume;
      isAiSpeakingRef.current = true;
      setStatus('speaking');
      window.speechSynthesis.speak(utterance);
    } catch {
      resume();
    }
  };

  const economyTurn = async (text: string) => {
    economyBusyRef.current = true;
    lastActivityRef.current = Date.now();
    setStatus('connecting');
    setLastTranscript('');
    addDebugLog('INFO', 'SpeechTTS', `User said: "${text}"`);
    try {
      const reply = cleanForSpeech(await economyVoiceTurn(
        text,
        locale,
        { meetings: buildMeetingContext(), tasks: buildTaskContext() },
        economyHistoryRef.current,
        async (name, args) => ((await executeToolSafely(name, args)) ?? { ok: false, error: 'No result' }) as Record<string, unknown>,
        getVoiceLang()
      ));
      economyHistoryRef.current = [...economyHistoryRef.current, { role: 'user' as const, text }, { role: 'spero' as const, text: reply }].slice(-12);
      lastActivityRef.current = Date.now();
      setLastTranscript(reply);
      speakEconomy(reply);
    } catch (err) {
      addDebugLog('ERROR', 'SpeechTTS', 'Voice turn failed', err instanceof Error ? err.message : String(err));
      const msg = locale === 'ar' ? 'تعذّر تنفيذ الطلب الآن، المهندس محمد. يرجى المحاولة مرة أخرى.' : 'I could not complete that request just now, Eng. Mohamed. Please try again.';
      setLastTranscript(msg);
      speakEconomy(msg);
    }
  };

  // Which way to hear the CEO: the browser's own speech recognition when it works, otherwise record a short clip
  // and have Gemini transcribe it (still far cheaper than streaming Live audio, because only spoken sentences are sent)
  const listenNext = () => {
    if (getSpeechRecognitionCtor() && !srBlocked()) listenOnce();
    else void listenByRecording();
  };

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result || '').split('base64,').pop() || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const listenByRecording = async () => {
    if (!activeRef.current || economyBusyRef.current) return;
    try {
      if (!mediaStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        mediaStreamRef.current = stream;
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        if (ctx.state === 'suspended') await ctx.resume();
        audioContextInRef.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        analyserRef.current = an;
      }
    } catch {
      setReconnectNote(locale === 'ar' ? 'الميكروفون غير مسموح به. فعّل الإذن لهذا الموقع من إعدادات المتصفح.' : 'Microphone is blocked. Allow it for this site in the browser settings.');
      terminateSession();
      return;
    }
    const stream = mediaStreamRef.current;
    const an = analyserRef.current;
    if (!stream || !an || !activeRef.current) return;

    const mime = ['audio/webm', 'audio/mp4', 'audio/aac'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) || '';
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      setReconnectNote(locale === 'ar' ? 'هذا المتصفح لا يدعم تسجيل الصوت.' : 'This browser cannot record audio.');
      terminateSession();
      return;
    }
    const actualMime = (rec.mimeType || mime || 'audio/webm').split(';')[0];
    const chunks: Blob[] = [];
    let voiceStart = 0;
    let lastVoice = 0;
    let finished = false;
    let raf = 0;
    const began = Date.now();
    let lastLevelPaint = 0;
    let floorSum = 0;
    let floorN = 0;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      cancelAnimationFrame(raf);
      if (!activeRef.current) return;
      const spokeMs = lastVoice - voiceStart;
      if (!voiceStart || spokeMs < 350) {
        void listenByRecording();
        return;
      }
      economyBusyRef.current = true;
      setStatus('connecting');
      try {
        const b64 = await blobToBase64(new Blob(chunks, { type: actualMime }));
        const heard = (await transcribeAudio(b64, actualMime)).trim();
        if (!heard) {
          economyBusyRef.current = false;
          setStatus('listening');
          void listenByRecording();
          return;
        }
        setUserTranscript(heard);
        await economyTurn(heard);
      } catch (err) {
        addDebugLog('ERROR', 'SpeechTTS', 'Transcription failed', err instanceof Error ? err.message : String(err));
        const em = err instanceof Error ? err.message : String(err);
        setLastTranscript(locale === 'ar' ? `تعذّر فهم التسجيل: ${em.slice(0, 120)}` : `Could not process the recording: ${em.slice(0, 120)}`);
        economyBusyRef.current = false;
        setStatus('listening');
        setTimeout(() => void listenByRecording(), 800);
      }
    };

    const buf = new Float32Array(an.fftSize);
    const tick = () => {
      if (!activeRef.current || finished) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (now - lastLevelPaint > 80) {
        lastLevelPaint = now;
        setAudioLevel(Math.min(100, Math.round(rms * 500)));
      }
      // the first moments set the room's noise floor; speech is anything clearly above it
      if (now - began < 500) {
        floorSum += rms;
        floorN += 1;
      }
      const floor = floorN ? floorSum / floorN : 0.005;
      if (now - began >= 500 && rms > Math.max(0.012, floor * 3)) {
        if (!voiceStart) voiceStart = now;
        lastVoice = now;
        lastActivityRef.current = now;
      }
      const stopNow = (voiceStart && now - lastVoice > 1100) || (!voiceStart && now - began > 8000) || now - began > 25000;
      if (stopNow) {
        finished = true;
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    try {
      rec.start(250);
      setStatus('listening');
      raf = requestAnimationFrame(tick);
    } catch {
      setTimeout(() => void listenByRecording(), 800);
    }
  };

  const listenOnce = () => {
    if (!activeRef.current || economyBusyRef.current) return;
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;
    let finalText = '';
    let lastInterim = '';
    try {
      const rec = new SR();
      rec.lang = getVoiceLang() === 'ar' ? 'ar-EG' : 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        lastInterim = interim;
        lastActivityRef.current = Date.now();
        setUserTranscript((finalText + interim).trim());
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed' || e?.error === 'language-not-supported') {
          // Device speech recognition is not available here: record short clips and transcribe them instead
          try {
            localStorage.setItem('alkammah_sr_blocked', '1');
          } catch {
            /* ignore */
          }
          recognitionRef.current = null;
        }
      };
      rec.onend = () => {
        recognitionRef.current = null;
        if (!activeRef.current || economyBusyRef.current) return;
        const said = (finalText || lastInterim).trim();
        if (said) void economyTurn(said);
        else setTimeout(listenNext, 250);
      };
      rec.start();
      recognitionRef.current = rec;
      setStatus('listening');
    } catch {
      setTimeout(listenOnce, 600);
    }
  };

  const initEconomySession = () => {
    activeRef.current = true;
    setIsSessionActive(true);
    setLastTranscript('');
    setUserTranscript('');
    setReconnectNote('');
    economyHistoryRef.current = [];
    economyBusyRef.current = false;
    lastActivityRef.current = Date.now();
    setMicActive(true);
    setStatus('listening');
    addDebugLog('INFO', 'SpeechTTS', 'Economy voice session started (device speech, flash-lite text)');
    // iOS only allows speech output after a tap: speak a silent utterance now so later replies are allowed
    try {
      if ('speechSynthesis' in window) {
        const unlock = new SpeechSynthesisUtterance(' ');
        unlock.volume = 0;
        window.speechSynthesis.speak(unlock);
      }
    } catch {
      /* ignore */
    }
    listenNext();
  };

  const initLiveSession = async () => {
    if (getVoiceEngine() === 'economy') {
      initEconomySession();
      return;
    }
    activeRef.current = true;
    setIsSessionActive(true);
    setStatus('connecting');
    setLastTranscript('');
    setUserTranscript('');
    addDebugLog('INFO', 'WebSocket', 'Initializing Spero Live Voice session...');

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      let outputCtx: AudioContext;
      try {
        outputCtx = new AudioCtx({ sampleRate: 24000 });
      } catch {
        outputCtx = new AudioCtx();
      }

      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      audioContextOutRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;
      addDebugLog('INFO', 'AudioStream', `Output AudioContext active at ${outputCtx.sampleRate}Hz`);

      // Connect straight to Gemini Live with automatic key failover and endless reconnect
      const ws = new GeminiLiveSocket({ getContext: buildLiveContext });
      wsRef.current = ws;
      setReconnectNote('');

      ws.onopen = () => {
        addDebugLog('SUCCESS', 'WebSocket', 'Connected to Gemini Live');
        setStatus('listening');
        startMicrophoneStream(ws);
      };

      ws.onmessage = async (event) => {
        if (!activeRef.current) return;
        lastActivityRef.current = Date.now();
        try {
          const data = JSON.parse(event.data);

          if (data.interrupted) {
            addDebugLog('WARN', 'AudioStream', 'Spero playback interrupted by user voice');
            addSpeechEvent('USER_INTERRUPTION', 'Playback interrupted by model VAD');
            stopAiPlayback();
            return;
          }

          if (data.status) {
            if (data.status === 'reconnecting') {
              setReconnectNote(
                locale === 'ar'
                  ? 'جاري إعادة الاتصال تلقائياً بمفتاح آخر...'
                  : 'Reconnecting automatically with the next key...'
              );
              addDebugLog('WARN', 'WebSocket', 'Reconnecting', data.error ? String(data.error) : undefined);
            } else if (data.status === 'connected') {
              setReconnectNote('');
              setStatus((prev) => (prev === 'speaking' ? prev : 'listening'));
              addDebugLog('SUCCESS', 'WebSocket', `Live voice connected via ${data.label || 'key'}`);
            }
          }

          if (data.error && data.fatal) {
            terminateSession();
            setReconnectNote(locale === 'ar' ? 'أضف مفتاح Gemini من الإعدادات أولاً.' : 'Add a Gemini key in Settings first.');
            setTimeout(() => setReconnectNote(''), 6000);
            addDebugLog('ERROR', 'GeminiLive', String(data.error));
          }

          if (data.functionCalls && data.functionCalls.length > 0) {
            const responses: { id?: string; name: string; response: unknown }[] = [];
            for (const call of data.functionCalls) {
              const result = await executeToolSafely(call.name, call.args || {});
              responses.push({
                id: call.id,
                name: call.name,
                response: result ?? { ok: false, error: 'Action failed to run' },
              });
            }
            ws.send(JSON.stringify({ toolResponse: responses }));
          }

          if (data.text) {
            setLastTranscript((prev) => (prev ? `${prev} ${data.text}` : data.text));
            addDebugLog('INFO', 'GeminiLive', `Text transcript: "${data.text}"`);
          }
          if (data.userTranscript) {
            setUserTranscript(data.userTranscript);
            addDebugLog('INFO', 'SpeechTTS', `User speech: "${data.userTranscript}"`);
          }

          if (data.audio && audioContextOutRef.current) {
            if (speechCompletionTimerRef.current) {
              clearTimeout(speechCompletionTimerRef.current);
              speechCompletionTimerRef.current = null;
            }

            if (!isAiSpeakingRef.current) {
              addSpeechEvent('AI_SPEECH_START', 'AI speech streaming started');
            }
            setStatus('speaking');
            isAiSpeakingRef.current = true;
            lastAiSpeechTimeRef.current = Date.now();

            const ctx = audioContextOutRef.current;
            if (ctx.state === 'suspended') {
              await ctx.resume();
            }

            const binary = atob(data.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) {
              float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
            }

            const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
            audioBuffer.getChannelData(0).set(float32);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);

            // Buffer queue timing synchronization with zero overlap:
            // If nextStartTime has fallen behind actual audio context time, advance to currentTime + tiny 20ms lead
            const curTime = ctx.currentTime;
            if (nextStartTimeRef.current < curTime) {
              nextStartTimeRef.current = curTime + 0.02;
            }
            const startTime = nextStartTimeRef.current;
            source.start(startTime);
            nextStartTimeRef.current = startTime + audioBuffer.duration;

            activeSourcesRef.current.add(source);

            source.onended = () => {
              activeSourcesRef.current.delete(source);
              if (activeSourcesRef.current.size === 0) {
                if (speechCompletionTimerRef.current) {
                  clearTimeout(speechCompletionTimerRef.current);
                }
                // Smooth debounce to allow next streaming chunk to arrive without fluttering the Orb
                speechCompletionTimerRef.current = setTimeout(() => {
                  const currentCtx = audioContextOutRef.current;
                  if (!currentCtx || currentCtx.currentTime >= nextStartTimeRef.current - 0.05) {
                    lastAiSpeechTimeRef.current = Date.now();
                    isAiSpeakingRef.current = false;
                    setStatus('listening');
                    addSpeechEvent('AI_SPEECH_END', 'AI speech completed cleanly');
                  }
                }, 400);
              }
            };
          }
        } catch (e) {
          addDebugLog('ERROR', 'WebSocket', 'Error parsing WebSocket message', String(e));
        }
      };

      ws.onerror = (err) => {
        addDebugLog('ERROR', 'WebSocket', 'Live connection problem (auto-retrying)', err?.message);
      };

      ws.onclose = () => {
        addDebugLog('WARN', 'WebSocket', 'WebSocket connection closed');
      };
    } catch (err) {
      addDebugLog('ERROR', 'AudioStream', 'Session initialization failed', String(err));
      setStatus('listening');
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      terminateSession();
    };
  }, [terminateSession]);

  // Pointer dragging handlers for floating bubble
  const handleBubblePointerDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: bubblePos.x,
      initY: bubblePos.y,
      moved: false,
    };
  };

  const handleBubblePointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (start.startX === 0 && start.startY === 0) return;

    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;

    if (!start.moved && Math.hypot(dx, dy) > 5) {
      start.moved = true;
      setIsDragging(true);
    }

    if (start.moved) {
      const maxX = window.innerWidth - (window.innerWidth < 640 ? 60 : 76);
      const maxY = window.innerHeight - 124 - bottomNavInset();
      const newX = Math.min(Math.max(16, start.initX + dx), maxX);
      const newY = Math.min(Math.max(16, start.initY + dy), maxY);
      setBubblePos({ x: newX, y: newY });
    }
  };

  const handleBubblePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const wasMoved = dragStartRef.current.moved;
    dragStartRef.current = { startX: 0, startY: 0, initX: 0, initY: 0, moved: false };

    if (wasMoved) {
      setTimeout(() => setIsDragging(false), 50);
      try {
        localStorage.setItem('spero_voice_agent_pos', JSON.stringify(bubblePos));
      } catch {}
      return;
    }

    setIsDragging(false);

    // Ensure AudioContext is active on user click
    if (audioContextInRef.current?.state === 'suspended') {
      audioContextInRef.current.resume().catch(console.warn);
    }
    if (audioContextOutRef.current?.state === 'suspended') {
      audioContextOutRef.current.resume().catch(console.warn);
    }

    // Tap on an idle bubble: start talking right here (the window stays closed). Tap on an active bubble: open the window.
    if (!isSessionActive || !activeRef.current) {
      setIsSessionActive(true);
      initLiveSession();
    } else {
      setIsWindowOpen(true);
    }
  };

  const handleSendTypedMessage = () => {
    if (!typedInput.trim()) return;
    const text = typedInput.trim();
    setUserTranscript(text);
    setTypedInput('');

    if (wsRef.current && wsRef.current.readyState === LIVE_OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
    } else if (getVoiceEngine() === 'economy' && !wsRef.current) {
      // Economy: the typed request goes through the same free path as speech
      try {
        recognitionRef.current?.abort?.();
      } catch {
        /* ignore */
      }
      void economyTurn(text);
    } else {
      handleFastVoiceQuery(text);
    }
  };

  // Dynamic orb scaling based on audio intensity
  const reactiveScale =
    micActive || status === 'speaking'
      ? 1 + Math.min(0.25, (audioLevel / 100) * 0.3)
      : 1;

  // Render modal window if open
  const renderModalWindow = () => {
    if (!isWindowOpen) return null;
    const ar = locale === 'ar';
    const thinking = status === 'connecting' && !reconnectNote;
    const phaseWin: 'speaking' | 'thinking' | 'listening' | 'ready' = status === 'speaking' ? 'speaking' : thinking ? 'thinking' : micActive ? 'listening' : 'ready';
    const stateLabel = {
      speaking: ar ? 'سبيرو تتحدث' : 'Spero is speaking',
      thinking: economyBusyRef.current ? (ar ? 'تفكّر...' : 'Thinking…') : ar ? 'جارٍ الاتصال' : 'Connecting',
      listening: nearVoiceDetected ? (ar ? 'أسمعك' : 'Hearing you') : ar ? 'أستمع إليك' : 'Listening',
      ready: ar ? 'اضغط على الدائرة للتحدث' : 'Tap the orb to talk',
    }[phaseWin];
    const orbSpin = phaseWin === 'thinking' ? 'spero-orbit-fast' : phaseWin === 'speaking' ? 'spero-orbit-mid' : 'spero-orbit';

    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0b1220]/45 backdrop-blur-xl p-3 sm:p-4 animate-in fade-in duration-200"
        dir={ar ? 'rtl' : 'ltr'}
      >
        <div className="relative w-full max-w-md bg-white/95 text-[#1d1d1f] rounded-[30px] border border-white shadow-[0_30px_80px_-20px_rgba(10,25,60,0.55)] backdrop-blur-3xl overflow-hidden p-4 sm:p-6 flex flex-col mb-[env(safe-area-inset-bottom)]">
          {/* Soft brand-blue wash behind the orb */}
          <div
            className="absolute -top-16 left-1/2 -translate-x-1/2 w-[340px] h-[260px] rounded-full pointer-events-none spero-halo"
            style={{ background: 'radial-gradient(circle, rgba(0,113,227,0.20) 0%, rgba(0,113,227,0.06) 45%, transparent 72%)' }}
          />

          {/* Header: who + state, and the few controls that matter */}
          <div className="relative z-20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="relative w-9 h-9 shrink-0 rounded-full spero-core flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-sm font-bold tracking-tight">Spero</div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      phaseWin === 'ready' ? 'bg-[#c7c7cc]' : phaseWin === 'speaking' ? 'bg-[#0071e3] animate-pulse' : 'bg-emerald-500 animate-pulse'
                    }`}
                  />
                  <span className="truncate">{stateLabel}</span>
                  <span className="shrink-0 px-1.5 rounded-full bg-[#f5f5f7] text-[10px] font-bold text-[#6e6e73]">{wsRef.current ? 'Live' : ar ? 'اقتصادي' : 'Economy'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center rounded-full bg-[#f5f5f7] p-0.5 text-[11px] font-bold" role="group" aria-label={ar ? 'لغة الحديث' : 'Speaking language'} dir="ltr">
                {(['ar', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => changeVoiceLang(l)}
                    aria-pressed={voiceLang === l}
                    className={`min-w-8 sm:min-w-9 h-8 sm:h-9 px-2 rounded-full transition-colors ${voiceLang === l ? 'bg-[#0071e3] text-white shadow-sm' : 'text-[#515154]'}`}
                  >
                    {l === 'ar' ? 'عربي' : 'EN'}
                  </button>
                ))}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreMenu((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={showMoreMenu}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] active:scale-95 text-[#515154] flex items-center justify-center transition-all"
                  title={ar ? 'المزيد' : 'More'}
                  aria-label={ar ? 'المزيد' : 'More'}
                >
                  <MoreHorizontal className="w-5 h-5" />
                  {(debugLogs.some((l) => l.level === 'ERROR') || nearVoiceFocus) && (
                    <span className={`absolute top-1.5 end-1.5 w-2 h-2 rounded-full ${nearVoiceFocus ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  )}
                </button>
                {showMoreMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowMoreMenu(false)} aria-hidden="true" />
                    <div role="menu" className={`absolute z-30 top-full mt-1.5 w-64 rounded-2xl bg-white border border-[#d2d2d7] shadow-2xl p-1.5 ${ar ? 'left-0' : 'right-0'}`}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setNearVoiceFocus(!nearVoiceFocus)}
                        className="w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl text-start hover:bg-[#f5f5f7]"
                      >
                        {nearVoiceFocus ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <Shield className="w-5 h-5 text-[#86868b]" />}
                        <span className="flex flex-col leading-tight flex-1">
                          <span className="text-sm font-semibold">{ar ? 'وضع الاجتماع' : 'Meeting mode'}</span>
                          <span className="text-[11px] text-[#86868b]">{ar ? 'الاستماع إليك أنت فقط' : 'Listen only to you'}</span>
                        </span>
                        <span className={`text-[11px] font-bold ${nearVoiceFocus ? 'text-emerald-600' : 'text-[#86868b]'}`}>{nearVoiceFocus ? (ar ? 'يعمل' : 'On') : ar ? 'متوقف' : 'Off'}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowMoreMenu(false);
                          setIsVoiceDebugMonitorOpen(true);
                        }}
                        className="w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl text-start hover:bg-[#f5f5f7]"
                      >
                        <Activity className="w-5 h-5 text-[#0071e3]" />
                        <span className="text-sm font-semibold">{ar ? 'مراقب الصوت' : 'Voice monitor'}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowMoreMenu(false);
                          setShowDebugPanel(!showDebugPanel);
                        }}
                        className="w-full min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl text-start hover:bg-[#f5f5f7]"
                      >
                        <Terminal className="w-5 h-5 text-amber-600" />
                        <span className="text-sm font-semibold flex-1">{ar ? 'سجل التشخيص' : 'Diagnostics log'}</span>
                        {debugLogs.filter((l) => l.level === 'ERROR').length > 0 && (
                          <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 rounded-full">{debugLogs.filter((l) => l.level === 'ERROR').length}</span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setIsWindowOpen(false);
                  onClose?.();
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] active:scale-95 text-[#515154] flex items-center justify-center transition-all"
                title={ar ? 'تصغير إلى الفقاعة (تستمر في الحديث)' : 'Minimise to the bubble (keeps talking)'}
                aria-label={ar ? 'تصغير' : 'Minimise'}
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIsWindowOpen(false);
                  terminateSession();
                  onClose?.();
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 flex items-center justify-center transition-all"
                title={ar ? 'إنهاء الجلسة' : 'End session'}
                aria-label={ar ? 'إنهاء الجلسة' : 'End session'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {reconnectNote && (
            <div className="relative z-10 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" role="status">
              {reconnectNote}
            </div>
          )}

          {/* The orb */}
          <div className="relative z-10 my-4 sm:my-5 flex items-center justify-center h-40">
            {(phaseWin === 'speaking' || phaseWin === 'listening') && (
              <>
                <span className="absolute w-28 h-28 rounded-full border border-[#0071e3]/35 spero-ring pointer-events-none" />
                <span className="absolute w-28 h-28 rounded-full border border-[#0071e3]/25 spero-ring pointer-events-none" style={{ animationDelay: '1.1s' }} />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                if (micActive) {
                  stopMicrophone();
                } else if (getVoiceEngine() === 'economy' && !wsRef.current) {
                  initEconomySession();
                } else {
                  startMicrophoneStream(wsRef.current);
                }
              }}
              className="relative w-28 h-28 rounded-full cursor-pointer transition-transform duration-200 active:scale-95 focus:outline-none"
              style={{ transform: `scale(${reactiveScale})` }}
              title={micActive ? (ar ? 'كتم' : 'Mute') : ar ? 'اضغط للتحدث' : 'Tap to talk'}
              aria-label={micActive ? (ar ? 'كتم الميكروفون' : 'Mute microphone') : ar ? 'تشغيل الميكروفون' : 'Turn the microphone on'}
            >
              <span
                className={`absolute -inset-[5px] rounded-full pointer-events-none ${orbSpin}`}
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg 150deg, rgba(124,192,255,0.15) 200deg, #7cc0ff 300deg, #0071e3 360deg)',
                  WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
                  mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
                  opacity: phaseWin === 'ready' ? 0.5 : 1,
                }}
              />
              <span className="absolute inset-0 rounded-full spero-core flex items-center justify-center overflow-hidden">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-14 rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.42) 0%, transparent 70%)' }} />
                {phaseWin === 'thinking' ? (
                  <span className="w-8 h-8 rounded-full border-[3px] border-white/25 border-t-white animate-spin" />
                ) : phaseWin === 'speaking' ? (
                  <span className="flex items-center gap-[4px] h-9" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="w-[4px] h-9 rounded-full bg-white spero-bar" style={{ animationDelay: `${i * 0.11}s` }} />
                    ))}
                  </span>
                ) : micActive ? (
                  nearVoiceDetected ? <UserCheck className="w-9 h-9 text-white" /> : <Mic className="w-9 h-9 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
                ) : (
                  <MicOff className="w-9 h-9 text-white/55" />
                )}
              </span>
            </button>
          </div>

          {/* Voice waveform */}
          <div className="relative z-10 w-full flex items-center justify-center -mt-2 mb-1">
            <canvas ref={waveformCanvasRef} width={420} height={48} className="w-full max-w-[420px] h-12 pointer-events-none" />
          </div>

          {/* What was heard and what Spero says */}
          <div className="relative z-10 w-full my-2 min-h-[72px] max-h-[110px] flex flex-col justify-center px-4 py-3 rounded-2xl bg-[#f5f5f7] border border-[#ececf0] overflow-y-auto">
            {userTranscript ? <p className="text-[#6e6e73] text-xs sm:text-sm italic line-clamp-2">&ldquo;{userTranscript}&rdquo;</p> : null}
            {lastTranscript ? (
              <p className={`text-[#1d1d1f] text-sm sm:text-[15px] font-semibold leading-relaxed ${userTranscript ? 'mt-1.5' : ''}`}>{lastTranscript}</p>
            ) : !userTranscript ? (
              <p className="text-[#86868b] text-sm text-center">
                {ar ? (nearVoiceFocus ? 'تحدّث الآن، أستمع إليك أنت فقط' : 'تحدّث معي، أنا أستمع') : nearVoiceFocus ? 'Speak now, listening to you only' : 'Speak now, I am listening'}
              </p>
            ) : null}
          </div>

          {/* Type instead of speaking */}
          <div className="relative z-10 w-full flex items-center gap-2 mt-2">
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendTypedMessage();
              }}
              placeholder={ar ? 'أو اكتب طلبك لسبيرو...' : 'Or type your request to Spero...'}
              className="flex-1 min-w-0 h-12 bg-white border border-[#d2d2d7] focus:border-[#0071e3] rounded-2xl px-4 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleSendTypedMessage}
              disabled={!typedInput.trim()}
              className="w-12 h-12 shrink-0 rounded-2xl bg-[#0071e3] hover:bg-[#0062c4] disabled:opacity-40 active:scale-95 flex items-center justify-center text-white transition-all"
              aria-label={ar ? 'إرسال' : 'Send'}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Diagnostic Error & Audio Stream Logger Panel */}
          {showDebugPanel && (
            <div className="w-full mt-3 p-3.5 rounded-2xl bg-black/85 border border-white/15 text-left font-mono text-[11px] text-white/80 flex flex-col gap-2 max-h-56 overflow-y-auto animate-in fade-in zoom-in-95 z-20">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-white text-xs">
                    {locale === 'ar' ? 'سجل تشخيص الصوت والوظائف' : 'Voice & Tool Diagnostic Log'}
                  </span>
                  <span className="text-[10px] text-white/40">({debugLogs.length})</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const textLogs = JSON.stringify(debugLogs, null, 2);
                      navigator.clipboard.writeText(textLogs);
                      setCopiedLogSuccess(true);
                      setTimeout(() => setCopiedLogSuccess(false), 2000);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-all"
                  >
                    {copiedLogSuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLogSuccess ? (locale === 'ar' ? 'تم النسخ' : 'Copied') : (locale === 'ar' ? 'نسخ السجل' : 'Copy Logs')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(debugLogs, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute("href", dataStr);
                      downloadAnchor.setAttribute("download", `spero_voice_debug_${Date.now()}.json`);
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                    }}
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
                    title={locale === 'ar' ? 'تنزيل ملف التشخيص' : 'Download Diagnostic Log File'}
                  >
                    <Download className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDebugLogs([]);
                      try { localStorage.removeItem('spero_voice_debug_logs'); } catch {}
                    }}
                    className="p-1 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-all"
                    title={locale === 'ar' ? 'مسح السجل' : 'Clear Logs'}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-[10px]">
                {['All', 'ToolCall', 'GeminiLive', 'WebSocket', 'AudioStream', 'SpeechTTS'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setDebugCategoryFilter(cat)}
                    className={`px-2 py-0.5 rounded-md transition-all ${
                      debugCategoryFilter === cat
                        ? 'bg-cyan-400 text-black font-bold'
                        : 'bg-white/5 hover:bg-white/10 text-white/60'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Log Entries */}
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-36 pr-1 text-[10px]">
                {debugLogs.length === 0 ? (
                  <p className="text-white/40 italic py-2 text-center">
                    {locale === 'ar' ? 'لا توجد أحداث مسجلة حتى الآن' : 'No diagnostic entries logged yet'}
                  </p>
                ) : (
                  debugLogs
                    .filter((l) => debugCategoryFilter === 'All' || l.category === debugCategoryFilter)
                    .map((log) => (
                      <div key={log.id} className="p-1.5 rounded-lg bg-white/[0.04] border border-white/5 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40">{log.timestamp}</span>
                            <span
                              className={`px-1 rounded text-[9px] font-bold ${
                                log.level === 'ERROR'
                                  ? 'bg-red-500/30 text-red-300 border border-red-500/40'
                                  : log.level === 'WARN'
                                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                  : log.level === 'SUCCESS'
                                  ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                              }`}
                            >
                              {log.level}
                            </span>
                            <span className="text-white/70 font-semibold">{log.category}</span>
                          </div>
                        </div>
                        <p className="text-white/90 font-medium leading-snug">{log.message}</p>
                        {log.details && (
                          <pre className="text-[9px] text-white/50 bg-black/50 p-1 rounded overflow-x-auto">
                            {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                          </pre>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render floating draggable bubble when modal is closed
  const renderFloatingBubble = () => {
    if (isWindowOpen || (hideBubble && !isSessionActive)) return null;

    const ar = locale === 'ar';
    const reconnecting = !!reconnectNote;
    // Development-only visual QA override (stripped from production builds)
    const forced = import.meta.env.DEV ? (localStorage.getItem('qa_bubble') as 'idle' | 'connecting' | 'reconnecting' | 'speaking' | 'listening' | null) : null;
    const controlsVisible = isSessionActive || !!forced;
    const phase: 'idle' | 'connecting' | 'reconnecting' | 'speaking' | 'listening' = forced
      ? forced
      : !isSessionActive
      ? 'idle'
      : reconnecting
      ? 'reconnecting'
      : status === 'connecting'
      ? 'connecting'
      : status === 'speaking'
      ? 'speaking'
      : 'listening';

    const label = {
      idle: ar ? 'اضغط للتحدث' : 'Tap to talk',
      connecting: economyBusyRef.current ? (ar ? 'تفكّر...' : 'Thinking…') : ar ? 'جارٍ الاتصال' : 'Connecting',
      reconnecting: ar ? 'إعادة الاتصال' : 'Reconnecting',
      speaking: ar ? 'سبيرو تتحدث' : 'Spero is speaking',
      listening: nearVoiceDetected ? (ar ? 'أسمعك' : 'Hearing you') : ar ? 'أستمع إليك' : 'Listening',
    }[phase];

    const warm = phase === 'reconnecting';
    const aura = warm ? 'rgba(245,158,11,0.45)' : 'rgba(0,113,227,0.42)';
    const level = Math.min(1, audioLevel / 100);
    const spinClass = phase === 'connecting' || phase === 'reconnecting' ? 'spero-orbit-fast' : phase === 'speaking' ? 'spero-orbit-mid' : 'spero-orbit';
    const captionOnLeft = bubblePos.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 400);
    const caption =
      phase === 'speaking' || phase === 'listening'
        ? lastTranscript || userTranscript || (forced ? (ar ? 'تم تسجيل الاجتماع في التقويم، المهندس محمد.' : 'The meeting has been scheduled, Eng. Mohamed.') : '')
        : '';

    return (
      <div
        style={{ left: `${bubblePos.x}px`, top: `${bubblePos.y}px`, touchAction: 'none' }}
        onPointerDown={handleBubblePointerDown}
        onPointerMove={handleBubblePointerMove}
        onPointerUp={handleBubblePointerUp}
        className="fixed z-50 select-none cursor-grab active:cursor-grabbing"
        role="group"
        aria-label={ar ? 'المساعد الصوتي سبيرو' : 'Spero voice assistant'}
      >
        <div className="relative w-9 h-9 sm:w-12 sm:h-12">
          {/* Soft halo that breathes (and swells with your voice while listening) */}
          <span
            className="absolute -inset-3 sm:-inset-5 rounded-full pointer-events-none spero-halo"
            style={{
              background: `radial-gradient(circle, ${aura} 0%, transparent 66%)`,
              transform: `scale(${1 + (phase === 'listening' ? level * 0.45 : 0)})`,
              transition: 'transform 140ms ease-out',
            }}
          />

          {/* Quiet ripples while it is active */}
          {(phase === 'speaking' || phase === 'listening') && (
            <>
              <span className="absolute inset-0 rounded-full border border-[#0071e3]/45 spero-ring pointer-events-none" />
              <span className="absolute inset-0 rounded-full border border-[#0071e3]/30 spero-ring pointer-events-none" style={{ animationDelay: '1.1s' }} />
            </>
          )}

          {/* Comet ring that circles the orb (faster while it thinks) */}
          <span
            className={`absolute -inset-[3px] rounded-full pointer-events-none ${spinClass}`}
            style={{
              background: warm
                ? 'conic-gradient(from 0deg, transparent 0deg 150deg, rgba(251,191,36,0.2) 200deg, #fbbf24 300deg, #f59e0b 360deg)'
                : 'conic-gradient(from 0deg, transparent 0deg 150deg, rgba(124,192,255,0.15) 200deg, #7cc0ff 300deg, #0071e3 360deg)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 1.5px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 1.5px))',
              opacity: phase === 'idle' ? 0.55 : 1,
            }}
          />

          {/* The orb */}
          <div
            className={`absolute inset-0 rounded-full flex items-center justify-center text-white overflow-hidden transition-transform duration-200 ${
              warm ? 'spero-core-warm' : 'spero-core'
            } ${isDragging ? 'scale-95' : 'active:scale-95'}`}
          >
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-6 rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.42) 0%, transparent 70%)' }} />
            {phase === 'connecting' || phase === 'reconnecting' ? (
              <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border-[2.5px] border-white/25 border-t-white animate-spin" />
            ) : phase === 'speaking' ? (
              <span className="flex items-center gap-[2px] sm:gap-[3px] h-4 sm:h-5" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-[2px] sm:w-[3px] h-4 sm:h-5 rounded-full bg-white spero-bar" style={{ animationDelay: `${i * 0.11}s` }} />
                ))}
              </span>
            ) : phase === 'listening' ? (
              <Mic className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ transform: `scale(${1 + level * 0.25})`, transition: 'transform 100ms' }} />
            ) : (
              <Sparkles className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px] text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
            )}
          </div>
        </div>

        {/* Frosted status chip with always-visible controls (touch friendly; no hover needed) */}
        <div
          className={`absolute ${captionOnLeft ? 'right-0' : 'left-0'} top-[44px] sm:top-[58px] flex items-center gap-1 rounded-full bg-white/85 backdrop-blur-xl text-[#1d1d1f] ps-3 pe-1 py-1 border border-black/5 shadow-[0_8px_24px_-8px_rgba(10,25,60,0.35)] whitespace-nowrap`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${phase === 'idle' ? 'bg-[#c7c7cc]' : warm ? 'bg-amber-500 animate-pulse' : 'bg-[#0071e3] animate-pulse'}`} />
          <span className="text-[11px] font-semibold px-1.5 text-[#1d1d1f]">{label}</span>
          {controlsVisible && (
            <>
              <button
                type="button"
                onClick={() => setIsWindowOpen(true)}
                className="w-7 h-7 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] flex items-center justify-center text-[#515154] transition-colors"
                aria-label={ar ? 'فتح النافذة' : 'Open window'}
                title={ar ? 'فتح النافذة' : 'Open window'}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={terminateSession}
                className="w-7 h-7 rounded-full bg-rose-50 hover:bg-rose-100 flex items-center justify-center text-rose-600 transition-colors"
                aria-label={ar ? 'إيقاف الصوت' : 'Stop voice'}
                title={ar ? 'إيقاف الصوت' : 'Stop voice'}
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            </>
          )}
        </div>

        {/* Live caption: what Spero is saying (or what you said), placed on the roomier side */}
        {caption && (
          <div
            className={`absolute top-1 ${captionOnLeft ? 'right-[46px] sm:right-[60px]' : 'left-[46px] sm:left-[60px]'} w-[min(280px,60vw)] bg-white/90 backdrop-blur-xl text-[#1d1d1f] px-3.5 py-2.5 rounded-2xl border border-black/5 shadow-[0_10px_30px_-10px_rgba(10,25,60,0.4)] pointer-events-none`}
            dir={ar ? 'rtl' : 'ltr'}
          >
            <p className="line-clamp-3 leading-relaxed text-[12px]">{caption}</p>
          </div>
        )}

        {reconnectNote && (
          <div
            className={`absolute top-[78px] sm:top-[94px] ${captionOnLeft ? 'right-0' : 'left-0'} w-[min(260px,70vw)] text-center text-[11px] text-amber-900 bg-amber-50/95 border border-amber-200 rounded-xl px-2.5 py-1.5 backdrop-blur-xl`}
            role="status"
          >
            {reconnectNote}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {renderFloatingBubble()}
      {renderModalWindow()}
      <VoiceDebugMonitor
        isOpen={isVoiceDebugMonitorOpen}
        onClose={() => setIsVoiceDebugMonitorOpen(false)}
        connectionStatus={
          wsRef.current?.readyState === LIVE_OPEN
            ? 'connected'
            : wsRef.current?.readyState === LIVE_CONNECTING
            ? 'connecting'
            : 'disconnected'
        }
        audioContextState={audioContextOutRef.current?.state || 'suspended'}
        sampleRate={audioContextOutRef.current?.sampleRate || 24000}
        activeSourceCount={activeSourcesRef.current.size}
        bufferQueueSeconds={Math.max(
          0,
          Number(
            (
              nextStartTimeRef.current -
              (audioContextOutRef.current?.currentTime || 0)
            ).toFixed(3)
          )
        )}
        bufferFillPercentage={Math.min(
          100,
          Math.round(
            (Math.max(
              0,
              nextStartTimeRef.current -
                (audioContextOutRef.current?.currentTime || 0)
            ) /
              2.0) *
              100
          )
        )}
        isMutedForEcho={
          isAiSpeakingRef.current ||
          Date.now() - lastAiSpeechTimeRef.current < 250
        }
        nearVoiceFocus={nearVoiceFocus}
        nearVoiceDetected={nearVoiceDetected}
        micDbfs={micDbfsState}
        events={speechEvents}
        onClearEvents={() => setSpeechEvents([])}
      />
    </>
  );
};
