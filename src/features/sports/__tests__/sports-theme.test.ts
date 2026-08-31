import { SPORTS_ACCENT, withAlpha } from '../sports-theme';

describe('withAlpha', () => {
  it('converts a hex accent to rgba', () => {
    expect(withAlpha('#FFB800', 0.12)).toBe('rgba(255, 184, 0, 0.12)');
    expect(withAlpha(SPORTS_ACCENT.live, 0.14)).toBe('rgba(255, 59, 48, 0.14)');
  });

  it('handles lowercase hex and full opacity', () => {
    expect(withAlpha('#007aff', 1)).toBe('rgba(0, 122, 255, 1)');
  });
});
