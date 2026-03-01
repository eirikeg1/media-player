import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import type { VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  type SharedValue,
  runOnJS,
  useSharedValue,
} from 'react-native-reanimated';
import { VolumeManager } from 'react-native-volume-manager';

import { useGestureStore, type GestureType } from '@/stores/video/gesture-store';
import { VIDEO_CONSTANTS } from '../../constants';

interface UseVideoGesturesProps {
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

type GestureZone = 'left' | 'right' | 'bottom' | 'center';

// Numeric zone codes for worklet access (strings can't be used in worklets)
const ZONE_CENTER = 0;
const ZONE_LEFT = 1;
const ZONE_RIGHT = 2;
const ZONE_BOTTOM = 3;

// Extract constants for worklet access
const SEEK_SECONDS_PER_PX = VIDEO_CONSTANTS.GESTURE_SEEK_SECONDS_PER_PX;
const SLIDER_SENSITIVITY = VIDEO_CONSTANTS.GESTURE_SLIDER_SENSITIVITY;
const MIN_DIRECTION_THRESHOLD = VIDEO_CONSTANTS.GESTURE_MIN_DIRECTION_THRESHOLD;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function zoneToNumeric(zone: GestureZone): number {
  switch (zone) {
    case 'left':
      return ZONE_LEFT;
    case 'right':
      return ZONE_RIGHT;
    case 'bottom':
      return ZONE_BOTTOM;
    default:
      return ZONE_CENTER;
  }
}

export function useVideoGestures({
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
}: UseVideoGesturesProps) {
  const { height: windowHeight } = useWindowDimensions();
  const containerDimensions = useRef({ width: 0, height: 0 });
  const sliderTrackHeight =
    windowHeight * VIDEO_CONSTANTS.GESTURE_SLIDER_HEIGHT_RATIO -
    VIDEO_CONSTANTS.GESTURE_SLIDER_TRACK_OVERHEAD;

  // JS-only refs (not needed in worklet)
  const gestureZone = useRef<GestureZone>('center');
  const cachedBrightness = useRef(0.5);
  const cachedVolume = useRef(1);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureSeekPending = useRef(false);
  const hasSystemBrightnessPermission = useRef(false);

  // Shared values for worklet fast-path (UI thread updates)
  const gestureActivatedSV = useSharedValue(false);
  const gestureZoneSV = useSharedValue(ZONE_CENTER);
  const startTranslationX = useSharedValue(0);
  const startTranslationY = useSharedValue(0);
  const startVolumeSV = useSharedValue(0);
  const startBrightnessSV = useSharedValue(0);
  const startTimeSV = useSharedValue(0);
  const durationSV = useSharedValue(duration);
  const sliderTrackHeightSV = useSharedValue(sliderTrackHeight);

  // Sync derived values to shared values
  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);

  useEffect(() => {
    sliderTrackHeightSV.value = sliderTrackHeight;
  }, [sliderTrackHeight, sliderTrackHeightSV]);

  // Clear gesture seeking once currentTime catches up after seekTo completes
  useEffect(() => {
    if (gestureSeekPending.current) {
      gestureSeekPending.current = false;
      isGestureSeeking.value = false;
    }
  }, [currentTime, isGestureSeeking]);

  const { setActiveGesture, setSeekDelta, setVolume, setBrightness, reset } =
    useGestureStore();

  // Cleanup resetTimeoutRef on unmount
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // Cache brightness on mount so gesture start is synchronous
  useEffect(() => {
    const init = async () => {
      if (Platform.OS === 'android') {
        const { status } = await Brightness.requestPermissionsAsync();
        hasSystemBrightnessPermission.current = status === 'granted';
        if (hasSystemBrightnessPermission.current) {
          cachedBrightness.current = await Brightness.getSystemBrightnessAsync();
        } else {
          cachedBrightness.current = await Brightness.getBrightnessAsync();
        }
      } else {
        cachedBrightness.current = await Brightness.getBrightnessAsync();
      }
    };
    init();
  }, []);

  // Cache system volume on mount and keep in sync via listener
  useEffect(() => {
    VolumeManager.getVolume().then((result) => {
      cachedVolume.current = result.volume;
    });
    const subscription = VolumeManager.addVolumeListener((result) => {
      cachedVolume.current = result.volume;
    });
    return () => subscription.remove();
  }, []);

