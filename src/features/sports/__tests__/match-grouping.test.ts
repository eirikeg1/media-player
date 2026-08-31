import type { Fixture } from 'expo-m3u-parser';

import { FAVORITES_GROUP_KEY, groupFixturesByLeague, involvesFavorite } from '../match-grouping';

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    providerId: Math.floor(Math.random() * 1_000_000),
    provider: 'sofascore',
    competitionName: 'Premier League',
    competitionId: 17,
    competitionCountry: 'England',
    homeTeam: 'Arsenal',
    homeTeamId: 42,
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    kickoffTime: 1_700_000_000,
    status: 'scheduled',
    ...overrides,
  };
}

const ucl = { competitionName: 'UEFA Champions League', competitionId: 7, competitionCountry: 'Europe' };
const laLiga = { competitionName: 'La Liga', competitionId: 8, competitionCountry: 'Spain' };
const obscure = { competitionName: 'Veikkausliiga', competitionId: 999, competitionCountry: 'Finland' };
const obscure2 = { competitionName: 'Allsvenskan', competitionId: 998, competitionCountry: 'Sweden' };

describe('groupFixturesByLeague', () => {
  it('orders leagues by the user ranking, then others by country/name', () => {
    const groups = groupFixturesByLeague(
      [
        fixture({ ...obscure2 }),
        fixture({ ...laLiga }),
        fixture({ ...obscure }),
        fixture({}),
        fixture({ ...ucl }),
      ],
      { favoriteTeamIds: new Set(), leagueOrder: [7, 17, 8] }
    );
    expect(groups.map((g) => g.title)).toEqual([
      'UEFA Champions League',
      'Premier League',
      'La Liga',
      'Veikkausliiga',
      'Allsvenskan',
    ]);
    expect(groups[0].logoUrl).toContain('/unique-tournament/7/');
    expect(groups[0].subtitle).toBe('Europe');
  });

  it('puts a Favorites group first with matches of favorite teams, keeping them in their league too', () => {
    const arsenal = fixture({ kickoffTime: 200 });
    const other = fixture({ homeTeamId: 1, awayTeamId: 2, kickoffTime: 100 });
    const groups = groupFixturesByLeague([other, arsenal], {
      favoriteTeamIds: new Set([42]),
      leagueOrder: [17],
    });
    expect(groups[0].key).toBe(FAVORITES_GROUP_KEY);
    expect(groups[0].fixtures).toEqual([arsenal]);
    expect(groups[1].fixtures.map((f) => f.kickoffTime)).toEqual([100, 200]);
  });

  it('omits the Favorites group when no favorite plays', () => {
    const groups = groupFixturesByLeague([fixture({})], { favoriteTeamIds: new Set([7]), leagueOrder: [] });
    expect(groups.some((g) => g.isFavorites)).toBe(false);
  });

  it('can hide unranked leagues and filter to live matches', () => {
    const live = fixture({ ...ucl, status: 'in_progress' });
    const groups = groupFixturesByLeague([live, fixture({ ...obscure, status: 'in_progress' }), fixture({ ...ucl })], {
      favoriteTeamIds: new Set(),
      leagueOrder: [7],
      hideOtherLeagues: true,
      liveOnly: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].fixtures).toEqual([live]);
    expect(groups[0].liveCount).toBe(1);
  });

  it('groups fixtures without a competition id by name', () => {
    const groups = groupFixturesByLeague(
      [
        fixture({ competitionId: undefined, competitionName: 'Friendly' }),
        fixture({ competitionId: undefined, competitionName: 'Friendly' }),
      ],
      { favoriteTeamIds: new Set(), leagueOrder: [] }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].fixtures).toHaveLength(2);
    expect(groups[0].logoUrl).toBeUndefined();
  });
});

describe('involvesFavorite', () => {
  it('matches either side of the fixture', () => {
    const match = fixture({ homeTeamId: 42, awayTeamId: 38 });
    expect(involvesFavorite(match, new Set([42]))).toBe(true);
    expect(involvesFavorite(match, new Set([38]))).toBe(true);
    expect(involvesFavorite(match, new Set([1]))).toBe(false);
  });

  it('ignores fixtures whose teams have no id', () => {
    const match = fixture({ homeTeamId: undefined, awayTeamId: undefined });
    expect(involvesFavorite(match, new Set([42]))).toBe(false);
  });
});
