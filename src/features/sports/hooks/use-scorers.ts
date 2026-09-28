import type { SportsDatabase, TopScorers } from 'expo-m3u-parser';

import { useLazyCompetitionData, type CompetitionDataState } from './use-competition-data';

const NO_SCORERS = null;

const fetchScorers = (db: SportsDatabase, id: number, ttlSecs: number) =>
  db.getScorers(id, ttlSecs);

export interface ScorersState extends Omit<CompetitionDataState<TopScorers | null>, 'data'> {
  scorers: TopScorers | null;
}

/** A competition's top scorers, loaded when its tab is on screen. */
export function useScorers(competitionId: number | null, enabled: boolean): ScorersState {
  const { data, ...rest } = useLazyCompetitionData<TopScorers | null>(
    competitionId,
    enabled,
    fetchScorers,
    NO_SCORERS
  );
  return { scorers: data, ...rest };
}
