import type { Fixture } from 'expo-m3u-parser';

import { fixtureRouteParam, parseFixtureParam } from '../fixture-param';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 12345,
    provider: 'sofascore',
    competitionName: 'Premier League',
    competitionId: 17,
    homeTeam: 'Arsenal',
    homeTeamCrest: 'https://img.example/arsenal.png',
    awayTeam: 'Chelsea',
    kickoffTime: 1_700_000_000,
    status: 'in_progress',
    ...overrides,
  };
}

describe('fixture route parameter', () => {
  it('round-trips the fixture the launching screen holds', () => {
    const original = fixture();
    expect(parseFixtureParam(fixtureRouteParam(original))).toEqual(original);
  });

  it('takes the first value when the router hands over an array', () => {
    const original = fixture();
    expect(parseFixtureParam([fixtureRouteParam(original)])).toEqual(original);
  });

  it('answers null for no parameter at all', () => {
    expect(parseFixtureParam(undefined)).toBeNull();
    expect(parseFixtureParam('')).toBeNull();
    expect(parseFixtureParam([])).toBeNull();
  });

  it('answers null for something that is not JSON', () => {
    // A hand-edited deep link, or a parameter from before this shape existed.
    expect(parseFixtureParam('not json')).toBeNull();
  });

  it('rejects JSON that is not a fixture', () => {
    // The player renders team names and a kickoff time without checking; a
    // half-decoded fixture crashes it on a field that is simply absent.
    expect(parseFixtureParam('null')).toBeNull();
    expect(parseFixtureParam('[1,2,3]')).toBeNull();
    expect(parseFixtureParam('{"providerId":1}')).toBeNull();
  });

  it('rejects a fixture whose ids arrived as strings', () => {
    const wrong = { ...fixture(), providerId: '12345' };
    expect(parseFixtureParam(JSON.stringify(wrong))).toBeNull();
  });
});
