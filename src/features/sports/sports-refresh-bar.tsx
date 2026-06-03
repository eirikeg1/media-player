import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ImportProgressBar } from '@/features/playlist/import-progress-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useImportProgressStore } from '@/stores/playlist/import-progress-store';
import { usePlaylistStore } from '@/stores/playlist/playlist-store';
import { memo, useCallback } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

/**
 * Refreshes the active playlist from the sports page, reusing the same loading
 * bar and phase message shown in settings (both driven by the global
 * import-progress store). Hidden when no playlist is active.
 */
export const SportsRefreshBar = memo(function SportsRefreshBar() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const iconColor = isDark ? '#7c869e' : '#5c6477';

  const activePlaylistId = usePlaylistStore((s) => s.activePlaylistId);
  const refreshPlaylist = usePlaylistStore((s) => s.refreshPlaylist);

  const phase = useImportProgressStore((s) => s.phase);
  const phaseLabel = useImportProgressStore((s) => s.phaseLabel);
  const progressPlaylistId = useImportProgressStore((s) => s.activePlaylistId);
  const isImporting =
    phase !== null && phase !== 'complete' && progressPlaylistId === activePlaylistId;

  const handleRefresh = useCallback(async () => {
    if (!activePlaylistId) return;
    try {
      await refreshPlaylist(activePlaylistId);
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to refresh playlist'
      );
    }
  }, [activePlaylistId, refreshPlaylist]);

  if (!activePlaylistId) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ThemedText style={styles.label} numberOfLines={1}>
          {isImporting ? phaseLabel : 'Refresh playlist'}
        </ThemedText>
        <TouchableOpacity
          style={styles.button}
          onPress={handleRefresh}
          disabled={isImporting}
          accessibilityRole="button"
          accessibilityLabel="Refresh playlist"
          accessibilityHint="Re-fetch and update the active playlist channels"
          accessibilityState={{ disabled: isImporting }}
        >
          <IconSymbol name="arrow.clockwise" size={18} color={iconColor} />
        </TouchableOpacity>
      </View>
      <ImportProgressBar playlistId={activePlaylistId} compact />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 14,
    opacity: 0.8,
  },
  button: {
    padding: 6,
  },
});
