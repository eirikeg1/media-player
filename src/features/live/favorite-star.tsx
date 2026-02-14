import { TouchableOpacity } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useUserStore } from '@/stores/user/user-store';


interface FavoriteStarProps {
  channelId: string;
  channelName: string;
  size?: number;
  initialIsFavorite?: boolean;
}

export function FavoriteStar({ channelId, channelName, size = 16, initialIsFavorite }: FavoriteStarProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite ?? false);
  const [isLoading, setIsLoading] = useState(false);

  const currentUser = useUserStore((state) => state.currentUser);
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  const checkIsFavorite = useUserStore((state) => state.isFavorite);

  const favoriteColor = '#FFD700';

  const loadFavoriteStatus = useCallback(async () => {
    if (!currentUser) return;

    try {
      const favorite = await checkIsFavorite(currentUser.id, channelId);
      setIsFavorite(favorite);
    } catch (error) {
      console.error('[FavoriteStar] Error checking favorite status:', error);
    }
  }, [currentUser, channelId, checkIsFavorite]);

  const handleToggle = useCallback(async () => {
    if (!currentUser || isLoading) return;

    console.log('[FavoriteStar] Toggling favorite for:', channelId, 'Current state:', isFavorite);
    setIsLoading(true);
    try {
      await toggleFavorite(currentUser.id, channelId);
      setIsFavorite(!isFavorite);
      console.log('[FavoriteStar] Successfully toggled favorite to:', !isFavorite);
    } catch (error) {
      console.error('[FavoriteStar] Error toggling favorite:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, channelId, isFavorite, isLoading, toggleFavorite]);

  useEffect(() => {
    // Only load from database if initial favorite status wasn't provided
    if (initialIsFavorite === undefined) {
      loadFavoriteStatus();
    }
  }, [loadFavoriteStatus, initialIsFavorite]);

  if (!currentUser) return null;

  return (
    <TouchableOpacity
      onPress={handleToggle}
      disabled={isLoading}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ padding: 6 }}
      accessibilityRole="button"
      accessibilityLabel={`${isFavorite ? 'Remove from' : 'Add to'} favorites`}
      accessibilityHint={`${isFavorite ? 'Remove' : 'Add'} ${channelName} ${isFavorite ? 'from' : 'to'} your favorite channels`}
    >
      <IconSymbol
        name={isFavorite ? 'star.fill' : 'star'}
        size={size}
        color={isFavorite ? favoriteColor : 'rgba(160, 160, 160, 0.9)'}
      />
    </TouchableOpacity>
  );
}