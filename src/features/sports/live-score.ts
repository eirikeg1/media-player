import type { Fixture, MatchScore } from 'expo-m3u-parser';

/**
 * The clock fields a live score carries. They travel together: a period is
 * described by when it started, what the clock read then, and where its normal
 * time ends, and two of the three are meaningless on their own.
 */
const PERIOD_FIELDS = ['periodStart', 'periodInitialSecs', 'periodMaxSecs'] as const;

/**
 * Overlay a polled score on the fixture the screen already holds.
 *
 * Scores and status are merged (a poll that has not answered yet leaves the
 * fixture's own numbers alone), but the period fields are **replaced**. The
 * backend sends them only while the clock is actually running, so their absence
 * is the signal that it has stopped: `??`-merging them would leave half time
 * showing a minute that keeps counting up from the first-half kick-off, and
 * full time showing one forever.
 */
export function mergeLiveScore(fixture: Fixture, score: MatchScore | null): Fixture {
  if (!score) return fixture;
  return {
    ...fixture,
    status: score.status || fixture.status,
    homeScore: score.homeScore ?? fixture.homeScore,
    awayScore: score.awayScore ?? fixture.awayScore,
    periodStart: score.periodStart,
    periodInitialSecs: score.periodInitialSecs,
    periodMaxSecs: score.periodMaxSecs,
  };
}

/**
 * Whether two polled scores are interchangeable on screen.
 *
 * The clock fields count: a second half starts with the same 1-0 scoreline as
 * the half-time break it follows, and only `periodStart` says the minute is
 * running again. Comparing the visible score alone discarded that poll and
 * froze the header on "HT" until something else changed.
 */
export function sameLiveScore(a: MatchScore, b: MatchScore): boolean {
  return (
    a.status === b.status &&
    a.homeScore === b.homeScore &&
    a.awayScore === b.awayScore &&
    // `null` and `undefined` both mean "no clock"; only the bridge knows which.
    PERIOD_FIELDS.every((field) => (a[field] ?? null) === (b[field] ?? null))
  );
}
