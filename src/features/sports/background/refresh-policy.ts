import {
  DEFAULT_SPORTS_BACKGROUND_REFRESH,
  type SportsBackgroundRefresh,
} from '@/types/user.types';

/**
 * Decides *when* the sports background refresh runs. Pure functions over the
 * user's preference and the last run — no storage, no scheduler, no clock of
 * their own, so both the OS wake and the UI summary read the same rules.
 */

/** Local-time hours the `night` mode refreshes in; `endHour` is exclusive. */
export const NIGHT_WINDOW = { startHour: 2, endHour: 6 } as const;

/** The OS will not wake a periodic task more often than this. */
const MIN_SCHEDULER_MINUTES = 15;
/**
 * Ceiling on the interval wake cadence: at least two wakes a day, however long
 * the chosen interval is. `shouldRunNow` still gates the actual refresh to the
 * chosen interval, so an extra wake only costs a cheap no-op check — while a
 * cadence stretched to days risks the device skipping the one wake that mattered
 * and losing a whole multi-day window.
 */
const MAX_SCHEDULER_MINUTES = 720;
/** How often to wake for the time-of-day modes, so the slot is never missed. */
const TIME_OF_DAY_WAKE_MINUTES = 30;

const MIN_INTERVAL_HOURS = 1;
/** 14 days — the longest interval the settings offer. */
const MAX_INTERVAL_HOURS = 336;
const HOURS_PER_DAY = 24;
const HOUR_MS = 3_600_000;

/** Interval modes outside [1, 336] h would either hammer the API or never run. */
function clampIntervalHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_SPORTS_BACKGROUND_REFRESH.intervalHours;
  return Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, hours));
}

interface TimeOfDay {
  hour: number;
  minute: number;
}

function tryParseTimeOfDay(value: string): TimeOfDay | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** The shipped default, parsed once — the fallback for a malformed value. */
const DEFAULT_TIME_OF_DAY: TimeOfDay = tryParseTimeOfDay(
  DEFAULT_SPORTS_BACKGROUND_REFRESH.dailyTime
) ?? { hour: 0, minute: 0 };

/** Parse `"HH:MM"`; anything else falls back to the default daily time. */
function parseTimeOfDay(value: string): TimeOfDay {
  return tryParseTimeOfDay(value) ?? DEFAULT_TIME_OF_DAY;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `"HH:MM"` as it should be shown — the default when the stored value is junk. */
function normalizeDailyTime(value: string): string {
  const { hour, minute } = parseTimeOfDay(value);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Today's local `HH:MM` moment, as epoch millis. */
function todayAt(now: Date, time: TimeOfDay): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    time.hour,
    time.minute,
    0,
    0
  ).getTime();
}

/**
 * Whether a refresh is due right now.
 *
 * `lastRunAt` is epoch millis of the last successful run, or null if it has
 * never run. Every comparison is made in local time so the daily and night
 * modes follow the device clock across timezone and DST changes.
 */
export function shouldRunNow(
  pref: SportsBackgroundRefresh,
  lastRunAt: number | null,
  now: Date
): boolean {
  switch (pref.mode) {
    case 'off':
      return false;

    case 'interval': {
      if (lastRunAt == null) return true;
      return now.getTime() - lastRunAt >= clampIntervalHours(pref.intervalHours) * HOUR_MS;
    }

    case 'daily': {
      const dueAt = todayAt(now, parseTimeOfDay(pref.dailyTime));
      if (now.getTime() < dueAt) return false;
      // A run from an earlier day is always before today's slot, so a missed
      // night still refreshes at the next wake after the time passes.
      return lastRunAt == null || lastRunAt < dueAt;
    }

    case 'night': {
      const hour = now.getHours();
      if (hour < NIGHT_WINDOW.startHour || hour >= NIGHT_WINDOW.endHour) return false;
      const windowStart = todayAt(now, { hour: NIGHT_WINDOW.startHour, minute: 0 });
      // At most once per night: a run inside this window blocks the rest of it.
      return lastRunAt == null || lastRunAt < windowStart;
    }
  }
}

/**
 * How often the OS should wake the task, in minutes. `0` means the task should
 * be unregistered entirely.
 *
 * Interval mode wakes at half its period so the drift between a wake and the
 * moment the refresh becomes due stays bounded by half an interval; the OS
 * floor of 15 minutes still wins for short intervals, and the 12-hour ceiling
 * wins for the multi-day ones. The time-of-day modes wake on a fixed cadence —
 * often enough to land inside the night window and to hit the daily slot
 * promptly, rarely enough to cost nothing when it is not due.
 */
export function schedulerIntervalMinutes(pref: SportsBackgroundRefresh): number {
  switch (pref.mode) {
    case 'off':
      return 0;
    case 'interval':
      return Math.min(
        MAX_SCHEDULER_MINUTES,
        Math.max(MIN_SCHEDULER_MINUTES, (clampIntervalHours(pref.intervalHours) * 60) / 2)
      );
    case 'daily':
    case 'night':
      return TIME_OF_DAY_WAKE_MINUTES;
  }
}

/**
 * Day-scale intervals in the words people use for them; anything that is not a
 * round week is spelled out in days. The day count is already rounded, so a
 * stored value between the offered options lands on its nearest name.
 */
function describeIntervalDays(days: number): string {
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days === 14) return 'Every 2 weeks';
  return `Every ${days} days`;
}

/** Short human summary of the schedule, for the settings row. */
export function describePreference(pref: SportsBackgroundRefresh): string {
  switch (pref.mode) {
    case 'off':
      return 'Off';
    case 'interval': {
      const hours = clampIntervalHours(pref.intervalHours);
      if (hours < HOURS_PER_DAY) return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
      return describeIntervalDays(Math.round(hours / HOURS_PER_DAY));
    }
    case 'daily':
      return `Daily at ${normalizeDailyTime(pref.dailyTime)}`;
    case 'night':
      return `At night (${pad2(NIGHT_WINDOW.startHour)}–${pad2(NIGHT_WINDOW.endHour)})`;
  }
}
