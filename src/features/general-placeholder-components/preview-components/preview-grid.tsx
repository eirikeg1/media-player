import { ThemedText } from '@/components/ui/display/themed-text';
import { Children, cloneElement, isValidElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

interface VideoPreviewGridProps {
  children: ReactNode[];
  title?: string;
  columns?: number;
}

export function VideoPreviewGrid({ title, children, columns = 3 }: VideoPreviewGridProps) {
  // Calculate item width based on columns
  // Account for gaps: total gap space = (columns - 1) * 8
  const gapPerItem = ((columns - 1) * 8) / columns;
  const itemWidthPercent = `${(100 / columns) - (gapPerItem / 100 * 100)}%`;

  return (
    <View style={styles.container}>
      {title && <ThemedText type="title">{title}</ThemedText>}
      <View style={styles.grid}>
        {Children.map(children, (child) => {
          if (isValidElement(child)) {
            return cloneElement(child, { width: itemWidthPercent } as any);
          }
          return child;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    rowGap: 8,
  },
});

export default VideoPreviewGrid;
