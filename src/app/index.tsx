import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useAppReadyStore } from '@/stores/app';
import { useUserStore } from '@/stores/user/user-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { retryInit } from '@/hooks/use-playlist-init';

/**
 * Root index - redirects to user-select or tabs based on user state.
 * Renders an invisible View while loading so the splash screen stays visible.
 */
export default function Index() {
  const users = useUserStore(state => state.users);
  const isLoading = useUserStore(state => state.isLoading);
  const isPlaylistInitialized = usePlaylistStore(state => state.isInitialized);
  const initError = usePlaylistStore(state => state.initError);

  const shouldRedirectToUserSelect = !isLoading && isPlaylistInitialized && users.length === 0;

  // Reveal the UI before redirecting to user-select or showing error, since
  // HomeScreen (which normally signals readiness) will never mount on this path.
  useEffect(() => {
    if (shouldRedirectToUserSelect || initError) {
      useAppReadyStore.getState().markReady();
    }
  }, [shouldRedirectToUserSelect, initError]);

  // Wait until users AND playlists are fully loaded before navigating
  if (isLoading || !isPlaylistInitialized) {
    return <View style={{ flex: 1 }} />;
  }

  // Show error screen if initialization failed
  if (initError) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorTitle}>Failed to Initialize</ThemedText>
        <ThemedText style={styles.errorMessage} type="subtitle">
          {initError}
        </ThemedText>
        <ThemedText
          style={styles.retryButton}
          onPress={retryInit}
        >
          Tap to Retry
        </ThemedText>
      </ThemedView>
    );
  }

  if (users.length === 0) {
    return <Redirect href="/user-select" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  retryButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 16,
    padding: 12,
  },
});
