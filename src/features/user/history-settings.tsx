import { ConfirmDialog } from '@/components/ui/containers/modal/confirm-dialog';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { saveSetting } from '@/features/user/save-setting';
import { useHaptics } from '@/hooks/use-haptics';
import { useNowSeconds } from '@/hooks/use-now-seconds';
import { useUserStore } from '@/stores/user/user-store';
import { SWITCH_TRACK, TINT } from '@/lib/theme';
import { memo, useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** When private mode stops, as a short local time (or null once it has). */
function formatExpiry(expiresAt: string | undefined, nowSeconds: number): string | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const expiryMs = expiry.getTime();
  if (Number.isNaN(expiryMs) || expiryMs <= nowSeconds * 1000) return null;

  return expiry.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const HistorySettings = memo(function HistorySettings() {
  const userId = useUserStore((state) => state.currentUser?.id);
  const clearViewingHistory = useUserStore((state) => state.clearViewingHistory);
  const privateModeExpiresAt = useUserStore(
    (state) => state.currentUser?.settings?.privateModeExpiresAt,
  );

  // Private mode expires on its own; without a tick the switch would keep
  // claiming it is on long after viewing history started being recorded again.
  const haptics = useHaptics();
  const nowSeconds = useNowSeconds();
  const expiryLabel = formatExpiry(privateModeExpiresAt, nowSeconds);
  const privateModeActive = expiryLabel !== null;

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
    haptics.warning();
    setShowClearHistoryDialog(true);
  }, [haptics]);

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
            {expiryLabel && (
              <ThemedText style={styles.subLabel}>Until {expiryLabel}</ThemedText>
            )}
          </View>
          <Switch
            value={privateModeActive}
            onValueChange={handleTogglePrivateMode}
            trackColor={{ false: SWITCH_TRACK, true: TINT }}
            accessibilityLabel="Toggle private mode"
          />
        </View>

        <Pressable
          style={styles.preferenceRow}
          onPress={handleClearHistory}
          accessibilityRole="button"
          accessibilityLabel="Clear viewing history"
        >
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
            onPress: async () => {
              await saveSetting(
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
            onPress: async () => {
              try {
                await clearViewingHistory(userId);
              } catch (error) {
                console.error('[HistorySettings] Failed to clear history:', error);
                Alert.alert(
                  "Couldn't clear history",
                  error instanceof Error ? error.message : 'Please try again.',
                );
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
  subLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  destructiveLabel: {
    color: '#FF3B30',
  },
});
