import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import type { Channel } from '@/types/playlist.types';
import { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

interface MovieItemProps {
  channel: Channel;
  isFavorite: boolean;
  onPress: (channel: Channel) => void;
}

export function MovieItem({ channel, isFavorite, onPress }: MovieItemProps) {
  const [imageError, setImageError] = useState(false);
  const hasLogo = !!channel.tvg.logo && !imageError;
  const initial = channel.name.charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onPress(channel)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${channel.name} movie`}
        accessibilityHint="Tap to view movie details"
      >
        {hasLogo ? (
          <Image
            source={{ uri: channel.tvg.logo }}
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

        <ThemedText style={styles.movieName} numberOfLines={2}>
          {channel.name}
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
  movieName: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 13,
    height: 26,
    textAlignVertical: 'top',
  },
});
