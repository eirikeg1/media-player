import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { VIDEO_CONSTANTS } from '../constants';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface VideoSeekBarProps {
  currentTime: number;
  duration: number;
  onSeekStart: () => void;
  onSeekEnd: (time: number) => void;
  onSeek?: (time: number) => void;
}

function formatTime(seconds: number): string {
  'worklet';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoSeekBar({
  currentTime,
  duration,
  onSeekStart,
  onSeekEnd,
  onSeek,
}: VideoSeekBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const isDragging = useSharedValue(false);
  const isSeeking = useSharedValue(false);
  const dragProgress = useSharedValue(0);
  const thumbScale = useSharedValue(1);


  const progress = duration > 0 ? currentTime / duration : 0;

  const displayTime = useDerivedValue(() => {
    const p = (isDragging.value || isSeeking.value) ? dragProgress.value : progress;
    return formatTime(p * duration);
  });

  const currentTimeAnimatedProps = useAnimatedProps(
    () => ({ text: displayTime.value }) as { text: string },
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const clampProgress = (value: number) => {
    'worklet';
    return Math.min(Math.max(value, 0), 1);
  };

  const seekToProgress = useCallback(
    (p: number) => {
      onSeekEnd(p * duration);
    },
    [duration, onSeekEnd],
  );

  // Clear isSeeking once currentTime catches up after async seek
  useEffect(() => {
    if (isSeeking.value) {
      isSeeking.value = false;
    }
  }, [currentTime, isSeeking]);

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      isDragging.value = true;
      dragProgress.value = trackWidth > 0 ? clampProgress(event.x / trackWidth) : progress;
      thumbScale.value = withSpring(VIDEO_CONSTANTS.SEEK_BAR_ACTIVE_THUMB_SIZE / VIDEO_CONSTANTS.SEEK_BAR_THUMB_SIZE);
      runOnJS(onSeekStart)();
    })
    .onUpdate((event) => {
      if (trackWidth > 0) {
        dragProgress.value = clampProgress(event.x / trackWidth);
        if (onSeek) {
          runOnJS(onSeek)(dragProgress.value * duration);
        }
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      isSeeking.value = true;
      thumbScale.value = withSpring(1);
      runOnJS(seekToProgress)(dragProgress.value);
    })
    .minDistance(0)
    .hitSlop({ top: 16, bottom: 16 });

  const tapGesture = Gesture.Tap()
    .onEnd((event) => {
      if (trackWidth > 0) {
        const tappedProgress = clampProgress(event.x / trackWidth);
        runOnJS(onSeekStart)();
        runOnJS(seekToProgress)(tappedProgress);
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const fillStyle = useAnimatedStyle(() => {
    const p = (isDragging.value || isSeeking.value) ? dragProgress.value : progress;
    return { width: `${p * 100}%` };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const p = (isDragging.value || isSeeking.value) ? dragProgress.value : progress;
    return {
      left: `${p * 100}%`,
      transform: [
        { translateX: -(VIDEO_CONSTANTS.SEEK_BAR_THUMB_SIZE / 2) },
        { scale: thumbScale.value },
      ],
    };
  });

  return (
    <View
      className="bg-transparent"
      style={{ paddingHorizontal: VIDEO_CONSTANTS.SEEK_BAR_PADDING_HORIZONTAL }}
    >
      <View className="flex-row justify-between" style={{ marginBottom: 4 }}>
        <AnimatedTextInput
          editable={false}
          underlineColorAndroid="transparent"
          animatedProps={currentTimeAnimatedProps as never}
          style={{
            fontSize: VIDEO_CONSTANTS.TIME_LABEL_SIZE,
            color: 'rgba(255, 255, 255, 0.8)',
            fontVariant: ['tabular-nums'],
            padding: 0,
          }}
          defaultValue={formatTime(currentTime)}
        />
        <Text
          style={{
            fontSize: VIDEO_CONSTANTS.TIME_LABEL_SIZE,
            color: 'rgba(255, 255, 255, 0.8)',
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatTime(duration)}
        </Text>
      </View>

      <GestureDetector gesture={composedGesture}>
        <View
          onLayout={onLayout}
          style={{
            height: VIDEO_CONSTANTS.SEEK_BAR_THUMB_SIZE + 8,
            justifyContent: 'center',
          }}
        >
          {/* Track background */}
          <View
            style={{
              height: VIDEO_CONSTANTS.SEEK_BAR_HEIGHT,
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: VIDEO_CONSTANTS.SEEK_BAR_HEIGHT / 2,
              overflow: 'hidden',
            }}
          >
            {/* Progress fill */}
            <Animated.View
              style={[
                {
                  height: '100%',
                  backgroundColor: '#fff',
                  borderRadius: VIDEO_CONSTANTS.SEEK_BAR_HEIGHT / 2,
                },
                fillStyle,
              ]}
            />
          </View>

          {/* Thumb */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: VIDEO_CONSTANTS.SEEK_BAR_THUMB_SIZE,
                height: VIDEO_CONSTANTS.SEEK_BAR_THUMB_SIZE,
                borderRadius: VIDEO_CONSTANTS.SEEK_BAR_THUMB_SIZE / 2,
                backgroundColor: '#fff',
              },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
