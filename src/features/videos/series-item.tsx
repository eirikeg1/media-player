import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

interface SeriesItemProps {
  series: SeriesInfo;
  isFavorite: boolean;
  onPress: (series: SeriesInfo) => void;
}

export function SeriesItem({ series, isFavorite, onPress }: SeriesItemProps) {
  const [imageError, setImageError] = useState(false);
  const hasPoster = !!series.poster && !imageError;
  const initial = series.seriesName.charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onPress(series)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${series.seriesName} series`}
        accessibilityHint="Tap to view series details"
      >
        {hasPoster ? (
          <Image
            source={{ uri: series.poster }}
            style={styles.poster}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <ThemedView style={[styles.poster, styles.fallbackPoster]}>
            <ThemedText style={styles.fallbackText}>{initial}</ThemedText>
          </ThemedView>
        )}

        {isFavorite && (
          <View style={styles.starBadge}>
            <IconSymbol name="star.fill" size={14} color="#FFD700" />
          </View>
        )}

        <ThemedText style={styles.seriesName} numberOfLines={2}>
          {series.seriesName}
        </ThemedText>

        <ThemedText style={styles.episodeCount}>
          {series.episodeCount} {series.episodeCount === 1 ? 'ep' : 'eps'}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 4,
  },
  button: {
    width: '100%',
  },
  poster: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 6,
    marginBottom: 4,
    backgroundColor: '#1a1a1a',
  },
  fallbackPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 24,
    fontWeight: '600',
  },
  starBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 10,
    padding: 3,
  },
  seriesName: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 13,
    height: 26,
    textAlignVertical: 'top',
  },
  episodeCount: {
    fontSize: 9,
    opacity: 0.6,
    textAlign: 'center',
  },
});
