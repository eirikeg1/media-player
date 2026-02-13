import { ThemedText } from '@/components/ui/display/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';
import { StyleSheet, View } from 'react-native';

interface CategoryPillProps {
  label: string;
}

export function CategoryPill({ label }: CategoryPillProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const glass = isDark ? GlassColors.dark : GlassColors.light;

  return (
    <View style={[styles.pill, { backgroundColor: glass.surfaceElevated, borderColor: glass.border }]}>
      <ThemedText style={styles.pillText}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
