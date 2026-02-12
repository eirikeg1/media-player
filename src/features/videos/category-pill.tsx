import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { StyleSheet, View } from 'react-native';

interface CategoryPillProps {
  label: string;
}

export function CategoryPill({ label }: CategoryPillProps) {
  const pillBackground = useThemeColor(
    { light: '#e8e8e8', dark: '#333' },
    'background'
  );

  return (
    <View style={[styles.pill, { backgroundColor: pillBackground }]}>
      <ThemedText style={styles.pillText}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
