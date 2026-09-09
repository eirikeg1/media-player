import { getSportsDatabase } from '@/services/sports-service';
import type { Fixture, SportsDatabase } from 'expo-m3u-parser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { dayWindow, isSameLocalDay } from '../date-utils';
import {
  CACHE_ONLY_SECS,
  TTL_FAVORITES_SECS,
  cacheTtlFor,
  favoritesWindow,
  fetchFavoriteTeamFixtures,
} from '../fixture-fetch';
import { isMatchLive } from '../match-widgets';
import { useToday } from './use-today';

/** How often today's list silently refreshes while any match is live. */
const LIVE_POLL_MS = 60_000;
/** How often today's list refreshes while nothing is live — catches kickoffs. */
const IDLE_POLL_MS = 5 * 60_000;

/** Shared identity for a day with no matches, so an empty list never re-renders. */
const NO_FIXTURES: Fixture[] = [];

/**
 * - `initial`: nothing on screen for this day — spinner, and errors surface.
 * - `revalidate`: a cached day is already on screen — same freshness as
 *   `initial`, but no spinner and a failure leaves the cached rows alone.
 * - `silent`: background poll — reads the cache without triggering its fan-out.
 * - `force`: pull-to-refresh — ignores every cache age.
 */
type LoadMode = 'initial' | 'revalidate' | 'silent' | 'force';

/** The favorites fetch that is still covering the days around its own window. */
interface FetchedFavorites {
  teamsKey: string;
  fromTs: number;
  toTs: number;
  /** Unix seconds of the fetch: the window covers a day only while it is fresh. */
  fetchedAt: number;
}

/** A day's rows plus the digest they were stored under. */
interface CachedDay {
  fixtures: Fixture[];
  digest: string;
}

/**
 * Everything a row renders that a poll can change. Two results with the same
 * digest are interchangeable on screen, so the previous array is kept and the
 * memoised rows above it never re-render.
 */
function fixturesDigest(fixtures: readonly Fixture[]): string {
  return fixtures
    .map(
      (f) =>
        `${f.providerId}:${f.status}:${f.homeScore ?? ''}:${f.awayScore ?? ''}:${f.periodStart ?? ''}`
    )
    .join('|');
}

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
 * Days already visited come straight back out of an in-memory cache, so paging
 * between them never blanks the list; the refetch runs behind the cached rows.
 *
 * Three backend calls, each with a different cost profile:
 * - `getFixturesForTeams` (6 h cache, skipped while its window still covers the
 *   selected day): the day schedule is assembled from a fixed set of priority
 *   regions, so a favorite playing outside them is only in the cache once its
 *   own fetch ran. It runs first so its rows are already stored when the day is
 *   read, and its failure is swallowed — the day view must render regardless.
 * - `getFixturesForDate` (every load): reads the day out of the cache, fanning
 *   out ~10 paced requests when the cached schedule is stale. That fan-out is
 *   far too expensive to repeat per poll, hence the {@link CACHE_ONLY_SECS}
 *   age on silent loads.
 * - `refreshLiveFixtures` (silent poll on today only): one request for every
 *   live match worldwide, upserted into the same cache the re-read then hits.
 *   This is what makes the poll cost exactly one request.
 *
 * The poll runs only while `isActive` — the tab is focused and the app is in
 * the foreground. Tabs stay mounted once visited, so without it every visitor
 * of the sports tab keeps polling for the rest of the process, backgrounded or
 * not.
 */
