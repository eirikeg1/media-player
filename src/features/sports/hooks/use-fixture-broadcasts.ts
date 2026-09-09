import { getEffectiveSportsCountry } from '@/lib/country-utils';
import { getRustDatabase } from '@/services/rust-channel-service';
import { getSportsDatabase } from '@/services/sports-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';
import { useEffect, useRef, useState } from 'react';

import { broadcastCacheKey, readBroadcastCache, writeBroadcastCache } from '../broadcast-cache';

interface FixtureBroadcasts {
  broadcasts: RankedBroadcast[];
  isLoading: boolean;
}

/** Shared identity for "no channels", so a sheet without any never re-renders. */
const NO_BROADCASTS: RankedBroadcast[] = [];

/**
 * The playable channels for a fixture, matched by the native engine and cached
 * per playlist/fixture/country so reopening the same match sheet is instant —
 * the matcher is heavy and holds the channel database lock while it runs.
 */
export function useFixtureBroadcasts(fixture: Fixture | null): FixtureBroadcasts {
  const [broadcasts, setBroadcasts] = useState<RankedBroadcast[]>(NO_BROADCASTS);
  const [isLoading, setIsLoading] = useState(false);
  const fetchRef = useRef(0);
  const fixtureRef = useRef(fixture);
  fixtureRef.current = fixture;

  const sportsCountry = useUserStore((s) => s.currentUser?.settings?.sportsCountry);
  const country = getEffectiveSportsCountry(sportsCountry);
  const playlistId = usePlaylistStore((s) => s.activePlaylistId);

  const providerId = fixture?.providerId;

  useEffect(() => {
    const currentFixture = fixtureRef.current;
    if (!currentFixture || !playlistId) {
      setBroadcasts(NO_BROADCASTS);
      setIsLoading(false);
      return;
    }

    const key = broadcastCacheKey(playlistId, currentFixture.providerId, country);
    const cached = readBroadcastCache(key);
    if (cached) {
      // Straight from the cache, before paint and without a loading state: a
      // reopened sheet shows its channels rather than a spinner.
      ++fetchRef.current;
      setBroadcasts(cached);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchRef.current;
    setIsLoading(true);

    (async () => {
      try {
        const [sportsDb, m3uDb] = await Promise.all([
          getSportsDatabase(),
          getRustDatabase(),
        ]);

        // The Rust matching engine internally ensures SofaScore broadcast and
        // country-channel data is cached before matching.
        const results = await sportsDb.findPlayableChannelsForFixture(
          currentFixture,
          playlistId,
          country,
          m3uDb,
        );

        // Cached even when this run has been superseded: the work is done, and
        // the result is keyed by the fixture it was matched for.
        writeBroadcastCache(key, results);
        if (fetchId !== fetchRef.current) return;
        setBroadcasts(results);
      } catch (err) {
        console.error('[useFixtureBroadcasts] Error:', err);
      } finally {
        if (fetchId === fetchRef.current) {
          setIsLoading(false);
        }
      }
    })();
  }, [providerId, country, playlistId]);

  return { broadcasts, isLoading };
}
