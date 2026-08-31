import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
} from '@/types/user.types';

import {
  NIGHT_WINDOW,
  describePreference,
  schedulerIntervalMinutes,
  shouldRunNow,
} from '../background/refresh-policy';

/**
 * Every moment is built with the local-time `Date` constructor, so the
 * expectations hold in any timezone and across a DST shift.
 */
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function pref(overrides: Partial<SportsBackgroundRefresh> = {}): SportsBackgroundRefresh {
  return { ...DEFAULT_SPORTS_BACKGROUND_REFRESH, ...overrides };
}

const HOUR_MS = 3_600_000;

describe('shouldRunNow — off', () => {
  it('never runs, however long ago the last run was', () => {
    const now = local(2026, 6, 12, 12);
    expect(shouldRunNow(pref({ mode: 'off' }), null, now)).toBe(false);
    expect(shouldRunNow(pref({ mode: 'off' }), now.getTime() - 30 * HOUR_MS, now)).toBe(false);
  });
});

describe('shouldRunNow — interval', () => {
  const now = local(2026, 6, 12, 12);
  const interval = pref({ mode: 'interval', intervalHours: 4 });

  it('runs when it has never run', () => {
    expect(shouldRunNow(interval, null, now)).toBe(true);
  });

  it('runs exactly at the interval boundary but not a millisecond before', () => {
    expect(shouldRunNow(interval, now.getTime() - 4 * HOUR_MS, now)).toBe(true);
    expect(shouldRunNow(interval, now.getTime() - 4 * HOUR_MS + 1, now)).toBe(false);
  });

  it('does not run within the interval', () => {
    expect(shouldRunNow(interval, now.getTime() - HOUR_MS, now)).toBe(false);
  });

  it('clamps an interval below one hour up to one hour', () => {
    const tiny = pref({ mode: 'interval', intervalHours: 0 });
    expect(shouldRunNow(tiny, now.getTime() - 59 * 60_000, now)).toBe(false);
    expect(shouldRunNow(tiny, now.getTime() - HOUR_MS, now)).toBe(true);
  });

  it('runs a weekly interval after seven days and not after six', () => {
    const weekly = pref({ mode: 'interval', intervalHours: 168 });
    expect(shouldRunNow(weekly, now.getTime() - 6 * 24 * HOUR_MS, now)).toBe(false);
    expect(shouldRunNow(weekly, now.getTime() - 7 * 24 * HOUR_MS, now)).toBe(true);
  });

  it('clamps an interval above two weeks down to two weeks', () => {
    const huge = pref({ mode: 'interval', intervalHours: 999 });
    expect(shouldRunNow(huge, now.getTime() - 335 * HOUR_MS, now)).toBe(false);
    expect(shouldRunNow(huge, now.getTime() - 336 * HOUR_MS, now)).toBe(true);
  });

  it('accepts the longest offered interval unclamped', () => {
    const fortnightly = pref({ mode: 'interval', intervalHours: 336 });
    expect(shouldRunNow(fortnightly, now.getTime() - 335 * HOUR_MS, now)).toBe(false);
    expect(shouldRunNow(fortnightly, now.getTime() - 336 * HOUR_MS, now)).toBe(true);
  });

  it('falls back to the default interval when the value is not a number', () => {
    const broken = pref({ mode: 'interval', intervalHours: Number.NaN });
    expect(shouldRunNow(broken, now.getTime() - 3 * HOUR_MS, now)).toBe(false);
    expect(shouldRunNow(broken, now.getTime() - 4 * HOUR_MS, now)).toBe(true);
  });
});

describe('shouldRunNow — daily', () => {
  const daily = pref({ mode: 'daily', dailyTime: '07:00' });

  it('does not run before the daily time', () => {
    expect(shouldRunNow(daily, null, local(2026, 6, 12, 6, 59))).toBe(false);
  });

  it('runs exactly at the daily time', () => {
    expect(shouldRunNow(daily, null, local(2026, 6, 12, 7, 0))).toBe(true);
  });

  it('runs once the time has passed when the last run was on a previous day', () => {
    const lastRun = local(2026, 6, 11, 7, 30).getTime();
    expect(shouldRunNow(daily, lastRun, local(2026, 6, 12, 9))).toBe(true);
  });

  it('does not run twice on the same day', () => {
    const lastRun = local(2026, 6, 12, 7, 5).getTime();
    expect(shouldRunNow(daily, lastRun, local(2026, 6, 12, 23))).toBe(false);
  });

  it('runs when the last run was earlier the same day but before the slot', () => {
    const lastRun = local(2026, 6, 12, 3).getTime();
    expect(shouldRunNow(daily, lastRun, local(2026, 6, 12, 7, 1))).toBe(true);
  });

  it('honours a non-default daily time', () => {
    const evening = pref({ mode: 'daily', dailyTime: '21:45' });
    expect(shouldRunNow(evening, null, local(2026, 6, 12, 21, 44))).toBe(false);
    expect(shouldRunNow(evening, null, local(2026, 6, 12, 21, 45))).toBe(true);
  });

  it.each(['', 'nonsense', '7', '25:00', '07:60', '07:0'])(
    'falls back to the default time for %p',
    (dailyTime) => {
      const broken = pref({ mode: 'daily', dailyTime });
      expect(shouldRunNow(broken, null, local(2026, 6, 12, 6, 59))).toBe(false);
      expect(shouldRunNow(broken, null, local(2026, 6, 12, 7, 0))).toBe(true);
    }
  );
});

