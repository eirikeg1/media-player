import { getSportsDatabase } from '@/services/sports-service';
import type { Fixture, SportsDatabase } from 'expo-m3u-parser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { dayWindow, isSameLocalDay } from '../date-utils';
import {
  CACHE_ONLY_SECS,
  TTL_FAVORITES_SECS,
  cacheTtlFor,
  fetchFavoriteTeamFixtures,
} from '../fixture-fetch';
import { isMatchLive } from '../match-widgets';

/** How often today's list silently refreshes while any match is live. */
const LIVE_POLL_MS = 60_000;
/** How often today's list refreshes while nothing is live — catches kickoffs. */
const IDLE_POLL_MS = 5 * 60_000;

export interface DayFixturesState {
  fixtures: Fixture[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * All fixtures kicking off on the given local day, plus the user's favorite
 * teams wherever they play. Shows cached data instantly and keeps today's
 * scores current by polling silently — every minute while a match is live,
 * more slowly otherwise so a kickoff is picked up without a manual refresh.
 *
 * Three backend calls, each with a different cost profile:
 * - `getFixturesForTeams` (initial/force only, 6 h cache): the day schedule is
 *   assembled from a fixed set of priority regions, so a favorite playing
 *   outside them is only in the cache once its own fetch ran. It runs first so
 *   its rows are already stored when the day is read, and its failure is
 *   swallowed — the day view must render regardless.
 * - `getFixturesForDate` (every load): reads the day out of the cache, fanning
 *   out ~10 paced requests when the cached schedule is stale. That fan-out is
 *   far too expensive to repeat per poll, hence the {@link CACHE_ONLY_SECS}
 *   age on silent loads.
 * - `refreshLiveFixtures` (silent poll on today only): one request for every
 *   live match worldwide, upserted into the same cache the re-read then hits.
 *   This is what makes the poll cost exactly one request.
 */
export function useDayFixtures(date: Date, favoriteTeamIds: readonly number[]): DayFixturesState {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const dayKey = dayWindow(date).key;

  // The array identity changes on every render; key on the ids themselves.
  const teamsKey = useMemo(() => favoriteTeamIds.join(','), [favoriteTeamIds]);
  const teamIdsRef = useRef(favoriteTeamIds);
  teamIdsRef.current = favoriteTeamIds;
  /** Favorites the team fetch last ran for, so the poll can skip it. */
  const fetchedTeamsKeyRef = useRef<string | null>(null);

  const fetchFavorites = useCallback(
    async (db: SportsDatabase, mode: 'initial' | 'silent' | 'force') => {
      const teamIds = teamIdsRef.current;
      const key = teamIds.join(',');
      // A silent poll must stay at one request: the per-team cache is fresh
      // from the initial load, so only a changed favorite set needs a fetch.
      if (mode === 'silent' && fetchedTeamsKeyRef.current === key) return;
      // A failed fetch leaves the key unmarked so the next load retries it; the
      // day schedule below renders either way.
      const cached = await fetchFavoriteTeamFixtures(
        db,
        date,
        teamIds,
        mode === 'force' ? 0 : TTL_FAVORITES_SECS
      );
      if (cached) fetchedTeamsKeyRef.current = key;
    },
    // The Date instance identity changes on every render; key on the local day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey]
  );

  const load = useCallback(
    async (mode: 'initial' | 'silent' | 'force') => {
      const requestId = ++requestRef.current;
      if (mode === 'initial') {
        setIsLoading(true);
        setError(null);
      }
      try {
        const now = new Date();
        const window = dayWindow(date);
        const db = await getSportsDatabase();

        await fetchFavorites(db, mode);

        if (mode === 'silent' && isSameLocalDay(date, now)) {
          try {
            await db.refreshLiveFixtures();
          } catch (err) {
            console.warn('[useDayFixtures] Live refresh failed:', err);
          }
        }

        const maxAge =
          mode === 'force' ? 0 : mode === 'silent' ? CACHE_ONLY_SECS : cacheTtlFor(date, now);
        const result = await db.getFixturesForDate(
          window.providerDate,
          window.fromTs,
          window.toTs,
          maxAge
        );
        if (requestId !== requestRef.current) return;
        setFixtures(result);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        if (mode !== 'silent') {
          setError(err instanceof Error ? err.message : 'Failed to load matches');
        }
        console.warn('[useDayFixtures] Error:', err);
      } finally {
        if (requestId === requestRef.current) setIsLoading(false);
      }
    },
    // The Date instance identity changes on every render; key on the local day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, fetchFavorites]
  );

  useEffect(() => {
    setFixtures([]);
    void load('initial');
  }, [load]);

  // A favorite added or removed reloads without a spinner: the list on screen
  // stays valid, it just gains or loses that team's matches.
  const previousTeamsKeyRef = useRef(teamsKey);
  useEffect(() => {
    if (previousTeamsKeyRef.current === teamsKey) return;
    previousTeamsKeyRef.current = teamsKey;
    void load('silent');
  }, [teamsKey, load]);

  const hasLive = fixtures.some(isMatchLive);
  const isToday = isSameLocalDay(date, new Date());
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => void load('silent'), hasLive ? LIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(interval);
  }, [isToday, hasLive, load]);

  const refresh = useCallback(() => load('force'), [load]);

  return { fixtures, isLoading, error, refresh };
}
