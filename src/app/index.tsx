import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useUserStore } from '@/stores/user/user-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';

/**
 * Root index - redirects to user-select or tabs based on user state.
 * Renders an invisible View while loading so the splash screen stays visible.
 */
export default function Index() {
  const users = useUserStore(state => state.users);
  const isLoading = useUserStore(state => state.isLoading);
  const isPlaylistInitialized = usePlaylistStore(state => state.isInitialized);

  // Wait until users AND playlists are fully loaded before navigating
  if (isLoading || !isPlaylistInitialized) {
    return <View style={{ flex: 1 }} />;
  }

  if (users.length === 0) {
    return <Redirect href="/user-select" />;
  }

  return <Redirect href="/(tabs)" />;
}
