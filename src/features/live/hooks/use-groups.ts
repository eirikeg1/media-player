import { useState, useEffect, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import { useFirstPageCacheStore } from '@/stores/cache';
import { FAVORITES_GROUP_SENTINEL, processRawGroupCounts, type GroupOption } from '@/lib/group-utils';

/**
 * Insert a Favorites entry after the "All" entry if favorite groups exist.
 * Groups from cache/fetch don't include the Favorites entry since it's user-specific.
 */
function addFavoritesEntry(groups: GroupOption[], favoriteGroups?: string[]): GroupOption[] {
  if (!favoriteGroups || favoriteGroups.length === 0) return groups;

  const result: GroupOption[] = [];
  for (const group of groups) {
    result.push(group);
    // Insert Favorites right after the "All" entry (empty name)
    if (group.name === '') {
      const favoritesCount = groups
        .filter((g) => favoriteGroups.includes(g.name))
        .reduce((sum, g) => sum + g.channelCount, 0);
      result.push({ name: FAVORITES_GROUP_SENTINEL, channelCount: favoritesCount });
    }
  }
  return result;
}

/**
 * Hook to fetch channel groups from the Rust database.
 * Returns groups with channel counts, sorted alphabetically with "All Channels" first.
 * When favoriteGroups is provided and non-empty, prepends a Favorites entry.
 */
export function useGroups(
  playlistId: string | null | undefined,
  contentType?: 'live' | 'movie' | 'series',
  favoriteGroups?: string[],
  excludeAdult?: boolean,
) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stabilize favoriteGroups reference — only update when contents actually change
  const favoriteGroupsRef = useRef(favoriteGroups);
  if (
    favoriteGroups?.length !== favoriteGroupsRef.current?.length ||
    favoriteGroups?.some((g, i) => g !== favoriteGroupsRef.current?.[i])
  ) {
    favoriteGroupsRef.current = favoriteGroups;
  }
  const stableFavoriteGroups = favoriteGroupsRef.current;

  useEffect(() => {
    if (!playlistId) {
      setGroups([]);
      return;
    }

    let cancelled = false;

    // Check cache for instant display
    const groupContentType = (contentType || 'live') as 'live' | 'movie' | 'series';
    const cached = useFirstPageCacheStore.getState().getCachedGroups(playlistId!, groupContentType);
    const cachedExcludeAdult = useFirstPageCacheStore.getState().getExcludeAdult(playlistId!);
    if (cached && cachedExcludeAdult === excludeAdult) {
      const withFavorites = addFavoritesEntry(cached, stableFavoriteGroups);
      setGroups(withFavorites);
      // Still fetch in background but skip loading spinner
    }

    async function fetchGroups() {
      // Only show loading if we don't have cached data
      if (!cached || cachedExcludeAdult !== excludeAdult) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const groupCounts = await RustChannelService.getGroupsWithCountsByPlaylist(playlistId!, contentType, excludeAdult);

        if (cancelled) return;

        const processed = processRawGroupCounts(groupCounts);

        // Write back to cache
        useFirstPageCacheStore.getState().setCachedGroups(playlistId!, groupContentType, processed);

        const result = addFavoritesEntry(processed, stableFavoriteGroups);
        setGroups(result);
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : 'Failed to fetch groups';
        console.error('[useGroups] Error:', message);
        setError(message);
        // Only clear groups if we didn't have cached data
        if (!cached || cachedExcludeAdult !== excludeAdult) {
          setGroups([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchGroups();

    return () => {
      cancelled = true;
    };
  }, [playlistId, contentType, stableFavoriteGroups, excludeAdult]);

  return { groups, isLoading, error };
}
