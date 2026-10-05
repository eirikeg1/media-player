import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/controls/button';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

import { stateStyles } from './state-styles';

export interface ErrorStateProps {
  /** What went wrong, in the user's words. */
  message: string;
  /**
   * Headline above the message. Omit for an error rendered inside a card or
   * table, where the surrounding UI already says what failed.
   */
  title?: string;
  onRetry?: () => void;
  /** Escape hatch for a screen the user would otherwise be stuck on. */
  onBack?: () => void;
  /**
   * Render tight and iconless, for an error inside an existing card or table
   * instead of on a screen of its own.
   */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Failure state with the recovery affordances that keep a screen from becoming a
 * dead end. A failure must never be shown through {@link EmptyState}: "nothing
 * here" and "we couldn't load this" are different things to the user.
 */
export function ErrorState({
  message,
  title,
  onRetry,
  onBack,
  inline = false,
  style,
}: ErrorStateProps) {
  const iconColor = useThemeColor({}, 'icon');
  const destructiveColor = useThemeColor({}, 'destructive');

  const actions =
    onRetry || onBack ? (
      <View style={inline ? undefined : stateStyles.actions}>
        {onBack && (
          <Button title="Go Back" icon="chevron.left" variant="ghost" onPress={onBack} />
        )}
        {onRetry && (
          <Button title="Retry" icon="arrow.clockwise" variant="secondary" onPress={onRetry} />
        )}
      </View>
    ) : null;

  if (inline) {
    return (
      <View style={[stateStyles.inlineContainer, style]}>
        <ThemedText style={[stateStyles.inlineMessage, { color: destructiveColor }]}>
          {message}
        </ThemedText>
        {actions}
      </View>
    );
  }

  return (
    <ThemedView style={[stateStyles.container, style]}>
      <IconSymbol name="exclamationmark.triangle" size={64} color={iconColor} />
      {title ? <ThemedText style={stateStyles.title}>{title}</ThemedText> : null}
      <ThemedText
        style={[stateStyles.message, !title && stateStyles.untitledMessage]}
        type="body"
      >
        {message}
      </ThemedText>
      {actions}
    </ThemedView>
  );
}
