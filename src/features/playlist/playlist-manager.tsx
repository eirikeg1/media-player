
import { Button } from '@/components/ui/controls/button';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlaylistStore } from '@/states/playlist/playlist-store';
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { PlaylistList } from './playlist-list';
import { PlaylistModal } from './playlist-modal';

/**
 * Manages IPTV playlists with add, view, and error handling.
 * Displays playlists in a list and provides a modal for adding new ones.
 */
export const PlaylistManager = memo(function PlaylistManager() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [showModal, setShowModal] = useState(false);

  const isLoading = usePlaylistStore((state) => state.isLoading);
  const error = usePlaylistStore((state) => state.error);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleOpenModal = useCallback(() => {
    setShowModal(true);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          Playlist Management
        </ThemedText>

        <View style={styles.actionRow}>
          <Button
            title="Add Playlist"
            icon="plus.circle"
            onPress={handleOpenModal}
            size="medium"
            variant="secondary"
            accessibilityLabel="Add playlist"
            accessibilityHint="Open modal to add a new IPTV playlist"
          />
        </View>

      </View>

      <View style={[styles.separator, { backgroundColor: isDark ? '#333' : '#ddd' }]} />

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: isDark ? '#4a1a1a' : '#fee' }]}>
          <IconSymbol name="exclamationmark.triangle" size={20} color="#c33" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>Loading playlists...</ThemedText>
        </View>
      )}

      {!isLoading && <PlaylistList />}

      <PlaylistModal visible={showModal} onClose={handleCloseModal} />
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  separator: {
    height: 1,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    color: '#c33',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
});