export function useDayFixtures(
  date: Date,
  favoriteTeamIds: readonly number[],
  isActive: boolean
): DayFixturesState {
  const [fixtures, setFixtures] = useState<Fixture[]>(NO_FIXTURES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const dayKey = dayWindow(date).key;
  /** Every day read so far, so a revisit renders before the refetch returns. */
  const dayCacheRef = useRef(new Map<string, CachedDay>());

  // The array identity changes on every render; key on the ids themselves.
  const teamsKey = useMemo(() => favoriteTeamIds.join(','), [favoriteTeamIds]);
  const teamIdsRef = useRef(favoriteTeamIds);
  teamIdsRef.current = favoriteTeamIds;
  const fetchedFavoritesRef = useRef<FetchedFavorites | null>(null);

  const fetchFavorites = useCallback(
    async (db: SportsDatabase, mode: LoadMode) => {
      const teamIds = teamIdsRef.current;
      const key = teamIds.join(',');
      const day = dayWindow(date);
      const fetched = fetchedFavoritesRef.current;
      const nowSecs = Math.floor(Date.now() / 1000);
      // The per-team cache is keyed by team alone and one fetch spans weeks, so
      // every day inside that window — and every poll on it — is already served,
      // but only for as long as the rows it stored are themselves fresh. Without
      // the age this skip is permanent, and a session left open all day never
      // picks up a favorite's newly scheduled match.
      if (
        mode !== 'force' &&
        fetched?.teamsKey === key &&
        day.fromTs >= fetched.fromTs &&
        day.toTs <= fetched.toTs &&
        nowSecs - fetched.fetchedAt < TTL_FAVORITES_SECS
      ) {
        return;
      }
      // A failed fetch leaves the window unmarked so the next load retries it;
      // the day schedule below renders either way.
      const window = favoritesWindow(date);
      const cached = await fetchFavoriteTeamFixtures(
        db,
        date,
        teamIds,
        mode === 'force' ? 0 : TTL_FAVORITES_SECS
      );
      if (cached) {
        fetchedFavoritesRef.current = {
          teamsKey: key,
          fromTs: window.fromTs,
          toTs: window.toTs,
          fetchedAt: nowSecs,
        };
      }
    },
    // The Date instance identity changes on every render; key on the local day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey]
  );

  const load = useCallback(
    async (mode: LoadMode) => {
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
        // A poll that changed nothing must not hand the list a new array: every
        // memoised row below would re-render for an identical scoreline.
        const digest = fixturesDigest(result);
        const previous = dayCacheRef.current.get(window.key);
        const day =
          previous?.digest === digest
            ? previous
            : { fixtures: result.length > 0 ? result : NO_FIXTURES, digest };
        dayCacheRef.current.set(window.key, day);
        if (requestId !== requestRef.current) return;
        setFixtures(day.fixtures);
        setError(null);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        // A background load leaves whatever is on screen in place: it is either
        // the cached day or a list the user is still reading.
        if (mode === 'initial' || mode === 'force') {
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

  // A day seen before is restored in the same commit that selects it, so
  // swiping back and forth never falls back to a spinner.
  useEffect(() => {
    const cached = dayCacheRef.current.get(dayKey);
    if (!cached) {
      setFixtures(NO_FIXTURES);
      void load('initial');
      return;
    }
    setFixtures(cached.fixtures);
    setIsLoading(false);
    setError(null);
    void load('revalidate');
  }, [dayKey, load]);

  // A favorite added or removed reloads without a spinner: the list on screen
  // stays valid, it just gains or loses that team's matches.
  const previousTeamsKeyRef = useRef(teamsKey);
  useEffect(() => {
    if (previousTeamsKeyRef.current === teamsKey) return;
    previousTeamsKeyRef.current = teamsKey;
    void load('silent');
  }, [teamsKey, load]);

  const hasLive = fixtures.some(isMatchLive);
  // Not `new Date()`: that is fixed at render, so the poll below would be torn
  // down at midnight and never re-armed for the new "today".
  const today = useToday();
  const isToday = isSameLocalDay(date, today);
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    const resumed = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!isActive || !isToday) return;
    // The screen was away — another tab, or the app in the background — for an
    // unknown stretch, so the rows on it are as old as the absence. Catch up
    // once before settling into the poll.
    if (resumed) void load('silent');
    const interval = setInterval(() => void load('silent'), hasLive ? LIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(interval);
  }, [isActive, isToday, hasLive, load]);

  const refresh = useCallback(() => load('force'), [load]);

  return { fixtures, isLoading, error, refresh };
}
