import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

interface RecentlyWatchedCardProps {
  item: RecentlyWatchedItem;
  isActive: boolean;
  size: number;
}

export function RecentlyWatchedCard({ item, isActive, size }: RecentlyWatchedCardProps) {
  const [imageError, setImageError] = useState(false);
  const hasLogo = !!item.tvgLogo && !imageError;
  const initial = item.channelName.charAt(0).toUpperCase();

  const showProgress =
    item.lastPosition != null &&
    item.lastPosition > 0 &&
    item.totalDuration != null &&
    item.totalDuration > 0 &&
    item.lastPosition < item.totalDuration * 0.9;

  const progressPercent = showProgress
    ? Math.min((item.lastPosition! / item.totalDuration!) * 100, 100)
    : 0;

  return (
    <View style={[styles.imageWrapper, { width: size, height: size, borderWidth: isActive ? 2 : 1, borderColor: isActive ? '#0a84ff' : '#000' }]}>
      {hasLogo ? (
        <Image
          source={{ uri: item.tvgLogo }}
          style={styles.poster}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <ThemedView style={[styles.poster, styles.fallbackPoster]}>
          <ThemedText style={styles.fallbackText}>{initial}</ThemedText>
        </ThemedView>
      )}

      {showProgress && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    borderColor: '#0a84ff',
    backgroundColor: '#1a1a1a',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  fallbackPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 28,
    fontWeight: '600',
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#0a84ff',
  },
});
