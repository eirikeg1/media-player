import type { Fixture } from 'expo-m3u-parser';

import { fixtureStatusKind, getFixtureStatus, isLiveStatusKind } from '../fixture-status';

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
    expect(getFixtureStatus({ ...base, status: 'interrupted' })).toMatchObject({
      kind: 'interrupted',
      label: 'SUSP',
    });
  });

  it('accepts the legacy spellings other providers and old caches use', () => {
    expect(getFixtureStatus({ ...base, status: 'IN_PLAY' }).kind).toBe('live');
    expect(getFixtureStatus({ ...base, status: 'HALFTIME' }).kind).toBe('halftime');
    expect(getFixtureStatus({ ...base, status: 'FULL_TIME' })).toMatchObject({
      kind: 'finished',
      label: 'FT',
    });
    expect(getFixtureStatus({ ...base, status: 'TIMED' }).kind).toBe('scheduled');
    // The provider spellings the backend's own parser folds into `interrupted`.
    expect(getFixtureStatus({ ...base, status: 'suspended' }).kind).toBe('interrupted');
    expect(getFixtureStatus({ ...base, status: 'abandoned' }).kind).toBe('interrupted');
  });

  it('shows the kickoff time for scheduled matches', () => {
    const info = getFixtureStatus(base);
    expect(info.kind).toBe('scheduled');
    expect(info.showScore).toBe(false);
    expect(info.label).toMatch(/\d/);
  });

  it('shows the score an interrupted match stopped at, never a kickoff time', () => {
    // It kicked off and stopped: a kickoff time long past says nothing, and the
    // scoreline is the whole story — including a goalless one.
    expect(getFixtureStatus({ ...base, status: 'interrupted' })).toMatchObject({
      kind: 'interrupted',
      showScore: true,
    });
  });

  it('shows the kickoff time, with whatever score exists, for a status it does not know', () => {
    expect(getFixtureStatus({ ...base, status: 'weather_delay' })).toMatchObject({
      kind: 'unknown',
      showScore: false,
    });
    expect(
      getFixtureStatus({ ...base, status: 'weather_delay', homeScore: 1, awayScore: 0 }).showScore
    ).toBe(true);
  });
});

describe('fixtureStatusKind', () => {
  it('derives the kind without formatting a label', () => {
    // `isMatchLive` runs over every fixture of a busy Saturday, so the cheap
    // half of the vocabulary has to stay separable from the label.
    const spy = jest.spyOn(Date.prototype, 'toLocaleTimeString');
    expect(fixtureStatusKind({ ...base, status: 'in_progress' })).toBe('live');
    expect(fixtureStatusKind(base)).toBe('scheduled');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('isLiveStatusKind', () => {
  it('counts the break as still on the pitch', () => {
    expect(isLiveStatusKind('live')).toBe(true);
    expect(isLiveStatusKind('halftime')).toBe(true);
    expect(isLiveStatusKind('finished')).toBe(false);
    // Play has stopped — the sheet must not render an interruption as the break.
    expect(isLiveStatusKind('interrupted')).toBe(false);
    expect(isLiveStatusKind('unknown')).toBe(false);
  });
});
