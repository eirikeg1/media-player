import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { Spinner } from '@/components/ui/display/state';
import { saveSetting } from '@/features/user/save-setting';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { SWITCH_TRACK, TINT } from '@/lib/theme';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { selectExcludeAdult, useUserStore } from '@/stores/user/user-store';
import { memo, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { PlaylistList } from './playlist-list';
import { PlaylistModal } from './playlist-modal';

/** How long a playlist error stays on screen before it clears itself. */
const ERROR_VISIBLE_MS = 8000;

/**
 * Background work is Android-only (see the sports refresh settings), so the
 * control for what it may download is not offered on iOS.
 */
const SHOWS_BACKGROUND_SYNC = Platform.OS !== 'ios';

/**
 * Manages IPTV playlists with add, view, and error handling.
 * Displays playlists in a list and provides a modal for adding new ones.
 */
export const PlaylistManager = memo(function PlaylistManager() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tintColor = useThemeColor({}, 'tint');

  const [showModal, setShowModal] = useState(false);

  const isLoading = usePlaylistStore((state) => state.isLoading);
  const playlistCount = usePlaylistStore((state) => state.playlists.length);
  const error = usePlaylistStore((state) => state.error);
  const clearError = usePlaylistStore((state) => state.clearError);

  // A failure the user has moved on from should not sit on the screen forever.
  useEffect(() => {
    if (!error) return;
    const timeout = setTimeout(clearError, ERROR_VISIBLE_MS);
    return () => clearTimeout(timeout);
  }, [error, clearError]);

  const playlistSharingEnabled = useUserStore(
    (state) => state.currentUser?.settings?.playlistSharingEnabled ?? true,
  );
  // The switch reads the same selector the content queries do, so it can never
  // claim filtering is off while the queries filter (or the reverse).
  const parentalControlEnabled = useUserStore((state) => selectExcludeAdult(state.currentUser));
  const backgroundSyncOnMobileData = useUserStore(
    (state) => state.currentUser?.settings?.backgroundSyncOnMobileData ?? false,
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

  const handleToggleBackgroundSyncOnMobileData = useCallback((value: boolean) => {
    void saveSetting({ backgroundSyncOnMobileData: value }, 'mobile data sync');
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
            trackColor={{ false: SWITCH_TRACK, true: TINT }}
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
            trackColor={{ false: SWITCH_TRACK, true: TINT }}
            accessibilityLabel="Share playlists with other users"
          />
        </View>

        {SHOWS_BACKGROUND_SYNC && (
          <View style={styles.preferenceRow}>
            <View style={styles.labelContainer}>
              <ThemedText style={styles.label}>Sync on Mobile Data</ThemedText>
              <ThemedText style={styles.helpText}>
                Let the background sync download playlists and guides over mobile data. A playlist
                sync can be tens of MB. Syncing while the app is open is not affected.
              </ThemedText>
            </View>
            <Switch
              value={backgroundSyncOnMobileData}
              onValueChange={handleToggleBackgroundSyncOnMobileData}
              trackColor={{ false: SWITCH_TRACK, true: TINT }}
              accessibilityLabel="Sync playlists and guides in the background on mobile data"
            />
          </View>
        )}
      </View>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: isDark ? '#4a1a1a' : '#fee' }]}>
          <IconSymbol name="exclamationmark.triangle" size={20} color="#c33" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable
            onPress={clearError}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
          >
            <IconSymbol name="xmark" size={16} color="#c33" />
          </Pressable>
        </View>
      )}

      {/* Only the first load has nothing to show; a reload keeps the list
          visible, and an import is reported on the card that is importing. */}
      {isLoading && playlistCount === 0 && (
        <View style={styles.loadingContainer}>
          <Spinner size="large" />
          <ThemedText style={styles.loadingText}>Loading playlists...</ThemedText>
        </View>
      )}

      <PlaylistList />

      <Pressable
        testID="playlist-add-button"
        onPress={handleOpenModal}
        style={styles.addButton}
        accessibilityLabel="Add playlist"
        accessibilityHint="Open modal to add a new IPTV playlist"
        hitSlop={8}
      >
        <IconSymbol name="plus.circle.fill" size={36} color={tintColor} />
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
  helpText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
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
