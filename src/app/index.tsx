import { View, ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useUserStore } from '@/stores/user/user-store';

/**
 * Root index - redirects to user-select or tabs based on user state
 */
export default function Index() {
  const users = useUserStore(state => state.users);
  const isLoading = useUserStore(state => state.isLoading);

  console.log('[Index] Render - isLoading:', isLoading, 'users.length:', users.length);

  // Show loading while initializing
  if (isLoading) {
    console.log('[Index] Showing loading screen');
    return (
      <View className="flex-1 bg-white dark:bg-gray-950 items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-gray-600 dark:text-gray-400">Loading...</Text>
      </View>
    );
  }

  // Redirect based on whether users exist
  if (users.length === 0) {
    console.log('[Index] No users, redirecting to user-select');
    return <Redirect href="/user-select" />;
  }

  console.log('[Index] Users exist, redirecting to tabs');
  return <Redirect href="/(tabs)" />;
}
