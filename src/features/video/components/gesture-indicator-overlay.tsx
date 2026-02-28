import { useEffect, useRef } from 'react';
import { TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useGestureStore, type GestureType } from '@/stores/video/gesture-store';
import { VIDEO_CONSTANTS } from '../constants';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function formatDelta(seconds: number): string {
  'worklet';
  const sign = seconds >= 0 ? '+' : '';
  return `${sign}${Math.round(seconds)}s`;
}

function formatTime(seconds: number): string {
  'worklet';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    const mStr = m < 10 ? `0${m}` : `${m}`;
    const sStr = s < 10 ? `0${s}` : `${s}`;
    return `${h}:${mStr}:${sStr}`;
  }
  const sStr = s < 10 ? `0${s}` : `${s}`;
  return `${m}:${sStr}`;
}

function SeekIndicator({
  seekDeltaDisplay,
  seekTargetDisplay,
}: {
  seekDeltaDisplay: SharedValue<number>;
  seekTargetDisplay: SharedValue<number>;
}) {
  // 'text' is a valid native prop but not in TextInputProps types
  const deltaProps = useAnimatedProps(
    () => ({ text: formatDelta(seekDeltaDisplay.value) }) as Record<string, string>,
  );

  const targetProps = useAnimatedProps(
    () => ({ text: formatTime(seekTargetDisplay.value) }) as Record<string, string>,
  );

  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
      <View
        className="items-center rounded-xl px-5 py-3"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <AnimatedTextInput
          editable={false}
          underlineColorAndroid="transparent"
          style={{ color: '#fff', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'], padding: 0, textAlign: 'center' }}
          animatedProps={deltaProps}
          defaultValue="+0s"
        />
        <AnimatedTextInput
          editable={false}
          underlineColorAndroid="transparent"
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontVariant: ['tabular-nums'], marginTop: 2, padding: 0, textAlign: 'center' }}
          animatedProps={targetProps}
          defaultValue="0:00"
        />
      </View>
    </View>
  );
}

function VerticalSliderIndicator({
  displayValue,
  side,
  type,
  sliderHeight,
}: {
  displayValue: SharedValue<number>;
  side: 'left' | 'right';
  type: 'brightness' | 'volume';
  sliderHeight: number;
}) {
  const fillStyle = useAnimatedStyle(() => ({
    height: `${displayValue.value * 100}%`,
  }));

  return (
    <View
      className="absolute top-0 bottom-0 justify-center"
      style={side === 'left' ? { left: 24 } : { right: 24 }}
      pointerEvents="none"
    >
      <View
        className="items-center rounded-2xl py-4"
        style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          width: VIDEO_CONSTANTS.GESTURE_SLIDER_WIDTH,
          height: sliderHeight,
          gap: 8,
        }}
      >
        <IconSymbol
          name={type === 'brightness' ? 'sun.max.fill' : 'speaker.wave.2.fill'}
          size={18}
          color="#fff"
        />
        <View
          className="flex-1 w-1 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
        >
          <Animated.View
            className="absolute bottom-0 left-0 right-0 rounded-full"
            style={[{ backgroundColor: '#fff' }, fillStyle]}
          />
        </View>
      </View>
    </View>
  );
}

interface GestureIndicatorOverlayProps {
  volumeDisplay: SharedValue<number>;
  brightnessDisplay: SharedValue<number>;
  seekDeltaDisplay: SharedValue<number>;
  seekTargetDisplay: SharedValue<number>;
}

export function GestureIndicatorOverlay({
  volumeDisplay,
  brightnessDisplay,
  seekDeltaDisplay,
  seekTargetDisplay,
}: GestureIndicatorOverlayProps) {
  const { height: windowHeight } = useWindowDimensions();
  const sliderHeight = windowHeight * VIDEO_CONSTANTS.GESTURE_SLIDER_HEIGHT_RATIO;

  const activeGesture = useGestureStore((s) => s.activeGesture);
  const prevGesture = useRef<GestureType | null>(null);

  const opacity = useSharedValue(0);

  useEffect(() => {
    if (activeGesture) {
      prevGesture.current = activeGesture;
      opacity.value = withTiming(1, { duration: VIDEO_CONSTANTS.GESTURE_INDICATOR_FADE_MS });
    } else {
      opacity.value = withDelay(
        VIDEO_CONSTANTS.GESTURE_INDICATOR_LINGER_MS,
        withTiming(0, { duration: VIDEO_CONSTANTS.GESTURE_INDICATOR_FADE_MS }),
      );
      // Clear prevGesture after linger + fade completes
      const timeout = setTimeout(() => {
        prevGesture.current = null;
      }, VIDEO_CONSTANTS.GESTURE_INDICATOR_LINGER_MS + VIDEO_CONSTANTS.GESTURE_INDICATOR_FADE_MS);
      return () => clearTimeout(timeout);
    }
  }, [activeGesture, opacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const visibleGesture = activeGesture ?? prevGesture.current;

  return (
    <Animated.View
      className="absolute inset-0"
      style={containerStyle}
      pointerEvents="none"
    >
      {visibleGesture === 'fine-seek' && (
        <SeekIndicator seekDeltaDisplay={seekDeltaDisplay} seekTargetDisplay={seekTargetDisplay} />
      )}
      {visibleGesture === 'brightness' && (
        <VerticalSliderIndicator displayValue={brightnessDisplay} side="left" type="brightness" sliderHeight={sliderHeight} />
      )}
      {visibleGesture === 'volume' && (
        <VerticalSliderIndicator displayValue={volumeDisplay} side="right" type="volume" sliderHeight={sliderHeight} />
      )}
    </Animated.View>
  );
}
