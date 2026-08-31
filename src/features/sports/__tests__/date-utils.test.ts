import { addDays, dayLabel, dayWindow, localDateKey } from '../date-utils';

describe('date utils', () => {
  it('builds an inclusive local-day window', () => {
    const day = new Date(2026, 5, 13, 15, 30);
    const window = dayWindow(day);
    expect(window.key).toBe('2026-06-13');
    expect(window.toTs - window.fromTs).toBe(24 * 3600 - 1);
    expect(new Date(window.fromTs * 1000).getHours()).toBe(0);
    expect(window.providerDate).toMatch(/^2026-06-1[234]$/);
  });

  it('labels today/tomorrow/yesterday relative to now', () => {
    const now = new Date(2026, 5, 13, 12);
    expect(dayLabel(now, now)).toBe('Today');
    expect(dayLabel(addDays(now, 1), now)).toBe('Tomorrow');
    expect(dayLabel(addDays(now, -1), now)).toBe('Yesterday');
    expect(dayLabel(addDays(now, 3), now)).not.toBe('Today');
    expect(localDateKey(addDays(now, 20))).toBe('2026-07-03');
  });
});
