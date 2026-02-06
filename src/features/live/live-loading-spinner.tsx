import { ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ui/display/themed-view';

interface LiveLoadingSpinnerProps {
  isLoading: boolean;
  tintColor: string;
}

export function LiveLoadingSpinner({ isLoading, tintColor }: LiveLoadingSpinnerProps) {
  if (!isLoading) return null;

  return (
    <ThemedView style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={tintColor} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 50,
    minHeight: 200,
  },
});