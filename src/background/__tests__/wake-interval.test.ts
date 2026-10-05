import { schedulerIntervalMinutes } from '@/features/sports/background/refresh-policy';
import { makePlaylist } from '@/test/factories';
import { DEFAULT_SPORTS_BACKGROUND_REFRESH } from '@/types/user.types';

import { backgroundWakeMinutes, wakeMinutesForPeriod } from '../wake-interval';

describe('wakeMinutesForPeriod', () => {
  it('wakes at half the period, within what WorkManager accepts', () => {
    expect(wakeMinutesForPeriod(360)).toBe(180);
    expect(wakeMinutesForPeriod(60)).toBe(30);
    expect(wakeMinutesForPeriod(20)).toBe(15);
    expect(wakeMinutesForPeriod(10080)).toBe(720);
  });
});

describe('backgroundWakeMinutes', () => {
  const sportsOff = 0;

  it('unregisters when nothing could ever be due', () => {
    expect(backgroundWakeMinutes([], sportsOff)).toBe(0);
    expect(
      backgroundWakeMinutes([makePlaylist({ syncInterval: 0, epgSyncInterval: 0 })], sportsOff),
    ).toBe(0);
    // Unset is treated as off, as the schedulers do.
    expect(backgroundWakeMinutes([makePlaylist()], sportsOff)).toBe(0);
  });

  it('serves the shortest interval of any playlist, channels or guide', () => {
    const playlists = [
      makePlaylist({ syncInterval: 1440, epgSyncInterval: 1440 }),
      makePlaylist({ syncInterval: 0, epgSyncInterval: 240 }),
    ];
    expect(backgroundWakeMinutes(playlists, sportsOff)).toBe(120);
  });

  it('keeps the task registered for a playlist when the sports refresh is off', () => {
    // A hidden sports tab mirrors as `off`, which used to unregister the task.
    const sports = schedulerIntervalMinutes({ ...DEFAULT_SPORTS_BACKGROUND_REFRESH, mode: 'off' });
    expect(backgroundWakeMinutes([makePlaylist({ syncInterval: 360 })], sports)).toBe(180);
  });

  it('wakes as often as the more frequent of the two needs', () => {
    const night = schedulerIntervalMinutes(DEFAULT_SPORTS_BACKGROUND_REFRESH);
    expect(night).toBe(30);
    expect(backgroundWakeMinutes([makePlaylist({ syncInterval: 360 })], night)).toBe(30);
    expect(backgroundWakeMinutes([makePlaylist({ syncInterval: 60 })], 120)).toBe(30);
    expect(backgroundWakeMinutes([], night)).toBe(30);
  });
});
