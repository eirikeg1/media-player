import type { SportsDatabase, Team } from 'expo-m3u-parser';
import { useCallback } from 'react';

import { CACHE_ONLY_SECS } from '../fixture-fetch';
import { useSportsQuery, type SportsQueryContext } from './use-sports-query';

const CACHE_TTL = 21_600; // 6 hours

/** Shared identity for "no teams", so an empty competition never re-renders. */
const NO_TEAMS: Team[] = [];

export interface CompetitionTeamsState {
  teams: Team[];
  isLoading: boolean;
  /** Why the list could not be refreshed, or null. */
  error: string | null;
  /** Read the competition again, ignoring the cache age. */
  retry: () => void;
}

/**
 * Cached first: the {@link CACHE_ONLY_SECS} read serves whatever is stored
 * without a request (an empty competition counts as stale, so the first ever
 * open still fetches), and the TTL'd read behind it refreshes a stale list in
 * place — the user browses the old list instead of a spinner.
 */
async function fetchCompetitionTeams(
  db: SportsDatabase,
  compId: number,
  { force, publish }: SportsQueryContext<Team[]>
): Promise<Team[]> {
  const cached = await db.getCompetitionTeams(compId, CACHE_ONLY_SECS);
  if (cached.length > 0) publish(cached);
  return db.getCompetitionTeams(compId, force ? 0 : CACHE_TTL);
}

/** One competition's teams, for the favourites picker. */
export function useCompetitionTeams(compId: number | null): CompetitionTeamsState {
  const { data, isLoading, error, refresh } = useSportsQuery<number, Team[]>({
    key: compId,
    fetcher: fetchCompetitionTeams,
    fallback: "Couldn't load this competition's teams.",
  });

  return {
    teams: data ?? NO_TEAMS,
    isLoading,
    error,
    retry: useCallback(() => void refresh({ force: true }), [refresh]),
  };
}
