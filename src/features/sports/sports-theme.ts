import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { THEME, TINT } from '@/lib/theme';

/** Accent colours shared by the sports screens (theme-independent). */
export const SPORTS_ACCENT = {
  // The app's own accent, so a change to the token travels here too. Note it is
  // an `hsl(...)` string — `withAlpha` below takes `#RRGGBB` only.
  tint: TINT,
  live: '#FF3B30',
  halftime: '#FF9500',
  favorite: '#FFB800',
} as const;

/** `#RRGGBB` plus an alpha channel, for tinted backgrounds built from an accent. */
export function withAlpha(hexColor: string, alpha: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SportsPalette {
  isDark: boolean;
  background: string;
  card: string;
  cardPressed: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
}

/**
 * Semantic palette for the sports tab, derived from the app theme tokens.
 *
 * One object per scheme, not per render: consumers key memos, context values
 * and cached stylesheets on its identity, so a fresh literal every call would
 * re-render every match-detail tab on each live tick.
 */
export function useSportsPalette(): SportsPalette {
  const scheme = useColorScheme() ?? 'light';
  return useMemo(() => {
    const tokens = THEME[scheme];
    const isDark = scheme === 'dark';
    return {
      isDark,
      background: tokens.background,
      // The light theme's card token is a hair lighter than its background, which
      // leaves the match rows invisible; plain white gives them the same lift the
      // dark theme's card token already provides.
      card: isDark ? tokens.card : '#FFFFFF',
      cardPressed: tokens.secondary,
      border: tokens.border,
      text: tokens.foreground,
      muted: tokens.mutedForeground,
      faint: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    };
  }, [scheme]);
}
