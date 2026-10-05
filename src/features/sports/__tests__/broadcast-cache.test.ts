import { publishCatalogueRefresh } from '@/stores/playlist/catalogue-events';
import { makePlaylist } from '@/test/factories';
import { resetSportsCacheEpoch } from '@/test/helpers';
import type { RankedBroadcast } from 'expo-m3u-parser';

import { broadcastCacheKey, readBroadcastCache, writeBroadcastCache } from '../broadcast-cache';
import { getSportsCacheEpoch } from '../sports-cache-epoch';

const KEY = broadcastCacheKey('playlist-1', 42, 'NO');
const MATCHES = [{ channelId: 'live:1' }] as unknown as RankedBroadcast[];

beforeEach(() => {
  resetSportsCacheEpoch();
});

it.each(['channels', 'guide'] as const)(
  'drops the matches and moves open surfaces to re-match after a %s refresh',
  (part) => {
    writeBroadcastCache(KEY, MATCHES);
    expect(readBroadcastCache(KEY)).toBe(MATCHES);

    publishCatalogueRefresh({ part, playlist: makePlaylist({ id: 'playlist-1' }) });

    expect(readBroadcastCache(KEY)).toBeNull();
    expect(getSportsCacheEpoch()).toBe(1);
  },
);
