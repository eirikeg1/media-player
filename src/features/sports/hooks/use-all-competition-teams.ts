import type { SportsDatabase, Team } from 'expo-m3u-parser';
import { useCallback, useState } from 'react';

import { useSportsCacheEpochStore } from '../sports-cache-epoch';
import { useSportsQuery, type SportsQueryContext } from './use-sports-query';

const CACHE_TTL = 21_600; // 6 hours

/** Shared identity for "nothing cached", so the first mounts agree on the list. */
const NO_TEAMS: Team[] = [];

/** There is only one cached-team set, so nothing about the key ever changes. */
const ALL_TEAMS_KEY = 'all-competition-teams';

/**
 * Whether the full sweep has already run in this process *and produced teams*.
 *
 * Module-level on purpose: the favourites modal is mounted fresh on every open,
 * and the sweep is far too expensive to tie to a component's lifetime. A sweep
 * that came back with nothing does not set it: the gate exists to stop work
 * that already paid off from being repeated, and there is nothing to show for
 * one that found no teams — leaving it set would make the picker permanently
 * empty for the rest of the launch.
 */
let sweptThisLaunch = false;

// A cache invalidation drops the very team lists the sweep filled in, so the
// once-per-launch gate has to open again — otherwise a "refresh" leaves the
// picker permanently empty for the rest of the process. Subscribed at module
// scope because the flag is module scope; it outlives every picker mount.
useSportsCacheEpochStore.subscribe(() => {
  sweptThisLaunch = false;
});

/** Test-only: forget that the sweep has run, so the next mount can run it. */
export function __resetCompetitionTeamsSweep(): void {
  sweptThisLaunch = false;
}

export interface AllCompetitionTeamsState {
  teams: Team[];
  isLoading: boolean;
  /** A user-requested sweep is running behind the teams already on screen. */
  isRefreshing: boolean;
  /** Why the teams could not be loaded or swept, or null. */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Cached-first, and cached-*only* unless there is a reason to sweep: the sweep
 * re-fetches every stale competition sequentially under the provider's rate
 * limiting, taking many seconds during which it holds the sports handle — so
 * running it on every open stalled the whole sports tab for data the picker
 * already had.
 */
async function fetchAllTeams(
  db: SportsDatabase,
  _key: string,
  { force, publish }: SportsQueryContext<Team[]>
): Promise<Team[]> {
  const cached = await db.getAllCachedCompetitionTeams();
  if (cached.length > 0) publish(cached);

  // Nothing to sweep for: the picker already has teams to show, or this launch
  // has paid for the sweep once already.
  if (!force && (cached.length > 0 || sweptThisLaunch)) return cached;

  // Single native call: refreshes stale competitions sequentially under the
  // provider's rate limiting (cache-or-fetch per competition).
  await db.refreshAllCompetitionTeams(CACHE_TTL);

  const result = await db.getAllCachedCompetitionTeams();
  if (result.length === 0) return NO_TEAMS;
  sweptThisLaunch = true;
  return result;
}

/**
 * What an empty list means once the sweep has run: the picker would otherwise
 * show nothing at all, which reads as a broken modal rather than as a sweep
 * that found no teams. The screen pairs it with its own Retry.
 */
const NO_TEAMS_FOUND = 'No teams found. Retry to sweep the competitions again.';

/**
 * Every cached competition team, for the favourites picker.
 *
 * The sweep runs when the cache is genuinely empty (first ever open — there is
 * nothing to show otherwise, so the picker waits on it), at most once per
 * launch, or when the user explicitly asks via {@link refresh}.
 */
export function useAllCompetitionTeams(): AllCompetitionTeamsState {
  const { data, isLoading, error, refresh } = useSportsQuery<string, Team[]>({
    key: ALL_TEAMS_KEY,
    fetcher: fetchAllTeams,
    fallback: "Couldn't load the team list.",
  });

  // A user-requested sweep reports through `isRefreshing` alone: the teams
  // already on screen stay usable while it runs, and a skeleton over them for
  // the minutes it takes would be a worse answer than the list itself.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sweep = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh({ force: true });
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  // `data` is only defined once a sweep (or a cache read) has answered, so an
  // empty list here is an answer, not the state before one.
  const foundNothing = data !== undefined && data.length === 0;
  return {
    teams: data ?? NO_TEAMS,
    isLoading,
    isRefreshing,
    error: error ?? (foundNothing ? NO_TEAMS_FOUND : null),
    refresh: sweep,
  };
}
