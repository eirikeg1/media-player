import { getSportsDatabase } from '@/services/sports-service';
import type { Fixture, SportsDatabase } from 'expo-m3u-parser';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';

import { matchDetailTtl } from '../match-detail-cache-policy';
import { isMatchLive, matchHasStarted, supportsMatchWidgets } from '../match-widgets';

/**
 * How many of the day's favorite matches are warmed. The requests are paced by
 * the provider and run one after another, so this is a budget, not a batch: it
 * is small enough to be finished long before the user taps into a match.
 */
export const PREFETCH_LIMIT = 6;

/**
 * The matches worth warming, most useful first: a favorite team's, live ones
 * ahead of the rest, then by kickoff. Fixtures without a SofaScore event id
 * have no detail to fetch at all.
 */
export function selectPrefetchFixtures(
  fixtures: readonly Fixture[],
  favoriteTeamIds: ReadonlySet<number>,
  limit: number = PREFETCH_LIMIT
): Fixture[] {
  if (favoriteTeamIds.size === 0) return [];
  const isFavorite = (fixture: Fixture) =>
    (fixture.homeTeamId != null && favoriteTeamIds.has(fixture.homeTeamId)) ||
    (fixture.awayTeamId != null && favoriteTeamIds.has(fixture.awayTeamId));

  return fixtures
    .filter((fixture) => supportsMatchWidgets(fixture) && isFavorite(fixture))
    .sort(
      (a, b) => Number(isMatchLive(b)) - Number(isMatchLive(a)) || a.kickoffTime - b.kickoffTime
    )
    .slice(0, limit);
}

/**
 * Warm the native match-detail cache for the favorite teams' matches of the day
 * on show, so opening one of them renders from SQLite instead of waiting on
 * SofaScore.
 *
 * Fire-and-forget by design: nothing is returned, nothing is rendered from it,
 * and every failure is swallowed — a warm cache is an optimisation, and the
 * match sheet fetches for itself regardless. The score is fetched for every
 * selected match and the statistics only once it has kicked off, since before
 * that they are empty.
 *
 * Runs on tab focus and whenever the selection or one of its statuses changes
 * (a kickoff), not on every poll: repeat runs are cheap but not free, and the
 * per-section TTLs ({@link matchDetailTtl}) already serve the unchanged ones.
 */
export function useFavoriteMatchPrefetch(
  fixtures: readonly Fixture[],
  favoriteTeamIds: ReadonlySet<number>,
  enabled: boolean
): void {
  const targets = useMemo(
    () => selectPrefetchFixtures(fixtures, favoriteTeamIds),
    [fixtures, favoriteTeamIds]
  );
  // Only a changed match or a changed status is worth another round of
  // requests; the day list itself re-renders every minute.
  const targetsKey = targets.map((f) => `${f.providerId}:${f.status}`).join(',');
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useFocusEffect(
    useCallback(() => {
      if (!enabled || targetsRef.current.length === 0) return;
      let cancelled = false;
      void prefetchMatchDetail(targetsRef.current, () => cancelled);
      return () => {
        cancelled = true;
      };
      // `targets` is read through the ref; the key is what decides a re-run.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, targetsKey])
  );
}

/** Sequential so the requests queue behind the provider's pacing, not past it. */
async function prefetchMatchDetail(
  fixtures: readonly Fixture[],
  isCancelled: () => boolean
): Promise<void> {
  let db: SportsDatabase;
  try {
    db = await getSportsDatabase();
  } catch (err) {
    console.warn('[sports-prefetch] Sports database unavailable:', err);
    return;
  }

  for (const fixture of fixtures) {
    if (isCancelled()) return;
    await warm(() => db.getMatchScore(fixture.providerId, matchDetailTtl(fixture, 'score')));
    if (isCancelled()) return;
    if (matchHasStarted(fixture)) {
      await warm(() =>
        db.getMatchStatistics(fixture.providerId, matchDetailTtl(fixture, 'statistics'))
      );
    }
  }
}

/** One prefetch request: a failure is not worth interrupting the rest for. */
async function warm(fetch: () => Promise<unknown>): Promise<void> {
  try {
    await fetch();
  } catch (err) {
    console.warn('[sports-prefetch] Match detail unavailable:', err);
  }
}
