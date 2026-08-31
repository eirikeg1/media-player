import type { Competition } from 'expo-m3u-parser';

import { groupCompetitions } from '../competition-groups';

function competition(providerId: number, name: string, country?: string): Competition {
  return { providerId, provider: 'sofascore', name, country };
}

const registry: Competition[] = [
  competition(17, 'Premier League', 'England'),
  competition(8, 'La Liga', 'Spain'),
  competition(16, 'FIFA World Cup', 'World'),
  competition(7, 'UEFA Champions League', 'Europe'),
  competition(20, 'Eliteserien', 'Norway'),
  competition(17015, 'UEFA Conference League', 'Europe'),
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

  it('treats an unknown or missing country as domestic', () => {
    const { top, international } = groupCompetitions([
      competition(999, 'Veikkausliiga', 'Finland'),
      competition(998, 'Mystery Cup'),
    ]);
    expect(top.map((c) => c.providerId)).toEqual([999, 998]);
    expect(international).toEqual([]);
  });

  it('matches the country regardless of case or padding', () => {
    const { international } = groupCompetitions([competition(679, 'UEFA Europa League', ' europe ')]);
    expect(international.map((c) => c.providerId)).toEqual([679]);
  });

  it('returns empty groups for an empty registry', () => {
    expect(groupCompetitions([])).toEqual({ top: [], international: [] });
  });
});
