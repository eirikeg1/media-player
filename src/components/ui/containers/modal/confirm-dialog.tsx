import { Button, type ButtonVariant } from '@/components/ui/controls/button';
import { ThemedText } from '@/components/ui/display/themed-text';
import { StyleSheet, View } from 'react-native';
import { AnimatedModal } from './animated-modal';

interface ConfirmDialogAction {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
}

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  actions: ConfirmDialogAction[];
}

export function ConfirmDialog({ visible, title, message, actions }: ConfirmDialogProps) {
  return (
    <AnimatedModal visible={visible}>
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
            onPress={action.onPress}
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
