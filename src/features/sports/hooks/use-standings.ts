import type { SportsDatabase, Standing } from 'expo-m3u-parser';

import { useLazyCompetitionData, type CompetitionDataState } from './use-competition-data';

/** Shared identity for "no table", so an empty result never re-renders the rows. */
const NO_STANDINGS: Standing[] = [];

const fetchStandings = (db: SportsDatabase, id: number, ttlSecs: number) =>
  db.getStandings(id, ttlSecs);

export interface StandingsState extends Omit<CompetitionDataState<Standing[]>, 'data'> {
  standings: Standing[];
}

/** A competition's league table, loaded when its tab is on screen. */
export function useStandings(competitionId: number | null, enabled: boolean): StandingsState {
  const { data, ...rest } = useLazyCompetitionData(
    competitionId,
    enabled,
    fetchStandings,
    NO_STANDINGS
  );
  return { standings: data, ...rest };
}
