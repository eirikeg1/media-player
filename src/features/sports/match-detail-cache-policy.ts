import type { Fixture } from 'expo-m3u-parser';

import { isMatchConcluded, isMatchLive } from './match-widgets';

/**
 * How long the native cache may serve each match-detail section without going
 * back to SofaScore.
 *
 * The five sections all describe one match, but they age at completely
 * different rates: nothing about a finished match ever changes again, while a
 * match in play is exactly the case the overlay polls for. One TTL for all of
 * them would either hammer the API for static data or freeze a live scoreline,
 * so the lifetime is chosen per (fixture, section) instead — and every caller
 * reads it from here, so the poll, the prefetch and a plain tab open agree.
 */

/** A concluded match is immutable; keep it for a week rather than refetching. */
export const TTL_CONCLUDED_SECS = 7 * 86_400;
/** Short enough that the overlay's minute poll always reaches the provider. */
export const TTL_LIVE_SECS = 30;
/** Lineups and facts trickle in before kickoff, but slowly. */
export const TTL_UPCOMING_SECS = 600;
/** Form and head-to-head are settled history until the match is played. */
export const TTL_PREVIEW_SECS = 6 * 3600;

/** The cached sections of a match, as keyed by the native cache. */
export type MatchDetailSection = 'score' | 'statistics' | 'players' | 'timeline' | 'preview';

/** How stale `section` of `fixture` may be before it is refetched. */
export function matchDetailTtl(fixture: Fixture, section: MatchDetailSection): number {
  if (isMatchConcluded(fixture.status)) return TTL_CONCLUDED_SECS;
  // Form and H2H are about the matches *before* this one, so they don't move
  // while it is played — the one section a live match still caches for hours.
  if (section === 'preview') return TTL_PREVIEW_SECS;
  if (isMatchLive(fixture)) return TTL_LIVE_SECS;
  return TTL_UPCOMING_SECS;
}
