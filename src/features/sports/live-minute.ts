import type { Fixture } from 'expo-m3u-parser';

/**
 * The match clock, derived on-device.
 *
 * SofaScore's event payloads carry the current period's start timestamp and
 * where that period sits on the 90-minute clock (`periodStart`,
 * `periodInitialSecs`, `periodMaxSecs`), which the backend persists on the
 * fixture. Ticking those forward against the device clock gives a live minute
 * without a single extra request — the list already re-renders on its ~60s
 * poll, which is all the granularity a minute counter needs.
 *
 * Returns `null` when no minute can be shown (not in play, or a row cached
 * before the clock was persisted), so callers fall back to their usual label.
 */
export function liveMinuteLabel(fixture: Fixture, now: Date): string | null {
  switch (fixture.status.toUpperCase()) {
    // Halftime has no running clock — SofaScore sends no `initial`/`max` for it.
    case 'PAUSED':
    case 'HALFTIME':
      return 'HT';
    // `IN_PROGRESS` is what the backend emits (FixtureStatus::to_str); the
    // others are accepted defensively, matching `isMatchLive`.
    case 'IN_PROGRESS':
    case 'IN_PLAY':
    case 'LIVE':
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
