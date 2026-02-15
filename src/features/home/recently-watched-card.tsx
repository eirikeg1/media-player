import { THEME } from '@/lib/theme';
import type { RecentlyWatchedItem } from '@/types/user.types';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, StyleSheet, Text, useColorScheme, View } from 'react-native';

interface RecentlyWatchedCardProps {
  item: RecentlyWatchedItem;
  isActive: boolean;
  size: number;
}

export function RecentlyWatchedCard({ item, isActive, size }: RecentlyWatchedCardProps) {
  const colorScheme = useColorScheme() ?? 'dark';
  const [imageError, setImageError] = useState(false);
  const imageUrl = item.seriesPoster ?? item.tvgLogo;
  const hasLogo = !!imageUrl && !imageError;
  const initial = (item.seriesName ?? item.channelName).charAt(0).toUpperCase();

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
    <View style={[styles.imageWrapper, { width: size, height: size }]}>
      {hasLogo ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.poster}
          resizeMode="cover"
          onError={() => setImageError(true)}
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

      {showProgress && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%`, backgroundColor: THEME[colorScheme].ring }]} />
        </View>
      )}
    </View>
  );
}

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
