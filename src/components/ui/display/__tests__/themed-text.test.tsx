import { render, screen } from '@testing-library/react-native';

import { ThemedText } from '../themed-text';
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
    ['title', { fontSize: 28, fontWeight: 'bold' }],
    ['subtitle', { fontSize: 20, fontWeight: 'bold' }],
    ['defaultSemiBold', { fontSize: 16, fontWeight: '600' }],
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
});
