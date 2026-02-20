import { Button } from '@/components/ui/controls/button';
import { ThemedText } from '@/components/ui/display/themed-text';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

interface EpgDateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  return target.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function EpgDateNavigatorInner({ selectedDate, onDateChange }: EpgDateNavigatorProps) {
  const handlePrevDay = useCallback(() => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    onDateChange(prev);
  }, [selectedDate, onDateChange]);

  const handleNextDay = useCallback(() => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    onDateChange(next);
  }, [selectedDate, onDateChange]);

  return (
    <View style={styles.container}>
      <Button
        title=""
        icon="chevron.left"
        variant="ghost"
        size="small"
        onPress={handlePrevDay}
      />
      <ThemedText style={styles.dateLabel}>
        {formatDateLabel(selectedDate)}
      </ThemedText>
      <Button
        title=""
        icon="chevron.right"
        variant="ghost"
        size="small"
        onPress={handleNextDay}
      />
    </View>
  );
}

export const EpgDateNavigator = React.memo(EpgDateNavigatorInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 100,
    textAlign: 'center',
  },
});
