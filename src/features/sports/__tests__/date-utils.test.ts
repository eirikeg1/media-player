import { addDays, dayLabel, dayWindow, localDateKey } from '../date-utils';

describe('date utils', () => {
  it('builds an inclusive local-day window', () => {
    const day = new Date(2026, 5, 13, 15, 30);
    const window = dayWindow(day);
    expect(window.key).toBe('2026-06-13');
    expect(window.toTs - window.fromTs).toBe(24 * 3600 - 1);
    expect(new Date(window.fromTs * 1000).getHours()).toBe(0);
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

/**
 * A DST day is 23 or 25 hours long. Deriving the window's end by adding a fixed
 * 24 h either cut an hour of fixtures off the end of the day or pulled the next
 * day's first hour into it.
 */
describe('dayWindow across a DST transition', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('covers the whole 23-hour spring-forward day', () => {
    process.env.TZ = 'Europe/Oslo';
    const window = dayWindow(new Date(2026, 2, 29, 12));

    expect(window.key).toBe('2026-03-29');
    expect(window.toTs - window.fromTs).toBe(23 * 3600 - 1);
    // The window ends exactly at the next local midnight, not an hour past it.
    const afterEnd = new Date((window.toTs + 1) * 1000);
    expect(afterEnd.getDate()).toBe(30);
    expect(afterEnd.getHours()).toBe(0);
  });

  it('covers the whole 25-hour fall-back day', () => {
    process.env.TZ = 'Europe/Oslo';
    const window = dayWindow(new Date(2026, 9, 25, 12));

    expect(window.key).toBe('2026-10-25');
    expect(window.toTs - window.fromTs).toBe(25 * 3600 - 1);
    const afterEnd = new Date((window.toTs + 1) * 1000);
    expect(afterEnd.getDate()).toBe(26);
    expect(afterEnd.getHours()).toBe(0);
  });
});
