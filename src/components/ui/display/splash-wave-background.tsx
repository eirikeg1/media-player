import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

/** Base colour — also the native splash backgroundColor, so cold-start handoff
 *  has no visible jump. Keep in sync with `expo-splash-screen` in app.config. */
export const SPLASH_WAVE_BASE = '#13214A';

/**
 * Subtle, ambient blue-with-purple flow.
 *
 * A fragment shader runs domain-warped fractal noise (fbm). The warp offsets are
 * driven by a few slow, incommensurate sines, so the field drifts back and forth
 * organically and never settles into an obvious loop. Contrast is deliberately
 * low — it reads as a calm living backdrop, not a busy effect.
 */
const SKSL = `
uniform float time;
uniform float2 resolution;

// Dave Hoskins hash — high quality with no radial/spiral structure even at
// large coords. The old fract(p.x*p.y) hash multiplied the coordinates, which
// produces hyperbolic streaks that read as straight lines between sections.
float hash(float2 p) {
  float3 p3 = fract(p.xyx * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  // Quintic fade (smootherstep): C2-continuous, so cells blend with no creases.
  float2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Three octaves, each rotated off-axis (so lattices never align into straight
// lines). The third octave adds fine detail — less blurry without going cloudy.
float fbm(float2 p) {
  float2x2 rot = float2x2(0.80, -0.60, 0.60, 0.80);
  float v = 0.50 * noise(p);
  p = rot * p * 2.03 + 7.1;
  v += 0.28 * noise(p);
  p = rot * p * 2.01 + 3.7;
  v += 0.10 * noise(p);
  return v / 0.88; // normalised to ~0..1
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / resolution;
  // Divide BOTH axes by height → features stay square (no stretch / no
  // top-bottom banding). A bit more scale = a bit more detail (less blur).
  float2 p = fragCoord / resolution.y * 2.1;

  float t = time * 0.03; // very slow, ambient drift

  // First domain warp — slow non-harmonic sines that drift back and forth.
  float2 warp1 = float2(
    sin(p.y * 1.1 + t * 1.2) + 0.7 * cos(p.x * 0.7 - t * 0.8),
    cos(p.x * 0.9 - t * 1.0) + 0.7 * sin(p.y * 0.6 + t * 0.7)
  );
  // Second, fbm-based warp folded on top of the first → flowing, marbled
  // structure instead of plain blobs (more interesting, still organic).
  float2 warp2 = float2(
    fbm(p + 0.9 * warp1 + float2(t * 0.5, 0.0)),
    fbm(p + 0.9 * warp1 + float2(0.0, -t * 0.4) + 11.0)
  );
  float n = fbm(p + 0.85 * warp1 + 0.95 * warp2);

  // Soft contrast — a touch tighter than before for a little more definition.
  n = smoothstep(0.28, 0.80, n);

  // Gentle blue ramp; deep base -> mid blue, with only a faint, soft highlight
  // so bright areas don't pop out.
  half3 deep = half3(0.075, 0.130, 0.290);
  half3 mid  = half3(0.105, 0.205, 0.430);
  half3 lite = half3(0.190, 0.310, 0.580);
  half3 col = mix(deep, mid, n);
  col = mix(col, lite, smoothstep(0.55, 1.0, n) * 0.40);

  // A few hints of purple — a separate, slow-wandering field, soft-edged.
  half3 purple = half3(0.42, 0.27, 0.66);
  float ph = fbm(p * 0.65 + float2(-t * 0.45, t * 0.55) + 19.0);
  col = mix(col, purple, smoothstep(0.45, 0.95, ph) * 0.22);

  // Dither: a subtle dark blue gradient bands hard on 8-bit displays, which
  // reads as straight lines between brightness sections. A sub-LSB random
  // offset per pixel breaks the bands into imperceptible noise.
  float d = hash(fragCoord + fract(time)) - 0.5;
  col += d * (1.5 / 255.0);

  return half4(col, 1.0);
}
`;

const effect = Skia.RuntimeEffect.Make(SKSL);

/** Full-bleed animated shader backdrop for the splash. Falls back to a flat base
 *  colour if the shader fails to compile, so startup never breaks. */
export function SplashWaveBackground() {
  const { width, height } = useWindowDimensions();
  const time = useSharedValue(0);

  useFrameCallback((info) => {
    time.value = info.timeSinceFirstFrame / 1000;
  });

  const uniforms = useDerivedValue(
    () => ({ time: time.value, resolution: [width, height] }),
    [width, height]
  );

  if (!effect) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_WAVE_BASE }]} />;
  }

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
