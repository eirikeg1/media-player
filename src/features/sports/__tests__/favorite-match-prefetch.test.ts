import type { Fixture } from 'expo-m3u-parser';

import { PREFETCH_LIMIT, selectPrefetchFixtures } from '../hooks/use-favorite-match-prefetch';

const ARSENAL = 42;
const CHELSEA = 38;

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 1,
    provider: 'sofascore',
    competitionName: 'Premier League',
    homeTeam: 'Arsenal',
    homeTeamId: ARSENAL,
    awayTeam: 'Chelsea',
    awayTeamId: CHELSEA,
    kickoffTime: 1_700_000_000,
    status: 'scheduled',
    ...overrides,
  };
}

const favorites = (...ids: number[]) => new Set(ids);

describe('selectPrefetchFixtures', () => {
  it('keeps only the matches a favorite team plays in', () => {
    const mine = fixture({ providerId: 1 });
    const theirs = fixture({ providerId: 2, homeTeamId: 7, awayTeamId: 8 });
    const away = fixture({ providerId: 3, homeTeamId: 7, awayTeamId: ARSENAL });

    const selected = selectPrefetchFixtures([mine, theirs, away], favorites(ARSENAL));

    expect(selected.map((f) => f.providerId)).toEqual([1, 3]);
  });

  it('selects nothing without favorites', () => {
    expect(selectPrefetchFixtures([fixture()], favorites())).toEqual([]);
  });

  it('puts live matches first, then the earliest kickoff', () => {
    const later = fixture({ providerId: 1, kickoffTime: 3_000 });
    const earlier = fixture({ providerId: 2, kickoffTime: 1_000 });
    const live = fixture({ providerId: 3, kickoffTime: 5_000, status: 'in_progress' });

    const selected = selectPrefetchFixtures([later, earlier, live], favorites(ARSENAL));

    expect(selected.map((f) => f.providerId)).toEqual([3, 2, 1]);
  });

  it('skips fixtures without a SofaScore event id', () => {
    const other = fixture({ providerId: 1, provider: 'football-data' });
    const unknown = fixture({ providerId: 0 });

    expect(selectPrefetchFixtures([other, unknown], favorites(ARSENAL))).toEqual([]);
  });

  it('caps the number of matches warmed', () => {
    const fixtures = Array.from({ length: PREFETCH_LIMIT + 3 }, (_, i) =>
      fixture({ providerId: i + 1, kickoffTime: 1_000 + i })
    );

    const selected = selectPrefetchFixtures(fixtures, favorites(ARSENAL));

    expect(selected).toHaveLength(PREFETCH_LIMIT);
    // The cap keeps the most useful ones: the earliest kickoffs.
    expect(selected.map((f) => f.providerId)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("leaves the caller's array untouched", () => {
    const fixtures = [
      fixture({ providerId: 1, kickoffTime: 3_000 }),
      fixture({ providerId: 2, kickoffTime: 1_000 }),
    ];

    selectPrefetchFixtures(fixtures, favorites(ARSENAL));

    expect(fixtures.map((f) => f.providerId)).toEqual([1, 2]);
  });
});
