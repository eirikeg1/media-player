import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import 'react-native-reanimated';
import '../global.css';
// Side-effect import: defines the sports background-refresh task. The
// definition has to run in global scope on every launch — including the
// headless one the OS starts for a wake — or the OS finds no executor for the
// registered task name.
import '@/features/sports/background/expo-scheduler';

import { useCallback, useEffect, useState } from 'react';

import { AnimatedSplashLoader } from '@/components/ui/display/animated-splash-loader';
import { waitForSportsWarm } from '@/features/sports/background/foreground-refresh';
import { useBackgroundRefresh } from '@/features/sports/background/use-background-refresh';
import { MiniPlayerBar } from '@/features/video/components/mini-player-bar';
import { PlaybackSessionHost } from '@/features/video/components/playback-session-host';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDeferredStartupWork } from '@/hooks/use-deferred-startup-work';
import { useEpgSync } from '@/hooks/use-epg-sync';
import { runInit, usePlaylistInit } from '@/hooks/use-playlist-init';
import { usePlaylistSync } from '@/hooks/use-playlist-sync';
import { NAV_THEME } from '@/lib/theme';
import { useAppReadyStore } from '@/stores/app';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // The splash overlay animates an infinite loop, so it has to leave the tree
  // once it has faded rather than render null in place.
  const [splashVisible, setSplashVisible] = useState(true);
  const hideSplash = useCallback(() => setSplashVisible(false), []);

  // Initialize playlists and users on app load
  usePlaylistInit();

  // Start periodic playlist sync scheduler
  usePlaylistSync();

  // Start periodic EPG sync scheduler
  useEpgSync();

  // Keep the sports background refresh registered with the OS
  useBackgroundRefresh();

  // Low-priority startup work, held back until the UI is on screen
  useDeferredStartupWork();

  // Safety net for a start-up that never reaches a screen: reveal the UI once
  // initialization has settled. Revealing while it is still running would show
  // screens with no users, no playlists and no favourites — and hide the error
  // screen the failure path renders — so a slow boot keeps the splash instead.
  //
  // Today's sports schedule is started by the same sequence and joined here
  // rather than awaited inside it: the loading screen is already up, so a few
  // more seconds of it cost nothing, and `waitForSportsWarm` caps the wait so a
  // provider that is down can never hold the UI back.
  useEffect(() => {
    const timeout = setTimeout(() => {
      void runInit()
        .then(() => waitForSportsWarm())
        .finally(() => useAppReadyStore.getState().markReady());
    }, 10_000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? NAV_THEME.dark : NAV_THEME.light}>
      <SafeAreaProvider>
        <GestureHandlerRootView>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="user-select" />
            <Stack.Screen name="(tabs)" />
            {/* Detail surfaces (movie, series, channel, match…) are presented
                over the tab they were opened from, which keeps the grid mounted
                with its scroll position behind them — and, unlike the React
                Native `Modal`s they replace, keeps them in router history, so
                the player pushed from inside one comes back here. The group's
                own stack cannot carry this option: its first screen has nothing
                behind it to be presented over. */}
            <Stack.Screen
              name="(detail)"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
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
          {/* Above the whole stack rather than inside the tab bar: minimizing
              the player leaves you on whatever route launched it — a detail
              sheet as often as a tab — and the bar has to stay reachable there.
              It docks itself on top of the tab bar while the tabs are on
              screen (see `useTabBarStore`). */}
          <MiniPlayerBar />
          {/* Session-scoped bookkeeping (viewing history) that must survive
              the video screen unmounting into the mini player bar. */}
          <PlaybackSessionHost />
          {splashVisible && <AnimatedSplashLoader onFadeComplete={hideSplash} />}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
