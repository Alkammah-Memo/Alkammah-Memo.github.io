import React, { useEffect, useMemo, useRef } from 'react';
import type { Meeting } from '../../types';
import { cairoDateOf, cairoTimeOf } from '../../lib/cairoTime';
import { isWeekend } from '../../lib/planner';

/** Egyptian weekend (Friday + Saturday): subtle diagonal hatch, readable in both text directions */
export const WEEKEND_HATCH =
  'repeating-linear-gradient(135deg, rgba(120,113,108,0.10) 0, rgba(120,113,108,0.10) 1px, transparent 1px, transparent 7px)';

/**
 * Time grid for the Week and Day calendar views (Cairo time).
 * Tap or click any empty spot in a day column to create a meeting at that date and time (30-minute precision).
 * Tap a meeting block to open it. Works with touch (no hover needed).
 */

export interface GridDay {
  dateStr: string; // YYYY-MM-DD (Cairo calendar day)
  weekday: string;
  dayNumber: string;
  isToday: boolean;
}

interface TimeGridProps {
  days: GridDay[];
  meetings: Meeting[];
  ar: boolean;
  nowTime: string; // HH:mm Cairo
  onCreateAt: (dateStr: string, time: string) => void;
  onOpenMeeting: (meeting: Meeting) => void;
}

const MIN_BLOCK = 50; // tall enough for the time line plus two lines of the title
const ROW_HEIGHT = 56; // px per hour: a comfortable touch target (28px per half hour)
const SNAP_MINUTES = 30;
const GUTTER = 56;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const pad = (n: number) => String(n).padStart(2, '0');

