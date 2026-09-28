import type { Competition } from 'expo-m3u-parser';

import { groupCompetitions } from '../competition-groups';

function competition(
  providerId: number,
  name: string,
  { country, international = false }: { country?: string; international?: boolean } = {}
): Competition {
  return { providerId, provider: 'sofascore', name, country, international };
}

const registry: Competition[] = [
  competition(17, 'Premier League', { country: 'England' }),
  competition(8, 'La Liga', { country: 'Spain' }),
  competition(16, 'FIFA World Cup', { country: 'World', international: true }),
  competition(7, 'UEFA Champions League', { country: 'Europe', international: true }),
  competition(20, 'Eliteserien', { country: 'Norway' }),
  competition(17015, 'UEFA Conference League', { country: 'Europe', international: true }),
];

describe('groupCompetitions', () => {
  it('splits domestic leagues from continental and world competitions', () => {
    const { top, international } = groupCompetitions(registry);
    expect(top.map((c) => c.providerId)).toEqual([17, 8, 20]);
    expect(international.map((c) => c.providerId)).toEqual([16, 7, 17015]);
  });

  it('keeps the registry order within each group', () => {
    const { top } = groupCompetitions([...registry].reverse());
    expect(top.map((c) => c.name)).toEqual(['Eliteserien', 'La Liga', 'Premier League']);
  });

  it('groups by the provider flag, not by the country name', () => {
    // "Europe" is a region the app used to pattern-match on; the registry is
    // what decides now, so a domestic league there stays domestic.
    const { top, international } = groupCompetitions([
      competition(999, 'Veikkausliiga', { country: 'Finland' }),
      competition(998, 'Mystery Cup'),
      competition(997, 'Regional League', { country: 'Europe' }),
    ]);
    expect(top.map((c) => c.providerId)).toEqual([999, 998, 997]);
    expect(international).toEqual([]);
  });

  it('returns empty groups for an empty registry', () => {
    expect(groupCompetitions([])).toEqual({ top: [], international: [] });
  });
});
