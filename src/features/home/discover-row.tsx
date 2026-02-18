import { ThemedText } from '@/components/ui/display/themed-text';
import { FlatList, StyleSheet, View } from 'react-native';

interface DiscoverRowProps<T> {
  title: string;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactElement;
}

export function DiscoverRow<T>({
  title,
  data,
  keyExtractor,
  renderItem,
}: DiscoverRowProps<T>) {
  if (data.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>

      <FlatList
        data={data}
        renderItem={({ item }) => <View style={styles.itemWrapper}>{renderItem(item)}</View>}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={data.length}
        windowSize={11}
        maxToRenderPerBatch={data.length}
      />
    </View>
  );
}

const ITEM_WIDTH = 120;

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    paddingHorizontal: 8,
  },
  listContent: {
    paddingHorizontal: 8,
    gap: 10,
  },
  itemWrapper: {
    width: ITEM_WIDTH,
  },
});
