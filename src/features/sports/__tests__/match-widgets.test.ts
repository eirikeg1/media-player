import type { Fixture } from 'expo-m3u-parser';

import {
  buildMatchTabs,
  getFixtureScoreDisplay,
  isConcludedStatus,
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
    // Interrupted mid-match: the statistics and timeline it produced are there.
    expect(matchHasStarted(makeFixture({ status: 'interrupted' }))).toBe(true);
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
    // The bug this vocabulary exists for: `interrupted` used to read as the
    // half-time break, so the sheet showed HT and polled for good.
    expect(isMatchLive(makeFixture({ status: 'interrupted' }))).toBe(false);
    expect(isMatchLive(makeFixture({ status: 'unknown' }))).toBe(false);
  });
});

describe('isMatchConcluded', () => {
  const KICKOFF = 1_700_000_000;
  const atKickoff = new Date(KICKOFF * 1000);
  const hoursAfterKickoff = (hours: number) => new Date((KICKOFF + hours * 3600) * 1000);

  it('is true once the match can no longer go live', () => {
    expect(isMatchConcluded(makeFixture({ status: 'finished' }), atKickoff)).toBe(true);
    expect(isMatchConcluded(makeFixture({ status: 'postponed' }), atKickoff)).toBe(true);
    expect(isMatchConcluded(makeFixture({ status: 'cancelled' }), atKickoff)).toBe(true);
  });

  it('keeps scheduled and live matches polling', () => {
    expect(isMatchConcluded(makeFixture({ status: 'scheduled' }), atKickoff)).toBe(false);
    expect(isMatchConcluded(makeFixture({ status: 'in_progress' }), atKickoff)).toBe(false);
    expect(isMatchConcluded(makeFixture({ status: 'paused' }), atKickoff)).toBe(false);
    // Hours late is still not concluded while the status says it is on.
    expect(isMatchConcluded(makeFixture({ status: 'in_progress' }), hoursAfterKickoff(9))).toBe(
      false
    );
  });

  it('polls an interrupted match until it can only be over', () => {
    // An interruption does not say whether the match resumes, so keep polling
    // through it…
    const interrupted = makeFixture({ status: 'interrupted' });
    expect(isMatchConcluded(interrupted, hoursAfterKickoff(1))).toBe(false);
    expect(isMatchConcluded(interrupted, hoursAfterKickoff(5))).toBe(false);
    // …and stop once no match could still be running.
    expect(isMatchConcluded(interrupted, hoursAfterKickoff(7))).toBe(true);
    // The legacy provider spellings behind it get the same treatment.
    expect(isMatchConcluded(makeFixture({ status: 'suspended' }), hoursAfterKickoff(7))).toBe(true);
    expect(isMatchConcluded(makeFixture({ status: 'abandoned' }), hoursAfterKickoff(7))).toBe(true);
  });

  it('polls a status it does not recognise on the same timeout', () => {
    const odd = makeFixture({ status: 'weather_delay' });
    expect(isMatchConcluded(odd, hoursAfterKickoff(5))).toBe(false);
    expect(isMatchConcluded(odd, hoursAfterKickoff(7))).toBe(true);
  });

  it('does not conclude a match that has not kicked off yet', () => {
    const tomorrow = makeFixture({ status: 'something new', kickoffTime: KICKOFF + 86_400 });
    expect(isMatchConcluded(tomorrow, atKickoff)).toBe(false);
  });
});

describe('isConcludedStatus', () => {
  it('decides from the status alone, for the scoreline poll', () => {
    expect(isConcludedStatus('finished')).toBe(true);
    expect(isConcludedStatus('cancelled')).toBe(true);
    expect(isConcludedStatus('in_progress')).toBe(false);
    // Without a kickoff time an unresolved status has to keep polling; the
    // caller's own gate applies the timeout.
    expect(isConcludedStatus('interrupted')).toBe(false);
    expect(isConcludedStatus('weather_delay')).toBe(false);
  });
});

describe('buildMatchTabs', () => {
  it('leads with statistics for a started match', () => {
    const tabs = buildMatchTabs(makeFixture({ status: 'in_progress' }));
    expect(tabs.map((t) => t.key)).toEqual(['stats', 'timeline', 'lineups', 'preview']);
  });

  it('leads with the preview before kickoff', () => {
    const tabs = buildMatchTabs(makeFixture({ status: 'scheduled' }));
    expect(tabs.map((t) => t.key)).toEqual(['preview', 'lineups', 'stats', 'timeline']);
  });

  it('leads with the preview for postponed matches (the in-play tabs are empty)', () => {
    const tabs = buildMatchTabs(makeFixture({ status: 'postponed' }));
    expect(tabs.map((t) => t.key)).toEqual(['preview', 'lineups', 'stats', 'timeline']);
  });

  it('always includes the four native tabs', () => {
    const tabs = buildMatchTabs(makeFixture());
    expect([...tabs.map((t) => t.key)].sort()).toEqual([
      'lineups',
      'preview',
      'stats',
      'timeline',
    ]);
  });
});

describe('getFixtureScoreDisplay', () => {
  it('shows the score and LIVE for in-play matches without a captured clock', () => {
    const display = getFixtureScoreDisplay(makeFixture());
    expect(display).toMatchObject({ home: 'ARS', away: 'CHE', score: '2 - 1', status: 'LIVE', isLive: true });
  });

  it('shows the match minute when the fixture carries the clock', () => {
    const display = getFixtureScoreDisplay(
      makeFixture({ periodStart: 1_700_000_000, periodInitialSecs: 2700, periodMaxSecs: 5400 }),
      new Date(1_700_000_600 * 1000)
    );
    expect(display).toMatchObject({ status: "55'", isLive: true });
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

  // The vocabulary now comes from `getFixtureStatus`, so nothing outside
  // in-play/finished falls through to "kickoff time next to a cached scoreline".
  it('shows HT for the halftime statuses', () => {
    expect(getFixtureScoreDisplay(makeFixture({ status: 'paused' }))).toMatchObject({
      status: 'HT',
      score: '2 - 1',
      isLive: true,
    });
  });

  it('shows FT for the legacy full-time spelling', () => {
    expect(getFixtureScoreDisplay(makeFixture({ status: 'FULL_TIME' }))).toMatchObject({
      status: 'FT',
      score: '2 - 1',
      isLive: false,
    });
  });

  it('names a postponed or cancelled match instead of its kickoff time', () => {
    expect(getFixtureScoreDisplay(makeFixture({ status: 'postponed' }))).toMatchObject({
      status: 'PP',
      // A match that never kicked off has no scoreline, whatever the cache holds.
      score: null,
      isLive: false,
    });
    expect(getFixtureScoreDisplay(makeFixture({ status: 'cancelled' }))).toMatchObject({
      status: 'CANC',
      score: null,
    });
  });

  it('names an interruption and keeps the score it stopped at', () => {
    expect(getFixtureScoreDisplay(makeFixture({ status: 'interrupted' }))).toMatchObject({
      status: 'SUSP',
      score: '2 - 1',
      isLive: false,
    });
  });

  it('falls back to kickoff time and the known score for an unrecognised status', () => {
    const display = getFixtureScoreDisplay(makeFixture({ status: 'weather_delay' }));
    expect(display.status).toMatch(/\d/);
    expect(display.score).toBe('2 - 1');
    expect(display.isLive).toBe(false);
  });
});
