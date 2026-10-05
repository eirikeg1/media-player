import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, type ButtonVariant } from '@/components/ui/controls/button';
import { IconSymbol, type IconSymbolName } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

import { stateStyles } from './state-styles';

export interface EmptyStateAction {
  title: string;
  onPress: () => void;
  icon?: IconSymbolName;
  /** @default 'secondary' */
  variant?: ButtonVariant;
}

export interface EmptyStateProps {
  icon: IconSymbolName;
  title: string;
  message?: string;
  action?: EmptyStateAction;
  /**
   * Pad for the notch and home indicator. Needed when the state fills a screen
   * on its own; a state rendered as a list's empty cell inherits the list's
   * insets and must leave this off.
   */
  safeArea?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Nothing here" state: an icon, a headline, an optional explanation and an
 * optional call to action. Use this rather than a hand-rolled centred `View` so
 * every tab's empty screen reads the same.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  safeArea = false,
  style,
}: EmptyStateProps) {
  const iconColor = useThemeColor({}, 'icon');
  const insets = useSafeAreaInsets();

  return (
    <ThemedView
      style={[
        stateStyles.container,
        safeArea && { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        style,
      ]}
    >
      <IconSymbol name={icon} size={64} color={iconColor} />
      <ThemedText style={stateStyles.title}>{title}</ThemedText>
      {message ? (
        <ThemedText style={stateStyles.message} type="body">
          {message}
        </ThemedText>
      ) : null}
      {action ? (
        <View style={stateStyles.actions}>
          <Button
            title={action.title}
            icon={action.icon}
            variant={action.variant ?? 'secondary'}
            onPress={action.onPress}
          />
        </View>
      ) : null}
    </ThemedView>
  );
}
