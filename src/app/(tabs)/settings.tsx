import { StyleSheet, View } from 'react-native';

import { PlaylistManager } from '@/features/playlist';
import { AppPreferences } from '@/features/user/app-preferences';
import { HistorySettings } from '@/features/user/history-settings';
import { UserSettings } from '@/features/user/user-settings';
import { SportsPreferences } from '@/features/sports/sports-preferences';
import { ThemeSettings } from '@/features/theme/theme-settings';
import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useHeaderBackground } from '@/hooks/use-header-background';
import { Image } from 'expo-image';

export default function SettingsScreen() {
  const customHeader = useHeaderBackground('settings');

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        customHeader ? (
          <Image source={customHeader} style={styles.headerBackground} contentFit="cover" />
        ) : (
          <IconSymbol
            size={310}
            color="#808080"
            name="gearshape.fill"
            style={styles.headerImage}
          />
        )
      }
    >
      {/* User Settings Section */}
      <ThemedView>
        <UserSettings />
      </ThemedView>

      {/* App Preferences Section */}
      <ThemedView>
        <AppPreferences />
      </ThemedView>

      {/* Sports Section */}
      <ThemedView>
        <SportsPreferences />
      </ThemedView>

      {/* Theme Customization Section */}
      <ThemedView>
        <ThemeSettings />
      </ThemedView>

      {/* History Settings Section */}
      <ThemedView>
        <HistorySettings />
      </ThemedView>

      {/* Playlist Management Section */}
      <ThemedView>
        <View style={styles.playlistContainer}>
          <PlaylistManager />
        </View>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  headerBackground: {
    width: '100%',
    height: '100%',
  },
  playlistContainer: {
  },
});
