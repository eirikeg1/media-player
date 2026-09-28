import { ThemedText } from '@/components/ui/display/themed-text';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

const ITEM_WIDTH = 120;
const ITEM_GAP = 10;
/** Horizontal distance from one cell's left edge to the next one's. */
const ITEM_STRIDE = ITEM_WIDTH + ITEM_GAP;

interface DiscoverRowProps<T> {
  title: string;
  data: T[];
  keyExtractor: (item: T) => string;
  /** Must be referentially stable (e.g. `useCallback`), or every cell re-renders. */
  renderItem: (item: T) => React.ReactElement;
}

/**
 * One horizontal "discover" row.
 *
 * Every cell has the same fixed width, so the list can be told its layout up
 * front instead of measuring: that plus the default batch sizes keeps a 60-item
 * row from rendering all of its cells in one synchronous pass.
 */
export function DiscoverRow<T>({ title, data, keyExtractor, renderItem }: DiscoverRowProps<T>) {
  const renderCell = useCallback(
    ({ item }: ListRenderItemInfo<T>) => (
      <View style={styles.itemWrapper}>{renderItem(item)}</View>
    ),
    [renderItem]
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<T> | null | undefined, index: number) => ({
      length: ITEM_STRIDE,
      offset: ITEM_STRIDE * index,
      index,
    }),
    []
  );

  if (data.length === 0) return null;

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.sectionTitle}>
        {title}
      </ThemedText>

      <FlatList
        data={data}
        renderItem={renderCell}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    paddingHorizontal: 8,
  },
  listContent: {
    paddingHorizontal: 8,
  },
  itemWrapper: {
    width: ITEM_WIDTH,
    marginRight: ITEM_GAP,
  },
});
