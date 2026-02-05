import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlaylistInit } from '@/hooks/use-playlist-init';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Initialize playlists and users on app load
  usePlaylistInit();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafeAreaProvider>
        <GestureHandlerRootView>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="user-select" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true, title: 'Modal' }} />
            <Stack.Screen
              name="video-player"
              options={{
                headerShown: false,
                orientation: 'landscape',
                gestureEnabled: false
              }}
            />
          </Stack>
          <StatusBar style="auto" />
          <PortalHost />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
