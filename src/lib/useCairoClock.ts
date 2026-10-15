import { useEffect, useState } from 'react';
import { getCairoDateString, getCairoTimeString } from './cairoTime';

/** Current Cairo date (YYYY-MM-DD) and time (HH:mm); re-renders the caller when the minute changes. */
export function useCairoClock(intervalMs = 15000): { today: string; time: string } {
  const [now, setNow] = useState(() => ({ today: getCairoDateString(), time: getCairoTimeString() }));
  useEffect(() => {
    const tick = () => {
      const next = { today: getCairoDateString(), time: getCairoTimeString() };
      setNow((prev) => (prev.today === next.today && prev.time === next.time ? prev : next));
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
