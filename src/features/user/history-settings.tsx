import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useUserStore } from '@/stores/user/user-store';
import { isPrivateModeActive } from '@/types/user.types';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const HistorySettings = memo(function HistorySettings() {
  const currentUser = useUserStore((state) => state.currentUser);
  const updateSettings = useUserStore((state) => state.updateSettings);
  const clearViewingHistory = useUserStore((state) => state.clearViewingHistory);

  const privateModeActive = isPrivateModeActive(currentUser?.settings);
  const [showPrivateModeDialog, setShowPrivateModeDialog] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);

  const handleTogglePrivateMode = useCallback(
    (value: boolean) => {
      if (!currentUser) return;

      if (value) {
        setShowPrivateModeDialog(true);
      } else {
        updateSettings(currentUser.id, {
          privateModeExpiresAt: undefined,
        });
      }
    },
    [currentUser, updateSettings],
  );

  const handleClearHistory = useCallback(() => {
    if (!currentUser) return;
    setShowClearHistoryDialog(true);
  }, [currentUser]);

  if (!currentUser) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle" style={styles.header}>
          History
        </ThemedText>

        <View style={styles.preferenceRow}>
          <View style={styles.labelContainer}>
            <ThemedText style={styles.label}>Private Mode</ThemedText>
          </View>
          <Switch
            value={privateModeActive}
            onValueChange={handleTogglePrivateMode}
            trackColor={{ false: '#767577', true: '#007AFF' }}
            accessibilityLabel="Toggle private mode"
          />
        </View>

        <Pressable style={styles.preferenceRow} onPress={handleClearHistory}>
          <View style={styles.labelContainer}>
            <ThemedText style={[styles.label, styles.destructiveLabel]}>
              Clear History
            </ThemedText>
          </View>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={showPrivateModeDialog}
        title="Enable Private Mode"
        message="While private mode is active, your viewing activity will not be recorded. This will last for 24 hours."
        actions={[
          {
            title: 'Cancel',
            onPress: () => setShowPrivateModeDialog(false),
          },
          {
            title: 'Enable',
            variant: 'primary',
            onPress: () => {
              if (currentUser) {
                updateSettings(currentUser.id, {
                  privateModeExpiresAt: new Date(
                    Date.now() + TWENTY_FOUR_HOURS_MS,
                  ).toISOString(),
                });
              }
              setShowPrivateModeDialog(false);
            },
          },
        ]}
      />

      <ConfirmDialog
        visible={showClearHistoryDialog}
        title="Clear Viewing History"
        message="This will permanently delete all your viewing history, including Continue Watching and Recently Watched data. This cannot be undone."
        actions={[
          {
            title: 'Cancel',
            onPress: () => setShowClearHistoryDialog(false),
          },
          {
            title: 'Clear',
            variant: 'danger',
            onPress: () => {
              if (currentUser) {
                clearViewingHistory(currentUser.id);
              }
              setShowClearHistoryDialog(false);
            },
          },
        ]}
      />
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
  destructiveLabel: {
    color: '#FF3B30',
  },
});
