const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day, as `YYYY-MM-DD` in the device timezone. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Midnight (local) of the given day. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export interface DayWindow {
  /** Local `YYYY-MM-DD`. */
  key: string;
  /** Unix seconds, inclusive. */
  fromTs: number;
  /** Unix seconds, inclusive (last second of the day). */
  toTs: number;
}

/**
 * The fetch window for a local calendar day.
 *
 * The end is derived from the *next* day's midnight rather than by adding 24 h:
 * a DST day is 23 or 25 hours long, and the fixed offset would either cut an
 * hour of fixtures off the end of the day or pull the next day's first hour in.
 *
 * The window is all the backend needs: it resolves the one or two UTC dates the
 * span touches itself, so a local day never loses the fixtures on the far side
 * of midnight UTC.
 */
export function dayWindow(date: Date): DayWindow {
  const start = startOfLocalDay(date);
  const nextStart = startOfLocalDay(addDays(start, 1));
  const end = new Date(nextStart.getTime() - 1000);
  return {
    key: localDateKey(start),
    fromTs: Math.floor(start.getTime() / 1000),
    toTs: Math.floor(end.getTime() / 1000),
  };
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

/** "Today" / "Tomorrow" / "Yesterday" / "Sat 13 Jun". */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const today = startOfLocalDay(now);
  const diffDays = Math.round((startOfLocalDay(date).getTime() - today.getTime()) / DAY_MS);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
