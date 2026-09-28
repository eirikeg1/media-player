import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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

/** How long to wait for `currentTime` to confirm a gesture seek before giving up on it. */
const SEEK_SETTLE_TIMEOUT_MS = 500;

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

  // `currentTime` ticks once a second. Read it from a ref so the gesture
  // callbacks — and through them the memoised gesture objects — keep their
  // identity between ticks; it is only needed the moment a seek starts.
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // JS-only refs (not needed in worklet)
  const gestureZone = useRef<GestureZone>('center');
  const cachedBrightness = useRef(0.5);
  const cachedVolume = useRef(1);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureSeekPending = useRef(false);
  const seekSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSystemBrightnessPermission = useRef(false);
  const pendingBrightnessValue = useRef<number | null>(null);
  const brightnessInFlight = useRef(false);
  /** Brightness before any gesture touched it — restored when the screen goes. */
  const initialBrightness = useRef<number | null>(null);
  const hasChangedBrightness = useRef(false);

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

  // Actions only — subscribing to the whole store would re-render the player
  // tree on every `setSeekDelta` frame of a seek gesture.
  const setActiveGesture = useGestureStore((s) => s.setActiveGesture);
  const setSeekDelta = useGestureStore((s) => s.setSeekDelta);
  const setVolume = useGestureStore((s) => s.setVolume);
  const setBrightness = useGestureStore((s) => s.setBrightness);
  const reset = useGestureStore((s) => s.reset);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
      if (seekSettleTimeoutRef.current !== null) {
        clearTimeout(seekSettleTimeoutRef.current);
      }
    };
  }, []);

  // Cache brightness on mount so gesture start is synchronous.
  //
  // The permission is only *read*, never requested: system brightness needs
  // WRITE_SETTINGS on Android, and asking for it opens the system "Modify
  // system settings" screen — which backgrounds the app mid-stream, pauses
  // playback and drops the panel's only connection. Without it the gesture
  // dims the app window instead (no permission required), which is what a
  // video player wants anyway.
  useEffect(() => {
    const init = async () => {
      try {
        if (Platform.OS === 'android') {
          const { granted } = await Brightness.getPermissionsAsync();
          hasSystemBrightnessPermission.current = granted;
        }
        cachedBrightness.current = hasSystemBrightnessPermission.current
          ? await Brightness.getSystemBrightnessAsync()
          : await Brightness.getBrightnessAsync();
        initialBrightness.current = cachedBrightness.current;
      } catch (error) {
        console.warn('[VideoGestures] Failed to read brightness:', error);
      }
    };
    void init();

    // A player dimmed for a dark room must not leave the rest of the app dim:
    // the gesture is a per-playback adjustment, so it is undone with the screen.
    return () => {
      if (!hasChangedBrightness.current) return;
      const restore = hasSystemBrightnessPermission.current
        ? Brightness.restoreSystemBrightnessAsync()
        : initialBrightness.current !== null
          ? Brightness.setBrightnessAsync(initialBrightness.current)
          : null;
      restore?.catch((error) =>
        console.warn('[VideoGestures] Failed to restore brightness:', error)
      );
    };
  }, []);

  // Cache system volume on mount and keep in sync via listener
  useEffect(() => {
    VolumeManager.getVolume()
      .then((result) => {
        cachedVolume.current = result.volume;
      })
      .catch((error) => console.warn('[VideoGestures] Failed to read volume:', error));
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
    try {
      const result = VolumeManager.setVolume(v, { showUI: false });
      void Promise.resolve(result).catch((error) =>
        console.warn('[VideoGestures] Failed to set volume:', error)
      );
    } catch (error) {
      console.warn('[VideoGestures] Failed to set volume:', error);
    }
  }, []);

  const applyBrightness = useCallback((b: number) => {
    cachedBrightness.current = b;
    hasChangedBrightness.current = true;
    const setBrightnessFn = hasSystemBrightnessPermission.current
      ? Brightness.setSystemBrightnessAsync
      : Brightness.setBrightnessAsync;

    if (brightnessInFlight.current) {
      pendingBrightnessValue.current = b;
      return;
    }

    brightnessInFlight.current = true;
    // `finally` matters more than the success path: a rejected write used to
    // leave the flag set, so every later drag only queued a pending value that
    // nothing ever flushed — the gesture stopped changing anything.
    setBrightnessFn(b)
      .catch((error) => console.warn('[VideoGestures] Failed to set brightness:', error))
      .finally(() => {
        brightnessInFlight.current = false;
        const pending = pendingBrightnessValue.current;
        if (pending !== null) {
          pendingBrightnessValue.current = null;
          applyBrightness(pending);
        }
      });
  }, []);

  const flushBrightness = useCallback(() => {
    if (brightnessInFlight.current) return;
    const pending = pendingBrightnessValue.current;
    if (pending !== null) {
      pendingBrightnessValue.current = null;
      applyBrightness(pending);
    }
  }, [applyBrightness]);

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

      // Fine-seek needs a timeline to move along: a live stream has none, and
      // neither does a stream whose duration hasn't arrived yet (seeking it
      // would clamp the target to 0 and restart the stream).
      if (zone === 'bottom' && (isLive || duration <= 0)) {
        gestureZone.current = 'center';
        gestureZoneSV.value = ZONE_CENTER;
      } else {
        gestureZoneSV.value = zoneToNumeric(zone);
      }
    },
    [determineZone, isLive, duration, reset, gestureActivatedSV, gestureZoneSV],
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
        const startTime = currentTimeRef.current;
        isGestureSeeking.value = true;
        startTimeSV.value = startTime;
        setSeekDelta(0, startTime);
        seekDeltaDisplay.value = 0;
        seekTargetDisplay.value = startTime;
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
        const refine = hasSystemBrightnessPermission.current
          ? Brightness.getSystemBrightnessAsync()
          : Brightness.getBrightnessAsync();
        refine
          .then((b) => {
            cachedBrightness.current = b;
            startBrightnessSV.value = b;
          })
          .catch((error) => console.warn('[VideoGestures] Failed to read brightness:', error));
      }
    },
    [
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
        // and gestureSeekPending would stay true forever. Tracked so unmounting
        // mid-seek doesn't leave a timer writing to a released shared value.
        if (seekSettleTimeoutRef.current !== null) clearTimeout(seekSettleTimeoutRef.current);
        seekSettleTimeoutRef.current = setTimeout(() => {
          seekSettleTimeoutRef.current = null;
          if (gestureSeekPending.current) {
            gestureSeekPending.current = false;
            isGestureSeeking.value = false;
          }
        }, SEEK_SETTLE_TIMEOUT_MS);
        seekTo(seekTarget);
        onSeekEnd(seekTarget);
        setSeekDelta(seekDelta, seekTarget);
      } else if (zone === 'right' && wasActivated) {
        setVolume(vol);
      } else if (zone === 'left' && wasActivated) {
        setBrightness(bright);
        flushBrightness();
      }

      // Only schedule reset if gesture was activated
      if (wasActivated) {
        resetTimeoutRef.current = setTimeout(() => {
          resetTimeoutRef.current = null;
          reset();
        }, VIDEO_CONSTANTS.GESTURE_INDICATOR_LINGER_MS);
      }
    },
    [seekTo, onSeekEnd, setSeekDelta, setVolume, setBrightness, flushBrightness, reset, isGestureSeeking],
  );

  const handleTap = useCallback(() => {
    onToggleControls();
  }, [onToggleControls]);

  // --- Gesture definitions ---

  // Memoised: rebuilding these on every render makes GestureDetector swap out
  // the native gesture handlers, which this component would otherwise do twice
  // a second as `currentTime` ticks.
  const panGesture = useMemo(() => Gesture.Pan()
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
    .minDistance(VIDEO_CONSTANTS.GESTURE_MIN_DISTANCE),
    [
      handleGestureStart,
      handleGestureActivation,
      handleGestureEnd,
      applyBrightness,
      applyVolume,
      gestureActivatedSV,
      gestureZoneSV,
      startTranslationX,
      startTranslationY,
      startVolumeSV,
      startBrightnessSV,
      startTimeSV,
      durationSV,
      sliderTrackHeightSV,
      volumeDisplay,
      brightnessDisplay,
      seekDeltaDisplay,
      seekTargetDisplay,
    ]);

  const tapGesture = useMemo(
    () => Gesture.Tap().onEnd(() => {
      runOnJS(handleTap)();
    }),
    [handleTap]
  );

  const composedGesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

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
