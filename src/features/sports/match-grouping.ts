import type { Fixture } from 'expo-m3u-parser';

import { competitionLogoUrl } from './league-preferences';
import { isMatchLive } from './match-widgets';

export const FAVORITES_GROUP_KEY = 'favorites';

export interface MatchGroup {
  /** `favorites` or `league:<competitionId>` (or `league:name:<name>` without an id). */
  key: string;
  title: string;
  subtitle?: string;
  logoUrl?: string;
  competitionId?: number;
  isFavorites: boolean;
  fixtures: Fixture[];
  liveCount: number;
}

export interface GroupingOptions {
  /** Provider ids of the user's favorite teams. */
  favoriteTeamIds: ReadonlySet<number>;
  /** Preferred league order (competition ids); unlisted leagues follow alphabetically. */
  leagueOrder: readonly number[];
  /** Drop leagues that aren't in `leagueOrder` (favorites are always kept). */
  hideOtherLeagues?: boolean;
  /** Keep only live matches. */
  liveOnly?: boolean;
}

/** Whether one of the fixture's teams is a favorite. */
export function involvesFavorite(fixture: Fixture, favoriteTeamIds: ReadonlySet<number>): boolean {
  return (
    (fixture.homeTeamId != null && favoriteTeamIds.has(fixture.homeTeamId)) ||
    (fixture.awayTeamId != null && favoriteTeamIds.has(fixture.awayTeamId))
  );
}

function leagueKey(fixture: Fixture): string {
  return fixture.competitionId != null
    ? `league:${fixture.competitionId}`
    : `league:name:${fixture.competitionName}`;
}

function byKickoff(a: Fixture, b: Fixture): number {
  return a.kickoffTime - b.kickoffTime || a.providerId - b.providerId;
}

/**
 * Group a day's fixtures FotMob-style: a Favorites group first (matches
 * involving favorite teams), then one group per competition ordered by the
 * user's league ranking, then every other competition alphabetically by
 * country and name. Fixtures are sorted by kickoff within each group.
 */
export function groupFixturesByLeague(fixtures: readonly Fixture[], options: GroupingOptions): MatchGroup[] {
  const { favoriteTeamIds, leagueOrder, hideOtherLeagues = false, liveOnly = false } = options;
  const visible = liveOnly ? fixtures.filter(isMatchLive) : [...fixtures];

  const favorites = visible.filter((f) => involvesFavorite(f, favoriteTeamIds)).sort(byKickoff);
  const rank = new Map(leagueOrder.map((id, index) => [id, index]));

  const leagues = new Map<string, MatchGroup>();
  for (const fixture of visible) {
    const isRanked = fixture.competitionId != null && rank.has(fixture.competitionId);
    if (hideOtherLeagues && !isRanked) continue;
    const key = leagueKey(fixture);
    let group = leagues.get(key);
    if (!group) {
      group = {
        key,
        title: fixture.competitionName,
        subtitle: fixture.competitionCountry,
        logoUrl: fixture.competitionId != null ? competitionLogoUrl(fixture.competitionId) : undefined,
        competitionId: fixture.competitionId,
        isFavorites: false,
        fixtures: [],
        liveCount: 0,
      };
      leagues.set(key, group);
    }
    group.fixtures.push(fixture);
  }

  const ordered = [...leagues.values()].sort((a, b) => {
    const ra = a.competitionId != null ? rank.get(a.competitionId) : undefined;
    const rb = b.competitionId != null ? rank.get(b.competitionId) : undefined;
    if (ra !== undefined || rb !== undefined) {
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra - rb;
    }
    return (
      (a.subtitle ?? '').localeCompare(b.subtitle ?? '') || a.title.localeCompare(b.title)
    );
  });

  for (const group of ordered) {
    group.fixtures.sort(byKickoff);
    group.liveCount = group.fixtures.filter(isMatchLive).length;
  }

  if (favorites.length > 0) {
    ordered.unshift({
      key: FAVORITES_GROUP_KEY,
      title: 'Favorites',
      isFavorites: true,
      fixtures: favorites,
      liveCount: favorites.filter(isMatchLive).length,
    });
  }
  return ordered;
}
