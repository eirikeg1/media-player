import { reportLandingReady } from '@/features/launch/landing-readiness';
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
import { useSportsCacheEpoch } from '../sports-cache-epoch';
import { sportsErrorMessage } from '../sports-errors';
import { useToday } from './use-today';

/** How often today's list silently refreshes while any match is live. */
const LIVE_POLL_MS = 60_000;
/** How often today's list refreshes while nothing is live — catches kickoffs. */
const IDLE_POLL_MS = 5 * 60_000;

/**
 * How often a day served from a cache the native side is still fanning out
 * behind re-reads that cache, and how long it keeps doing so.
 *
 * Every re-read is cache-only, so the whole revalidation costs no provider
 * requests at all; the deadline is there for a fan-out that never lands (the
 * provider is refusing us), after which the rows on screen are simply the best
 * there is until the next poll.
 */
const RECHECK_POLL_MS = 2_000;
const RECHECK_MAX_MS = 15_000;

/** Shared identity for a day with no matches, so an empty list never re-renders. */
const NO_FIXTURES: Fixture[] = [];

/**
 * - `initial`: nothing on screen for this day — spinner, and errors surface.
 * - `revalidate`: a cached day is already on screen — same freshness as
 *   `initial`, but no spinner and a failure leaves the cached rows alone.
 * - `silent`: background poll — reads the cache without triggering its fan-out.
 * - `recheck`: the rows on screen came from a schedule the native side is
 *   refreshing behind them — re-reads that cache until the refresh lands.
 * - `force`: pull-to-refresh — ignores every cache age.
 */
