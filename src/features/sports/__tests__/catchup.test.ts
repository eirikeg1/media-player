import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';

import {
  CATCHUP_LEAD_SECONDS,
  CATCHUP_WINDOW_MINUTES,
  catchupBroadcasts,
  catchupWindow,
  isCatchupAvailable,
  parseCatchupParams,
  sameCatchupWindow,
  shouldHandOverToLive,
} from '../catchup';

const KICKOFF = 1_781_357_400; // 2026-06-13T15:30:00Z

const fixture: Fixture = {
  providerId: 1,
  provider: 'sofascore',
  competitionName: 'PL',
  homeTeam: 'A',
  awayTeam: 'B',
  kickoffTime: KICKOFF,
  status: 'finished',
};

function makeBroadcast(overrides: Partial<RankedBroadcast> = {}): RankedBroadcast {
  return {
    channelId: 'ch-1',
    title: 'Sports 1',
    url: 'http://panel.example.com:8080/user/pass/4242',
    group: 'Sports',
    confidence: 0.9,
    source: 'sofascore+epg',
    catchupDays: 7,
    ...overrides,
  };
}

describe('catchupWindow', () => {
  it('starts before kickoff and runs long enough for a full match', () => {
    expect(catchupWindow(fixture)).toEqual({
      start: KICKOFF - CATCHUP_LEAD_SECONDS,
      durationMinutes: CATCHUP_WINDOW_MINUTES,
    });
  });
});

describe('isCatchupAvailable', () => {
  const now = KICKOFF + 3600; // an hour into the match

  it('accepts a channel with archive on a kicked-off match', () => {
    expect(isCatchupAvailable(makeBroadcast(), fixture, now)).toBe(true);
  });

  it('rejects a channel the panel keeps no archive of', () => {
    expect(isCatchupAvailable(makeBroadcast({ catchupDays: undefined }), fixture, now)).toBe(false);
  });

  it('rejects a match that has not kicked off yet', () => {
    expect(isCatchupAvailable(makeBroadcast(), fixture, KICKOFF - 1)).toBe(false);
  });

  it('accepts the match exactly at kickoff', () => {
    expect(isCatchupAvailable(makeBroadcast(), fixture, KICKOFF)).toBe(true);
  });

  it('holds at the exact retention boundary and fails one second past it', () => {
    const start = KICKOFF - CATCHUP_LEAD_SECONDS;
    const retention = 2 * 86_400;
    const broadcast = makeBroadcast({ catchupDays: 2 });

    expect(isCatchupAvailable(broadcast, fixture, start + retention)).toBe(true);
    expect(isCatchupAvailable(broadcast, fixture, start + retention + 1)).toBe(false);
  });
});

describe('catchupBroadcasts', () => {
  it('keeps only qualifying channels, in the given ranking order', () => {
    const broadcasts = [
      makeBroadcast({ channelId: 'no-archive', catchupDays: undefined }),
      makeBroadcast({ channelId: 'best' }),
      makeBroadcast({ channelId: 'expired', catchupDays: 1 }),
      makeBroadcast({ channelId: 'second', catchupDays: 30 }),
    ];
    const now = KICKOFF + 5 * 86_400;

    expect(catchupBroadcasts(broadcasts, fixture, now).map((b) => b.channelId)).toEqual([
      'best',
      'second',
    ]);
  });

  it('is empty before kickoff regardless of retention', () => {
    expect(catchupBroadcasts([makeBroadcast()], fixture, KICKOFF - 60)).toEqual([]);
  });
});

describe('shouldHandOverToLive', () => {
  const window = catchupWindow(fixture);

  it('hands over while the match is still in play', () => {
    expect(shouldHandOverToLive(window, { ...fixture, status: 'in_progress' })).toBe(true);
    expect(shouldHandOverToLive(window, { ...fixture, status: 'paused' })).toBe(true);
  });

  it('hands over on any status the match can still go live from', () => {
    expect(shouldHandOverToLive(window, { ...fixture, status: 'scheduled' })).toBe(true);
    // An interruption does not say whether the match resumes, so it counts as
    // live until long after kickoff: a match interrupted minutes ago still has
    // a live stream to hand over to.
    const justInterrupted = {
      ...fixture,
      status: 'interrupted',
      kickoffTime: Math.floor(Date.now() / 1000) - 600,
    };
    expect(shouldHandOverToLive(window, justInterrupted)).toBe(true);
  });

  it('never hands over for a concluded match', () => {
    expect(shouldHandOverToLive(window, { ...fixture, status: 'finished' })).toBe(false);
    expect(shouldHandOverToLive(window, { ...fixture, status: 'postponed' })).toBe(false);
    // Kickoff was months ago: whatever "interrupted" meant, it is over.
    expect(shouldHandOverToLive(window, { ...fixture, status: 'interrupted' })).toBe(false);
  });

  it('never hands over without a window or a fixture', () => {
    expect(shouldHandOverToLive(null, { ...fixture, status: 'in_progress' })).toBe(false);
    expect(shouldHandOverToLive(window, null)).toBe(false);
    expect(shouldHandOverToLive(null, null)).toBe(false);
  });
});

describe('sameCatchupWindow', () => {
  const window = { start: KICKOFF, durationMinutes: 150 };

  it('treats two absent windows as the same (both live)', () => {
    expect(sameCatchupWindow(null, null)).toBe(true);
  });

  it('never matches a window against live', () => {
    expect(sameCatchupWindow(window, null)).toBe(false);
    expect(sameCatchupWindow(null, window)).toBe(false);
  });

  it('compares both start and duration', () => {
    expect(sameCatchupWindow(window, { ...window })).toBe(true);
    expect(sameCatchupWindow(window, { ...window, start: KICKOFF + 1 })).toBe(false);
    expect(sameCatchupWindow(window, { ...window, durationMinutes: 90 })).toBe(false);
  });
});

describe('parseCatchupParams', () => {
  it('round-trips a window through its route params', () => {
    const window = catchupWindow(fixture);
    expect(parseCatchupParams(String(window.start), String(window.durationMinutes))).toEqual(window);
  });

  it('is null without both params', () => {
    expect(parseCatchupParams(undefined, undefined)).toBeNull();
    expect(parseCatchupParams('1781357400', undefined)).toBeNull();
    expect(parseCatchupParams(undefined, '150')).toBeNull();
  });

  it('is null for garbage, empty and non-positive values', () => {
    expect(parseCatchupParams('not-a-number', '150')).toBeNull();
    expect(parseCatchupParams('1781357400', 'soon')).toBeNull();
    expect(parseCatchupParams('', '150')).toBeNull();
    expect(parseCatchupParams('0', '150')).toBeNull();
    expect(parseCatchupParams('1781357400', '0')).toBeNull();
    expect(parseCatchupParams('-1781357400', '150')).toBeNull();
    expect(parseCatchupParams('Infinity', '150')).toBeNull();
  });
});
