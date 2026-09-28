import { Button, type ButtonVariant } from '@/components/ui/controls/button';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AnimatedModal } from './animated-modal';

interface ConfirmDialogAction {
  title: string;
  /** May be async: the dialog stays disabled until the returned promise settles. */
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
}

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  actions: ConfirmDialogAction[];
  /** What a backdrop tap and Android back do. Defaults to `findCancelAction`. */
  onCancel?: () => void;
}

/**
 * The action that backing out of the dialog stands for: its single plain-styled
 * choice ("Cancel", "From Beginning"). A `primary` or `danger` action is the one
 * the dialog is asking about, so it is never it, and a dialog offering two plain
 * choices has no unambiguous way out — it waits for a deliberate answer.
 */
function findCancelAction(actions: ConfirmDialogAction[]): ConfirmDialogAction | undefined {
  const plain = actions.filter((action) => (action.variant ?? 'secondary') === 'secondary');
  return plain.length === 1 ? plain[0] : undefined;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  actions,
  onCancel,
}: ConfirmDialogProps) {
  // Confirmations guard destructive work, so the second tap of a double tap
  // must not run the action again — it would act on something already gone.
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setBusy(false);
  }, [visible]);

  const handlePress = useCallback(async (action: ConfirmDialogAction) => {
    setBusy(true);
    try {
      await action.onPress();
    } catch (error) {
      console.error(`[ConfirmDialog] Action "${action.title}" failed:`, error);
    } finally {
      setBusy(false);
    }
  }, []);

  const fallbackCancel = findCancelAction(actions);
  const cancel = onCancel ?? (fallbackCancel ? () => void handlePress(fallbackCancel) : undefined);

  return (
    // Backing out is a cancel, and is withdrawn while an action runs for the
    // same reason the buttons are disabled.
    <AnimatedModal visible={visible} onClose={busy ? undefined : cancel}>
      <ThemedText type="subtitle" style={styles.title}>
        {title}
      </ThemedText>
      <View style={styles.body}>
        <ThemedText style={styles.message}>{message}</ThemedText>
      </View>
      <View style={styles.buttonRow}>
        {actions.map((action) => (
          <Button
            key={action.title}
            title={action.title}
            onPress={() => void handlePress(action)}
            disabled={busy}
            variant={action.variant ?? 'secondary'}
            style={styles.button}
          />
        ))}
      </View>
    </AnimatedModal>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    fontSize: 15,
    opacity: 0.8,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
  },
});
