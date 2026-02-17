import { FavoriteStar } from '@/features/live/favorite-star';
import { ProgrammeProgress } from '@/features/live/programme-progress';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { getChannelId } from '@/lib/channel-utils';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

interface ChannelItemProps {
  channel: Channel;
  isFavorite: boolean;
  onPress: (channel: Channel) => void;
  currentProgramme?: EpgProgramme | null;
}

export function ChannelItem({ channel, isFavorite, onPress, currentProgramme }: ChannelItemProps) {
  const [imageError, setImageError] = useState(false);
  const hasLogo = !!channel.tvg.logo && !imageError;
  const initial = channel.name.charAt(0).toUpperCase();
  const channelId = getChannelId(channel);
  const hasProgramme = !!currentProgramme;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onPress(channel)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${channel.name} channel`}
        accessibilityHint="Tap to view channel details"
      >
        <View style={styles.imageWrapper}>
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
          {currentProgramme && <ProgrammeProgress programme={currentProgramme} />}
        </View>

        <ThemedText style={styles.channelName} numberOfLines={hasProgramme ? 1 : 2}>
          {channel.name}
        </ThemedText>
        {currentProgramme && (
          <ThemedText style={styles.programmeName} numberOfLines={1}>
            {currentProgramme.title}
          </ThemedText>
        )}
      </TouchableOpacity>

      <View style={styles.starContainer}>
        <FavoriteStar
          channelId={channelId}
          channelName={channel.name}
          size={20}
          initialIsFavorite={isFavorite}
        />
      </View>
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
  imageWrapper: {
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 4,
  },
  poster: {
    width: '100%',
    aspectRatio: 4 / 3,
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
  starContainer: {
    position: 'absolute',
    top: 4,
    right: 0,
    zIndex: 1,
  },
  channelName: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 13,
  },
  programmeName: {
    fontSize: 9,
    textAlign: 'center',
    opacity: 0.6,
    lineHeight: 11,
  },
});
