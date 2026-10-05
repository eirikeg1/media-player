import { useMemo } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

/** The type scale: one name per size, each with the line height that fits it. */
export type ThemedTextType =
  | 'default'
  | 'defaultSemiBold'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'small'
  | 'caption'
  | 'link';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemedTextType;
};

/**
 * How tall a line of text is relative to its font size.
 *
 * Every variant below ships the line height that goes with its size, but a
 * caller that overrides only `fontSize` kept the variant's — which left 10–15pt
 * text sitting on `default`'s 24pt line, spaced as if it were 16pt. Deriving the
 * line from the size the caller actually asked for is what makes an override
 * safe.
 */
const LINE_HEIGHT_RATIO = 1.35;

/** The height of one line of {@link ThemedText} set at `fontSize`. */
export function textLineHeight(fontSize: number): number {
  return Math.round(fontSize * LINE_HEIGHT_RATIO);
}

/**
 * The line height for a caller that set a `fontSize` of its own and no
 * `lineHeight`, or `undefined` when there is nothing to derive — the caller
 * named a line height, or left the size to the variant.
 */
function deriveLineHeight(style: ThemedTextProps['style']): TextStyle | undefined {
  const flattened = StyleSheet.flatten(style);
  if (flattened?.fontSize == null || flattened.lineHeight != null) return undefined;
  return { lineHeight: textLineHeight(flattened.fontSize) };
}

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  // Last in the array, so it overrides the variant's line height — and it is
  // only produced when the caller did not set one itself.
  const derivedLineHeight = useMemo(() => deriveLineHeight(style), [style]);

  return <Text style={[{ color }, styles[type], style, derivedLineHeight]} {...rest} />;
}

const styles = StyleSheet.create<Record<ThemedTextType, TextStyle>>({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  /** Secondary prose: messages, descriptions, a card's supporting line. */
  body: {
    fontSize: 15,
    lineHeight: 20,
  },
  /** Metadata: row subtitles, counts, timestamps. */
  small: {
    fontSize: 13,
    lineHeight: 18,
  },
  /** Labels and hints — the smallest size that stays legible. */
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
