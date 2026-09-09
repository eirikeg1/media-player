import { useUserStore } from '@/stores/user/user-store';
import { useCallback, useEffect, useState } from 'react';

export function useFavoriteGroups() {
  const [favoriteGroups, setFavoriteGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const userId = useUserStore((state) => state.currentUser?.id);
  const getFavoriteGroups = useUserStore((state) => state.getFavoriteGroups);
  const toggleFavoriteGroup = useUserStore((state) => state.toggleFavoriteGroup);

  const loadFavorites = useCallback(async () => {
    if (!userId) {
      setFavoriteGroups([]);
      setIsLoading(false);
      return;
    }

    try {
      const favorites = await getFavoriteGroups(userId);
      setFavoriteGroups(favorites);
    } catch (error) {
      console.error('Failed to load favorite groups:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, getFavoriteGroups]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleToggleFavorite = useCallback(async (groupName: string) => {
    if (!userId) return;

    // Optimistic update
    setFavoriteGroups((prev) => {
      if (prev.includes(groupName)) {
        return prev.filter((g) => g !== groupName);
      } else {
        return [groupName, ...prev];
      }
    });

    try {
      await toggleFavoriteGroup(userId, groupName);
    } catch (error) {
      console.error('Failed to toggle favorite group:', error);
      // Revert on error
      loadFavorites();
    }
  }, [userId, toggleFavoriteGroup, loadFavorites]);

  return {
    favoriteGroups,
    isLoading,
    toggleFavorite: handleToggleFavorite,
    refreshFavorites: loadFavorites,
  };
}
