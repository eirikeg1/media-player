import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export interface SpinnerProps {
  /** @default 'small' */
  size?: 'small' | 'large';
  /**
   * Overrides the theme tint. Only for a spinner on a surface that ignores the
   * colour scheme (a fixed-dark sheet, a coloured button).
   */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** @default 'Loading' */
  accessibilityLabel?: string;
}

/**
 * The app's busy indicator. Wraps `ActivityIndicator` so every spinner picks up
 * the theme tint instead of a per-call-site colour, and is announced to screen
 * readers.
 */
export function Spinner({
  size = 'small',
  color,
  style,
  accessibilityLabel = 'Loading',
}: SpinnerProps) {
  const tintColor = useThemeColor({}, 'tint');

  return (
    <ActivityIndicator
      size={size}
      color={color ?? tintColor}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
