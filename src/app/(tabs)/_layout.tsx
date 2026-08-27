import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { HapticTab } from '@/components/ui/controls/haptic-tab';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { MiniPlayerBar } from '@/features/video/components/mini-player-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, GlassColors } from '@/lib/theme';
import { useUserStore } from '@/stores/user/user-store';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const settings = useUserStore((state) => state.currentUser?.settings);

  return (
    <Tabs
      tabBar={(props) => (
        <>
          <MiniPlayerBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
          backgroundColor: 'transparent',
          elevation: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={isDark ? 80 : 60}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, {
              backgroundColor: isDark ? 'rgba(10, 14, 23, 0.98)' : 'rgba(240, 242, 248, 0.98)',
            }]}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: settings?.showHomeTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          href: settings?.showLiveTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="play.tv" color={color} />,
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          href: settings?.showVideosTab === false ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="film.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sports"
        options={{
          title: 'Sports',
          href: settings?.showSportsTab === false ? null : undefined,
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
