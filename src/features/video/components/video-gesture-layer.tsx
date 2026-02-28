import type { VideoPlayer } from 'expo-video';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

import { useVideoGestures } from '../hooks/specialized/use-video-gestures';

interface VideoGestureLayerProps {
  player: VideoPlayer;
  currentTime: number;
  duration: number;
  isLive: boolean;
  seekTo: (time: number) => void;
  onToggleControls: () => void;
  onSeekStart: () => void;
  onSeekEnd: (time: number) => void;
  volumeDisplay: SharedValue<number>;
  brightnessDisplay: SharedValue<number>;
  seekDeltaDisplay: SharedValue<number>;
  seekTargetDisplay: SharedValue<number>;
  isGestureSeeking: SharedValue<boolean>;
}

export function VideoGestureLayer({
  player,
  currentTime,
  duration,
  isLive,
  seekTo,
  onToggleControls,
  onSeekStart,
  onSeekEnd,
  volumeDisplay,
  brightnessDisplay,
  seekDeltaDisplay,
  seekTargetDisplay,
  isGestureSeeking,
}: VideoGestureLayerProps) {
  const { gesture, onLayout } = useVideoGestures({
    player,
    currentTime,
    duration,
    isLive,
    seekTo,
    onToggleControls,
    onSeekStart,
    onSeekEnd,
    volumeDisplay,
    brightnessDisplay,
    seekDeltaDisplay,
    seekTargetDisplay,
    isGestureSeeking,
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        className="absolute inset-0"
        onLayout={onLayout}
        collapsable={false}
      />
    </GestureDetector>
  );
}
