import { getSportsDatabase } from '@/services/sports-service';
import type { Fixture } from 'expo-m3u-parser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addDays, localDateKey, startOfLocalDay } from '../date-utils';
import { TTL_FAVORITES_SECS } from '../fixture-fetch';
import { byKickoff } from '../match-grouping';
import { isMatchConcluded } from '../match-widgets';

/**
 * How far ahead a team's schedule is read. The native cache is keyed by team
 * alone and the window only filters the read, so a generous one costs nothing
 * beyond the single fetch a shorter window would have made anyway.
 */
const LOOKAHEAD_DAYS = 180;

const DAY_SECS = 86_400;

export interface TeamScheduleState {
  /** Upcoming fixtures, soonest first. */
  fixtures: Fixture[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * A team's upcoming matches, from today onwards.
 *
 * Reads the same per-team cache the favorites fetch fills ({@link
 * TTL_FAVORITES_SECS}), so opening the sheet for a followed team usually costs
 * no request at all. Today's already-finished matches are dropped rather than
 * the whole day: a team playing later today is exactly what "upcoming" means.
 */
export function useTeamSchedule(teamId: number | null): TeamScheduleState {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (teamId === null) {
      setFixtures([]);
      return;
    }

    const fetchId = ++fetchRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const from = startOfLocalDay(new Date());
      const to = addDays(from, LOOKAHEAD_DAYS);
      const fromTs = Math.floor(from.getTime() / 1000);
      const toTs = Math.floor(to.getTime() / 1000) + DAY_SECS - 1;

      const db = await getSportsDatabase();
      const result = await db.getTeamFixtures(
        teamId,
        localDateKey(from),
        localDateKey(to),
        fromTs,
        toTs,
        TTL_FAVORITES_SECS
      );
      if (fetchId === fetchRef.current) {
        setFixtures(
          result
            .filter((fixture) => fixture.kickoffTime >= fromTs && !isMatchConcluded(fixture.status))
            .sort(byKickoff)
        );
      }
    } catch (err) {
      if (fetchId === fetchRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
        console.error('[useTeamSchedule] Error:', err);
      }
    } finally {
      if (fetchId === fetchRef.current) {
        setIsLoading(false);
      }
    }
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { fixtures, isLoading, error, refresh };
}
