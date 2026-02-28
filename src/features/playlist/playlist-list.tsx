import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { extractCleanUrl } from '@/lib/playlist-utils';
import { GlassColors } from '@/lib/theme';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import type { Playlist } from '@/types/playlist.types';
import { memo, useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ImportProgressBar } from './import-progress-bar';
import { PlaylistModal } from './playlist-modal';

function formatSyncInterval(minutes: number): string {
  if (minutes >= 10080) return `${minutes / 10080}w`;
  if (minutes >= 1440) return `${minutes / 1440}d`;
  return `${minutes / 60}h`;
}

interface PlaylistCardProps {
  item: Playlist;
  isActive: boolean;
  onSelect: (playlist: Playlist) => void;
  onEdit: (playlist: Playlist) => void;
  onRefresh: (playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
}

const PlaylistCard = memo(function PlaylistCard({
  item,
  isActive,
  onSelect,
  onEdit,
  onRefresh,
  onDelete,
}: PlaylistCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const glass = isDark ? GlassColors.dark : GlassColors.light;

  const importPhase = useImportProgressStore((s) => s.phase);
  const importPlaylistId = useImportProgressStore((s) => s.activePlaylistId);
  const phaseLabel = useImportProgressStore((s) => s.phaseLabel);
  const isImporting =
    importPhase !== null &&
    importPhase !== 'complete' &&
    importPlaylistId === item.id;

  const cardStyle = [
    styles.playlistCard,
    {
      backgroundColor: glass.surface,
      borderColor: isActive ? '#007AFF' : glass.border,
      borderWidth: isActive ? 2 : 1,
    },
  ];

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={() => onSelect(item)}
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
          {isImporting ? (
            <View style={styles.importArea}>
              <ThemedText style={styles.metaText}>{phaseLabel}</ThemedText>
              <ImportProgressBar playlistId={item.id} compact showAlways />
            </View>
          ) : (
            <View style={styles.metaRow}>
              <IconSymbol name="tv" size={14} color={isDark ? '#7c869e' : '#5c6477'} />
              <ThemedText style={styles.metaText}>
                {item.channelCount || 0}
              </ThemedText>
              {!!item.syncInterval && item.syncInterval > 0 && (
                <>
                  <ThemedText style={styles.separator}>•</ThemedText>
                  <IconSymbol name="arrow.triangle.2.circlepath" size={12} color={isDark ? '#7c869e' : '#5c6477'} />
                  <ThemedText style={styles.metaText}>
                    {formatSyncInterval(item.syncInterval)}
                  </ThemedText>
                </>
              )}
              <ThemedText style={styles.separator}>•</ThemedText>
              <ThemedText style={[styles.metaText, styles.urlText]} numberOfLines={1} ellipsizeMode="tail">
                {extractCleanUrl(item.url)}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.playlistActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            accessibilityRole="button"
            accessibilityLabel="Edit playlist"
            accessibilityHint="Edit playlist details and settings"
          >
            <IconSymbol name="pencil" size={18} color={isDark ? '#7c869e' : '#5c6477'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              onRefresh(item);
            }}
            accessibilityRole="button"
            accessibilityLabel="Refresh playlist"
            accessibilityHint="Re-fetch and update the playlist channels"
          >
            <IconSymbol name="arrow.clockwise" size={18} color={isDark ? '#7c869e' : '#5c6477'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              onDelete(item);
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
});

/**
 * Displays a list of all playlists with management actions.
 * Used in settings for playlist management.
 */
export const PlaylistList = memo(function PlaylistList() {
  const playlists = usePlaylistStore((state) => state.playlists);
  const activePlaylistId = usePlaylistStore((state) => state.activePlaylistId);
  const setActivePlaylist = usePlaylistStore((state) => state.setActivePlaylist);
  const removePlaylist = usePlaylistStore((state) => state.removePlaylist);
  const refreshPlaylist = usePlaylistStore((state) => state.refreshPlaylist);

  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState<Playlist | null>(null);

  const handleEdit = useCallback((playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setShowEditModal(true);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingPlaylist(null);
  }, []);

  const handleDelete = useCallback((playlist: Playlist) => {
    setPendingDeletePlaylist(playlist);
  }, []);

  const handleRefresh = useCallback(
    async (playlist: Playlist) => {
      try {
        await refreshPlaylist(playlist.id);
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
    ({ item }: { item: Playlist }) => (
      <PlaylistCard
        item={item}
        isActive={item.id === activePlaylistId}
        onSelect={handleSelectPlaylist}
        onEdit={handleEdit}
        onRefresh={handleRefresh}
        onDelete={handleDelete}
      />
    ),
    [activePlaylistId, handleSelectPlaylist, handleEdit, handleRefresh, handleDelete]
  );

  const keyExtractor = useCallback((item: Playlist) => item.id, []);

  if (playlists.length === 0) {
    return null;
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
      <ConfirmDialog
        visible={pendingDeletePlaylist !== null}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${pendingDeletePlaylist?.name}"?`}
        actions={[
          {
            title: 'Cancel',
            onPress: () => setPendingDeletePlaylist(null),
          },
          {
            title: 'Delete',
            variant: 'danger',
            onPress: async () => {
              if (pendingDeletePlaylist) {
                try {
                  await removePlaylist(pendingDeletePlaylist.id);
                } catch (error) {
                  Alert.alert(
                    'Error',
                    error instanceof Error ? error.message : 'Failed to delete playlist'
                  );
                }
              }
              setPendingDeletePlaylist(null);
            },
          },
        ]}
      />
    </>
  );
});

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  playlistCard: {
    borderRadius: 8,
    padding: 12,
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
  importArea: {
    gap: 2,
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
});