  const determineZone = useCallback(
    (x: number, y: number): GestureZone => {
      const { width, height } = containerDimensions.current;
      if (width === 0 || height === 0) return 'center';

      const relX = x / width;
      const relY = y / height;

      // Left side for brightness (priority over bottom)
      if (relX < VIDEO_CONSTANTS.GESTURE_SIDE_ZONE_RATIO) {
        return 'left';
      }
      // Right side for volume (priority over bottom)
      if (relX > 1 - VIDEO_CONSTANTS.GESTURE_SIDE_ZONE_RATIO) {
        return 'right';
      }
      // Bottom strip for fine-seek
      if (relY > 1 - VIDEO_CONSTANTS.GESTURE_BOTTOM_ZONE_RATIO) {
        return 'bottom';
      }

      return 'center';
    },
    [],
  );

  const gestureTypeForZone = (zone: GestureZone): GestureType | null => {
    switch (zone) {
      case 'bottom':
        return 'fine-seek';
      case 'left':
        return 'brightness';
      case 'right':
        return 'volume';
      default:
        return null;
    }
  };

  // --- Side-effect callbacks called from worklet via runOnJS ---

  const applyVolume = useCallback((v: number) => {
    cachedVolume.current = v;
    VolumeManager.setVolume(v, { showUI: false });
  }, []);

  const applyBrightness = useCallback((b: number) => {
    cachedBrightness.current = b;
    if (Platform.OS === 'android' && hasSystemBrightnessPermission.current) {
      Brightness.setSystemBrightnessAsync(b);
    } else {
      Brightness.setBrightnessAsync(b);
    }
  }, []);

  // --- JS handlers called from worklets via runOnJS ---

