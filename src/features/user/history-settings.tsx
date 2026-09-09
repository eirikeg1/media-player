import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { saveSetting } from '@/features/user/save-setting';
import { useUserStore } from '@/stores/user/user-store';
import { isPrivateModeActive } from '@/types/user.types';
import { memo, useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const HistorySettings = memo(function HistorySettings() {
  const userId = useUserStore((state) => state.currentUser?.id);
  const clearViewingHistory = useUserStore((state) => state.clearViewingHistory);
  const privateModeExpiresAt = useUserStore(
    (state) => state.currentUser?.settings?.privateModeExpiresAt,
  );

  const privateModeActive = isPrivateModeActive({ privateModeExpiresAt });
  const [showPrivateModeDialog, setShowPrivateModeDialog] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);

  const handleTogglePrivateMode = useCallback((value: boolean) => {
    if (value) {
      setShowPrivateModeDialog(true);
    } else {
      void saveSetting({ privateModeExpiresAt: undefined }, 'Private Mode');
    }
  }, []);

  const handleClearHistory = useCallback(() => {
    setShowClearHistoryDialog(true);
  }, []);

  if (!userId) {
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
              void saveSetting(
                {
                  privateModeExpiresAt: new Date(
                    Date.now() + TWENTY_FOUR_HOURS_MS,
                  ).toISOString(),
                },
                'Private Mode',
              );
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
              clearViewingHistory(userId).catch((error: unknown) => {
                console.error('[HistorySettings] Failed to clear history:', error);
                Alert.alert(
                  "Couldn't clear history",
                  error instanceof Error ? error.message : 'Please try again.',
                );
              });
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