type LoadMode = 'initial' | 'revalidate' | 'silent' | 'recheck' | 'force';

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
  /**
   * The rows on screen came from a schedule the native side is still
   * refreshing, and are about to be replaced. Worth saying so quietly; never
   * worth a spinner, because what is shown is real data.
   */
  isRevalidating: boolean;
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
 * - `getFixturesForWindow` (every load): reads the day out of the cache, fanning
 *   out ~10 paced requests for each UTC date the window touches when the cached
 *   schedule is stale. Only a day that was never fetched makes the call wait
 *   for that fan-out; a day with anything on file answers at once and reports
 *   the refresh through `stale`, which is what the cache-only recheck below
 *   follows until the fresh rows land. The fan-out is far too expensive to
 *   repeat per poll, hence the {@link CACHE_ONLY_SECS} age on silent loads —
 *   the native side honours it outright, so not even a day whose cached
 *   schedule came back incomplete is refetched by a poll.
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
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  /** How many `initial`/`force` loads are in flight; cache-only reads stand aside. */
  const blockingLoadsRef = useRef(0);
  /** When the running recheck gives up; `null` when nothing is being rechecked. */
  const recheckDeadlineRef = useRef<number | null>(null);
  const dayKey = dayWindow(date).key;
  /** Every day read so far, so a revisit renders before the refetch returns. */
  const dayCacheRef = useRef(new Map<string, CachedDay>());

  // The array identity changes on every render; key on the ids themselves.
  const teamsKey = useMemo(() => favoriteTeamIds.join(','), [favoriteTeamIds]);
  const teamIdsRef = useRef(favoriteTeamIds);
  teamIdsRef.current = favoriteTeamIds;
  const fetchedFavoritesRef = useRef<FetchedFavorites | null>(null);

  // A cache invalidation replaces the rows every stored day was built from.
  // Dropped during render rather than in an effect: the day effect below reads
  // `dayCacheRef` in the same commit, and would otherwise restore a day from
  // exactly the data the user asked to replace.
  const epoch = useSportsCacheEpoch();
  const handledEpochRef = useRef(epoch);
  if (handledEpochRef.current !== epoch) {
    dayCacheRef.current.clear();
    fetchedFavoritesRef.current = null;
  }

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
      const fetchWindow = favoritesWindow(date);
      const cached = await fetchFavoriteTeamFixtures(
        db,
        date,
        teamIds,
        mode === 'force' ? 0 : TTL_FAVORITES_SECS
      );
      if (cached) {
        fetchedFavoritesRef.current = {
          teamsKey: key,
          fromTs: fetchWindow.fromTs,
          toTs: fetchWindow.toTs,
          fetchedAt: nowSecs,
        };
      }
    },
    // The Date instance identity changes on every render; key on the local day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey]
  );

  /**
   * Record whether a refresh is running behind the rows a load just stored.
   *
   * Only a load that went and looked — anything but a recheck — may open a
   * recheck session and set its deadline. A recheck can keep its own session
   * alive but never start one, so a read that lands just after the deadline
   * cannot restart the loop it was meant to end.
   */
  const reportStale = useCallback((mode: LoadMode, stale: boolean) => {
    if (!stale) {
      recheckDeadlineRef.current = null;
      setIsRevalidating(false);
      return;
    }
    if (mode === 'recheck') {
      const deadline = recheckDeadlineRef.current;
      if (deadline !== null && Date.now() < deadline) setIsRevalidating(true);
      return;
    }
    recheckDeadlineRef.current = Date.now() + RECHECK_MAX_MS;
    setIsRevalidating(true);
  }, []);

  const load = useCallback(
    async (mode: LoadMode) => {
      // A cache-only read would win the request race against the fan-out it
      // interrupted, discarding the fresher rows the user is waiting for. The
      // tick simply returns; the load in flight is what lands.
      const isCacheOnly = mode === 'silent' || mode === 'recheck';
      if (isCacheOnly && blockingLoadsRef.current > 0) return;

      const requestId = ++requestRef.current;
      const isBlocking = mode === 'initial' || mode === 'force';
      if (isBlocking) blockingLoadsRef.current += 1;
      if (mode === 'initial') {
        setIsLoading(true);
        setError(null);
      }
      try {
        const now = new Date();
        const day = dayWindow(date);
        const db = await getSportsDatabase();

        // A recheck is waiting on a fan-out that is already running; it re-reads
        // that one cache and asks for nothing else.
        if (mode !== 'recheck') await fetchFavorites(db, mode);

        if (mode === 'silent' && isSameLocalDay(date, now)) {
          try {
            await db.refreshLiveFixtures();
          } catch (err) {
            console.warn('[useDayFixtures] Live refresh failed:', err);
          }
        }

        const maxAge =
          mode === 'force' ? 0 : isCacheOnly ? CACHE_ONLY_SECS : cacheTtlFor(date, now);
        const window = await db.getFixturesForWindow(day.fromTs, day.toTs, maxAge);
        const result = window.fixtures;
        // A poll that changed nothing must not hand the list a new array: every
        // memoised row below would re-render for an identical scoreline.
        const digest = fixturesDigest(result);
        const previous = dayCacheRef.current.get(day.key);
        const cachedDay =
          previous?.digest === digest
            ? previous
            : { fixtures: result.length > 0 ? result : NO_FIXTURES, digest };
        // Below the guard: a superseded read must not poison the cache the next
        // visit to this day renders from.
        if (requestId !== requestRef.current) return;
        dayCacheRef.current.set(day.key, cachedDay);
        setFixtures(cachedDay.fixtures);
        setError(null);
        // The native side is still fanning out behind these rows; the effect
        // below re-reads the same window until it has landed.
        reportStale(mode, window.stale);
        // The rows are on screen — `stale` only means a refresh is running
        // behind them — so the landing screen counts as populated and the warms
        // that were standing aside for the day view may go ahead.
        if (mode === 'initial') reportLandingReady('sports');
      } catch (err) {
        if (requestId !== requestRef.current) return;
        // A background load leaves whatever is on screen in place: it is either
        // the cached day or a list the user is still reading.
        if (isBlocking) {
          setError(sportsErrorMessage(err, "Couldn't load matches."));
        }
        console.warn('[useDayFixtures] Error:', err);
      } finally {
        if (isBlocking) blockingLoadsRef.current -= 1;
        if (requestId === requestRef.current) setIsLoading(false);
      }
    },
    // The Date instance identity changes on every render; key on the local day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, fetchFavorites, reportStale]
  );

  // A day seen before is restored in the same commit that selects it, so
  // swiping back and forth never falls back to a spinner.
  useEffect(() => {
    // Whatever the previous day was waiting for says nothing about this one.
    recheckDeadlineRef.current = null;
    setIsRevalidating(false);
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

  // The rows on screen came out of a schedule the native side is refreshing
  // behind them. Re-read that one window — cache-only, so the whole wait costs
  // no provider requests — until the fresh rows are in it.
  useEffect(() => {
    if (!isRevalidating) return;
    const interval = setInterval(() => {
      const deadline = recheckDeadlineRef.current;
      if (deadline === null || Date.now() >= deadline) {
        recheckDeadlineRef.current = null;
        setIsRevalidating(false);
        return;
      }
      void load('recheck');
    }, RECHECK_POLL_MS);
    return () => clearInterval(interval);
  }, [isRevalidating, load]);

  // The day on screen is as invalid as the cache it came from, so refetch it —
  // silently, because the rows the user is reading are still the best guess
  // until the replacement lands.
  useEffect(() => {
    if (handledEpochRef.current === epoch) return;
    handledEpochRef.current = epoch;
    void load('revalidate');
  }, [epoch, load]);

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

  return { fixtures, isLoading, isRevalidating, error, refresh };
}
