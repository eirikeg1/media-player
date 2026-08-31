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
  /** The UTC calendar date to ask SofaScore for — the one local noon falls on. */
  providerDate: string;
}

/** The fetch window for a local calendar day. */
export function dayWindow(date: Date): DayWindow {
  const start = startOfLocalDay(date);
  const end = new Date(start.getTime() + DAY_MS - 1000);
  const noon = new Date(start.getTime() + DAY_MS / 2);
  return {
    key: localDateKey(start),
    fromTs: Math.floor(start.getTime() / 1000),
    toTs: Math.floor(end.getTime() / 1000),
    providerDate: noon.toISOString().slice(0, 10),
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
