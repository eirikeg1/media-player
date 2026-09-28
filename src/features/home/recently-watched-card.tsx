import { THEME } from '@/lib/theme';
import { isInProgress } from '@/lib/viewing-progress';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useState } from 'react';
import { Image, StyleSheet, Text, useColorScheme, View } from 'react-native';

interface RecentlyWatchedCardProps {
  item: RecentlyWatchedItem;
  isActive: boolean;
  size: number;
}

export const RecentlyWatchedCard = memo(function RecentlyWatchedCard({
  item,
  isActive,
  size,
}: RecentlyWatchedCardProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  // Keyed by URL rather than a boolean, so a recycled card showing a different
  // poster starts out trusting it again.
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = item.seriesPoster ?? item.tvgLogo;
  const hasLogo = !!imageUrl && failedImageUrl !== imageUrl;
  const initial = (item.seriesName ?? item.channelName).charAt(0).toUpperCase();

  const lastPosition = item.lastPosition ?? 0;
  const totalDuration = item.totalDuration ?? 0;
  // The bar needs a known duration to have a width, so an in-progress title that
  // never reported one simply shows none.
  const showProgress = totalDuration > 0 && isInProgress(lastPosition, totalDuration);
  const progressPercent = showProgress
    ? Math.min((lastPosition / totalDuration) * 100, 100)
    : 0;

  return (
    <View style={[styles.imageWrapper, { width: size, height: size }]}>
      {hasLogo ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.poster}
          resizeMode="cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <View style={[styles.poster, styles.fallbackPoster]}>
          <Text style={styles.fallbackText}>{initial}</Text>
        </View>
      )}

      {!isActive && (
        <LinearGradient
          colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.20)', 'transparent']}
          locations={[0, 0.45, 0.70, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {isActive && showProgress && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%`, backgroundColor: THEME[colorScheme].ring }]} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  imageWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
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
    color: '#eff0f4',
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
  },
});
