import { render, screen } from '@testing-library/react-native';

import { ThemedText, textLineHeight } from '../themed-text';
import { Colors } from '@/lib/theme';

describe('ThemedText', () => {
  it('renders its children', async () => {
    await render(<ThemedText>Hello world</ThemedText>);

    expect(screen.getByText('Hello world')).toBeOnTheScreen();
  });

  it('uses the theme text color by default', async () => {
    await render(<ThemedText>Themed</ThemedText>);

    // jest-expo runs with the light color scheme by default
    expect(screen.getByText('Themed')).toHaveStyle({ color: Colors.light.text });
  });

  it('prefers an explicit lightColor over the theme color', async () => {
    await render(<ThemedText lightColor="#123456">Custom</ThemedText>);

    expect(screen.getByText('Custom')).toHaveStyle({ color: '#123456' });
  });

  it.each([
    ['default', { fontSize: 16, lineHeight: 24 }],
    ['title', { fontSize: 28, fontWeight: 'bold' }],
    ['subtitle', { fontSize: 20, fontWeight: 'bold' }],
    ['defaultSemiBold', { fontSize: 16, fontWeight: '600' }],
    ['body', { fontSize: 15, lineHeight: 20 }],
    ['small', { fontSize: 13, lineHeight: 18 }],
    ['caption', { fontSize: 12, lineHeight: 16 }],
    ['link', { fontSize: 16, color: '#0a7ea4' }],
  ] as const)('applies the %s type styles', async (type, expected) => {
    await render(<ThemedText type={type}>Variant</ThemedText>);

    expect(screen.getByText('Variant')).toHaveStyle(expected);
  });

  it('lets a custom style override the variant style', async () => {
    await render(
      <ThemedText type="title" style={{ fontSize: 99 }}>
        Override
      </ThemedText>
    );

    expect(screen.getByText('Override')).toHaveStyle({ fontSize: 99 });
  });

  describe('line height', () => {
    it('derives one for a caller that overrides only the font size', async () => {
      // The variant's 24pt line belongs to its 16pt size: keeping it under a
      // 12pt override is what spaced small text as if it were body copy.
      await render(<ThemedText style={{ fontSize: 12 }}>Small</ThemedText>);

      expect(screen.getByText('Small')).toHaveStyle({ fontSize: 12, lineHeight: 16 });
    });

    it('derives one whichever style entry carries the font size', async () => {
      await render(
        <ThemedText type="title" style={[{ fontWeight: '600' }, { fontSize: 20 }]}>
          Flattened
        </ThemedText>
      );

      expect(screen.getByText('Flattened')).toHaveStyle({ fontSize: 20, lineHeight: 27 });
    });

    it('leaves a line height the caller set alone', async () => {
      await render(<ThemedText style={{ fontSize: 12, lineHeight: 30 }}>Roomy</ThemedText>);

      expect(screen.getByText('Roomy')).toHaveStyle({ lineHeight: 30 });
    });

    it("keeps the variant's line height when the caller sets no font size", async () => {
      await render(<ThemedText style={{ textAlign: 'center' }}>Untouched</ThemedText>);

      expect(screen.getByText('Untouched')).toHaveStyle({ fontSize: 16, lineHeight: 24 });
    });
  });
});

describe('textLineHeight', () => {
  it('rounds the ratio so every size lands on a whole point', () => {
    expect(textLineHeight(12)).toBe(16);
    expect(textLineHeight(13)).toBe(18);
    expect(textLineHeight(15)).toBe(20);
  });
});
