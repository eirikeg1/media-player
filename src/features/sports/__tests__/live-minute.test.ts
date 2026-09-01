import type { Fixture } from 'expo-m3u-parser';

import { liveMinuteLabel } from '../live-minute';

const KICKOFF = 1_788_301_800;

const base: Fixture = {
  providerId: 1,
  provider: 'sofascore',
  competitionName: 'PL',
  homeTeam: 'A',
  awayTeam: 'B',
  kickoffTime: KICKOFF,
  status: 'in_progress',
};

/** A fixture whose current period started `secondsAgo` before `now`. */
function inPlay(initial: number, max: number, secondsAgo: number): Fixture {
  return {
    ...base,
    periodStart: KICKOFF - secondsAgo,
    periodInitialSecs: initial,
    periodMaxSecs: max,
  };
}

const now = new Date(KICKOFF * 1000);

describe('liveMinuteLabel', () => {
  const cases: [name: string, fixture: Fixture, expected: string | null][] = [
    // First half: initial 0, normal time ends at 45'.
    ['counts the first minute as 1', inPlay(0, 2700, 0), "1'"],
    ['rounds part-minutes up', inPlay(0, 2700, 30), "1'"],
    ['mid first half', inPlay(0, 2700, 1200), "20'"],
    ['end of first half', inPlay(0, 2700, 2700), "45'"],
    ['first-half stoppage time', inPlay(0, 2700, 2820), "45+'"],
    // Second half: the clock resumes at 45:00.
    ['second half starts at 46', inPlay(2700, 5400, 10), "46'"],
    ['mid second half', inPlay(2700, 5400, 1200), "65'"],
    ['second-half stoppage time', inPlay(2700, 5400, 2760), "90+'"],
    // Extra time.
    ['first half of extra time', inPlay(5400, 6300, 10), "91'"],
    ['extra-time stoppage', inPlay(5400, 6300, 960), "105+'"],
    ['second half of extra time', inPlay(6300, 6900, 10), "106'"],
    ['extra-time second-half stoppage', inPlay(6300, 6900, 660), "115+'"],
    // A device clock behind the period start must not show 0' or a negative.
    ['clamps a device clock running behind', inPlay(0, 2700, -120), "1'"],
    // Halftime carries no running clock at all.
    ['shows HT while paused', { ...base, status: 'paused' }, 'HT'],
    ['shows HT for the legacy halftime status', { ...base, status: 'halftime' }, 'HT'],
    // Rows cached before the clock was persisted, and anything not in play.
    ['returns null when the clock is missing', base, null],
    [
      'returns null when the clock is only partly present',
      { ...base, periodStart: KICKOFF, periodInitialSecs: 0 },
      null,
    ],
    ['returns null for a finished match', { ...inPlay(2700, 5400, 3000), status: 'finished' }, null],
    ['returns null for a scheduled match', { ...base, status: 'scheduled' }, null],
    ['returns null for a postponed match', { ...base, status: 'postponed' }, null],
  ];

  it.each(cases)('%s', (_name, fixture, expected) => {
    expect(liveMinuteLabel(fixture, now)).toBe(expected);
  });

  it('accepts the defensive live status aliases', () => {
    for (const status of ['live', 'in_play', 'IN_PROGRESS']) {
      expect(liveMinuteLabel({ ...inPlay(0, 2700, 600), status }, now)).toBe("10'");
    }
  });
});
