import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { extractCleanUrl } from '@/lib/playlist-utils';
import { usePlaylistStore } from '@/states/playlist/playlist-store';
import type { Playlist } from '@/types/playlist.types';
import { memo, useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { PlaylistModal } from './playlist-modal';

/**
 * Displays a list of all playlists with management actions.
 * Used in settings for playlist management.
 */
export const PlaylistList = memo(function PlaylistList() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const playlists = usePlaylistStore((state) => state.playlists);
  const activePlaylistId = usePlaylistStore((state) => state.activePlaylistId);
  const setActivePlaylist = usePlaylistStore((state) => state.setActivePlaylist);
  const removePlaylist = usePlaylistStore((state) => state.removePlaylist);
  const refreshPlaylist = usePlaylistStore((state) => state.refreshPlaylist);

  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const handleEdit = useCallback((playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setShowEditModal(true);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingPlaylist(null);
  }, []);

  const handleDelete = useCallback(
    (playlist: Playlist) => {
      Alert.alert('Delete Playlist', `Are you sure you want to delete "${playlist.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removePlaylist(playlist.id);
            } catch (error) {
              Alert.alert(
                'Error',
                error instanceof Error ? error.message : 'Failed to delete playlist'
              );
            }
          },
        },
      ]);
    },
    [removePlaylist]
  );

  const handleRefresh = useCallback(
    async (playlist: Playlist) => {
      try {
        await refreshPlaylist(playlist.id);
        Alert.alert('Success', 'Playlist refreshed successfully');
      } catch (error) {
        Alert.alert(
          'Error',
          error instanceof Error ? error.message : 'Failed to refresh playlist'
        );
      }
    },
    [refreshPlaylist]
  );

  const handleSelectPlaylist = useCallback(
    async (playlist: Playlist) => {
      try {
        await setActivePlaylist(playlist.id);
      } catch (error) {
        console.error('Failed to select playlist:', error);
      }
    },
    [setActivePlaylist]
  );

  const renderPlaylistCard = useCallback(
    ({ item }: { item: Playlist }) => {
      const isActive = item.id === activePlaylistId;
      const cardStyle = [
        styles.playlistCard,
        {
          backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
          borderColor: isActive ? '#007AFF' : isDark ? '#444' : '#ddd',
          borderWidth: isActive ? 2 : 1,
        },
      ];

      return (
        <TouchableOpacity
          style={cardStyle}
          onPress={() => handleSelectPlaylist(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} playlist`}
          accessibilityHint="Tap to select this playlist as active"
          accessibilityState={{ selected: isActive }}
        >
          <View style={styles.mainContent}>
            <View style={styles.playlistInfo}>
              <View style={styles.nameRow}>
                <ThemedText type="defaultSemiBold" style={styles.playlistName}>
                  {item.name}
                </ThemedText>
                {isActive && (
                  <View style={styles.activeIndicator} />
                )}
              </View>
              <View style={styles.metaRow}>
                <IconSymbol name="tv" size={14} color={isDark ? '#888' : '#666'} />
                <ThemedText style={styles.metaText}>
                  {item.channelCount || 0}
                </ThemedText>
                <ThemedText style={styles.separator}>•</ThemedText>
                <ThemedText style={[styles.metaText, styles.urlText]} numberOfLines={1} ellipsizeMode="tail">
                  {extractCleanUrl(item.url)}
                </ThemedText>
              </View>
            </View>

            <View style={styles.playlistActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleEdit(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit playlist"
                accessibilityHint="Edit playlist details and settings"
              >
                <IconSymbol name="pencil" size={18} color={isDark ? '#888' : '#666'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleRefresh(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Refresh playlist"
                accessibilityHint="Re-fetch and update the playlist channels"
              >
                <IconSymbol name="arrow.clockwise" size={18} color={isDark ? '#888' : '#666'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDelete(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete playlist"
                accessibilityHint="Remove this playlist from your library"
              >
                <IconSymbol name="trash" size={18} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [activePlaylistId, isDark, handleSelectPlaylist, handleEdit, handleRefresh, handleDelete]
  );

  const keyExtractor = useCallback((item: Playlist) => item.id, []);

  if (playlists.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <IconSymbol name="tv" size={64} color={isDark ? '#555' : '#ccc'} />
        <ThemedText style={styles.emptyTitle}>No Playlists</ThemedText>
        <ThemedText style={styles.emptyText}>
          Add your first IPTV playlist to get started
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <FlatList
        data={playlists}
        renderItem={renderPlaylistCard}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContainer}
        scrollEnabled={false}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
      />
      <PlaylistModal
        visible={showEditModal}
        onClose={handleCloseEditModal}
        playlist={editingPlaylist || undefined}
      />
    </>
  );
});

const styles = StyleSheet.create({
  listContainer: {
    padding: 16,
    gap: 8,
  },
  playlistCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  playlistInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playlistName: {
    fontSize: 15,
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    opacity: 0.6,
  },
  urlText: {
    flex: 1,
    flexShrink: 1,
  },
  separator: {
    fontSize: 12,
    opacity: 0.4,
  },
  playlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
});
