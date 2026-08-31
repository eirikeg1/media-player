import type { Fixture } from 'expo-m3u-parser';

import { getFixtureStatus } from '../fixture-status';

const base: Fixture = {
  providerId: 1,
  provider: 'sofascore',
  competitionName: 'PL',
  homeTeam: 'A',
  awayTeam: 'B',
  kickoffTime: 1_700_000_000,
  status: 'scheduled',
};

describe('getFixtureStatus', () => {
  it('maps the backend vocabulary', () => {
    expect(getFixtureStatus({ ...base, status: 'in_progress' }).kind).toBe('live');
    expect(getFixtureStatus({ ...base, status: 'paused' })).toMatchObject({ kind: 'halftime', label: 'HT' });
    expect(getFixtureStatus({ ...base, status: 'finished' })).toMatchObject({ kind: 'finished', label: 'FT', showScore: true });
    expect(getFixtureStatus({ ...base, status: 'postponed' })).toMatchObject({ kind: 'postponed', showScore: false });
    expect(getFixtureStatus({ ...base, status: 'cancelled' }).kind).toBe('cancelled');
  });

  it('shows the kickoff time for scheduled matches', () => {
    const info = getFixtureStatus(base);
    expect(info.kind).toBe('scheduled');
    expect(info.showScore).toBe(false);
    expect(info.label).toMatch(/\d/);
  });
});
