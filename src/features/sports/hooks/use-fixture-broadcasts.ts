import { getEffectiveSportsCountry } from '@/lib/country-utils';
import { getRustDatabase } from '@/services/rust-channel-service';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { Fixture, RankedBroadcast } from 'expo-m3u-parser';
import { useCallback } from 'react';

import { broadcastCacheKey, readBroadcastCache, writeBroadcastCache } from '../broadcast-cache';
import { useSportsQuery } from './use-sports-query';

export interface FixtureBroadcasts {
  broadcasts: RankedBroadcast[];
  isLoading: boolean;
  /**
   * Why the match failed, or null. Distinct from an empty `broadcasts`: "your
   * playlist doesn't carry this match" and "the matcher crashed" are different
   * answers, and only one of them is worth retrying.
   */
  error: string | null;
  /** Run the matcher again — a failed run caches nothing, so this refetches. */
  retry: () => void;
}

/** Shared identity for "no channels", so a surface without any never re-renders. */
const NO_BROADCASTS: RankedBroadcast[] = [];

/**
 * The playable channels for a fixture, matched by the native engine and cached
 * per playlist/fixture/country so reopening the same match is instant —
 * the matcher is heavy and holds the channel database lock while it runs.
 */
export function useFixtureBroadcasts(fixture: Fixture | null): FixtureBroadcasts {
  const sportsCountry = useUserStore((s) => s.currentUser?.settings?.sportsCountry);
  const country = getEffectiveSportsCountry(sportsCountry);
  const playlistId = usePlaylistStore((s) => s.activePlaylistId);

  // The cache key *is* the query key: everything the matcher's answer depends
  // on is in it, so a change to any of them is a different question.
  const key =
    fixture && playlistId
      ? broadcastCacheKey(playlistId, fixture.providerId, country)
      : null;

  const { data, isLoading, error, refresh } = useSportsQuery<string, RankedBroadcast[]>({
    key,
    // A reopened surface shows its channels rather than a spinner, and the
    // matcher — which holds the channel database lock — is never run twice for
    // the same question.
    initialData: (cacheKey) => readBroadcastCache(cacheKey) ?? undefined,
    fetcher: async (sportsDb, cacheKey) => {
      // Both are what the key is built from, so the query cannot run without
      // them; this is the narrowing, not a fallback.
      if (!fixture || !playlistId) return NO_BROADCASTS;

      const m3uDb = await getRustDatabase();
      // The Rust matching engine internally ensures SofaScore broadcast and
      // country-channel data is cached before matching.
      const results = await sportsDb.findPlayableChannelsForFixture(
        fixture,
        playlistId,
        country,
        m3uDb
      );
      // Cached even if this run has been superseded: the work is done, and the
      // result is keyed by the question it answers.
      writeBroadcastCache(cacheKey, results);
      return results.length > 0 ? results : NO_BROADCASTS;
    },
    fallback: "Couldn't find channels for this match.",
  });

  return {
    broadcasts: data ?? NO_BROADCASTS,
    isLoading,
    error,
    retry: useCallback(() => void refresh({ force: true }), [refresh]),
  };
}
