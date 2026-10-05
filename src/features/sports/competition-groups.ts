import type { Competition } from 'expo-m3u-parser';

export interface CompetitionGroups {
  /** Domestic leagues. */
  top: Competition[];
  /** Continental and world competitions. */
  international: Competition[];
}

/**
 * Split the known competitions into the two sections the picker shows,
 * keeping the registry's order within each. The provider's registry decides
 * which side a competition falls on, so a league added to it appears without a
 * code change — and the app keeps no list of which country names are regions.
 */
export function groupCompetitions(competitions: readonly Competition[]): CompetitionGroups {
  const top: Competition[] = [];
  const international: Competition[] = [];
  for (const competition of competitions) {
    if (competition.international) international.push(competition);
    else top.push(competition);
  }
  return { top, international };
}
