import { ThemedText } from '@/components/ui/display/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { CHANNEL_COL_WIDTH, DAY_WIDTH, HOUR_WIDTH, TIME_HEADER_HEIGHT } from './epg-constants';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface EpgTimeHeaderProps {
  scrollX: SharedValue<number>;
}

function EpgTimeHeaderInner({ scrollX }: EpgTimeHeaderProps) {
  const borderColor = useThemeColor({ light: '#d0d0d0', dark: '#444' }, 'icon');

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));

  return (
    <View style={[styles.container, { borderBottomColor: borderColor }]}>
      {/* Corner cell */}
      <View style={[styles.corner, { borderRightColor: borderColor }]} />

      {/* Scrollable time labels */}
      <View style={styles.clipWrapper}>
        <Animated.View style={[styles.labelsRow, animatedStyle]}>
          {HOURS.map((hour) => (
            <View key={hour} style={[styles.label, { width: HOUR_WIDTH }]}>
              <ThemedText style={styles.labelText}>
                {String(hour).padStart(2, '0')}:00
              </ThemedText>
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

export const EpgTimeHeader = React.memo(EpgTimeHeaderInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: TIME_HEADER_HEIGHT,
    borderBottomWidth: 1,
  },
  corner: {
    width: CHANNEL_COL_WIDTH,
    height: TIME_HEADER_HEIGHT,
    borderRightWidth: 1,
  },
  clipWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  labelsRow: {
    flexDirection: 'row',
    width: DAY_WIDTH,
    height: TIME_HEADER_HEIGHT,
  },
  label: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.7,
  },
});
