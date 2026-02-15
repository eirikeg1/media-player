import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { useCallback, useEffect, useState } from 'react';

export function useRecentlyWatched(limit = 20) {
  const currentUser = useUserStore((s) => s.currentUser);
  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const getRecentlyWatched = useUserStore((s) => s.getRecentlyWatched);

  const [items, setItems] = useState<RecentlyWatchedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!currentUser?.id || !activePlaylistId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await getRecentlyWatched(currentUser.id, activePlaylistId, limit);
      setItems(result.filter((item) => item.contentType !== 'live'));
    } catch (error) {
      console.error('[useRecentlyWatched] Error:', error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, activePlaylistId, limit, getRecentlyWatched]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { items, isLoading, refresh: fetch };
}
