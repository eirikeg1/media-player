import type { Fixture } from 'expo-m3u-parser';

import {
  buildMatchTabs,
  getFixtureScoreDisplay,
  isMatchConcluded,
  isMatchLive,
  matchHasStarted,
  supportsMatchWidgets,
} from '../match-widgets';

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    providerId: 12436870,
    provider: 'sofascore',
    competitionName: 'Premier League',
    homeTeam: 'Arsenal',
    homeTeamId: 42,
    homeTeamShort: 'ARS',
    awayTeam: 'Chelsea',
    awayTeamId: 38,
    awayTeamShort: 'CHE',
    kickoffTime: 1_700_000_000,
    // The status vocabulary the backend actually emits (FixtureStatus::to_str).
    status: 'in_progress',
    homeScore: 2,
    awayScore: 1,
    ...overrides,
  };
}

describe('supportsMatchWidgets', () => {
  it('accepts a SofaScore fixture with a positive event id', () => {
    expect(supportsMatchWidgets(makeFixture())).toBe(true);
  });

  it('rejects null / non-SofaScore / invalid ids', () => {
    expect(supportsMatchWidgets(null)).toBe(false);
    expect(supportsMatchWidgets(undefined)).toBe(false);
    expect(supportsMatchWidgets(makeFixture({ provider: 'football-data' }))).toBe(false);
    expect(supportsMatchWidgets(makeFixture({ providerId: 0 }))).toBe(false);
  });
});

describe('matchHasStarted', () => {
  it('is true once a match is live or finished', () => {
    expect(matchHasStarted(makeFixture({ status: 'in_progress' }))).toBe(true);
    expect(matchHasStarted(makeFixture({ status: 'paused' }))).toBe(true);
    expect(matchHasStarted(makeFixture({ status: 'finished' }))).toBe(true);
  });

  it('is false before kickoff', () => {
    expect(matchHasStarted(makeFixture({ status: 'scheduled' }))).toBe(false);
    expect(matchHasStarted(makeFixture({ status: 'TIMED' }))).toBe(false);
  });

  it('is false for matches that never happened', () => {
    expect(matchHasStarted(makeFixture({ status: 'postponed' }))).toBe(false);
    expect(matchHasStarted(makeFixture({ status: 'cancelled' }))).toBe(false);
    expect(matchHasStarted(makeFixture({ status: 'unknown' }))).toBe(false);
  });
});

describe('isMatchLive', () => {
  it('is true for the in-play statuses the backend emits', () => {
    expect(isMatchLive(makeFixture({ status: 'in_progress' }))).toBe(true);
    expect(isMatchLive(makeFixture({ status: 'paused' }))).toBe(true);
    expect(isMatchLive(makeFixture({ status: 'live' }))).toBe(true);
  });

  it('accepts legacy in-play spellings defensively', () => {
    expect(isMatchLive(makeFixture({ status: 'IN_PLAY' }))).toBe(true);
    expect(isMatchLive(makeFixture({ status: 'HALFTIME' }))).toBe(true);
  });

  it('is false when not in play', () => {
    expect(isMatchLive(makeFixture({ status: 'scheduled' }))).toBe(false);
    expect(isMatchLive(makeFixture({ status: 'finished' }))).toBe(false);
    expect(isMatchLive(makeFixture({ status: 'unknown' }))).toBe(false);
  });
});

describe('isMatchConcluded', () => {
  it('is true once the match can no longer go live', () => {
    expect(isMatchConcluded('finished')).toBe(true);
    expect(isMatchConcluded('postponed')).toBe(true);
    expect(isMatchConcluded('cancelled')).toBe(true);
  });

  it('keeps scheduled, live and interrupted matches polling', () => {
    expect(isMatchConcluded('scheduled')).toBe(false);
    expect(isMatchConcluded('in_progress')).toBe(false);
    expect(isMatchConcluded('unknown')).toBe(false);
  });
});

describe('buildMatchTabs', () => {
  it('leads with statistics for a started match', () => {
    const tabs = buildMatchTabs(makeFixture({ status: 'in_progress' }));
    expect(tabs.map((t) => t.key)).toEqual(['stats', 'players', 'timeline', 'lineups', 'preview']);
  });

  it('leads with the preview before kickoff', () => {
    const tabs = buildMatchTabs(makeFixture({ status: 'scheduled' }));
    expect(tabs.map((t) => t.key)).toEqual(['preview', 'lineups', 'stats', 'players', 'timeline']);
  });

  it('leads with the preview for postponed matches (the in-play tabs are empty)', () => {
    const tabs = buildMatchTabs(makeFixture({ status: 'postponed' }));
    expect(tabs.map((t) => t.key)).toEqual(['preview', 'lineups', 'stats', 'players', 'timeline']);
  });

  it('always includes the five native tabs', () => {
    const tabs = buildMatchTabs(makeFixture());
    expect([...tabs.map((t) => t.key)].sort()).toEqual([
      'lineups',
      'players',
      'preview',
      'stats',
      'timeline',
    ]);
  });
});

describe('getFixtureScoreDisplay', () => {
  it('shows the score and LIVE for in-play matches', () => {
    const display = getFixtureScoreDisplay(makeFixture());
    expect(display).toMatchObject({ home: 'ARS', away: 'CHE', score: '2 - 1', status: 'LIVE', isLive: true });
  });

  it('shows FT for finished matches', () => {
    const display = getFixtureScoreDisplay(makeFixture({ status: 'finished' }));
    expect(display).toMatchObject({ score: '2 - 1', status: 'FT', isLive: false });
  });

  it('shows kickoff time and no score before the match', () => {
    const display = getFixtureScoreDisplay(
      makeFixture({ status: 'scheduled', homeScore: undefined, awayScore: undefined })
    );
    expect(display.score).toBeNull();
    expect(display.isLive).toBe(false);
    expect(display.status).toMatch(/\d/); // a formatted time
  });
});
