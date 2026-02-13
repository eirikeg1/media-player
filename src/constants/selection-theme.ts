import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassColors } from '@/lib/theme';

/**
 * Selection state colors for interactive components like buttons, cards, etc.
 * Provides consistent colors across the app for selected/unselected states.
 */
export function useSelectionColors() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const glass = isDark ? GlassColors.dark : GlassColors.light;

  const selectedBackground = useThemeColor({ light: '#007AFF', dark: '#3b82f6' }, 'tint');
  const unselectedBackground = glass.surface;
  const selectedBorder = selectedBackground;
  const unselectedBorder = glass.border;
  const selectedText = '#ffffff';
  const unselectedText = useThemeColor({}, 'text');
  const selectedIcon = '#ffffff';
  const unselectedIcon = useThemeColor({}, 'icon');
  const selectedSubtext = '#e5e7eb';
  const unselectedSubtext = useThemeColor({}, 'tabIconDefault');

  return {
    selected: {
      background: selectedBackground,
      border: selectedBorder,
      text: selectedText,
      icon: selectedIcon,
      subtext: selectedSubtext,
    },
    unselected: {
      background: unselectedBackground,
      border: unselectedBorder,
      text: unselectedText,
      icon: unselectedIcon,
      subtext: unselectedSubtext,
    },
  };
}

/**
 * Helper function to get selection colors based on selected state
 * Use this within a component that already calls useSelectionColors()
 */
export function getSelectionState(selectionColors: ReturnType<typeof useSelectionColors>, isSelected: boolean) {
  return isSelected ? selectionColors.selected : selectionColors.unselected;
}