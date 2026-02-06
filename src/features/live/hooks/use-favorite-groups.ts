import { useUserStore } from '@/states/user/user-store';
import { useCallback, useEffect, useState } from 'react';

export function useFavoriteGroups() {
  const [favoriteGroups, setFavoriteGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const currentUser = useUserStore((state) => state.currentUser);
  const getFavoriteGroups = useUserStore((state) => state.getFavoriteGroups);
  const toggleFavoriteGroup = useUserStore((state) => state.toggleFavoriteGroup);

  const loadFavorites = useCallback(async () => {
    if (!currentUser) {
      setFavoriteGroups([]);
      setIsLoading(false);
      return;
    }

    try {
      const favorites = await getFavoriteGroups(currentUser.id);
      setFavoriteGroups(favorites);
    } catch (error) {
      console.error('Failed to load favorite groups:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, getFavoriteGroups]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleToggleFavorite = useCallback(async (groupName: string) => {
    if (!currentUser) return;

    // Optimistic update
    setFavoriteGroups((prev) => {
      if (prev.includes(groupName)) {
        return prev.filter((g) => g !== groupName);
      } else {
        return [groupName, ...prev];
      }
    });

    try {
      await toggleFavoriteGroup(currentUser.id, groupName);
    } catch (error) {
      console.error('Failed to toggle favorite group:', error);
      // Revert on error
      loadFavorites();
    }
  }, [currentUser, toggleFavoriteGroup, loadFavorites]);

  return {
    favoriteGroups,
    isLoading,
    toggleFavorite: handleToggleFavorite,
    refreshFavorites: loadFavorites,
  };
}
