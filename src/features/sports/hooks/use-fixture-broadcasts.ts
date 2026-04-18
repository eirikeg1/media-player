import { getEffectiveSportsCountry } from '@/lib/country-utils';
import { getRustDatabase } from '@/services/rust-channel-service';
import { getSportsDatabase } from '@/services/sports-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';
import { useEffect, useRef, useState } from 'react';

interface FixtureBroadcasts {
  broadcasts: RankedBroadcast[];
  isLoading: boolean;
}

export function useFixtureBroadcasts(fixture: Fixture | null): FixtureBroadcasts {
  const [broadcasts, setBroadcasts] = useState<RankedBroadcast[]>([]);
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
      setBroadcasts([]);
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

        // Fallback: ensure SofaScore data is cached for this fixture
        await Promise.all([
          sportsDb.fetchAndStoreTvChannels(country).catch((err) => {
            console.warn('[useFixtureBroadcasts] Failed to fetch country channels:', err);
          }),
          sportsDb.fetchAndStoreFixtureBroadcasts(currentFixture.providerId).catch((err) => {
            console.warn('[useFixtureBroadcasts] Failed to fetch fixture broadcasts:', err);
          }),
        ]);

        if (fetchId !== fetchRef.current) return;

        // Call the Rust matching engine
        const results = await sportsDb.findPlayableChannelsForFixture(
          currentFixture,
          playlistId,
          country,
          m3uDb,
        );

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
