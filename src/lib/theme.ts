import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { Platform } from 'react-native';

/**
 * The single source of truth for the app's colour tokens.
 *
 * Values stay `hsl(...)` strings so the same numbers can be pasted into
 * `global.css` for the NativeWind/Tailwind variables; React Native parses this
 * notation natively. Everything else in this module — {@link Colors},
 * {@link NAV_THEME}, {@link TINT} — is derived from here, so a token can only
 * be changed in one place.
 */
export const THEME = {
  light: {
    background: 'hsl(220 25% 97%)',
    foreground: 'hsl(220 15% 10%)',
    card: 'hsl(220 25% 98%)',
    cardForeground: 'hsl(220 15% 10%)',
    popover: 'hsl(220 25% 98%)',
    popoverForeground: 'hsl(220 15% 10%)',
    primary: 'hsl(220 15% 15%)',
    primaryForeground: 'hsl(220 15% 98%)',
    secondary: 'hsl(220 20% 94%)',
    secondaryForeground: 'hsl(220 15% 15%)',
    muted: 'hsl(220 20% 94%)',
    mutedForeground: 'hsl(220 10% 45%)',
    accent: 'hsl(220 20% 94%)',
    accentForeground: 'hsl(220 15% 15%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    success: 'hsl(135 60% 34%)',
    warning: 'hsl(32 95% 40%)',
    border: 'hsl(220 15% 88%)',
    input: 'hsl(220 15% 88%)',
    ring: 'hsl(211 100% 50%)',
    radius: '0.625rem',
    chart1: 'hsl(12 76% 61%)',
    chart2: 'hsl(173 58% 39%)',
    chart3: 'hsl(197 37% 24%)',
    chart4: 'hsl(43 74% 66%)',
    chart5: 'hsl(27 87% 67%)',
  },
  dark: {
    background: 'hsl(222 30% 5%)',
    foreground: 'hsl(220 15% 95%)',
    card: 'hsl(222 25% 7%)',
    cardForeground: 'hsl(220 15% 95%)',
    popover: 'hsl(222 25% 7%)',
    popoverForeground: 'hsl(220 15% 95%)',
    primary: 'hsl(220 15% 95%)',
    primaryForeground: 'hsl(222 25% 7%)',
    secondary: 'hsl(222 20% 12%)',
    secondaryForeground: 'hsl(220 15% 95%)',
    muted: 'hsl(222 20% 12%)',
    mutedForeground: 'hsl(220 10% 55%)',
    accent: 'hsl(222 20% 12%)',
    accentForeground: 'hsl(220 15% 95%)',
    destructive: 'hsl(0 70.9% 59.4%)',
    destructiveForeground: 'hsl(0 0% 100%)',
    success: 'hsl(135 55% 50%)',
    warning: 'hsl(35 100% 55%)',
    border: 'hsl(222 20% 16%)',
    input: 'hsl(222 20% 16%)',
    ring: 'hsl(211 100% 50%)',
    radius: '0.625rem',
    chart1: 'hsl(220 70% 50%)',
    chart2: 'hsl(160 60% 45%)',
    chart3: 'hsl(30 80% 55%)',
    chart4: 'hsl(280 65% 60%)',
    chart5: 'hsl(340 75% 55%)',
  },
};

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};

/**
 * Translucent surfaces for chrome that floats over content.
 *
 * `surface`/`surfaceElevated` are flat fills: what is behind them shows through.
 * `surfaceFrosted` is the tint laid *over* a `BlurView` — nearly opaque on
 * purpose, so the content behind reads as a soft blur rather than as itself.
 * `chromeBlur` is that blur's intensity; the mini player and the tab bar are
 * stacked directly on each other, so one value keeps the two from seaming.
 */
export const GlassColors = {
  light: {
    surface: 'rgba(255, 255, 255, 0.65)',
    surfaceElevated: 'rgba(255, 255, 255, 0.85)',
    surfaceFrosted: 'rgba(240, 242, 248, 0.92)',
    border: 'rgba(80, 110, 180, 0.15)',
    backdrop: 'rgba(0, 0, 5, 0.7)',
    backdropBlur: 50,
    chromeBlur: 60,
  },
  dark: {
    surface: 'rgba(15, 20, 45, 0.6)',
    surfaceElevated: 'rgba(25, 33, 60, 0.75)',
    surfaceFrosted: 'rgba(15, 20, 35, 0.92)',
    border: 'rgba(100, 140, 220, 0.12)',
    backdrop: 'rgba(0, 0, 5, 0.85)',
    backdropBlur: 60,
    chromeBlur: 80,
  },
} as const;

/**
 * The accent colour, identical in both schemes — {@link THEME}'s `ring` token.
 * Use this where a colour is needed outside a component (StyleSheet literals,
 * `Switch` track); inside one, prefer `useThemeColor({}, 'tint')`.
 */
export const TINT = THEME.light.ring;

/**
 * `Switch`'s "off" track. RN paints it from a fixed grey rather than a theme
 * colour, so it has no token of its own; one constant keeps every switch equal.
 */
export const SWITCH_TRACK = '#767577';

/**
 * A {@link THEME} token made translucent, e.g. for a surface over a blur.
 *
 * Takes the token's `hsl(H S% L%)` and returns the `hsla(H S% L% / A)` that
 * React Native's colour parser accepts — so a translucent surface still tracks
 * the token it is built from instead of hardcoding an `rgba()` beside it.
 */
export function translucent(token: string, alpha: number): string {
  const channels = token.match(/^hsl\((.+)\)$/)?.[1];
  if (!channels) {
    throw new Error(`translucent() expects an hsl() token, got "${token}"`);
  }
  return `hsla(${channels} / ${alpha})`;
}

/**
 * Neutral fill behind a parallax header image — seen only while the image loads
 * or where it does not cover. One value for every header so the tabs cannot
 * drift apart again.
 */
export const HEADER_BACKGROUND = { light: '#D0D0D0', dark: '#353636' } as const;

/** Per-scheme palette for {@link useThemeColor}, derived from {@link THEME}. */
function palette(tokens: (typeof THEME)['light']) {
  return {
    text: tokens.foreground,
    background: tokens.background,
    tint: tokens.ring,
    // Secondary content — icons, captions, inactive tabs.
    icon: tokens.mutedForeground,
    muted: tokens.mutedForeground,
    tabIconDefault: tokens.mutedForeground,
    tabIconSelected: tokens.ring,
    card: tokens.card,
    border: tokens.border,
    destructive: tokens.destructive,
    success: tokens.success,
    warning: tokens.warning,
  };
}

export const Colors = {
  light: palette(THEME.light),
  dark: palette(THEME.dark),
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
