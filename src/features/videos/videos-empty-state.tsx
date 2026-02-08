import { StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { ThemedText } from '@/components/ui/display/themed-text';
import { ThemedView } from '@/components/ui/display/themed-view';

interface VideosEmptyStateProps {
  searchText: string;
  selectedGroupName: string;
  iconColor: string;
  contentType: 'movie' | 'series';
}

export function VideosEmptyState({ searchText, selectedGroupName, iconColor, contentType }: VideosEmptyStateProps) {
  const isSearching = searchText.trim().length > 0;
  const isFiltering = !!selectedGroupName;
  const contentLabel = contentType === 'movie' ? 'movies' : 'series';

  return (
    <ThemedView style={styles.emptyContainer}>
      <IconSymbol
        name={isSearching ? 'magnifyingglass' : 'film.fill'}
        size={64}
        color={iconColor}
      />
      <ThemedText style={styles.emptyTitle}>
        {isSearching ? 'No Results' : contentType === 'movie' ? 'No Movies' : 'No Series'}
      </ThemedText>
      <ThemedText style={styles.emptyText} type="subtitle">
        {isSearching
          ? `No ${contentLabel} found for "${searchText}"`
          : isFiltering
          ? `No ${contentLabel} found in "${selectedGroupName}" group`
          : `This playlist doesn't contain any ${contentLabel}`}
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
