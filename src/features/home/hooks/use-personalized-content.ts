import type { RecommendationMode } from '@/features/home/recommendation-signals';
import {
  HOME_CACHE_SLOT,
  useFirstPageCacheStore,
  type HomeSliceKey,
} from '@/stores/cache';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import type { Channel } from '@/types/playlist.types';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useCallback, useRef, useState } from 'react';

import { loadPersonalizedContent } from './load-personalized-content';
import { useSeededLoad } from './use-seeded-load';

/**
 * The home page's discover rows (see {@link loadPersonalizedContent} for what
 * goes into them).
 *
 * Renders from the launch pre-fetch's slice on the first frame (see
 * `first-page-cache-store`) and revalidates behind it, so arriving on the home
 * page never costs a skeleton for a batch that is already in hand.
 *
 * Taste signals are read imperatively rather than subscribed to on purpose: a
 * like landing while the home page is mounted must not swap the rows out from
 * under the user. The new signal is picked up by the next generation, i.e. on
 * pull-to-refresh or the next launch.
 */
export function usePersonalizedContent(limit: number = HOME_CACHE_SLOT.contentLimit) {
  const userId = useUserStore((s) => s.currentUser?.id);
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const excludeAdult = useUserStore((s) => selectExcludeAdult(s.currentUser));

  const cacheKey: HomeSliceKey | null =
    userId && activePlaylistId
      ? { playlistId: activePlaylistId, userId, excludeAdult, limit }
      : null;

  // Read once, during the very first render: what the cache holds later is this
  // hook's own writing, and re-seeding from it would fight the state below.
  const [seed] = useState(() =>
    cacheKey ? useFirstPageCacheStore.getState().getCachedHomeContent(cacheKey) : null
  );

  const [movies, setMovies] = useState<Channel[]>(seed?.value.movies ?? []);
  const [series, setSeries] = useState<SeriesInfo[]>(seed?.value.series ?? []);
  const [mode, setMode] = useState<RecommendationMode>(seed?.value.mode ?? 'random');
  const [isLoading, setIsLoading] = useState(seed === null);

  // Every fetch takes the next generation; only the newest one may write state,
  // so an unmount or a superseding refresh discards the in-flight run's result.
  const generationRef = useRef(0);

  /** Supersede whatever run is in flight, so its result is discarded. */
  const cancelInFlightFetch = useCallback(() => {
    generationRef.current += 1;
  }, []);

  const fetch = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const generation = ++generationRef.current;
      const isCurrent = () => generationRef.current === generation;

      if (!userId || !activePlaylistId) {
        setMovies([]);
        setSeries([]);
        setMode('random');
        setIsLoading(false);
        return;
      }

      const key: HomeSliceKey = { playlistId: activePlaylistId, userId, excludeAdult, limit };

      try {
        // A revalidation runs behind rows that are already on screen: raising
        // the flag would put the page back into its skeleton for real data.
        if (!silent) setIsLoading(true);

        const { contentReactions, favoriteChannels } = useUserStore.getState();
        const content = await loadPersonalizedContent({
          ...key,
          reactions: contentReactions,
          favoriteIds: favoriteChannels,
        });

        if (!isCurrent()) return;
        // Below the guard: a superseded run must not overwrite the slice the
        // run that superseded it has already written.
        useFirstPageCacheStore.getState().setCachedHomeContent(key, content);
        setMovies(content.movies);
        setSeries(content.series);
        setMode(content.mode);
      } catch (error) {
        if (!isCurrent()) return;
        console.error('[usePersonalizedContent] Error:', error);
        setMovies([]);
        setSeries([]);
        setMode('random');
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    },
    [userId, activePlaylistId, limit, excludeAdult]
  );

  useSeededLoad(seed, fetch, cancelInFlightFetch);

  // Pull-to-refresh: the user has asked for a new batch, so the one behind the
  // rows is dropped before the load that replaces it — see
  // `invalidateHomeSlice`. The load itself always runs; only the *mount* is
  // allowed to stand on a fresh slice.
  const refresh = useCallback(() => {
    if (activePlaylistId) {
      useFirstPageCacheStore.getState().invalidateHomeSlice(activePlaylistId, 'content');
    }
    return fetch();
  }, [activePlaylistId, fetch]);

  return { movies, series, mode, isLoading, refresh };
}
