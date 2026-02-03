import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { usePlaylistChannels } from '@/hooks/live/use-playlist-channels';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePlaylistStore } from '@/states/playlist/playlist-store';
import type { Channel } from '@/types/playlist.types';
import { useCallback, useMemo } from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

interface ChannelGridProps {
  selectedGroup?: string;
  searchText?: string;
  onChannelPress?: (channel: Channel) => void;
}

const { width } = Dimensions.get('window');
const PADDING = 16;
const GAP = 8;
const COLUMNS = 4;
const ITEM_WIDTH = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

export function ChannelGrid({
  selectedGroup,
  searchText = '',
  onChannelPress,
}: ChannelGridProps) {
  const iconColor = useThemeColor({}, 'icon');
  const activePlaylist = usePlaylistStore((state) => state.getActivePlaylist());
  const { channels: allChannels } = usePlaylistChannels(activePlaylist?.id);

  const filteredChannels = useMemo(() => {
    let channels = allChannels;

    // Filter by group
    if (selectedGroup) {
      channels = channels.filter((channel) => {
        const channelGroup = channel.group.title || 'Uncategorized';
        return channelGroup === selectedGroup;
      });
    }

    // Filter by search text
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase().trim();
      channels = channels.filter((channel) =>
        channel.name.toLowerCase().includes(searchLower)
      );
    }

    return channels;
  }, [allChannels, selectedGroup, searchText]);

  const handleChannelPress = useCallback(
    (channel: Channel) => {
      if (onChannelPress) {
        onChannelPress(channel);
      } else if (__DEV__) {
        console.log('Channel pressed:', channel.name);
      }
    },
    [onChannelPress]
  );

  const getChannelInitial = (channelName: string) => {
    return channelName.charAt(0).toUpperCase();
  };

  if (!activePlaylist) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <IconSymbol name="tv" size={64} color={iconColor} />
        <ThemedText style={styles.emptyTitle}>
          No Active Playlist
        </ThemedText>
        <ThemedText style={styles.emptyText} type="subtitle">
          Please add and select a playlist from the settings
        </ThemedText>
      </ThemedView>
    );
  }

  if (filteredChannels.length === 0) {
    const isSearching = searchText.trim().length > 0;
    const isFiltering = !!selectedGroup;

    return (
      <ThemedView style={styles.emptyContainer}>
        <IconSymbol
          name={isSearching ? 'magnifyingglass' : 'tv'}
          size={64}
          color={iconColor}
        />
        <ThemedText style={styles.emptyTitle}>
          {isSearching ? 'No Results' : 'No Channels'}
        </ThemedText>
        <ThemedText style={styles.emptyText} type="subtitle">
          {isSearching
            ? `No channels found for "${searchText}"`
            : isFiltering
            ? `No channels found in "${selectedGroup}" group`
            : "This playlist doesn't contain any channels"}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.grid}>
        {filteredChannels.map((channel, index) => {
          const hasLogo = !!channel.tvg.logo;
          const initial = getChannelInitial(channel.name);

          return (
            <ThemedView key={`channel-${index}`} style={styles.gridItem}>
              <TouchableOpacity
                style={styles.channelItem}
                onPress={() => handleChannelPress(channel)}
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
            </ThemedView>
          );
        })}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: PADDING,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: ITEM_WIDTH,
    marginBottom: GAP,
  },
  channelItem: {
    alignItems: 'center',
    paddingVertical: 4,
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
    height: 26, // Fixed height for consistent alignment
    textAlignVertical: 'top',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});