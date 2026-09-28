import type { Fixture } from 'expo-m3u-parser';

import { fixtureStatusKind } from './fixture-status';

/**
 * The match clock, derived on-device.
 *
 * SofaScore's event payloads carry the current period's start timestamp and
 * where that period sits on the 90-minute clock (`periodStart`,
 * `periodInitialSecs`, `periodMaxSecs`), which the backend persists on the
 * fixture. Ticking those forward against the device clock gives a live minute
 * without a single extra request; `now` is passed in so the surfaces that show
 * it can advance it on their own tick (see `useLiveTick`) rather than waiting
 * for the ~60s fixture poll.
 *
 * Returns `null` when no minute can be shown (not in play, or a row cached
 * before the clock was persisted), so callers fall back to their usual label.
 */
export function liveMinuteLabel(fixture: Fixture, now: Date): string | null {
  switch (fixtureStatusKind(fixture)) {
    // Halftime has no running clock — SofaScore sends no `initial`/`max` for it.
    case 'halftime':
      return 'HT';
    case 'live':
      return inPlayMinute(fixture, now);
    default:
      return null;
  }
}

function inPlayMinute(fixture: Fixture, now: Date): string | null {
  const { periodStart, periodInitialSecs, periodMaxSecs } = fixture;
  if (periodStart == null || periodInitialSecs == null || periodMaxSecs == null) {
    return null;
  }

  const elapsed = periodInitialSecs + (now.getTime() / 1000 - periodStart);
  // Past the period's normal time the broadcast minute freezes and stoppage
  // time is shown as an open-ended "45+" rather than counting on to 48.
  if (elapsed > periodMaxSecs) {
    return `${Math.floor(periodMaxSecs / 60)}+'`;
  }
  // Football counts the first minute as 1', so round up and never show 0.
  return `${Math.max(1, Math.ceil(elapsed / 60))}'`;
}