interface Placed {
  meeting: Meeting;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Positions one day's meetings; overlapping meetings share the width side by side. */
function placeMeetings(dateStr: string, meetings: Meeting[]): Placed[] {
  const items = meetings
    .filter((m) => cairoDateOf(m.start) === dateStr)
    .map((m) => {
      const start = toMinutes(cairoTimeOf(m.start));
      const endSameDay = cairoDateOf(m.end) === dateStr ? toMinutes(cairoTimeOf(m.end)) : 24 * 60;
      const end = Math.max(endSameDay, start + 20);
      return { meeting: m, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: Placed[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((it) => {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[lane] = it.end;
      }
      return { it, lane };
    });
    for (const { it, lane } of assigned) {
      placed.push({
        meeting: it.meeting,
        top: (it.start / 60) * ROW_HEIGHT,
        height: Math.max(MIN_BLOCK, ((it.end - it.start) / 60) * ROW_HEIGHT - 2),
        lane,
        lanes: laneEnds.length,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return placed;
}

export const TimeGrid: React.FC<TimeGridProps> = ({ days, meetings, ar, nowTime, onCreateAt, onOpenMeeting }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const placedByDay = useMemo(
    () => Object.fromEntries(days.map((d) => [d.dateStr, placeMeetings(d.dateStr, meetings)])) as Record<string, Placed[]>,
    [days, meetings]
  );

  // Open the grid around the working day (or the current hour when today is shown)
  const firstDay = days[0]?.dateStr;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anyToday = days.some((d) => d.isToday);
    const earliest = Math.min(
      ...days.flatMap((d) => (placedByDay[d.dateStr] || []).map((p) => p.top)),
      Infinity
    );
    const target = anyToday ? (toMinutes(nowTime) / 60) * ROW_HEIGHT - ROW_HEIGHT * 1.5 : Number.isFinite(earliest) ? earliest - ROW_HEIGHT : 7 * ROW_HEIGHT;
    el.scrollTop = Math.max(0, Math.min(target, 24 * ROW_HEIGHT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, days.length]);

  const handleColumnTap = (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.floor(Math.max(0, y) / ROW_HEIGHT * 60 / SNAP_MINUTES) * SNAP_MINUTES;
    const clamped = Math.min(minutes, 24 * 60 - SNAP_MINUTES);
    onCreateAt(dateStr, `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cols = { gridTemplateColumns: `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))` } as const;
  const nowTop = (toMinutes(nowTime) / 60) * ROW_HEIGHT;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
      {/* Day headers */}
      <div className="grid border-b border-stone-200 bg-stone-50/80 text-center text-xs font-bold text-stone-700 py-2.5" style={cols}>
        <div />
        {days.map((d) => (
          <div
            key={d.dateStr}
            className={`px-1 ${d.isToday ? 'text-[#0071e3]' : ''}`}
            style={isWeekend(d.dateStr) ? { backgroundImage: WEEKEND_HATCH } : undefined}
          >
            <div className="uppercase text-[11px] font-mono text-stone-500">{d.weekday}</div>
            <div
              className={`text-sm font-bold mt-0.5 ${
                d.isToday ? 'bg-[#0071e3] text-white w-7 h-7 rounded-full flex items-center justify-center mx-auto' : ''
              }`}
            >
              {d.dayNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable 24h grid */}
      <div ref={scrollRef} className="overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(100dvh - 21rem)', minHeight: 320 }}>
        <div className="grid relative" style={{ ...cols, height: 24 * ROW_HEIGHT }}>
          {/* Hour labels */}
          <div className="relative">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute inset-x-0 pe-2 text-end font-mono text-[10px] text-stone-400 -translate-y-1.5"
                style={{ top: h * ROW_HEIGHT }}
              >
                {h === 0 ? '' : `${pad(h)}:00`}
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div
              key={d.dateStr}
              role="button"
              tabIndex={0}
              aria-label={ar ? `إضافة اجتماع في ${d.dateStr}` : `Add a meeting on ${d.dateStr}`}
              onClick={(e) => handleColumnTap(e, d.dateStr)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateAt(d.dateStr, '09:00');
              }}
              className={`relative border-s border-stone-200 cursor-pointer select-none hover:bg-sky-50/40 active:bg-sky-100/50 transition-colors ${
                d.isToday ? 'bg-sky-50/30' : ''
              }`}
              style={
                isWeekend(d.dateStr)
                  ? {
                      backgroundImage: `${WEEKEND_HATCH}, repeating-linear-gradient(to bottom, #e7e5e4 0, #e7e5e4 1px, transparent 1px, transparent ${ROW_HEIGHT / 2}px)`,
                      backgroundSize: `auto, 100% ${ROW_HEIGHT / 2}px`,
                    }
                  : {
                      backgroundImage: `repeating-linear-gradient(to bottom, #e7e5e4 0, #e7e5e4 1px, transparent 1px, transparent ${ROW_HEIGHT / 2}px)`,
                      backgroundSize: `100% ${ROW_HEIGHT / 2}px`,
                    }
              }
            >
              {d.isToday && (
                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                  <div className="h-px bg-rose-500" />
                  <div className="w-2 h-2 rounded-full bg-rose-500 -mt-[5px] -ms-1" />
                </div>
              )}

              {(placedByDay[d.dateStr] || []).map((p) => (
                <div
                  key={p.meeting.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMeeting(p.meeting);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      onOpenMeeting(p.meeting);
                    }
                  }}
                  className="absolute z-[5] overflow-hidden rounded-lg border border-blue-300 bg-blue-100/95 hover:bg-blue-200 text-blue-950 px-1.5 py-1 text-[11px] sm:text-xs leading-snug shadow-2xs cursor-pointer"
                  style={{
                    top: p.top + 1,
                    height: p.height,
                    insetInlineStart: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / p.lanes}% - 4px)`,
                  }}
                  title={p.meeting.title}
                >
                  <div className="font-mono text-[10px] font-bold text-blue-700">
                    {cairoTimeOf(p.meeting.start)} - {cairoTimeOf(p.meeting.end)}
                  </div>
                  <div className={`font-bold break-words ${days.length === 1 ? 'line-clamp-4' : 'line-clamp-3'}`}>{p.meeting.title}</div>
                  {p.meeting.location && p.height > 64 && (
                    <div className="text-[10px] text-blue-800/70 truncate">{p.meeting.location}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="px-3 py-1.5 border-t border-stone-100 bg-stone-50/60 text-[11px] text-stone-500">
        {ar ? 'اضغط على أي وقت فارغ لإضافة اجتماع بالتاريخ والوقت المحدد.' : 'Tap any empty time slot to add a meeting at that date and time.'}
      </div>
    </div>
  );
};
