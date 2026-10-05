import { getSportsDatabase } from '@/services/sports-service';
import { resetSportsCacheEpoch } from '@/test/helpers';
import type { SportsDatabase } from 'expo-m3u-parser';

import { broadcastCacheKey, readBroadcastCache, writeBroadcastCache } from '../broadcast-cache';
import { invalidateSportsCaches } from '../cache-invalidation';
import { getSportsCacheEpoch } from '../sports-cache-epoch';

let db: SportsDatabase;

beforeEach(async () => {
  resetSportsCacheEpoch();
  db = await getSportsDatabase();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('invalidateSportsCaches', () => {
  it('bumps the epoch before the native call is awaited', async () => {
    const before = getSportsCacheEpoch();
    let epochDuringCall = before;
    jest.spyOn(db, 'invalidateSportsCaches').mockImplementation(async () => {
      epochDuringCall = getSportsCacheEpoch();
    });

    await invalidateSportsCaches(db);

    // A read that starts while the native call is in flight has to land on the
    // new epoch, or it is cached as if it predated nothing.
    expect(epochDuringCall).toBe(before + 1);
    expect(getSportsCacheEpoch()).toBe(before + 1);
  });

  it('bumps the epoch even when the native call fails', async () => {
    const before = getSportsCacheEpoch();
    jest.spyOn(db, 'invalidateSportsCaches').mockRejectedValue(new Error('sports db locked'));

    await expect(invalidateSportsCaches(db)).resolves.toBeUndefined();

    // The app's own copies are dropped regardless of what the backend managed.
    expect(getSportsCacheEpoch()).toBe(before + 1);
  });

  it('drops the matched broadcast lists', async () => {
    const key = broadcastCacheKey('playlist-1', 42, 'NO');
    writeBroadcastCache(key, []);
    expect(readBroadcastCache(key)).not.toBeNull();

    await invalidateSportsCaches(db);

    expect(readBroadcastCache(key)).toBeNull();
  });
});
