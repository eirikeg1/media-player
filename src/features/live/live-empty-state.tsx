import { StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';

interface LiveEmptyStateProps {
  searchText: string;
  selectedGroupName: string;
  iconColor: string;
}

export function LiveEmptyState({ searchText, selectedGroupName, iconColor }: LiveEmptyStateProps) {
  const isSearching = searchText.trim().length > 0;
  const isFiltering = !!selectedGroupName;

  return (
    <ThemedView style={styles.emptyContainer}>
      <IconSymbol
        name={isSearching ? 'magnifyingglass' : 'tv'}
        size={64}
        color={iconColor}
      />
      <ThemedText style={styles.emptyTitle}>
        {isSearching ? 'No Results' : 'No Channels'}
      </ThemedText>
      <ThemedText style={styles.emptyText} type="subtitle">
        {isSearching
          ? `No channels found for "${searchText}"`
          : isFiltering
          ? `No channels found in "${selectedGroupName}" group`
          : "This playlist doesn't contain any channels"}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    minHeight: 200,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});