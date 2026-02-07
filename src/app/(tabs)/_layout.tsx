import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/ui/controls/haptic-tab';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { CastMiniPlayerBar } from '@/features/video/components/cast-mini-player-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/lib/theme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      tabBar={(props) => (
        <>
          <CastMiniPlayerBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="play.tv" color={color} />,
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
