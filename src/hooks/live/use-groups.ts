import { useState, useEffect } from 'react';
import { RustChannelService } from '@/services/rust-channel-service';
import { sortGroupsWithAdultLast, type GroupOption } from '@/lib/group-utils';

/**
 * Hook to fetch channel groups from the Rust database.
 * Returns groups with channel counts, sorted alphabetically with "All Channels" first.
 */
export function useGroups(playlistId: string | null | undefined, contentType?: 'live' | 'movie' | 'series') {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const groupCounts = await RustChannelService.getGroupsWithCountsByPlaylist(playlistId!, contentType);

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

        // Add "All Channels" option at the top (empty string name means "all")
        setGroups([{ name: '', channelCount: totalCount }, ...sortedGroups]);
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
  }, [playlistId, contentType]);

  return { groups, isLoading, error };
}
