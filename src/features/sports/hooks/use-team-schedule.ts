import type { Fixture, SportsDatabase } from 'expo-m3u-parser';
import { useCallback } from 'react';

import { addDays, localDateKey, startOfLocalDay } from '../date-utils';
import { TTL_FAVORITES_SECS } from '../fixture-fetch';
import { byKickoff } from '../match-grouping';
import { isMatchConcluded } from '../match-widgets';
import { useSportsQuery } from './use-sports-query';

/**
 * How far ahead a team's schedule is read. The native cache is keyed by team
 * alone and the window only filters the read, so a generous one costs nothing
 * beyond the single fetch a shorter window would have made anyway.
 */
const LOOKAHEAD_DAYS = 180;

const DAY_SECS = 86_400;

/** Shared identity for "no matches", so an empty schedule never re-renders. */
const NO_FIXTURES: Fixture[] = [];

export interface TeamScheduleState {
  /** Upcoming fixtures, soonest first. */
  fixtures: Fixture[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** The team's matches from today onwards, soonest first. */
async function fetchSchedule(db: SportsDatabase, teamId: number): Promise<Fixture[]> {
  const from = startOfLocalDay(new Date());
  const to = addDays(from, LOOKAHEAD_DAYS);
  const fromTs = Math.floor(from.getTime() / 1000);
  const toTs = Math.floor(to.getTime() / 1000) + DAY_SECS - 1;

  const result = await db.getTeamFixtures(
    teamId,
    localDateKey(from),
    localDateKey(to),
    fromTs,
    toTs,
    TTL_FAVORITES_SECS
  );
  return result
    .filter((fixture) => fixture.kickoffTime >= fromTs && !isMatchConcluded(fixture))
    .sort(byKickoff);
}

/**
 * A team's upcoming matches, from today onwards.
 *
 * Reads the same per-team cache the favorites fetch fills ({@link
 * TTL_FAVORITES_SECS}), so opening the surface for a followed team usually costs
 * no request at all. Today's already-finished matches are dropped rather than
 * the whole day: a team playing later today is exactly what "upcoming" means.
 */
export function useTeamSchedule(teamId: number | null): TeamScheduleState {
  const { data, isLoading, error, refresh } = useSportsQuery<number, Fixture[]>({
    key: teamId,
    fetcher: fetchSchedule,
    fallback: "Couldn't load this team's matches.",
  });

  return {
    fixtures: data ?? NO_FIXTURES,
    isLoading,
    error,
    // Wrapped so a retry button's press event can't arrive as `{ force }`.
    refresh: useCallback(() => refresh(), [refresh]),
  };
}
