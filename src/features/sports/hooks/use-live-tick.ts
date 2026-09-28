import { useAppState } from '@/hooks/use-app-state';
import { useEffect, useState } from 'react';

/** Half a minute: fine enough that a minute counter is never visibly stale. */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * A counter that increments on a fixed interval while `enabled`.
 *
 * The match minute is derived from the device clock (see `liveMinuteLabel`), so
 * nothing about a live match changes React's state as time passes: the row,
 * the surface header and the overlay all render a minute that was correct when
 * they last re-rendered and then freeze. Fixture polls do not rescue it either
 * — an unchanged scoreline deliberately keeps its array identity so memoised
 * rows stay put.
 *
 * Threading this counter through whatever derives the minute makes the passage
 * of time an actual input. It is a counter rather than a timestamp so the value
 * changes exactly once per interval, and `0` while disabled: a screen with no
 * live match holds no timer and re-renders nothing.
 *
 * The timer also stops while the app is in the background: nobody is reading the
 * minute there, and a surface or player left open on a live match would otherwise
 * re-render its whole tree twice a minute for hours. The next tick after
 * returning to the foreground picks the clock back up.
 */
export function useLiveTick(enabled: boolean, intervalMs: number = DEFAULT_INTERVAL_MS): number {
  const [tick, setTick] = useState(0);
  const appActive = useAppState() === 'active';
  const running = enabled && appActive;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((previous) => previous + 1), intervalMs);
    return () => clearInterval(interval);
  }, [running, intervalMs]);

  return enabled ? tick : 0;
}
