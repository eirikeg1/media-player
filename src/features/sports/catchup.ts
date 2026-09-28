import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';

import type { CatchupWindow } from '@/types/playback.types';
import { isMatchConcluded } from './match-widgets';

/**
 * Catch-up rules for a football fixture: which archive window covers the match
 * and which of its broadcasters can still serve that window.
 *
 * The window/param helpers live in `@/types/playback.types` (the video layer
 * needs them without depending on sports) and are re-exported here so the
 * sports code has a single import.
 */
export { parseCatchupParams, sameCatchupWindow } from '@/types/playback.types';
export type { CatchupWindow } from '@/types/playback.types';

/** Recording starts before kickoff so the build-up and the whistle are included. */
export const CATCHUP_LEAD_SECONDS = 5 * 60;

/** Long enough for 90 minutes plus half time, stoppage and a short post-match. */
export const CATCHUP_WINDOW_MINUTES = 150;

const SECONDS_PER_DAY = 86_400;

/** The archive window covering a match, whether or not any channel can serve it. */
export function catchupWindow(fixture: Fixture): CatchupWindow {
  return {
    start: fixture.kickoffTime - CATCHUP_LEAD_SECONDS,
    durationMinutes: CATCHUP_WINDOW_MINUTES,
  };
}

/**
 * Whether this broadcast can play the match from its archive: the panel keeps
 * an archive of the channel, the match has kicked off (panels serve windows
 * running past "now", so an in-progress match plays from kickoff), and the
 * window start has not yet aged out of retention.
 */
export function isCatchupAvailable(
  broadcast: RankedBroadcast,
  fixture: Fixture,
  nowSeconds: number
): boolean {
  if (broadcast.catchupDays == null) return false;
  if (fixture.kickoffTime > nowSeconds) return false;
  return catchupWindow(fixture).start >= nowSeconds - broadcast.catchupDays * SECONDS_PER_DAY;
}

/**
 * Whether the end of a catch-up window should hand over to the live stream.
 * The panel fixes the archive file's length at request time, so a window over a
 * match still in play ends at the recording edge, not at the final whistle —
 * the rest of the match is only on the live stream. A concluded match (or an
 * unknown fixture) just ends normally.
 */
export function shouldHandOverToLive(
  catchup: CatchupWindow | null,
  fixture: Fixture | null
): boolean {
  return !!catchup && !!fixture && !isMatchConcluded(fixture);
}

/** The broadcasts that can play the match from archive, in the given order. */
export function catchupBroadcasts(
  broadcasts: RankedBroadcast[],
  fixture: Fixture,
  nowSeconds: number
): RankedBroadcast[] {
  return broadcasts.filter((broadcast) => isCatchupAvailable(broadcast, fixture, nowSeconds));
}
