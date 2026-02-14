import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUserStore } from '@/stores/user/user-store';
import type { Playlist } from '@/types/playlist.types';

export function useFavoriteChannels(activePlaylist: Playlist | null, hasLoadedPlaylist: boolean) {
  const [hasLoadedFavorites, setHasLoadedFavorites] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const isInitialMount = useRef(true);
  const isMountedRef = useRef(true);

  const currentUser = useUserStore((state) => state.currentUser);
  const favoriteChannels = useUserStore((state) => state.favoriteChannels);
  const loadFavoriteChannels = useUserStore((state) => state.loadFavoriteChannels);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadFavorites = useCallback(async () => {
    if (!isMountedRef.current) return;

    if (currentUser) {
      try {
        await loadFavoriteChannels(currentUser.id);
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error('Error loading favorite channels:', error);
      }
    }

    if (!isMountedRef.current) return;
    setHasLoadedFavorites(true);
  }, [currentUser, loadFavoriteChannels]);

  const handleRefresh = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsRefreshing(true);
    await loadFavorites();
    if (isMountedRef.current) {
      setIsRefreshing(false);
    }
  }, [loadFavorites]);

  useEffect(() => {
    if (activePlaylist && hasLoadedPlaylist) {
      loadFavorites();
    } else if (hasLoadedPlaylist && !currentUser) {
      setHasLoadedFavorites(true);
    }
  }, [activePlaylist, hasLoadedPlaylist, loadFavorites, currentUser]);

  useFocusEffect(
    useCallback(() => {
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      loadFavorites().catch((error) => {
        if (isMountedRef.current) {
          console.error('Error reloading favorites on focus:', error);
        }
      });
    }, [loadFavorites])
  );

  return {
    favoriteChannels,
    hasLoadedFavorites,
    isRefreshing,
    handleRefresh
  };
}
