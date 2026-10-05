import { getSportsDatabase } from '@/services/sports-service';
import type { Competition } from 'expo-m3u-parser';
import { useCallback } from 'react';

import { getSportsCacheEpoch } from '../sports-cache-epoch';
import { useSportsQuery } from './use-sports-query';

/** Six hours — the competition list is effectively static within a session. */
const CACHE_TTL_SECS = 21_600;

/** Shared identity for "not loaded yet", so mounts before the fetch agree. */
const NO_COMPETITIONS: Competition[] = [];

/** A resolved competition list, when it was read, and under which epoch. */
interface CachedCompetitions {
  competitions: Competition[];
  fetchedAt: number;
  epoch: number;
}

/**
 * The last result and the in-flight read, shared by every mount in the process.
 *
 * Three screens ask for the competition list, two of them at the same time
 * inside the favourites modal, and each mount used to make its own native call:
 * the same read, serialised behind the panel's single connection, delaying the
 * data the modal is waiting for. One promise serves all of them.
 *
 * The resolved list is kept for {@link CACHE_TTL_SECS}, matching the native
 * cache it came from — long enough that paging between screens costs nothing,
 * short enough that a session left open all day still picks up a new
 * competition. A failure is never cached: the next mount retries.
 */
let cached: CachedCompetitions | null = null;
let pending: { epoch: number; promise: Promise<Competition[]> } | null = null;

/** Test-only: forget the shared list, so the next call reads afresh. */
export function __resetCompetitionsCache(): void {
  cached = null;
  pending = null;
}

function loadCompetitions(force: boolean): Promise<Competition[]> {
  const epoch = getSportsCacheEpoch();
  const now = Date.now();
  // An invalidation since the list was stored makes it describe replaced data,
  // however young it is.
  if (
    !force &&
    cached &&
    cached.epoch === epoch &&
    now - cached.fetchedAt < CACHE_TTL_SECS * 1000
  ) {
    return Promise.resolve(cached.competitions);
  }
  // Joined only by callers of the same epoch: a read started before an
  // invalidation is answering about the data being replaced, so handing it to a
  // caller that asked afterwards would be the stale list with extra steps.
  if (pending && pending.epoch === epoch) return pending.promise;

  const started: Promise<Competition[]> = (async () => {
    const db = await getSportsDatabase();
    return db.getCompetitions(force ? 0 : CACHE_TTL_SECS);
  })()
    .then((competitions) => {
      // Same reason the other way round: an invalidation while this read was in
      // flight means storing it would serve the superseded list to every mount
      // for the next six hours.
      if (getSportsCacheEpoch() === epoch) {
        cached = { competitions, fetchedAt: Date.now(), epoch };
      }
      return competitions;
    })
    .finally(() => {
      // Only clear the slot this read owns, and on both paths: a settled
      // promise must not be handed to a later mount as if it were still in
      // flight, and a rejected one must not be remembered at all.
      if (pending?.promise === started) pending = null;
    });

  pending = { epoch, promise: started };
  return started;
}

export interface CompetitionsState {
  competitions: Competition[];
  isLoading: boolean;
  /** Why the list could not be loaded, or null. */
  error: string | null;
  /** Refetches, ignoring both caches. */
  retry: () => void;
}

/**
 * There is only ever one competition list, so the query's key is a constant:
 * nothing about what is being asked for can change, only when.
 */
const COMPETITIONS_KEY = 'competitions';

/**
 * The read the query runs. The process-wide dedupe above lives inside it, so a
 * second mount joins the promise instead of making the same native call — the
 * panel serialises them behind one connection.
 */
const fetchCompetitions = (
  _db: unknown,
  _key: string,
  { force }: { force: boolean }
): Promise<Competition[]> => loadCompetitions(force);

/** Every competition the provider knows, cached for the launch. */
export function useCompetitions(): CompetitionsState {
  const { data, isLoading, error, refresh } = useSportsQuery<string, Competition[]>({
    key: COMPETITIONS_KEY,
    fetcher: fetchCompetitions,
    fallback: "Couldn't load competitions.",
  });

  const retry = useCallback(() => void refresh({ force: true }), [refresh]);

  return { competitions: data ?? NO_COMPETITIONS, isLoading, error, retry };
}
