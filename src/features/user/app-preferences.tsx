import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useUserStore } from '@/stores/user/user-store';
import { memo, useCallback } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

export const AppPreferences = memo(function AppPreferences() {
  const currentUser = useUserStore((state) => state.currentUser);
  const updateSettings = useUserStore((state) => state.updateSettings);

  const parentalControlEnabled = currentUser?.settings?.parentalControlEnabled ?? true;

  const handleToggleParentalControl = useCallback(
    (value: boolean) => {
      if (!currentUser) return;
      updateSettings(currentUser.id, { parentalControlEnabled: value });
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
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
});
