import { StyleSheet, View } from 'react-native';

import { PlaylistManager } from '@/features/playlist';
import { AppPreferences } from '@/features/user/app-preferences';
import { UserSettings } from '@/features/user/user-settings';
import ParallaxScrollView from '@/components/ui/containers/parallax-scroll-view';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedView } from '@/components/ui/display/themed-view';

export default function SettingsScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="gearshape.fill"
          style={styles.headerImage}
        />
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
  playlistContainer: {
  },
});
