import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';

import { useHaptics } from '@/hooks/use-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  const haptics = useHaptics();

  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // A soft tap when pressing down on a tab.
        haptics.light();
        props.onPressIn?.(ev);
      }}
    />
  );
}
