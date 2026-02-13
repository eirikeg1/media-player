import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { Platform } from 'react-native';

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

export const GlassColors = {
  light: {
    surface: 'rgba(255, 255, 255, 0.65)',
    surfaceElevated: 'rgba(255, 255, 255, 0.85)',
    border: 'rgba(80, 110, 180, 0.15)',
    backdrop: 'rgba(0, 10, 30, 0.6)',
  },
  dark: {
    surface: 'rgba(15, 20, 45, 0.6)',
    surfaceElevated: 'rgba(25, 33, 60, 0.75)',
    border: 'rgba(100, 140, 220, 0.12)',
    backdrop: 'rgba(0, 5, 15, 0.8)',
  },
} as const;

export const Colors = {
  light: {
    text: '#161a21',
    background: '#f0f2f8',
    tint: '#007AFF',
    icon: '#5c6477',
    tabIconDefault: '#5c6477',
    tabIconSelected: '#007AFF',
  },
  dark: {
    text: '#eff0f4',
    background: '#0a0e17',
    tint: '#007AFF',
    icon: '#7c869e',
    tabIconDefault: '#7c869e',
    tabIconSelected: '#007AFF',
  },
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
