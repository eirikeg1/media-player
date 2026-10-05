import type { SportsDatabase } from 'expo-m3u-parser';
import { useCallback } from 'react';

import { useSportsQuery } from './use-sports-query';

/** Six hours: a table or scorer chart changes when matches finish, not by the minute. */
export const COMPETITION_CACHE_TTL_SECS = 21_600;

export interface CompetitionDataState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * One lazily-loaded section of a competition (its table, its top scorers).
 *
 * `enabled` is the *tab* gate, not a mount gate: the competition surface keeps
 * every section mounted across tab switches, so returning to one shows what it
 * already loaded instead of clearing it and fetching again. Only a different
 * competition drops the data — its section must never appear under another
 * competition's name.
 *
 * `empty` is a shared identity for "nothing loaded", so an empty result never
 * hands the memoised rows below a fresh array.
 */
export function useLazyCompetitionData<T>(
  competitionId: number | null,
  enabled: boolean,
  fetcher: (db: SportsDatabase, id: number, ttlSecs: number) => Promise<T>,
  empty: T
): CompetitionDataState<T> {
  const { data, isLoading, error, refresh } = useSportsQuery<number, T>({
    key: competitionId,
    enabled,
    fetcher: (db, id) => fetcher(db, id, COMPETITION_CACHE_TTL_SECS),
    fallback: "Couldn't load this competition.",
  });

  return {
    data: data ?? empty,
    isLoading,
    error,
    // Wrapped so a retry button's press event can't arrive as `{ force }`.
    refresh: useCallback(() => refresh(), [refresh]),
  };
}
