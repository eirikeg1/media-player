import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUserStore } from '@/states/user/user-store';
import type { Playlist } from '@/types/playlist.types';

export function useFavoriteChannels(activePlaylist: Playlist | null, hasLoadedPlaylist: boolean) {
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([]);
  const [hasLoadedFavorites, setHasLoadedFavorites] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const isInitialMount = useRef(true);
  const isMountedRef = useRef(true);

  const currentUser = useUserStore((state) => state.currentUser);
  const getFavoriteChannels = useUserStore((state) => state.getFavoriteChannels);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadFavorites = useCallback(async (isTabClick: boolean = false) => {
    if (!isMountedRef.current) return;

    if (isTabClick) {
      setIsInitialLoading(true);
    }

    if (currentUser) {
      try {
        const favorites = await getFavoriteChannels(currentUser.id);
        if (!isMountedRef.current) return;
        setFavoriteChannels(favorites);
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error('Error loading favorite channels:', error);
      }
    } else {
      if (!isMountedRef.current) return;
      setFavoriteChannels([]);
    }

    if (!isMountedRef.current) return;
    setHasLoadedFavorites(true);
    setIsInitialLoading(false);
  }, [currentUser, getFavoriteChannels]);

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

      let timeoutId: ReturnType<typeof setTimeout>;

      timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          loadFavorites(true).catch((error) => {
            if (isMountedRef.current) {
              console.error('Error reloading favorites on focus:', error);
            }
          });
        }
      }, 0);

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }, [loadFavorites])
  );

  return {
    favoriteChannels,
    hasLoadedFavorites,
    isRefreshing,
    isInitialLoading,
    handleRefresh
  };
}