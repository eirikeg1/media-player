import { FavoriteStar } from '@/features/live/favorite-star';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { getChannelId } from '@/lib/channel-utils';
import type { Channel } from '@/types/playlist.types';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

interface ChannelItemProps {
  channel: Channel;
  isFavorite: boolean;
  onPress: (channel: Channel) => void;
}

export function ChannelItem({ channel, isFavorite, onPress }: ChannelItemProps) {
  const hasLogo = !!channel.tvg.logo;
  const initial = channel.name.charAt(0).toUpperCase();
  const channelId = getChannelId(channel);

  return (
    <View style={styles.channelItem}>
      <TouchableOpacity
        style={styles.channelButton}
        onPress={() => onPress(channel)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${channel.name} channel`}
        accessibilityHint="Tap to play this channel"
      >
        {hasLogo ? (
          <Image
            source={{ uri: channel.tvg.logo }}
            style={styles.channelIcon}
            resizeMode="contain"
            onError={() => {
              // Silently handle image load errors
            }}
          />
        ) : (
          <ThemedView
            style={[
              styles.channelIcon,
              styles.fallbackIcon,
            ]}
          >
            <ThemedText style={styles.fallbackText}>
              {initial}
            </ThemedText>
          </ThemedView>
        )}

        <ThemedText
          style={styles.channelName}
          numberOfLines={2}
        >
          {channel.name}
        </ThemedText>
      </TouchableOpacity>

      <View style={styles.favoriteContainer}>
        <FavoriteStar
          channelId={channelId}
          channelName={channel.name}
          size={16}
          initialIsFavorite={isFavorite}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  channelItem: {
    alignItems: 'center',
    paddingVertical: 4,
    flex: 1,
    position: 'relative',
  },
  channelButton: {
    alignItems: 'center',
    width: '100%',
  },
  favoriteContainer: {
    position: 'absolute',
    top: 2,
    right: 2,
    zIndex: 1,
  },
  channelIcon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginBottom: 4,
  },
  fallbackIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 20,
    fontWeight: '600',
  },
  channelName: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 13,
    height: 26,
    textAlignVertical: 'top',
  },
});