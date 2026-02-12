import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useUserStore } from '@/stores/user/user-store';
import { memo, useCallback } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

export const AppPreferences = memo(function AppPreferences() {
  const currentUser = useUserStore((state) => state.currentUser);
  const updateSettings = useUserStore((state) => state.updateSettings);

  const parentalControlEnabled = currentUser?.settings?.parentalControlEnabled ?? true;
  const showHomeTab = currentUser?.settings?.showHomeTab ?? true;
  const showLiveTab = currentUser?.settings?.showLiveTab ?? true;
  const showVideosTab = currentUser?.settings?.showVideosTab ?? true;

  const handleToggleParentalControl = useCallback(
    (value: boolean) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { parentalControlEnabled: value });
    },
    [currentUser, updateSettings],
  );

  const handleToggleHomeTab = useCallback(
    (value: boolean) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { showHomeTab: value });
    },
    [currentUser, updateSettings],
  );

  const handleToggleLiveTab = useCallback(
    (value: boolean) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { showLiveTab: value });
    },
    [currentUser, updateSettings],
  );

  const handleToggleVideosTab = useCallback(
    (value: boolean) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { showVideosTab: value });
    },
    [currentUser, updateSettings],
  );

  if (!currentUser) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          Preferences
        </ThemedText>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Hide Adult Content</ThemedText>
          </View>
          <Switch
            value={parentalControlEnabled}
            onValueChange={handleToggleParentalControl}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Hide adult content"
          />
        </View>

        <ThemedText type="subtitle" style={styles.header}>
          Visible Tabs
        </ThemedText>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Home</ThemedText>
          </View>
          <Switch
            value={showHomeTab}
            onValueChange={handleToggleHomeTab}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Show Home tab"
          />
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Live</ThemedText>
          </View>
          <Switch
            value={showLiveTab}
            onValueChange={handleToggleLiveTab}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Show Live tab"
          />
        </View>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Videos</ThemedText>
          </View>
          <Switch
            value={showVideosTab}
            onValueChange={handleToggleVideosTab}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Show Videos tab"
          />
        </View>
      </View>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 0,
  },
  header: {
    marginBottom: 8,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
