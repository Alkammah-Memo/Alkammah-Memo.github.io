import React, { useState, useRef, useEffect } from 'react';
import { getCairoUtcOffsetLabel } from '../../lib/cairoTime';
import { transcribeAudio } from '../../lib/ai/gemini';
import { AssistantMessage, Task, Meeting } from '../../types';
import { Locale, translations } from '../../lib/translations';
import {
  Sparkles,
  Send,
  Mic,
  Square,
  RotateCcw,
  CheckCircle2,
  Calendar,
  FileText,
  AlertCircle,
  Clock,
  Radio,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface ExecutiveAssistantProps {
  messages: AssistantMessage[];
  tasks: Task[];
  meetings: Meeting[];
  locale: Locale;
  onSendMessage: (userText: string) => Promise<void>;
  onExecuteToolAction: (toolName: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onUndoToolAction: (undoAction: unknown) => void;
  onOpenLiveVoice?: () => void;
}

// Generic suggestions: clicking one only fills the input box, nothing is executed until the user sends it
const SAMPLE_PROMPTS = {
  en: [
    'What is due today?',
    'Show overdue tasks',
    'What is waiting on others?',
    'What meetings do I have tomorrow?',
    'Schedule a meeting tomorrow at 4 pm',
    'Remind me to follow up next Sunday',
  ],
  ar: [
    'ما المستحق اليوم؟',
    'وريني المهام المتأخرة',
    'ما المهام المعلقة بانتظار الآخرين؟',
    'ما اجتماعاتي غداً؟',
    'ضيف اجتماع بكرة الساعة أربعة',
    'ذكرني بالمتابعة يوم الأحد القادم',
  ],
};

const MAX_RECORD_SECONDS = 180;
const cairoClock = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' });
};

const TOOL_LABELS: Record<string, { en: string; ar: string }> = {
  createTask: { en: 'Task added', ar: 'تمت إضافة مهمة' },
  deleteTask: { en: 'Task deleted', ar: 'تم حذف مهمة' },
  updateTask: { en: 'Task updated', ar: 'تم تحديث مهمة' },
  setTaskStatus: { en: 'Task status changed', ar: 'تم تغيير حالة مهمة' },
  searchTasks: { en: 'Looked up tasks', ar: 'تم البحث في المهام' },
  createMeeting: { en: 'Meeting scheduled', ar: 'تمت جدولة اجتماع' },
  deleteMeeting: { en: 'Meeting deleted', ar: 'تم حذف اجتماع' },
  rescheduleMeeting: { en: 'Meeting rescheduled', ar: 'تم تغيير موعد اجتماع' },
  updateMeeting: { en: 'Meeting updated', ar: 'تم تحديث اجتماع' },
  listMeetings: { en: 'Checked the calendar', ar: 'تمت مراجعة التقويم' },
  getMeetingBriefing: { en: 'Prepared a meeting briefing', ar: 'تم إعداد ملخص الاجتماع' },
  archiveTask: { en: 'Task archived', ar: 'تمت أرشفة مهمة' },
  navigateTo: { en: 'Opened a page', ar: 'تم فتح صفحة' },
  openItem: { en: 'Opened an item', ar: 'تم فتح عنصر' },
};
const toolLabel = (name: string, ar: boolean) => (TOOL_LABELS[name] ? (ar ? TOOL_LABELS[name].ar : TOOL_LABELS[name].en) : name);

export const ExecutiveAssistant: React.FC<ExecutiveAssistantProps> = ({
  messages,
  tasks,
  meetings,
  locale,
  onSendMessage,
  onExecuteToolAction,
  onUndoToolAction,
  onOpenLiveVoice,
}) => {
  const t = translations[locale];
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentCommands, setRecentCommands] = useState<Array<{ id: string; commandText: string; timestamp: string; executedTools?: string[] }>>([]);
  const [showRecentPanel, setShowRecentPanel] = useState(false);

  useEffect(() => {
    const loadCommands = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('spero_recent_voice_commands') || '[]');
        setRecentCommands(stored);
      } catch {}
    };
    loadCommands();
    window.addEventListener('spero-recent-command-added', loadCommands);
    return () => window.removeEventListener('spero-recent-command-added', loadCommands);
  }, []);

  // Audio Recording with gemini-3.5-transcribe
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text) return;
    if (loading) {
      // never drop a command: keep it in the box until the current request finishes
      setInputText(text);
      return;
    }

    setInputText('');
    setLoading(true);
    try {
      await onSendMessage(text);
    } catch (err) {
      console.warn('Assistant request failed:', err);
      setInputText(text);
      setMicError(
        locale === 'ar'
          ? 'تعذر تنفيذ الأمر. أعدنا النص في الحقل، حاول مرة أخرى.'
          : 'The request could not be completed. Your text was restored; please try again.'
      );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const releaseMic = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // Stop the recorder, the microphone stream and the timer when leaving the screen
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const rec = mediaRecorderRef.current;
      if (rec) {
        rec.onstop = null;
        rec.ondataavailable = null;
        if (rec.state !== 'inactive') {
          try {
            rec.stop();
          } catch {
            /* already stopped */
          }
        }
      }
      mediaRecorderRef.current = null;
      releaseMic();
    };
  }, []);

  const startRecordingAudio = async () => {
    setMicError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setMicError(
          locale === 'ar'
            ? 'الميكروفون غير مدعوم في متصفحك الحالي.'
            : 'Microphone is not supported in this browser context.'
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      audioChunksRef.current = [];

      let preferredMime = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) preferredMime = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/aac')) preferredMime = 'audio/aac';
        else preferredMime = '';
      }

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      } catch (recErr) {
        releaseMic();
        throw recErr;
      }
      mediaRecorderRef.current = mediaRecorder;
      const actualMime = mediaRecorder.mimeType || preferredMime || 'audio/webm';

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        releaseMic();
        if (!mountedRef.current) return;
        if (audioBlob.size < 1024) {
          setMicError(locale === 'ar' ? 'لم يتم التقاط صوت. حاول مرة أخرى.' : 'No audio was captured. Please try again.');
          return;
        }

        // Convert Blob to base64
        setTranscribing(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Audio = reader.result as string;
            const text = await transcribeAudio(base64Audio, actualMime);
            if (text.trim()) {
              await handleSendRef.current(text.trim());
            }
          } catch (err) {
            console.warn('Audio transcription notice:', err);
            setMicError(
              (err as Error)?.name === 'NoKeysConfiguredError'
                ? locale === 'ar'
                  ? 'أضف مفتاح Gemini من الإعدادات أولاً.'
                  : 'Add a Gemini key in Settings first.'
                : locale === 'ar'
                ? 'تعذر تفريغ الصوت الآن. حاول مرة أخرى.'
                : 'Could not transcribe the audio right now. Please try again.'
            );
          } finally {
            if (mountedRef.current) setTranscribing(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((sec) => {
          if (sec + 1 >= MAX_RECORD_SECONDS) stopRecordingRef.current();
          return sec + 1;
        });
      }, 1000);
    } catch (err) {
      console.warn('Microphone recording warning:', err);
      releaseMic();
      setMicError(
        locale === 'ar'
          ? 'يرجى السماح بالوصول إلى الميكروفون من شريط عنوان المتصفح، ثم الضغط مجدداً.'
          : 'Please allow microphone access in your browser settings bar, then tap again to speak.'
      );
    }
  };

  const stopRecordingAudio = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    setIsRecordingAudio(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };
  const stopRecordingRef = useRef(stopRecordingAudio);
  stopRecordingRef.current = stopRecordingAudio;

  const samplePromptsList = SAMPLE_PROMPTS[locale] || SAMPLE_PROMPTS.en;

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto bg-white/90 backdrop-blur-2xl rounded-3xl border border-[#d2d2d7] shadow-xl overflow-hidden pb-4">
      {/* Assistant Header with Live Voice Trigger */}
      <div className="bg-white text-[#1d1d1f] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 border-b border-[#ececf0]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full spero-core flex items-center justify-center text-white">
            <Sparkles className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#1d1d1f]">
              {locale === 'en' ? 'Spero · Executive Assistant' : 'سبيرو · مساعدتك التنفيذية'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-[#86868b]">
              <span>Cairo ({getCairoUtcOffsetLabel()})</span>
            </div>
          </div>
        </div>

        {/* Actions (Live Voice + Recent Commands) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRecentPanel(!showRecentPanel)}
            className="flex items-center gap-1.5 min-h-10 px-3 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] rounded-full text-xs font-semibold transition-colors"
            title="Recent Voice Commands"
            aria-label={locale === 'en' ? 'Recent commands' : 'الأوامر السابقة'}
          >
            <Clock className="w-3.5 h-3.5 text-[#0071e3]" />
            <span className="hidden sm:inline">{locale === 'en' ? 'Recent' : 'السابقة'}</span>
          </button>

          <button
            onClick={() => onOpenLiveVoice?.()}
            className="flex items-center gap-2 min-h-10 px-4 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-full text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
            title={locale === 'en' ? 'Talk to Spero' : 'تحدّث مع سبيرو'}
          >
            <Radio className="w-3.5 h-3.5 text-white" />
            <span>{locale === 'en' ? 'Voice' : 'صوتي'}</span>
          </button>
        </div>
      </div>

      {/* Recent Voice Commands Panel Drawer */}
      {showRecentPanel && (
        <div className="bg-[#f5f5f7] border-b border-[#d2d2d7] p-4 text-[#1d1d1f] text-xs space-y-3 animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#0071e3] flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {locale === 'en' ? 'Recent Voice & Tool Commands' : 'سجل الأوامر الصوتية وتنفيذ الأدوات'}
            </span>
            <button
              onClick={() => setShowRecentPanel(false)}
              className="text-[#86868b] hover:text-[#1d1d1f] text-xs font-bold px-2.5 py-1 rounded-xl bg-white border border-[#d2d2d7]"
            >
              {locale === 'en' ? 'Close' : 'إغلاق'}
            </button>
          </div>

          {recentCommands.length === 0 ? (
            <p className="text-slate-400 py-2 italic text-center">
              {locale === 'en' ? 'No recent voice commands recorded yet.' : 'لا توجد أوامر صوتية مسجلة حديثاً.'}
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="bg-white hover:bg-[#e8e8ed] p-2.5 rounded-xl border border-[#d2d2d7] flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-[#1d1d1f]">{cmd.commandText}</p>
                    <div className="flex items-center gap-2 text-[10px] text-[#86868b] font-mono">
                      <span>{cairoClock(cmd.timestamp)}</span>
                      {cmd.executedTools && cmd.executedTools.length > 0 && (
                        <span className="text-[#0071e3] font-bold bg-[#f5f5f7] border border-[#d2d2d7] px-1.5 py-0.5 rounded">
                          Tools: {cmd.executedTools.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowRecentPanel(false);
                      handleSend(cmd.commandText);
                    }}
                    className="px-3 py-1.5 bg-[#0071e3] hover:bg-[#0062c4] text-white rounded-lg font-bold text-xs shrink-0 transition-colors shadow-xs"
                  >
                    {locale === 'en' ? 'Re-run' : 'إعادة تنفيذ'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#f5f5f7]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-3xl px-4 py-3 text-[13px] sm:text-sm leading-relaxed shadow-xs ${
                msg.role === 'user'
                  ? 'bg-[#0071e3] text-white rounded-br-md'
                  : 'bg-white text-[#1d1d1f] border border-[#e5e5ea] rounded-bl-md'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {/* What Spero did, in plain words (details are one tap away) */}
              {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {msg.toolInvocations.map((inv, idx) => {
                    const key = `${msg.id}:${idx}`;
                    return (
                      <div key={idx} className="rounded-2xl bg-[#f5f5f7] border border-[#ececf0] px-3 py-2 text-xs text-[#1d1d1f]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-semibold">
                            {inv.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <span className="w-4 h-4 rounded-full border-2 border-amber-500 shrink-0" />}
                            {toolLabel(inv.toolName, locale === 'ar')}
                          </span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenDetails((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                              className="text-[11px] text-[#0071e3] font-semibold px-1.5 min-h-8"
                            >
                              {openDetails.has(key) ? (locale === 'ar' ? 'إخفاء' : 'Hide') : locale === 'ar' ? 'التفاصيل' : 'Details'}
                            </button>
                            {inv.undoAvailable && inv.undoAction && (
                              <button
                                disabled={undone.has(key)}
                                onClick={() => {
                                  setUndone((prev) => new Set(prev).add(key));
                                  onUndoToolAction(inv.undoAction);
                                }}
                                className="px-2.5 min-h-8 text-xs bg-white border border-[#d2d2d7] hover:bg-[#e8e8ed] disabled:opacity-40 text-[#1d1d1f] rounded-full flex items-center gap-1 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{t.undo}</span>
                              </button>
                            )}
                          </span>
                        </div>
                        {openDetails.has(key) && (
                          <pre className="mt-2 bg-white p-2 rounded-lg border border-[#ececf0] font-mono text-[11px] text-[#515154] whitespace-pre-wrap break-words">{JSON.stringify(inv.args, null, 2)}</pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <span className="text-[10px] text-[#86868b] font-mono mt-1 px-1.5">
              {cairoClock(msg.timestamp)}
            </span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#6e6e73] bg-white px-4 py-2.5 rounded-full border border-[#e5e5ea] max-w-xs shadow-xs">
            <div className="w-3.5 h-3.5 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
            <span>{locale === 'en' ? 'Spero is working on it…' : 'سبيرو تعمل على طلبك…'}</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Suggested Executive Prompt Chips */}
      <div className="px-4 py-2 bg-white border-t border-[#ececf0] overflow-x-auto">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {samplePromptsList.map((prompt, i) => (
            <button
              key={i}
              onClick={() => setInputText(prompt)}
              className="text-xs bg-white hover:bg-[#f5f5f7] hover:border-[#0071e3] text-[#1d1d1f] min-h-10 px-3.5 rounded-full border border-[#d2d2d7] transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Audio Recording Banner if active */}
      {isRecordingAudio && (
        <div className="mx-4 mb-2 p-2.5 bg-red-50 border border-red-300 rounded-xl flex items-center justify-between text-xs text-red-900 animate-pulse">
          <div className="flex items-center gap-2 font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <span>{locale === 'en' ? `Recording audio command: ${recordSeconds}s` : `تسجيل أمر صوتي: ${recordSeconds}ث`}</span>
          </div>
          <button
            onClick={stopRecordingAudio}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
          >
            <Square className="w-3 h-3" />
            <span>{locale === 'en' ? 'Stop & Transcribe' : 'إنهاء ومعالجة'}</span>
          </button>
        </div>
      )}

      {micError && (
        <div className="mx-4 mb-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-900">
          <span>{micError}</span>
          <button onClick={() => setMicError(null)} className="text-amber-800 hover:text-amber-950 font-bold ms-1 cursor-pointer">
            {locale === 'ar' ? 'إخفاء' : 'Dismiss'}
          </button>
        </div>
      )}

      {transcribing && (
        <div className="mx-4 mb-2 p-2.5 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl flex items-center gap-2 text-xs text-[#1d1d1f]">
          <Loader2 className="w-4 h-4 animate-spin text-[#0071e3]" />
          <span>{locale === 'en' ? 'Transcribing and processing voice command...' : 'جارٍ معالجة وتحويل الأمر الصوتي...'}</span>
        </div>
      )}

      {/* Input Composer Bar */}
      <div className="px-4 pt-2 bg-white flex items-center gap-2">
        {/* Live Voice Interactive Modal Trigger */}
        <button
          onClick={() => onOpenLiveVoice?.()}
          className="min-w-11 min-h-11 px-3 rounded-full border border-[#d2d2d7] bg-white hover:bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center gap-1.5 transition-colors text-xs font-semibold cursor-pointer"
          title={locale === 'ar' ? 'المساعد الصوتي المباشر (Siri)' : 'Live Siri Voice Assistant'}
        >
          <Radio className="w-4 h-4 text-[#0071e3]" />
          <span className="hidden sm:inline">{locale === 'ar' ? 'صوتي' : 'Voice'}</span>
        </button>

        {/* Microphone Dictate Trigger */}
        <button
          onClick={isRecordingAudio ? stopRecordingAudio : startRecordingAudio}
          className={`min-w-11 min-h-11 flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
            isRecordingAudio
              ? 'bg-red-600 text-white border-red-700 animate-pulse'
              : 'bg-[#f5f5f7] text-[#1d1d1f] border-[#d2d2d7] hover:bg-[#e8e8ed] hover:border-[#0071e3]'
          }`}
          title={isRecordingAudio ? 'Stop recording' : 'Dictate audio'}
        >
          {isRecordingAudio ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[#0071e3]" />}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend();
          }}
          placeholder={locale === 'en' ? 'Message Spero…' : 'اكتب رسالة لسبيرو…'}
          className="flex-1 min-w-0 min-h-11 px-4 rounded-full border border-[#d2d2d7] text-sm focus:outline-none focus:border-[#0071e3] font-medium bg-[#f5f5f7] focus:bg-white text-[#1d1d1f] placeholder-[#86868b]"
        />

        <button
          onClick={() => handleSend()}
          disabled={!inputText.trim() || loading}
          className="min-w-11 min-h-11 flex items-center justify-center bg-[#0071e3] hover:bg-[#0062c4] disabled:opacity-40 text-white rounded-full shadow-xs transition-colors"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
