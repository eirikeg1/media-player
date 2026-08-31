import type { Competition } from 'expo-m3u-parser';

/**
 * Countries the registry uses for competitions that aren't domestic leagues
 * (`sports-provider/src/sofascore/registry.rs`).
 */
const INTERNATIONAL_COUNTRIES = new Set(['europe', 'world']);

export interface CompetitionGroups {
  /** Domestic leagues. */
  top: Competition[];
  /** Continental and world competitions. */
  international: Competition[];
}

/**
 * Split the known competitions into the two sections the picker shows,
 * keeping the registry's order within each. Derived from each competition's
 * country so a league added to the registry appears without a code change.
 */
export function groupCompetitions(competitions: readonly Competition[]): CompetitionGroups {
  const top: Competition[] = [];
  const international: Competition[] = [];
  for (const competition of competitions) {
    const country = competition.country?.trim().toLowerCase() ?? '';
    if (INTERNATIONAL_COUNTRIES.has(country)) international.push(competition);
    else top.push(competition);
  }
  return { top, international };
}
