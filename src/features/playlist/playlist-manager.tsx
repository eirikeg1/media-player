import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { saveSetting } from '@/features/user/save-setting';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { useUserStore } from '@/stores/user/user-store';
import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
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

  const playlistSharingEnabled = useUserStore(
    (state) => state.currentUser?.settings?.playlistSharingEnabled ?? true,
  );
  // Adult filtering is on by default: keep this fallback in sync with
  // DEFAULT_USER_SETTINGS and every consumer that filters content (`?? true`)
  // — the switch must never claim filtering is off while the queries filter.
  const parentalControlEnabled = useUserStore(
    (state) => state.currentUser?.settings?.parentalControlEnabled ?? true,
  );

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleOpenModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleTogglePlaylistSharing = useCallback((value: boolean) => {
    void saveSetting({ playlistSharingEnabled: value }, 'playlist sharing');
  }, []);

  const handleToggleParentalControl = useCallback((value: boolean) => {
    void saveSetting({ parentalControlEnabled: value }, 'adult content filtering');
  }, []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          Playlist Management
        </ThemedText>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Hide Adult Content</ThemedText>
          </View>
          <Switch
            value={parentalControlEnabled}
            onValueChange={handleToggleParentalControl}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Hide adult content"
          />
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Share Playlists With Other Users</ThemedText>
          </View>
          <Switch
            value={playlistSharingEnabled}
            onValueChange={handleTogglePlaylistSharing}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Share playlists with other users"
          />
        </View>
      </View>

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

      <Pressable
        testID="playlist-add-button"
        onPress={handleOpenModal}
        style={styles.addButton}
        accessibilityLabel="Add playlist"
        accessibilityHint="Open modal to add a new IPTV playlist"
        hitSlop={8}
      >
        <IconSymbol name="plus.circle.fill" size={36} color="#007AFF" />
      </Pressable>

      <PlaylistModal visible={showModal} onClose={handleCloseModal} />
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  header: {
    marginBottom: 8,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 0,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  addButton: {
    alignItems: 'center',
    paddingVertical: 16,
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
