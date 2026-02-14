import { useState, useEffect, useRef } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import { FAVORITES_GROUP_SENTINEL, sortGroupsWithAdultLast, type GroupOption } from '@/lib/group-utils';

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

    async function fetchGroups() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch groups with counts from Rust backend
        const groupCounts = await RustChannelService.getGroupsWithCountsByPlaylist(playlistId!, contentType, excludeAdult);

        if (cancelled) return;

        // Calculate total channel count for "All Channels" option
        const totalCount = groupCounts.reduce((sum, g) => sum + g.count, 0);

        // Convert to GroupOption format
        const groupOptions: GroupOption[] = groupCounts.map((g) => ({
          name: g.name,
          channelCount: g.count,
        }));

        // Sort alphabetically with adult groups at the bottom
        const sortedGroups = sortGroupsWithAdultLast(groupOptions);

        // Build final list: All Channels → Favorites (if applicable) → sorted groups
        const result: GroupOption[] = [];

        // Add "All Channels" option (empty string name means "all")
        result.push({ name: '', channelCount: totalCount });

        // Add Favorites entry if there are favorite groups
        if (stableFavoriteGroups && stableFavoriteGroups.length > 0) {
          const favoritesCount = groupCounts
            .filter((g) => stableFavoriteGroups.includes(g.name))
            .reduce((sum, g) => sum + g.count, 0);
          result.push({ name: FAVORITES_GROUP_SENTINEL, channelCount: favoritesCount });
        }

        // Add sorted groups
        result.push(...sortedGroups);

        setGroups(result);
      } catch (err) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : 'Failed to fetch groups';
        console.error('[useGroups] Error:', message);
        setError(message);
        setGroups([]);
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
