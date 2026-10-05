import { useEffect, useState } from 'react';

import { addDays, isSameLocalDay, startOfLocalDay } from '../date-utils';

/**
 * Milliseconds until just after the next local midnight.
 *
 * Recomputed from the clock every time rather than by adding 24 h, so a DST
 * change (or the device clock being moved) lands on the real boundary. The
 * second of slack keeps a timer that fires a touch early from waking on the
 * day it was scheduled in.
 */
function msUntilNextLocalDay(): number {
  const next = startOfLocalDay(addDays(new Date(), 1));
  return Math.max(next.getTime() - Date.now(), 0) + 1_000;
}

/**
 * Today's local midnight, re-emitted when the calendar day rolls over.
 *
 * Anything derived from `new Date()` at render time silently goes stale at
 * midnight: the date strip keeps marking yesterday as "Today", and the day
 * view's poll — armed only for today — tears itself down and never re-arms.
 * A timer set for the next local midnight flips this exactly once per day, and
 * the identity is stable in between so it can be depended on directly.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfLocalDay(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setToday((previous) => {
        const current = startOfLocalDay(new Date());
        return isSameLocalDay(previous, current) ? previous : current;
      });
      // Re-armed from inside the tick rather than from the state, so a tick
      // that found the same day (an early timer) still schedules the next one.
      timer = setTimeout(tick, msUntilNextLocalDay());
    };
    timer = setTimeout(tick, msUntilNextLocalDay());
    return () => clearTimeout(timer);
  }, []);

  return today;
}
