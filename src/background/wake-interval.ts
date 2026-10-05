import { shortestSyncInterval } from '@/lib/sync-intervals';
import type { Playlist } from '@/types/playlist.types';

/**
 * How often the OS should wake the app's one background task. Pure: the
 * registration hook feeds it the stored intervals, the tests feed it numbers.
 */

/** WorkManager will not run periodic work more often than this. */
export const MIN_WAKE_MINUTES = 15;

/**
 * Ceiling on the wake cadence: at least two wakes a day, however long the
 * interval being served is. Each step still gates itself on its own interval,
 * so an extra wake only costs a cheap no-op check — while a cadence stretched to
 * days risks the device skipping the one wake that mattered and losing a whole
 * multi-day window.
 */
export const MAX_WAKE_MINUTES = 720;

/**
 * The wake cadence that serves work due every `periodMinutes`: half the period,
 * so the drift between a wake and the moment the work becomes due stays bounded
 * by half an interval, within what the platform accepts.
 */
export function wakeMinutesForPeriod(periodMinutes: number): number {
  return Math.min(MAX_WAKE_MINUTES, Math.max(MIN_WAKE_MINUTES, periodMinutes / 2));
}

/**
 * The cadence to register the background task at, or `0` when nothing could
 * ever be due and the task should be unregistered.
 *
 * @param playlists Every stored playlist — the task syncs all of them.
 * @param sportsWakeMinutes The sports refresh's own cadence; `0` when it is off.
 */
export function backgroundWakeMinutes(
  playlists: readonly Playlist[],
  sportsWakeMinutes: number,
): number {
  const candidates: number[] = [];
  const shortestSync = shortestSyncInterval(playlists);
  if (shortestSync !== null) candidates.push(wakeMinutesForPeriod(shortestSync));
  if (sportsWakeMinutes > 0) candidates.push(sportsWakeMinutes);
  return candidates.length === 0 ? 0 : Math.min(...candidates);
}