  const handleGestureStart = useCallback(
    (x: number, y: number) => {
      // Clear any pending reset from a previous gesture
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
        reset();
      }

      const zone = determineZone(x, y);
      gestureZone.current = zone;
      gestureActivatedSV.value = false;

      // Bottom zone disabled for live streams
      if (zone === 'bottom' && isLive) {
        gestureZone.current = 'center';
        gestureZoneSV.value = ZONE_CENTER;
      } else {
        gestureZoneSV.value = zoneToNumeric(zone);
      }
    },
    [determineZone, isLive, reset, gestureActivatedSV, gestureZoneSV],
  );

  const activateGesture = useCallback(
    (translationX: number, translationY: number) => {
      const zone = gestureZone.current;
      const gestureType = gestureTypeForZone(zone);
      if (!gestureType) return;

      // Write shared values so worklet fast-path can take over
      gestureActivatedSV.value = true;
      startTranslationX.value = translationX;
      startTranslationY.value = translationY;

      setActiveGesture(gestureType);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (gestureType === 'fine-seek') {
        isGestureSeeking.value = true;
        startTimeSV.value = currentTime;
        setSeekDelta(0, currentTime);
        seekDeltaDisplay.value = 0;
        seekTargetDisplay.value = currentTime;
        onSeekStart();
      } else if (gestureType === 'volume') {
        startVolumeSV.value = cachedVolume.current;
        setVolume(cachedVolume.current);
        volumeDisplay.value = cachedVolume.current;
      } else if (gestureType === 'brightness') {
        // Use cached value immediately (synchronous), then refine async
        startBrightnessSV.value = cachedBrightness.current;
        setBrightness(cachedBrightness.current);
        brightnessDisplay.value = cachedBrightness.current;
        const refine = Platform.OS === 'android' && hasSystemBrightnessPermission.current
          ? Brightness.getSystemBrightnessAsync()
          : Brightness.getBrightnessAsync();
        refine.then((b) => {
          cachedBrightness.current = b;
          startBrightnessSV.value = b;
        });
      }
    },
    [
      currentTime,
      setActiveGesture,
      setSeekDelta,
      setVolume,
      setBrightness,
      onSeekStart,
      gestureActivatedSV,
      startTranslationX,
      startTranslationY,
      startVolumeSV,
      startBrightnessSV,
      startTimeSV,
      volumeDisplay,
      brightnessDisplay,
      seekDeltaDisplay,
      seekTargetDisplay,
      isGestureSeeking,
    ],
  );

  /** Pre-activation only: validates direction and activates gesture */
  const handleGestureActivation = useCallback(
    (translationX: number, translationY: number) => {
      const zone = gestureZone.current;
      if (zone === 'center') return;

      const absX = Math.abs(translationX);
      const absY = Math.abs(translationY);

      // Need enough movement to determine direction
      if (absX < MIN_DIRECTION_THRESHOLD && absY < MIN_DIRECTION_THRESHOLD) return;

      // Side zones require vertical swipe, bottom requires horizontal
      if ((zone === 'left' || zone === 'right') && absY <= absX) {
        gestureZone.current = 'center';
        gestureZoneSV.value = ZONE_CENTER;
        return;
      }
      if (zone === 'bottom' && absX <= absY) {
        gestureZone.current = 'center';
        gestureZoneSV.value = ZONE_CENTER;
        return;
      }

      activateGesture(translationX, translationY);
    },
    [activateGesture, gestureZoneSV],
  );

  const handleGestureEnd = useCallback(
    (wasActivated: boolean, seekTarget: number, seekDelta: number, vol: number, bright: number) => {
      const zone = gestureZone.current;

      if (zone === 'bottom' && wasActivated) {
        gestureSeekPending.current = true;
        // Fallback: if seekTo lands on the same position, currentTime won't change
        // and gestureSeekPending would stay true forever
        setTimeout(() => {
          if (gestureSeekPending.current) {
            gestureSeekPending.current = false;
            isGestureSeeking.value = false;
          }
        }, 500);
        seekTo(seekTarget);
        onSeekEnd(seekTarget);
        setSeekDelta(seekDelta, seekTarget);
      } else if (zone === 'right' && wasActivated) {
        setVolume(vol);
      } else if (zone === 'left' && wasActivated) {
        setBrightness(bright);
      }

      // Only schedule reset if gesture was activated
      if (wasActivated) {
        resetTimeoutRef.current = setTimeout(() => {
          resetTimeoutRef.current = null;
          reset();
        }, VIDEO_CONSTANTS.GESTURE_INDICATOR_LINGER_MS);
      }
    },
    [seekTo, onSeekEnd, setSeekDelta, setVolume, setBrightness, reset, isGestureSeeking],
  );

  const handleTap = useCallback(() => {
    onToggleControls();
  }, [onToggleControls]);

  // --- Gesture definitions ---

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      runOnJS(handleGestureStart)(event.x, event.y);
    })
    .onUpdate((event) => {
      if (!gestureActivatedSV.value) {
        // Pre-activation: direction validation + activation (needs Haptics, Zustand)
        runOnJS(handleGestureActivation)(event.translationX, event.translationY);
        return;
      }

      // Post-activation: direct shared value updates on UI thread (zero lag)
      const adjX = event.translationX - startTranslationX.value;
      const adjY = event.translationY - startTranslationY.value;
      const zone = gestureZoneSV.value;

      if (zone === ZONE_BOTTOM) {
        const delta = adjX * SEEK_SECONDS_PER_PX;
        seekDeltaDisplay.value = delta;
        seekTargetDisplay.value = clamp(
          startTimeSV.value + delta,
          0,
          durationSV.value,
        );
      } else if (zone === ZONE_LEFT) {
        const newVal = clamp(
          startBrightnessSV.value + (-adjY / sliderTrackHeightSV.value) * SLIDER_SENSITIVITY,
          0,
          1,
        );
        brightnessDisplay.value = newVal;
        runOnJS(applyBrightness)(newVal);
      } else if (zone === ZONE_RIGHT) {
        const newVal = clamp(
          startVolumeSV.value + (-adjY / sliderTrackHeightSV.value) * SLIDER_SENSITIVITY,
          0,
          1,
        );
        volumeDisplay.value = newVal;
        runOnJS(applyVolume)(newVal);
      }
    })
    .onEnd(() => {
      // Capture before resetting — handleGestureEnd needs this on the JS thread
      const wasActivated = gestureActivatedSV.value;
      // Reset immediately on UI thread so the next gesture's onUpdate
      // won't see a stale `true` during the linger window
      gestureActivatedSV.value = false;
      runOnJS(handleGestureEnd)(
        wasActivated,
        seekTargetDisplay.value,
        seekDeltaDisplay.value,
        volumeDisplay.value,
        brightnessDisplay.value,
      );
    })
    .minDistance(VIDEO_CONSTANTS.GESTURE_MIN_DISTANCE);

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleTap)();
  });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const onLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      containerDimensions.current = {
        width: event.nativeEvent.layout.width,
        height: event.nativeEvent.layout.height,
      };
    },
    [],
  );

  return {
    gesture: composedGesture,
    onLayout,
  };
}
