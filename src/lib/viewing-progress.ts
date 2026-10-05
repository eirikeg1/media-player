/**
 * The single definition of "watched, but not finished".
 *
 * Continue-watching rows, the resume prompt and the series "continue" pointer
 * all have to agree on when playback counts as resumable, otherwise a title
 * offers to resume in one place and starts from the beginning in another.
 *
 * The repository mirrors this rule in SQL (it filters inside the query rather
 * than fetching every stats row); those queries bind `RESUME_MIN_SECONDS` and
 * `COMPLETION_RATIO` so the numbers cannot drift. Any change here must be
 * reflected in the SQL comments that point back to this file.
 */

/**
 * Progress below this many seconds is treated as "not started": a few seconds
 * of buffering or a mis-tap should not turn into a resume offer.
 */
export const RESUME_MIN_SECONDS = 30;

/** Watching this far into a known duration counts as finished. */
export const COMPLETION_RATIO = 0.9;

/**
 * Whether playback of a title is resumable.
 *
 * An unknown (or non-positive) `totalDuration` — live content, or a stream that
 * never reported one — cannot be checked against the completion ratio, so any
 * real progress counts as in progress.
 */
export function isInProgress(lastPosition: number, totalDuration?: number | null): boolean {
  if (!Number.isFinite(lastPosition) || lastPosition < RESUME_MIN_SECONDS) {
    return false;
  }
  if (totalDuration == null || !Number.isFinite(totalDuration) || totalDuration <= 0) {
    return true;
  }
  return lastPosition < totalDuration * COMPLETION_RATIO;
}

/** Whether playback reached the point where the title counts as watched. */
export function isCompleted(position: number, totalDuration?: number | null): boolean {
  if (totalDuration == null || !Number.isFinite(totalDuration) || totalDuration <= 0) {
    return false;
  }
  return position / totalDuration >= COMPLETION_RATIO;
}
