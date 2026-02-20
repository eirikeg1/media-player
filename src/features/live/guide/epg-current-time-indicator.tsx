import { useThemeColor } from '@/hooks/use-theme-color';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { HOUR_WIDTH } from './epg-constants';

interface EpgCurrentTimeIndicatorProps {
  dayStartSeconds: number;
  scrollX: SharedValue<number>;
  height: number;
}

function EpgCurrentTimeIndicatorInner({
  dayStartSeconds,
  scrollX,
  height,
}: EpgCurrentTimeIndicatorProps) {
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const indicatorColor = useThemeColor({ light: '#e53e3e', dark: '#fc5c5c' }, 'tint');

  const dayEndSeconds = dayStartSeconds + 86400;
  const isToday = nowSeconds >= dayStartSeconds && nowSeconds < dayEndSeconds;

  const animatedStyle = useAnimatedStyle(() => {
    const position = ((nowSeconds - dayStartSeconds) / 3600) * HOUR_WIDTH;
    return {
      transform: [{ translateX: position - scrollX.value }],
      height,
    };
  });

  if (!isToday) return null;

  return (
    <Animated.View style={[styles.indicator, animatedStyle]} pointerEvents="none">
      <View style={[styles.line, { backgroundColor: indicatorColor }]} />
      <View style={[styles.dot, { backgroundColor: indicatorColor }]} />
    </Animated.View>
  );
}

export const EpgCurrentTimeIndicator = React.memo(EpgCurrentTimeIndicatorInner);

const styles = StyleSheet.create({
  indicator: {
    position: 'absolute',
    top: 0,
    width: 2,
    zIndex: 10,
  },
  line: {
    flex: 1,
    width: 2,
  },
  dot: {
    position: 'absolute',
    top: -4,
    left: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
