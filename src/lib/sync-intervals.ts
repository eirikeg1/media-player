import type { Playlist } from '@/types/playlist.types';

/**
 * The vocabulary of a playlist's two automatic syncs — the channel list
 * (`syncInterval`) and the programme guide (`epgSyncInterval`) — and the one
 * definition of when either is due. The form, the store, the foreground
 * schedulers and the OS background task all read it from here, so they cannot
 * disagree about what "every 6 hours" or "off" means.
 *
 * Intervals are minutes. `0` is an explicit "off"; an unset interval (only ever
 * seen on rows written before the defaults existed) is treated the same way.
 */

/** Explicitly off: the user chose not to sync automatically. */
export const SYNC_OFF = 0;

/**
 * Channel lists: panels rename their event channels per match, so a day-old
 * list no longer says which channel carries tonight's game.
 */
export const DEFAULT_PLAYLIST_SYNC_MINUTES = 360;

/** Programme guides: providers publish them a day or more ahead. */
export const DEFAULT_EPG_SYNC_MINUTES = 1440;

/** The choices both interval pickers offer, "Off" first. */
export const SYNC_INTERVAL_OPTIONS: { label: string; value: number }[] = [
  { label: 'Off', value: SYNC_OFF },
  { label: 'Every 1 hour', value: 60 },
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 4 hours', value: 240 },
  { label: 'Every 6 hours', value: 360 },
  { label: 'Every 8 hours', value: 480 },
  { label: 'Every 12 hours', value: 720 },
  { label: 'Every day', value: 1440 },
  { label: 'Every 2 days', value: 2880 },
  { label: 'Every 4 days', value: 5760 },
  { label: 'Every week', value: 10080 },
];

/** Whether an interval asks for automatic syncing at all. */
function isEnabled(intervalMinutes: number | undefined): intervalMinutes is number {
  return intervalMinutes !== undefined && intervalMinutes > 0;
}

/**
 * Whether `lastSyncAt + intervalMinutes` has elapsed at `now` (epoch millis).
 * Never synced is overdue; an interval that is off or unset is never due.
 */
export function isOverdue(
  lastSyncAt: Date | undefined,
  intervalMinutes: number | undefined,
  now: number,
): boolean {
  if (!isEnabled(intervalMinutes)) return false;
  if (!lastSyncAt) return true;
  return now >= lastSyncAt.getTime() + intervalMinutes * 60_000;
}

/** Whether the playlist's channel list is due for a re-import. */
export function isChannelSyncDue(playlist: Playlist, now: number): boolean {
  return isOverdue(playlist.lastFetchedAt, playlist.syncInterval, now);
}

/** Whether the playlist's programme guide is due for a download. */
export function isGuideSyncDue(playlist: Playlist, now: number): boolean {
  return isOverdue(playlist.lastEpgFetchedAt, playlist.epgSyncInterval, now);
}

/**
 * The shortest interval any of these playlists syncs at, channels or guide, or
 * `null` when none of them syncs automatically.
 */
export function shortestSyncInterval(playlists: readonly Playlist[]): number | null {
  let shortest: number | null = null;
  for (const playlist of playlists) {
    for (const interval of [playlist.syncInterval, playlist.epgSyncInterval]) {
      if (isEnabled(interval) && (shortest === null || interval < shortest)) shortest = interval;
    }
  }
  return shortest;
}
