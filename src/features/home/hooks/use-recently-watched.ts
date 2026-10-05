import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import {
  HOME_CACHE_SLOT,
  useFirstPageCacheStore,
  type RecentlyWatchedKey,
} from '@/stores/cache';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearPosterCache, loadRecentlyWatched } from './load-recently-watched';
import { useSeededLoad } from './use-seeded-load';

/**
 * The home page's "Continue Watching" carousel.
 *
 * Renders from the launch pre-fetch's slice on the first frame (see
 * `first-page-cache-store`) and revalidates behind it, so arriving on the home
 * page never costs a skeleton for data that is already in hand. Both sides run
 * the same {@link loadRecentlyWatched}, and every successful load writes the
 * slice back for the next mount.
 */
export function useRecentlyWatched(limit: number = HOME_CACHE_SLOT.recentlyWatchedLimit) {
  const userId = useUserStore((s) => s.currentUser?.id);
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const excludeAdult = useUserStore((s) => selectExcludeAdult(s.currentUser));
  const recentlyWatchedVersion = useUserStore((s) => s.recentlyWatchedVersion);

  const cacheKey: RecentlyWatchedKey | null =
    userId && activePlaylistId
      ? {
          playlistId: activePlaylistId,
          userId,
          excludeAdult,
          limit,
          version: recentlyWatchedVersion,
        }
      : null;

  // Read once, during the very first render: what the cache holds later is this
  // hook's own writing, and re-seeding from it would fight the state below.
  const [seed] = useState(() =>
    cacheKey ? useFirstPageCacheStore.getState().getCachedRecentlyWatched(cacheKey) : null
  );

  const [items, setItems] = useState<RecentlyWatchedItem[]>(seed?.value ?? []);
  const [isLoading, setIsLoading] = useState(seed === null);

  // Every fetch takes the next generation; only the newest one may write state,
  // so an unmount or a superseding refresh discards the in-flight run's result.
  const generationRef = useRef(0);

  /** Supersede whatever run is in flight, so its result is discarded. */
  const cancelInFlightFetch = useCallback(() => {
    generationRef.current += 1;
  }, []);

  // A re-import can hand the same series a different poster, so the memoised
  // ones are keyed by the import as well as by the playlist.
  const playlistRevision = usePlaylistStore((s) => {
    const active = s.playlists.find((p) => p.id === s.activePlaylistId);
    return active?.lastFetchedAt?.getTime() ?? null;
  });

  // Declared before the fetch effect so the stale posters are gone before the
  // first fetch for the new playlist starts.
  const loadedPlaylistKeyRef = useRef(`${activePlaylistId}|${playlistRevision}`);
  useEffect(() => {
    const key = `${activePlaylistId}|${playlistRevision}`;
    if (loadedPlaylistKeyRef.current === key) return;
    loadedPlaylistKeyRef.current = key;
    clearPosterCache();
  }, [activePlaylistId, playlistRevision]);

  const fetch = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const generation = ++generationRef.current;
      const isCurrent = () => generationRef.current === generation;

      if (!userId || !activePlaylistId) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      const key: RecentlyWatchedKey = {
        playlistId: activePlaylistId,
        userId,
        excludeAdult,
        limit,
        version: recentlyWatchedVersion,
      };

      try {
        // A revalidation runs behind rows that are already on screen: raising
        // the flag would put the page back into its skeleton for real data.
        if (!silent) setIsLoading(true);

        const loaded = await loadRecentlyWatched(key);

        if (!isCurrent()) return;
        // Below the guard: a superseded run must not overwrite the slice the
        // run that superseded it has already written.
        useFirstPageCacheStore.getState().setCachedRecentlyWatched(key, loaded);
        setItems(loaded);
      } catch (error) {
        if (!isCurrent()) return;
        console.error('[useRecentlyWatched] Error:', error);
        setItems([]);
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    },
    [userId, activePlaylistId, limit, excludeAdult, recentlyWatchedVersion]
  );

  useSeededLoad(seed, fetch, cancelInFlightFetch);

  // Pull-to-refresh, and the revalidation a tab focus triggers: both say the
  // cards on screen are stale, so the slice behind them is dropped before the
  // load that replaces it — see `invalidateHomeSlice`.
  const refresh = useCallback(() => {
    if (activePlaylistId) {
      useFirstPageCacheStore.getState().invalidateHomeSlice(activePlaylistId, 'recentlyWatched');
    }
    return fetch();
  }, [activePlaylistId, fetch]);

  return { items, isLoading, refresh };
}
