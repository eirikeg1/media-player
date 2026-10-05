import { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useSportsPalette } from '../sports-theme';

/**
 * The surface colours every match-detail tab draws on.
 *
 * The tabs are hosted in two places with opposite needs. Over the player they
 * sit on a card floating above video, which is dark whatever the device scheme
 * is; on the `/match` route they are the body of a themed screen, and a fixed
 * dark slab under light chrome is exactly the seam this contract removes. Both
 * hosts provide the tokens, so a tab never has to know which one it is in.
 *
 * Team accents travel with the surface because the tabs pair them with it — a
 * legend dot, a comparison bar and a formation tag all have to agree.
 */
export interface MatchDetailTheme {
  /** The tab body itself. */
  background: string;
  /** A surface raised above the body: the player sheet, a timeline node. */
  card: string;
  /** Primary text on `background` and `card`. */
  text: string;
  /** Secondary text: labels, captions, minutes. */
  muted: string;
  /** Subtle fills — chips, bar tracks, list rows. */
  faint: string;
  /** Hairline dividers and card outlines. */
  border: string;
  /**
   * Loading-placeholder blocks. Distinct from `faint`, which all but vanishes
   * once a skeleton's pulse dips.
   */
  skeleton: string;
  homeColor: string;
  awayColor: string;
  /**
   * Accent text drawn straight on `background`: the player-of-the-match gold,
   * the goal/"BEST"/sub-in green and the sub-off red. `#RRGGBB`, so a tab can
   * build a tinted fill from them with `withAlpha`. They travel with the surface
   * because the values readable on the dark card fall below 2:1 on a light body.
   */
  gold: string;
  positive: string;
  negative: string;
}

/** The home/away accent pair, reused across every tab for instant association. */
export const HOME_ACCENT = '#4C8DFF';
export const AWAY_ACCENT = '#FF8A3D';

const DARK_ACCENTS = { gold: '#FFC800', positive: '#34C759', negative: '#D85A4A' } as const;
/** The same accents at ≥4.5:1 on the light theme's near-white body. */
const LIGHT_ACCENTS = { gold: '#8A6600', positive: '#127A48', negative: '#B8412F' } as const;

/**
 * The fixed dark palette the tabs were designed against, and the default for a
 * tab rendered outside either host.
 */
export const DARK_MATCH_DETAIL_THEME: MatchDetailTheme = {
  background: '#141417',
  card: '#1C1C20',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.55)',
  faint: 'rgba(255, 255, 255, 0.10)',
  border: 'rgba(255, 255, 255, 0.14)',
  skeleton: '#33333A',
  homeColor: HOME_ACCENT,
  awayColor: AWAY_ACCENT,
  ...DARK_ACCENTS,
};

const MatchDetailThemeContext = createContext<MatchDetailTheme>(DARK_MATCH_DETAIL_THEME);

export const MatchDetailThemeProvider = MatchDetailThemeContext.Provider;

/** The surface colours of the host this tab is rendered in. */
export function useMatchDetailTheme(): MatchDetailTheme {
  return useContext(MatchDetailThemeContext);
}

/**
 * The match surface's tokens, taken from the sports palette so the tab bodies
 * match the chrome around them in both schemes.
 *
 * Memoised because the identity is what {@link createThemedStyles} keys its
 * stylesheets on.
 */
export function useThemedMatchDetailTheme(): MatchDetailTheme {
  const palette = useSportsPalette();
  return useMemo(
    () => ({
      background: palette.background,
      card: palette.card,
      text: palette.text,
      muted: palette.muted,
      faint: palette.faint,
      border: palette.border,
      // The colour every other sports skeleton uses, so the detail tabs' loading
      // states match the lists they were opened from.
      skeleton: palette.border,
      homeColor: HOME_ACCENT,
      awayColor: AWAY_ACCENT,
      ...(palette.isDark ? DARK_ACCENTS : LIGHT_ACCENTS),
    }),
    [palette],
  );
}

/**
 * Declare one module's stylesheet as a function of the surface it is drawn on.
 *
 * Returns the hook that reads it. Each distinct theme is built once and cached
 * on its identity, so switching tabs — or rendering a dozen rows — does not
 * rebuild a stylesheet, and the call sites keep reading plain `styles.x` instead
 * of assembling inline colour arrays.
 */
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: MatchDetailTheme) => T,
): () => T {
  const cache = new WeakMap<MatchDetailTheme, T>();

  return function useThemedStyles(): T {
    const theme = useMatchDetailTheme();
    const cached = cache.get(theme);
    if (cached) return cached;

    const created = StyleSheet.create(factory(theme));
    cache.set(theme, created);
    return created;
  };
}
