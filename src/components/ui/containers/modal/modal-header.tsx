import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';
import { StyleSheet, TouchableOpacity } from 'react-native';

export interface ModalHeaderProps {
  /**
   * Header title text
   */
  title: string;

  /**
   * Callback when close button is pressed
   */
  onClose: () => void;

  /**
   * Optional subtitle text
   */
  subtitle?: string;

  /**
   * Show close button
   * @default true
   */
  showCloseButton?: boolean;
}

export function ModalHeader({
  title,
  onClose,
  subtitle,
  showCloseButton = true,
}: ModalHeaderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const borderColor = isDark ? GlassColors.dark.border : GlassColors.light.border;
  const textColor = useThemeColor({}, 'text');

  return (
    <ThemedView style={[styles.header, { borderBottomColor: borderColor }]}>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          {title}
        </ThemedText>
        {subtitle && (
          <ThemedText style={[styles.subtitle, { color: textColor }]}>
            {subtitle}
          </ThemedText>
        )}
      </ThemedView>

      {showCloseButton && (
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close modal"
          accessibilityHint="Close the modal"
        >
          <IconSymbol name="xmark" size={24} color={textColor} />
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  titleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
    opacity: 0.8,
  },
  closeButton: {
    padding: 4,
  },
});