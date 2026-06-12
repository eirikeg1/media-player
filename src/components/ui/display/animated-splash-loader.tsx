import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useAppReadyStore } from '@/stores/app';

// ── Tunables ───────────────────────────────────────────────────────────────
const BACKGROUND = '#F3D6FF'; // matches the native splash backgroundColor
const HOLD_MS = 80; // brief stop held on each play-triangle pose
const BEAT_MOTION_MS = 1000; // motion per beat: triangle → center → next triangle
const CIRCLE_SIZE = 56; // diameter of each disc
const MAX_R = 70; // radius at the spread "play triangle" formation
const MIN_R = 6; // radius at the center overlap (almost full, not perfect)
const FADE_OUT_MS = 400; // overlay fade-out once the app is ready

const BEAT_MS = HOLD_MS + BEAT_MOTION_MS; // one of the 3 beats per cycle
const CYCLE_MS = BEAT_MS * 3; // full 360° loop = 3 beats
const HOLD_FRACTION = HOLD_MS / BEAT_MS; // portion of each beat spent frozen

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * Timing curve for `progress` (0→1 over one cycle). Splits the cycle into 3
 * beats; each beat holds frozen on its starting play-triangle pose for
 * {@link HOLD_FRACTION} of its duration, then cosine-eases through the center
 * to the next triangle. Output lands exactly on 0, ⅓, ⅔, 1 at the triangle
 * poses so the loop wrap (1→0, an identical 360° pose) stays seamless.
 */
function holdEasing(t: number): number {
  'worklet';
  const beat = Math.min(2, Math.floor(t * 3)); // 0, 1, 2 (guard t === 1)
  const local = t * 3 - beat; // 0..1 within the beat
  if (local <= HOLD_FRACTION) {
    return beat / 3; // frozen on the triangle
  }
  const u = (local - HOLD_FRACTION) / (1 - HOLD_FRACTION);
  const eased = (1 - Math.cos(Math.PI * u)) / 2; // smooth ease-in-out
  return (beat + eased) / 3;
}

// Right-pointing play triangle ▶ — each disc starts on its own vertex and
// advances to the next vertex each beat (loops seamlessly every 360°).
const CIRCLES = [
  { color: '#8B5CF6', baseAngle: 0 * DEG }, // purple — right vertex
  { color: '#EF4444', baseAngle: 120 * DEG }, // red — lower-left
  { color: '#3B82F6', baseAngle: 240 * DEG }, // blue — upper-left
] as const;

const BOX_SIZE = 2 * MAX_R + CIRCLE_SIZE;

interface SplashCircleProps {
  color: string;
  baseAngle: number;
  progress: SharedValue<number>;
}

function SplashCircle({ color, baseAngle, progress }: SplashCircleProps) {
  const animatedStyle = useAnimatedStyle(() => {
    // Full 360° per cycle keeps colors aligned across the wrap (seamless loop).
    const rotation = progress.value * TWO_PI + baseAngle;
    // Three radius pulses per cycle: 1 = spread triangle, 0 = center overlap.
    // The cosine naturally slows/lingers at both extremes (gentle easing).
    const pulse = (Math.cos(6 * Math.PI * progress.value) + 1) / 2;
    const radius = MIN_R + (MAX_R - MIN_R) * pulse;

    return {
      transform: [
        { translateX: radius * Math.cos(rotation) },
        { translateY: radius * Math.sin(rotation) },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.circle, { backgroundColor: color, shadowColor: color }, animatedStyle]}
    />
  );
}

/**
 * Full-screen animated loading overlay shown during app startup. Three glowing
 * discs rotate between a "play triangle" formation and a center overlap in an
 * infinite loop. Hands off from the native splash on first layout and fades out
 * once {@link useAppReadyStore} reports the app is ready.
 */
export function AnimatedSplashLoader() {
  const [mounted, setMounted] = useState(true);
  const isReady = useAppReadyStore((s) => s.isReady);

  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const nativeSplashHidden = useRef(false);

  // Drive the rotation/converge loop.
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: holdEasing }),
      -1,
      false,
    );
  }, [progress]);

  // Fade out (and unmount) once the app reports ready.
  useEffect(() => {
    if (!isReady) return;
    opacity.value = withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
      }
    });
  }, [isReady, opacity]);

  // Hand off from the native splash the moment this overlay paints over the
  // same colored background — avoids any flash or jump.
  const handleLayout = useCallback(() => {
    if (nativeSplashHidden.current) return;
    nativeSplashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {
      // Already hidden or unavailable — nothing to do.
    });
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.container, containerStyle]} onLayout={handleLayout}>
      <View style={styles.box}>
        {CIRCLES.map((c) => (
          <SplashCircle
            key={c.color}
            color={c.color}
            baseAngle={c.baseAngle}
            progress={progress}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    position: 'absolute',
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    // Soft glow halo (iOS shadow + Android elevation).
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
});
