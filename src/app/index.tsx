import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { ErrorState } from '@/components/ui/display/state';
import { firstVisibleTabHref } from '@/features/user/visible-tabs';
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
  const settings = useUserStore(state => state.currentUser?.settings);
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
      <ErrorState
        title="Failed to Initialize"
        message={initError}
        // retryInit reports failures through `initError`; the promise itself
        // must not be left floating.
        onRetry={() => void retryInit()}
      />
    );
  }

  // First launch: a redirect, not a push, so back from the profile wizard exits
  // the app. That is the policy — the wizard is the first screen, with nowhere
  // behind it to go, and leaving it half-finished would land on this same
  // redirect anyway.
  if (users.length === 0) {
    return <Redirect href="/user-select" />;
  }

  // Home may be hidden, in which case `/(tabs)` would land on a screen with no
  // tab of its own.
  return <Redirect href={firstVisibleTabHref(settings)} />;
}
