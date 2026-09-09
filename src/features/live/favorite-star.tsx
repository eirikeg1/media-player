import { TouchableOpacity } from 'react-native';
import { useCallback, useState } from 'react';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useUserStore } from '@/stores/user/user-store';


interface FavoriteStarProps {
  channelId: string;
  channelName: string;
  size?: number;
}

export function FavoriteStar({ channelId, channelName, size = 16 }: FavoriteStarProps) {
  const [isLoading, setIsLoading] = useState(false);

  const userId = useUserStore((state) => state.currentUser?.id);
  const toggleFavorite = useUserStore((state) => state.toggleFavorite);
  // `toggleFavorite` keeps this list in sync, so the store is the single source
  // of truth — no local copy to drift and no per-star database round-trip.
  const isFavorite = useUserStore((state) => state.favoriteChannels.includes(channelId));

  const favoriteColor = '#FFD700';

  const handleToggle = useCallback(async () => {
    if (!userId || isLoading) return;

    setIsLoading(true);
    try {
      await toggleFavorite(userId, channelId);
    } catch (error) {
      console.error('[FavoriteStar] Error toggling favorite:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, channelId, isLoading, toggleFavorite]);

  if (!userId) return null;

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
