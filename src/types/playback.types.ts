/**
 * Playback types shared by the video layer and its callers. Catch-up windows
 * originate in the sports tab but travel through route params, the playback
 * session and the cast bar, so the type lives here rather than in a feature.
 */

/** A slice of a channel's catch-up archive, as the panel addresses it. */
export interface CatchupWindow {
  /** Window start as a Unix timestamp in seconds. */
  start: number;
  /** Window length in minutes. */
  durationMinutes: number;
}

/** Whether two windows (either of which may be absent) address the same slice. */
export function sameCatchupWindow(a: CatchupWindow | null, b: CatchupWindow | null): boolean {
  if (!a || !b) return a === b;
  return a.start === b.start && a.durationMinutes === b.durationMinutes;
}

/**
 * Rebuild a window from its route params. Everything about the pair must be a
 * positive finite number — a partial or garbled pair means "no catch-up", never
 * a window pointing at the wrong part of the archive.
 */
export function parseCatchupParams(start?: string, duration?: string): CatchupWindow | null {
  if (!start || !duration) return null;
  const startUnix = Number(start);
  const durationMinutes = Number(duration);
  if (!isFinite(startUnix) || startUnix <= 0) return null;
  if (!isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return { start: startUnix, durationMinutes };
}
