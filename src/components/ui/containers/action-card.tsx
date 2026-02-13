import { IconSymbol, IconSymbolName } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

export interface ActionCardProps {
  /**
   * Main icon displayed on the left side of the card
   */
  icon?: IconSymbolName;

  /**
   * Title text of the card
   */
  title?: string;

  /**
   * Optional subtitle text displayed below the title
   */
  subtitle?: string;

  /**
   * Optional icon displayed next to the subtitle
   */
  subtitleIcon?: IconSymbolName;

  /**
   * Callback when the card is pressed
   */
  onPress?: () => void;

  /**
   * Accessibility label for the card
   */
  accessibilityLabel?: string;

  /**
   * Accessibility hint for the card
   */
  accessibilityHint?: string;

  /**
   * Optional custom style for the card container
   */
  style?: ViewStyle;

  /**
   * Whether to show the chevron icon on the right
   * @default true
   */
  showChevron?: boolean;
}

/**
 * A reusable action card component that displays an icon, title, subtitle, and optional chevron.
 * Used for navigation items, action buttons, and list items.
 */
export const ActionCard = memo(function ActionCard({
  icon,
  title,
  subtitle,
  subtitleIcon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  showChevron = true,
}: ActionCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const glass = isDark ? GlassColors.dark : GlassColors.light;

  const cardStyle = [
    styles.card,
    {
      backgroundColor: glass.surface,
      borderColor: glass.border,
    },
    style,
  ];

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
    >
      <View style={styles.content}>
        {icon && (
          <View style={styles.iconContainer}>
            <IconSymbol name={icon} size={48} color={isDark ? '#7c869e' : '#5c6477'} />
          </View>
        )}

        {(title || subtitle) && (
          <View style={styles.textContainer}>
            {title && (
              <ThemedText type="defaultSemiBold" style={styles.title}>
                {title}
              </ThemedText>
            )}

            {subtitle && (
              <View style={styles.subtitleContainer}>
                {subtitleIcon && (
                  <IconSymbol
                    name={subtitleIcon}
                    size={16}
                    color={isDark ? '#7c869e' : '#5c6477'}
                  />
                )}
                <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
              </View>
            )}
          </View>
        )}

        {showChevron && (
          <IconSymbol
            name="chevron.right"
            size={24}
            color={isDark ? '#7c869e' : '#5c6477'}
            style={styles.chevronIcon}
          />
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 18,
  },
  subtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  chevronIcon: {
    marginLeft: 8,
  },
});
