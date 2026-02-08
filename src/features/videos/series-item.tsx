import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import type { SeriesInfo } from 'expo-m3u-parser';
import { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

interface SeriesItemProps {
  series: SeriesInfo;
  onPress: (series: SeriesInfo) => void;
}

export function SeriesItem({ series, onPress }: SeriesItemProps) {
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
            resizeMode="contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <ThemedView style={[styles.poster, styles.fallbackPoster]}>
            <ThemedText style={styles.fallbackText}>{initial}</ThemedText>
          </ThemedView>
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
    alignItems: 'center',
    paddingVertical: 4,
    flex: 1,
  },
  button: {
    alignItems: 'center',
    width: '100%',
  },
  poster: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginBottom: 4,
  },
  fallbackPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 20,
    fontWeight: '600',
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
