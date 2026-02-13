import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { memo } from 'react';
import { StyleSheet, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { StyleProp } from 'react-native/Libraries/StyleSheet/StyleSheet';
import { IconSymbol, IconSymbolName } from '../display/icon-symbol';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
  /**
   * Button text content
   */
  title: string;

  /**
   * Callback when button is pressed
   */
  onPress?: () => void;

  /**
   * Visual variant of the button
   * @default 'primary'
   */
  variant?: ButtonVariant;

  /**
   * Size of the button
   * @default 'medium'
   */
  size?: ButtonSize;

  /**
   * Optional icon to display before the text
   */
  icon?: IconSymbolName;

  /**
   * Whether the button is disabled
   * @default false
   */
  disabled?: boolean;

  /**
   * Whether the button should take full width
   * @default false
   */
  fullWidth?: boolean;

  /**
   * Custom style for the button container
   */
  style?: ViewStyle;

  /**
   * Accessibility label
   */
  accessibilityLabel?: string;

  /**
   * Accessibility hint
   */
  accessibilityHint?: string;
}

/**
 * A reusable button component with multiple variants and sizes
 */
export const Button = memo(function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getButtonColors = () => {
    const glass = isDark ? GlassColors.dark : GlassColors.light;

    if (disabled) {
      return {
        backgroundColor: glass.surface,
        textColor: isDark ? '#8a90a0' : '#556',
        iconColor: isDark ? '#8a90a0' : '#556',
      };
    }

    switch (variant) {
      case 'primary':
        return {
          backgroundColor: '#007AFF',
          textColor: '#FFFFFF',
          iconColor: '#FFFFFF',
        };
      case 'secondary':
        return {
          backgroundColor: glass.surface,
          textColor: isDark ? '#ffffff' : '#000000',
          iconColor: isDark ? '#ffffff' : '#000000',
        };
      case 'danger':
        return {
          backgroundColor: '#FF3B30',
          textColor: '#FFFFFF',
          iconColor: '#FFFFFF',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          textColor: isDark ? '#ffffff' : '#000000',
          iconColor: isDark ? '#ffffff' : '#000000',
        };
      default:
        return {
          backgroundColor: '#007AFF',
          textColor: '#FFFFFF',
          iconColor: '#FFFFFF',
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          paddingHorizontal: 12,
          paddingVertical: 6,
          fontSize: 14,
          iconSize: 16,
        };
      case 'medium':
        return {
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontSize: 16,
          iconSize: 18,
        };
      case 'large':
        return {
          paddingHorizontal: 20,
          paddingVertical: 14,
          fontSize: 18,
          iconSize: 20,
        };
      default:
        return {
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontSize: 16,
          iconSize: 18,
        };
    }
  };

  const colors = getButtonColors();
  const sizeStyles = getSizeStyles();

  const buttonStyle: StyleProp<ViewStyle> = [
    styles.button,
    {
      backgroundColor: colors.backgroundColor,
      paddingHorizontal: sizeStyles.paddingHorizontal,
      paddingVertical: sizeStyles.paddingVertical,
      opacity: disabled ? 0.5 : 1,
      alignSelf: fullWidth ? 'stretch' : 'flex-start',
    },
    variant === 'ghost' && {
      borderWidth: 1,
      borderColor: isDark ? GlassColors.dark.border : GlassColors.light.border,
    },
    style,
  ];

  const textStyle: TextStyle = {
    color: colors.textColor,
    fontSize: sizeStyles.fontSize,
    fontWeight: '600',
  };

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      {icon && (
        <IconSymbol
          name={icon}
          size={sizeStyles.iconSize}
          color={colors.iconColor}
          style={styles.icon}
        />
      )}
      <ThemedText style={[styles.text, textStyle]}>{title}</ThemedText>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    minHeight: 44,
  },
  text: {
    textAlign: 'center',
  },
  icon: {
    marginRight: 8,
  },
});