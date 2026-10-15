import React, { useState } from 'react';
import {
  Activity,
  X,
  Copy,
  Check,
  Download,
  Trash2,
  Volume2,
  Mic,
  ShieldAlert,
  Zap,
  Clock,
  Radio,
  Sliders,
} from 'lucide-react';

export interface SpeechEvent {
  id: string;
  type:
    | 'AI_SPEECH_START'
    | 'AI_SPEECH_END'
    | 'USER_INTERRUPTION'
    | 'USER_SPEECH_DETECTED'
    | 'BUFFER_SYNC'
    | 'TOOL_EXECUTION';
  timestamp: string;
  timeMs: number;
  deltaFromPrev?: string;
  message: string;
  details?: Record<string, unknown> | string;
}

export interface VoiceDebugMonitorProps {
  isOpen: boolean;
  onClose: () => void;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  audioContextState: string;
  sampleRate: number;
  activeSourceCount: number;
  bufferQueueSeconds: number;
  bufferFillPercentage: number;
  isMutedForEcho: boolean;
  nearVoiceFocus: boolean;
  nearVoiceDetected: boolean;
  micDbfs: number;
  events: SpeechEvent[];
  onClearEvents: () => void;
}

export const VoiceDebugMonitor: React.FC<VoiceDebugMonitorProps> = ({
  isOpen,
  onClose,
  connectionStatus,
  audioContextState,
  sampleRate,
  activeSourceCount,
  bufferQueueSeconds,
  bufferFillPercentage,
  isMutedForEcho,
  nearVoiceFocus,
  nearVoiceDetected,
  micDbfs,
  events,
  onClearEvents,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<string>('ALL');

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    const data = JSON.stringify(events, null, 2);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(events, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `voice_debug_events_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  const filteredEvents =
    filterType === 'ALL'
      ? events
      : events.filter((ev) => ev.type === filterType);

  const getEventBadge = (type: SpeechEvent['type']) => {
    switch (type) {
      case 'AI_SPEECH_START':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30';
      case 'AI_SPEECH_END':
        return 'bg-blue-500/20 text-blue-300 border-blue-400/30';
      case 'USER_INTERRUPTION':
        return 'bg-rose-500/30 text-rose-300 border-rose-400/40 font-bold animate-pulse';
      case 'USER_SPEECH_DETECTED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
      case 'BUFFER_SYNC':
        return 'bg-purple-500/20 text-purple-300 border-purple-400/30';
      case 'TOOL_EXECUTION':
        return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
      default:
        return 'bg-white/10 text-white/70 border-white/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#0c0d14] text-white border border-white/15 rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Monitor Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,242,254,0.3)]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-wide">
                  VoiceDebugMonitor
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : connectionStatus === 'connecting'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40 animate-pulse'
                      : 'bg-red-500/20 text-red-300 border-red-400/40'
                  }`}
                >
                  {connectionStatus === 'connected'
                    ? 'WebRTC / WS Active'
                    : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Disconnected'}
                </span>
              </div>
              <p className="text-[11px] text-white/50">
                Real-time audio buffer queue & utterance vs. interruption
                diagnostics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs transition-all active:scale-95"
              title="Copy event logs to clipboard"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <button
              onClick={handleDownloadLogs}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
              title="Download events JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all active:scale-95 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real-Time Audio Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-white/10 bg-white/[0.01]">
          {/* Buffer Fill Percentage */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <Sliders className="w-3 h-3 text-cyan-400" />
                Buffer Fill
              </span>
              <span className="font-mono font-bold text-white">
                {bufferFillPercentage.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-150"
                style={{ width: `${Math.min(100, bufferFillPercentage)}%` }}
              />
            </div>
            <span className="text-[10px] text-white/40 font-mono">
              Queue: {bufferQueueSeconds.toFixed(2)}s ahead
            </span>
          </div>

          {/* Active Audio Sources */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-blue-400" />
                Active Voices
              </span>
              <span
                className={`font-mono font-bold px-1.5 py-0.2 rounded text-[11px] ${
                  activeSourceCount > 1
                    ? 'bg-rose-500/30 text-rose-300'
                    : 'text-white'
                }`}
              >
                {activeSourceCount} node{activeSourceCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="text-[10px] text-white/40 mt-1">
              {activeSourceCount === 0
                ? 'Silent (listening)'
                : activeSourceCount === 1
                ? 'Single sequential stream'
                : 'Overlapping detected!'}
            </div>
          </div>

          {/* Echo Mute Status */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-emerald-400" />
                Echo Gate
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isMutedForEcho
                    ? 'bg-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {isMutedForEcho ? 'MUTED' : 'OPEN'}
              </span>
            </div>
            <div className="text-[10px] text-white/40 mt-1">
              {isMutedForEcho
                ? 'Blocking speaker feedback'
                : 'Listening to mic input'}
            </div>
          </div>

          {/* Mic Input & Proximity */}
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <Mic className="w-3 h-3 text-fuchsia-400" />
                Mic Level
              </span>
              <span className="font-mono text-white text-[11px]">
                {micDbfs.toFixed(1)} dBFS
              </span>
            </div>
            <div className="text-[10px] text-white/40 mt-1 flex items-center justify-between">
              <span>{nearVoiceFocus ? 'Focus Mode' : 'Standard'}</span>
              <span
                className={
                  nearVoiceDetected ? 'text-emerald-300 font-bold' : ''
                }
              >
                {nearVoiceDetected ? 'Near Speaker' : 'Ambient'}
              </span>
            </div>
          </div>
        </div>

        {/* SpeechEventLog Section Header */}
        <div className="px-5 py-2.5 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-white/60" />
            <span className="text-xs font-bold text-white/90">
              SpeechEventLog
            </span>
            <span className="text-[10px] text-white/40 font-mono">
              ({filteredEvents.length} events)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
              {[
                'ALL',
                'AI_SPEECH_START',
                'AI_SPEECH_END',
                'USER_INTERRUPTION',
                'TOOL_EXECUTION',
              ].map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFilterType(ft)}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    filterType === ft
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-white/5 hover:bg-white/10 text-white/60'
                  }`}
                >
                  {ft === 'AI_SPEECH_START'
                    ? 'Start'
                    : ft === 'AI_SPEECH_END'
                    ? 'End'
                    : ft === 'USER_INTERRUPTION'
                    ? 'Interrupts'
                    : ft === 'TOOL_EXECUTION'
                    ? 'Tools'
                    : 'All'}
                </button>
              ))}
            </div>

            <button
              onClick={onClearEvents}
              className="p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-all text-[10px] flex items-center gap-1"
              title="Clear event logs"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Event List with Utterance vs. Interruption Timestamps */}
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-2 font-mono text-[11px] max-h-96">
          {filteredEvents.length === 0 ? (
            <div className="py-8 text-center text-white/40 text-xs italic">
              No speech events recorded yet. Start talking to generate real-time
              telemetry.
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all flex flex-col gap-1"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-white/40">{ev.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[9px] ${getEventBadge(
                        ev.type
                      )}`}
                    >
                      {ev.type}
                    </span>
                  </div>
                  {ev.deltaFromPrev && (
                    <span className="text-cyan-300/80 text-[10px] font-bold">
                      Δ {ev.deltaFromPrev}
                    </span>
                  )}
                </div>

                <p className="text-white/90 text-xs font-sans leading-snug">
                  {ev.message}
                </p>

                {ev.details && (
                  <pre className="text-[10px] text-white/50 bg-black/50 p-1.5 rounded-lg overflow-x-auto">
                    {typeof ev.details === 'object'
                      ? JSON.stringify(ev.details, null, 2)
                      : String(ev.details)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Diagnostic Summary Bar */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[11px] text-white/50">
          <div className="flex items-center gap-3">
            <span>Audio Context: {audioContextState}</span>
            <span>Rate: {sampleRate}Hz</span>
          </div>
          <span className="text-[10px] text-cyan-300/70">
            AI Speech & Interruption Diagnostic Monitor Active
          </span>
        </div>
      </div>
    </div>
  );
};
