import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Locale } from '../../lib/translations';
import { VoiceDebugMonitor, SpeechEvent } from './VoiceDebugMonitor';
import { GeminiLiveSocket, LIVE_OPEN, LIVE_CONNECTING } from '../../lib/ai/liveSocket';
import { voiceFastQuery } from '../../lib/ai/gemini';
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
          const maxX = typeof window !== 'undefined' ? window.innerWidth - 76 : 300;
          const maxY = typeof window !== 'undefined' ? window.innerHeight - 76 - bottomNavInset() : 600;
          return {
            x: Math.min(Math.max(16, parsed.x), Math.max(16, maxX)),
            y: Math.min(Math.max(16, parsed.y), Math.max(16, maxY)),
          };
        }
      }
    } catch {}
    return {
      x: typeof window !== 'undefined' ? window.innerWidth - 84 : 300,
      y: typeof window !== 'undefined' ? window.innerHeight - 88 - bottomNavInset() : 600,
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
        x: Math.min(Math.max(16, prev.x), window.innerWidth - 76),
        y: Math.min(Math.max(16, prev.y), window.innerHeight - 76 - bottomNavInset()),
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
              color: 'rgba(0, 242, 254, 0.85)',
              glow: 'rgba(0, 242, 254, 0.7)',
              speed: 1.0,
              freq: 0.022,
              amp: ampBase * 1.0,
              lineWidth: 2.4,
            },
            {
              color: 'rgba(255, 0, 127, 0.8)',
              glow: 'rgba(255, 0, 127, 0.6)',
              speed: -1.3,
              freq: 0.018,
              amp: ampBase * 0.85,
              lineWidth: 2.0,
            },
            {
              color: 'rgba(121, 40, 202, 0.85)',
              glow: 'rgba(121, 40, 202, 0.65)',
              speed: 0.8,
              freq: 0.026,
              amp: ampBase * 0.75,
              lineWidth: 2.2,
            },
            {
              color: 'rgba(56, 189, 248, 0.9)',
              glow: 'rgba(56, 189, 248, 0.8)',
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
            autoGainControl: !nearVoiceFocusRef.current,
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
      const reply = data.text || (locale === 'ar' ? 'تمام يافندم، تم تنفيذ الأمر.' : 'Understood, done.');
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

  const initLiveSession = async () => {
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
            setReconnectNote(locale === 'ar' ? 'أضف مفتاح Gemini من الإعدادات أولاً.' : 'Add a Gemini key in Settings first.');
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
      const maxX = window.innerWidth - 76;
      const maxY = window.innerHeight - 76 - bottomNavInset();
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

    // Always expand window modal on bubble click; maintain active live session if already running
    setIsWindowOpen(true);
    if (!isSessionActive || !activeRef.current) {
      setIsSessionActive(true);
      initLiveSession();
    }
  };

  const handleSendTypedMessage = () => {
    if (!typedInput.trim()) return;
    const text = typedInput.trim();
    setUserTranscript(text);
    setTypedInput('');

    if (wsRef.current && wsRef.current.readyState === LIVE_OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
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

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-2xl p-4 animate-in fade-in duration-200">
        {/* Siri AI Floating Glass Modal - Perfectly Sized, Zero Scrollbar */}
        <div className="relative w-full max-w-lg bg-[#0e0f14]/94 text-white rounded-[36px] border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.85)] backdrop-blur-3xl overflow-hidden p-6 sm:p-7 flex flex-col items-center text-center select-none">
          {/* Subtle Ambient Siri Glow Background */}
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full pointer-events-none transition-all duration-700 animate-siri-glow"
            style={{
              background:
                status === 'speaking'
                  ? 'radial-gradient(circle, rgba(0,113,227,0.35) 0%, rgba(138,43,226,0.25) 50%, transparent 75%)'
                  : micActive
                  ? nearVoiceDetected
                    ? 'radial-gradient(circle, rgba(0,242,254,0.35) 0%, rgba(255,0,128,0.3) 50%, transparent 75%)'
                    : 'radial-gradient(circle, rgba(138,43,226,0.2) 0%, rgba(0,113,227,0.15) 50%, transparent 75%)'
                  : 'radial-gradient(circle, rgba(138,43,226,0.25) 0%, rgba(0,113,227,0.15) 50%, transparent 75%)',
            }}
          />

          {/* Top Header Bar: Status Pill + Meeting Focus Toggle + Minimize + Close */}
          <div className="w-full flex items-center justify-between mb-4 z-10 gap-2 flex-wrap sm:flex-nowrap">
            {/* Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white/90">
              <span
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  status === 'speaking'
                    ? 'bg-blue-400 animate-pulse shadow-[0_0_8px_#60a5fa]'
                    : micActive
                    ? nearVoiceDetected
                      ? 'bg-emerald-400 animate-ping shadow-[0_0_8px_#34d399]'
                      : 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]'
                    : 'bg-white/40'
                }`}
              />
              <span className="tracking-wide">Siri AI</span>
              <span className="text-white/40">·</span>
              <span className="text-white/70">
                {status === 'speaking'
                  ? locale === 'ar' ? 'يتحدث' : 'Speaking'
                  : micActive
                  ? nearVoiceDetected
                    ? locale === 'ar' ? 'صوت قريب (أنت)' : 'Near Voice (You)'
                    : locale === 'ar' ? 'جاهز للاستماع' : 'Listening'
                  : locale === 'ar' ? 'جاهز' : 'Ready'}
              </span>
            </div>
            {reconnectNote && (
              <div className="absolute left-4 right-4 top-12 z-10 text-[11px] text-amber-200 bg-amber-500/15 border border-amber-400/30 rounded-xl px-3 py-1.5" role="status">
                {reconnectNote}
              </div>
            )}

            {/* Meeting Mode / Near-Voice Focus Toggle & Debug Panel & Window Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNearVoiceFocus(!nearVoiceFocus)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                  nearVoiceFocus
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.15)]'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
                title={
                  locale === 'ar'
                    ? 'وضع الاجتماع: الاستماع للصوت القريب فقط وعزل أصوات باقي الحضور'
                    : 'Meeting Mode: Listens only to you in front of device, rejects background attendees'
                }
              >
                {nearVoiceFocus ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-white/50" />
                )}
                <span className="hidden xs:inline">
                  {nearVoiceFocus
                    ? locale === 'ar' ? 'عزل الاجتماع: نشط' : 'Meeting Focus: ON'
                    : locale === 'ar' ? 'عزل الاجتماع: متوقف' : 'Meeting Focus: OFF'}
                </span>
              </button>

              {/* Voice Debug Monitor Button (Tracks Connection, Buffer Fill %, Utterance vs Interruption Timestamps) */}
              <button
                type="button"
                onClick={() => setIsVoiceDebugMonitorOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border bg-cyan-500/15 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/25 shadow-[0_0_10px_rgba(0,242,254,0.15)]"
                title={locale === 'ar' ? 'مراقب تشخيص الصوت المباشر والـ WebRTC' : 'Real-time Voice & Audio Stream Monitor'}
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span className="hidden sm:inline">
                  {locale === 'ar' ? 'مراقب الصوت' : 'Voice Monitor'}
                </span>
                {speechEvents.filter((e) => e.type === 'USER_INTERRUPTION').length > 0 && (
                  <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                    {speechEvents.filter((e) => e.type === 'USER_INTERRUPTION').length}
                  </span>
                )}
              </button>

              {/* Debug Logs Toggle Button */}
              <button
                type="button"
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                  showDebugPanel
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
                title={locale === 'ar' ? 'سجل تشخيص الصوت والوظائف والأخطاء' : 'Voice & Tool Diagnostic Logs'}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">
                  {locale === 'ar' ? 'سجل التشخيص' : 'Debug Logs'}
                </span>
                {debugLogs.filter((l) => l.level === 'ERROR').length > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                    {debugLogs.filter((l) => l.level === 'ERROR').length}
                  </span>
                )}
              </button>

              {/* Minimize Button: Closes window while speech continues inside the bubble! */}
              <button
                onClick={() => {
                  setIsWindowOpen(false);
                  onClose?.();
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/70 hover:text-white flex items-center justify-center transition-all border border-white/10"
                title={
                  locale === 'ar'
                    ? 'تصغير إلى الفقاعة (متابعة التحدث)'
                    : 'Minimize to bubble (completes speech in background)'
                }
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              {/* Close Button: Completely stops session and closes */}
              <button
                onClick={() => {
                  setIsWindowOpen(false);
                  terminateSession();
                  onClose?.();
                }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/70 hover:text-white flex items-center justify-center transition-all border border-white/10"
                title={locale === 'ar' ? 'إغلاق وإنهاء' : 'Close & end session'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Central Siri Glowing Orb */}
          <div className="relative my-2 flex items-center justify-center z-10">
            {/* Animated Wave Rings when speaking/listening */}
            {(status === 'speaking' || micActive) && (
              <div
                className="absolute rounded-full border border-cyan-400/30 animate-ping pointer-events-none"
                style={{
                  width: `${110 + audioLevel * 0.75}px`,
                  height: `${110 + audioLevel * 0.75}px`,
                }}
              />
            )}

            {/* The Siri Multi-color Radiant Orb */}
            <button
              type="button"
              onClick={() => {
                if (micActive) {
                  stopMicrophone();
                } else {
                  startMicrophoneStream(wsRef.current);
                }
              }}
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full p-1 cursor-pointer transition-transform duration-200 active:scale-95 focus:outline-none"
              style={{ transform: `scale(${reactiveScale})` }}
              title={micActive ? 'Mute' : 'Tap to speak'}
            >
              {/* Iridescent outer fluid gradient ring */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff007f] via-[#7928ca] via-[#00f2fe] to-[#4facfe] animate-siri-spin blur-[2px] opacity-90" />

              {/* Siri Orb Core with deep multi-stop radial highlights */}
              <div className="relative w-full h-full rounded-full bg-gradient-to-br from-[#121420] via-[#0c0d15] to-[#1a1329] border border-white/25 flex items-center justify-center shadow-[inset_0_2px_12px_rgba(255,255,255,0.3)]">
                {status === 'speaking' ? (
                  <Volume2 className="w-9 h-9 text-cyan-300 animate-pulse drop-shadow-[0_0_12px_rgba(0,242,254,0.8)]" />
                ) : micActive ? (
                  nearVoiceDetected ? (
                    <UserCheck className="w-9 h-9 text-emerald-300 animate-bounce drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  ) : (
                    <Mic className="w-9 h-9 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]" />
                  )
                ) : (
                  <MicOff className="w-9 h-9 text-white/40" />
                )}
              </div>
            </button>
          </div>

          {/* Dynamic Siri Animated Waveform Visualizer Canvas */}
          <div className="w-full flex items-center justify-center my-2 relative z-10">
            <canvas
              ref={waveformCanvasRef}
              width={420}
              height={56}
              className="w-full max-w-[420px] h-14 rounded-2xl pointer-events-none"
            />
          </div>

          {/* Voice Prompt & Live Transcription Display (Zero Scroll, Smooth Wrap) */}
          <div className="w-full my-2 min-h-[64px] max-h-[88px] flex flex-col justify-center items-center px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md z-10 overflow-hidden">
            {userTranscript ? (
              <p className="text-white/80 text-xs sm:text-sm font-medium italic line-clamp-2">
                &ldquo;{userTranscript}&rdquo;
              </p>
            ) : null}

            {lastTranscript ? (
              <p
                className={`text-white text-xs sm:text-sm font-semibold tracking-wide line-clamp-2 ${
                  userTranscript ? 'mt-1' : ''
                }`}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              >
                {lastTranscript}
              </p>
            ) : !userTranscript ? (
              <p className="text-white/40 text-xs font-normal">
                {locale === 'ar'
                  ? nearVoiceFocus
                    ? 'تحدث معي... مستمع لصوتك القريب فقط مع عزل القاعة'
                    : 'تحدث معي، أنا مستمع...'
                  : nearVoiceFocus
                  ? 'Speak now... isolated for your voice only'
                  : 'Speak now, listening...'}
              </p>
            ) : null}
          </div>

          {/* Bottom Quick-Command Text Bar */}
          <div className="w-full flex items-center gap-2 mt-2 z-10">
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendTypedMessage();
              }}
              placeholder={
                locale === 'ar'
                  ? 'أو اكتب أمراً لـ Siri AI...'
                  : 'Or type a command to Siri AI...'
              }
              className="flex-1 bg-white/[0.08] border border-white/15 focus:border-cyan-400/80 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-white/35 focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleSendTypedMessage}
              disabled={!typedInput.trim()}
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#00f2fe] disabled:opacity-40 hover:opacity-90 active:scale-95 flex items-center justify-center text-white transition-all shadow-[0_4px_16px_rgba(0,113,227,0.4)]"
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
    if (isWindowOpen) return null;

    return (
      <div
        style={{
          left: `${bubblePos.x}px`,
          top: `${bubblePos.y}px`,
          touchAction: 'none',
        }}
        onPointerDown={handleBubblePointerDown}
        onPointerMove={handleBubblePointerMove}
        onPointerUp={handleBubblePointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed z-50 select-none flex items-center group cursor-grab active:cursor-grabbing"
      >
        {/* Real-time Siri Voice Wave aura when speaking or listening in bubble mode */}
        {isSessionActive && (
          <>
            <div
              className={`absolute -inset-2 rounded-full border border-cyan-400/40 pointer-events-none transition-transform duration-100 ${
                status === 'speaking'
                  ? 'border-fuchsia-400/50 animate-ping'
                  : 'border-cyan-400/40 animate-pulse'
              }`}
              style={{
                transform: `scale(${1 + (audioLevel / 100) * 0.35})`,
              }}
            />
            <div
              className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#ff007f] via-[#7928ca] to-[#00f2fe] blur-md opacity-70 animate-pulse pointer-events-none"
            />
          </>
        )}

        {/* Speech Bubble Pill (Shows what Siri is saying while window is closed!) */}
        {isSessionActive && (lastTranscript || status === 'speaking' || status === 'connecting') && (
          <div
            className={`absolute right-16 bottom-1 flex items-center gap-2 max-w-[280px] bg-[#0e0f14]/95 backdrop-blur-2xl text-white px-3.5 py-2 rounded-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.6)] text-xs font-medium animate-in fade-in zoom-in-95 pointer-events-none ${
              locale === 'ar' ? 'text-right' : 'text-left'
            }`}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
            <p className="line-clamp-2 leading-relaxed text-[11px] text-white/90">
              {status === 'connecting'
                ? locale === 'ar' ? 'جاري الاتصال بـ Siri...' : 'Connecting to Siri...'
                : lastTranscript || (locale === 'ar' ? 'أستمع إليك...' : 'Listening to you...')}
            </p>
          </div>
        )}

        {/* Tooltip on Hover when idle */}
        {!isSessionActive && isHovered && !isDragging && (
          <div className="absolute right-16 bottom-1 hidden group-hover:flex flex-col gap-0.5 bg-[#0e0f14]/90 backdrop-blur-xl text-white px-3 py-1.5 rounded-2xl border border-white/20 shadow-2xl text-[11px] font-medium whitespace-nowrap animate-in fade-in duration-150 pointer-events-none">
            <span className="font-bold text-cyan-300">Siri AI</span>
            <span className="text-white/70">
              {locale === 'ar'
                ? 'نقرة: تحدث بالخلفية · نقرتان: فتح النافذة · سحب: تحريك'
                : 'Click: Talk in background · 2-Clicks: Open window · Drag: Move'}
            </span>
          </div>
        )}

        {/* The Siri Bubble Orb Button */}
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-300 relative border-2 ${
            isSessionActive
              ? status === 'speaking'
                ? 'bg-gradient-to-tr from-[#ff007f] via-[#7928ca] to-[#00f2fe] shadow-[0_0_25px_rgba(255,0,127,0.7),0_0_35px_rgba(0,113,227,0.8)] border-white/60 scale-105'
                : 'bg-gradient-to-tr from-[#0071e3] via-[#7928ca] to-[#00f2fe] shadow-[0_0_20px_rgba(0,242,254,0.7)] border-white/50 scale-105'
              : 'bg-gradient-to-tr from-[#ff007f] via-[#7928ca] via-[#0071e3] to-[#00f2fe] hover:scale-110 active:scale-95 shadow-[0_10px_35px_rgba(0,113,227,0.5)] border-white/30'
          }`}
          title={
            locale === 'ar'
              ? 'المساعد الصوتي Siri AI (اسحب للتحريك، نقرة للتحدث، نقرتان للفتح)'
              : 'Siri AI Voice Assistant (Drag to move, click to talk in background, double click to open)'
          }
        >
          {isSessionActive ? (
            status === 'speaking' ? (
              <Volume2 className="w-6 h-6 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-pulse" />
            ) : micActive ? (
              nearVoiceDetected ? (
                <UserCheck className="w-6 h-6 text-emerald-200 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              ) : (
                <Mic className="w-6 h-6 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-pulse" />
              )
            ) : (
              <Sparkles className="w-6 h-6 text-white" />
            )
          ) : (
            <Sparkles className="w-6 h-6 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          )}

          {/* Drag Handle Indicator Pill */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md px-1 py-0.5 rounded-full border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripHorizontal className="w-2.5 h-2.5 text-white/80" />
          </div>

          {/* Quick Action Overlay Buttons on Hover when Session Active */}
          {isSessionActive && isHovered && !isDragging && (
            <div
              className="absolute -top-3 -right-2 flex items-center gap-1 z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsWindowOpen(true);
                }}
                className="w-5 h-5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-white flex items-center justify-center shadow-md transition-transform hover:scale-110"
                title={locale === 'ar' ? 'فتح النافذة' : 'Expand window'}
              >
                <Maximize2 className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  terminateSession();
                }}
                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-md transition-transform hover:scale-110"
                title={locale === 'ar' ? 'إيقاف الصوت' : 'Stop voice'}
              >
                <Square className="w-2.5 h-2.5 fill-current" />
              </button>
            </div>
          )}
        </div>
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
