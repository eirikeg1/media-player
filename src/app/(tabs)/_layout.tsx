import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { HapticTab } from '@/components/ui/controls/haptic-tab';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { whenLandingReady } from '@/features/launch/landing-readiness';
import { firstVisibleTabKey } from '@/features/user/visible-tabs';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, GlassColors, THEME, translucent } from '@/lib/theme';
import { useAppReadyStore, useTabBarStore } from '@/stores/app';
import { useUserStore } from '@/stores/user/user-store';

/**
 * The tab bar sits over a blur, so it needs the background token with a touch of
 * transparency rather than a hardcoded `rgba()` that drifts from the theme.
 */
const TAB_BAR_BACKGROUND = {
  light: translucent(THEME.light.background, 0.98),
  dark: translucent(THEME.dark.background, 0.98),
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  // Primitive selectors: the whole user (and its settings object) is replaced on
  // every settings write, which would re-render the tab bar for unrelated changes.
  const showHomeTab = useUserStore((s) => s.currentUser?.settings?.showHomeTab);
  const showLiveTab = useUserStore((s) => s.currentUser?.settings?.showLiveTab);
  const showVideosTab = useUserStore((s) => s.currentUser?.settings?.showVideosTab);
  const showSportsTab = useUserStore((s) => s.currentUser?.settings?.showSportsTab);
  // Derived inside the selector so this subscription yields a string: the whole
  // settings object is replaced on every write, and the landing tab is what the
  // redirect in `app/index` picked.
  const landingTab = useUserStore((s) => firstVisibleTabKey(s.currentUser?.settings));

  // The mini player bar is rendered by the root layout so it survives a detail
  // route being presented over the tabs, which leaves it with no way of its own
  // to know where the tab bar ends — or whether the tab bar is even on screen.
  // Both facts are published from here, the one place that knows them.
  const isTabRouteFocused = useIsFocused();
  useEffect(() => {
    useTabBarStore.getState().setTabRouteFocused(isTabRouteFocused);
    return () => useTabBarStore.getState().setTabRouteFocused(false);
  }, [isTabRouteFocused]);

  const handleTabBarLayout = useCallback((event: LayoutChangeEvent) => {
    useTabBarStore.getState().setHeight(event.nativeEvent.layout.height);
  }, []);

  // Reaching the tab group is not the same as having something to show: the
  // screen the redirect landed on still loads its own first page. The splash
  // stays up until that screen reports itself populated (capped inside
  // `whenLandingReady`, with the root layout's 10s backstop behind it), so the
  // app is revealed exactly once, already filled in.
  useEffect(() => {
    void whenLandingReady(landingTab).then(() => useAppReadyStore.getState().markReady());
  }, [landingTab]);

  return (
    <Tabs
      tabBar={(props) => (
        // Absolutely positioned, so screens stay full-height and reserve the
        // space the bar covers via `useChromeInsets()`. Measured here because
        // the root layout's mini player bar docks on top of it.
        <View style={styles.barStack} onLayout={handleTabBarLayout}>
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
          backgroundColor: 'transparent',
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={isDark ? GlassColors.dark.chromeBlur : GlassColors.light.chromeBlur}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, {
              backgroundColor: TAB_BAR_BACKGROUND[isDark ? 'dark' : 'light'],
            }]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: showHomeTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          href: showLiveTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="play.tv" color={color} />,
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          href: showVideosTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="film.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sports"
        options={{
          title: 'Sports',
          href: showSportsTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sportscourt.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barStack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
