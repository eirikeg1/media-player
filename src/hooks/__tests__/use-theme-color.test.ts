import { renderHook } from '@testing-library/react-native';

import { useColorScheme } from '../use-color-scheme';
import { useThemeColor } from '../use-theme-color';
import { Colors } from '@/lib/theme';

// Mock the color-scheme hook so each test can pick light/dark explicitly.
jest.mock('../use-color-scheme', () => ({
  useColorScheme: jest.fn(),
}));

const mockUseColorScheme = jest.mocked(useColorScheme);

describe('useThemeColor', () => {
  it('returns the named color from the light palette', async () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result } = await renderHook(() => useThemeColor({}, 'text'));

    expect(result.current).toBe(Colors.light.text);
  });

  it('returns the named color from the dark palette', async () => {
    mockUseColorScheme.mockReturnValue('dark');

    const { result } = await renderHook(() => useThemeColor({}, 'background'));

    expect(result.current).toBe(Colors.dark.background);
  });

  it('prefers a color override matching the active scheme', async () => {
    mockUseColorScheme.mockReturnValue('dark');

    const { result } = await renderHook(() =>
      useThemeColor({ light: '#ffffff', dark: '#000000' }, 'text')
    );

    expect(result.current).toBe('#000000');
  });

  it('ignores overrides for the inactive scheme', async () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result } = await renderHook(() => useThemeColor({ dark: '#000000' }, 'text'));

    expect(result.current).toBe(Colors.light.text);
  });

  it('falls back to the light palette when the scheme is unknown', async () => {
    mockUseColorScheme.mockReturnValue(null);

    const { result } = await renderHook(() => useThemeColor({}, 'tint'));

    expect(result.current).toBe(Colors.light.tint);
  });
});
