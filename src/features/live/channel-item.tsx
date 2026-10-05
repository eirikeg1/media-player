import { FavoriteStar } from '@/features/live/favorite-star';
import { ProgrammeProgress } from '@/features/live/programme-progress';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { getChannelId } from '@/lib/channel-utils';
import type { Channel } from '@/types/playlist.types';
import type { EpgProgramme } from 'expo-m3u-parser';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface ChannelItemProps {
  channel: Channel;
  onPress: (channel: Channel) => void;
  currentProgramme?: EpgProgramme | null;
  testID?: string;
}

function ChannelItemInner({ channel, onPress, currentProgramme, testID }: ChannelItemProps) {
  const logoUri = channel.tvg.logo;
  // Keyed by URI rather than a boolean: FlashList recycles this component
  // between rows, and a plain `imageError` flag would carry the previous
  // channel's failure over and degrade the whole grid to letter tiles.
  const [failedLogoUri, setFailedLogoUri] = useState<string | null>(null);
  const hasLogo = !!logoUri && failedLogoUri !== logoUri;
  const initial = channel.name.charAt(0).toUpperCase();
  const channelId = getChannelId(channel);
  const hasProgramme = !!currentProgramme;

  const handlePress = useCallback(() => onPress(channel), [onPress, channel]);
  const handleLogoError = useCallback(() => setFailedLogoUri(logoUri ?? null), [logoUri]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        testID={testID}
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${channel.name} channel`}
        accessibilityHint="Tap to view channel details"
      >
        <View style={styles.imageWrapper}>
          {hasLogo ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.poster}
              contentFit="cover"
              transition={200}
              onError={handleLogoError}
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
        />
      </View>
    </View>
  );
}

/**
 * Memoised: a grid of these re-renders whenever the screen's programme map or
 * favourites change, and only the affected rows should actually re-render.
 */
export const ChannelItem = React.memo(ChannelItemInner);

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