describe('shouldRunNow — night', () => {
  const night = pref({ mode: 'night' });
  const windowStart = (day: number) => local(2026, 6, day, NIGHT_WINDOW.startHour).getTime();

  it('runs inside the window when it has never run', () => {
    expect(shouldRunNow(night, null, local(2026, 6, 12, 3))).toBe(true);
  });

  it('runs from the first hour of the window and not the hour before', () => {
    expect(shouldRunNow(night, null, local(2026, 6, 12, NIGHT_WINDOW.startHour - 1, 59))).toBe(
      false
    );
    expect(shouldRunNow(night, null, local(2026, 6, 12, NIGHT_WINDOW.startHour, 0))).toBe(true);
  });

  it('treats the end hour as exclusive', () => {
    expect(shouldRunNow(night, null, local(2026, 6, 12, NIGHT_WINDOW.endHour - 1, 59))).toBe(true);
    expect(shouldRunNow(night, null, local(2026, 6, 12, NIGHT_WINDOW.endHour, 0))).toBe(false);
  });

  it('runs at most once per night', () => {
    const ranTonight = local(2026, 6, 12, 2, 30).getTime();
    expect(shouldRunNow(night, ranTonight, local(2026, 6, 12, 5))).toBe(false);
  });

  it('runs again the next night', () => {
    expect(shouldRunNow(night, windowStart(11) + 30 * 60_000, local(2026, 6, 12, 2, 5))).toBe(true);
  });

  it('does not run during the day even when the last run is old', () => {
    expect(shouldRunNow(night, windowStart(1), local(2026, 6, 12, 14))).toBe(false);
  });
});

describe('schedulerIntervalMinutes', () => {
  it('unregisters when refreshing is off', () => {
    expect(schedulerIntervalMinutes(pref({ mode: 'off' }))).toBe(0);
  });

  it('wakes at half the interval', () => {
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 4 }))).toBe(120);
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 24 }))).toBe(720);
  });

  it('caps the wake cadence at 12 hours for multi-day intervals', () => {
    // The policy gate still holds the run to the chosen interval; the extra
    // wakes only cost a no-op check, and never miss a multi-day window.
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 48 }))).toBe(720);
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 168 }))).toBe(720);
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 336 }))).toBe(720);
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 999 }))).toBe(720);
  });

  it('never goes below the 15-minute OS floor', () => {
    // A one-hour interval would want 30 min; anything shorter is clamped first.
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 1 }))).toBe(30);
    expect(schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 0 }))).toBe(30);
    expect(
      schedulerIntervalMinutes(pref({ mode: 'interval', intervalHours: 0.1 }))
    ).toBeGreaterThanOrEqual(15);
  });

  it('wakes every half hour for the time-of-day modes', () => {
    expect(schedulerIntervalMinutes(pref({ mode: 'daily' }))).toBe(30);
    expect(schedulerIntervalMinutes(pref({ mode: 'night' }))).toBe(30);
  });
});

describe('describePreference', () => {
  it('summarises each mode', () => {
    expect(describePreference(pref({ mode: 'off' }))).toBe('Off');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 4 }))).toBe('Every 4 hours');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 1 }))).toBe('Every hour');
    expect(describePreference(pref({ mode: 'daily', dailyTime: '07:00' }))).toBe('Daily at 07:00');
    expect(describePreference(pref({ mode: 'night' }))).toBe('At night (02–06)');
  });

  it('names the day-scale intervals', () => {
    expect(describePreference(pref({ mode: 'interval', intervalHours: 12 }))).toBe(
      'Every 12 hours'
    );
    expect(describePreference(pref({ mode: 'interval', intervalHours: 24 }))).toBe('Daily');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 48 }))).toBe('Every 2 days');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 312 }))).toBe(
      'Every 13 days'
    );
    expect(describePreference(pref({ mode: 'interval', intervalHours: 168 }))).toBe('Weekly');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 336 }))).toBe('Every 2 weeks');
  });

  it('rounds an interval that is not a whole number of days', () => {
    expect(describePreference(pref({ mode: 'interval', intervalHours: 30 }))).toBe('Daily');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 170 }))).toBe('Weekly');
    expect(describePreference(pref({ mode: 'interval', intervalHours: 60 }))).toBe('Every 3 days');
  });

  it('describes the clamped interval, not the stored one', () => {
    expect(describePreference(pref({ mode: 'interval', intervalHours: 999 }))).toBe(
      'Every 2 weeks'
    );
  });

  it('describes the default time when the stored one is malformed', () => {
    expect(describePreference(pref({ mode: 'daily', dailyTime: 'nope' }))).toBe('Daily at 07:00');
    expect(describePreference(pref({ mode: 'daily', dailyTime: '7:05' }))).toBe('Daily at 07:05');
  });
});
