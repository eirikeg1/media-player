import { formatTime } from '@/lib/format-time';
import type { Fixture } from 'expo-m3u-parser';

export type FixtureStatusKind =
  | 'live'
  | 'halftime'
  | 'finished'
  | 'scheduled'
  | 'postponed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown';

export interface FixtureStatusInfo {
  kind: FixtureStatusKind;
  /** Short label: "LIVE", "HT", "FT", "PP", "CANC", "SUSP" or the kickoff time. */
  label: string;
  /** Whether a scoreline should be shown instead of the kickoff time. */
  showScore: boolean;
}

/** The kickoff time as local wall clock — the label every pre-match row shows. */
export function formatKickoffTime(kickoffTime: number): string {
  return formatTime(kickoffTime);
}

/**
 * The one place the backend's status vocabulary is interpreted.
 *
 * Accepts what `FixtureStatus::to_str` emits (`in_progress`, `paused`,
 * `finished`, `postponed`, `cancelled`, `scheduled`, `interrupted`) plus the
 * legacy spellings older cached rows and other providers use.
 *
 * Split from {@link getFixtureStatus} because the kind alone answers most
 * questions ("is this live?"), and deriving it must stay cheap enough to run
 * over a whole day of fixtures — building the label formats a time.
 */
export function fixtureStatusKind(fixture: Pick<Fixture, 'status'>): FixtureStatusKind {
  switch (fixture.status.toUpperCase()) {
    // `IN_PROGRESS`/`PAUSED` are what the backend emits; the rest are accepted
    // defensively.
    case 'IN_PROGRESS':
    case 'IN_PLAY':
    case 'LIVE':
      return 'live';
    case 'PAUSED':
    case 'HALFTIME':
      return 'halftime';
    case 'FINISHED':
    case 'FULL_TIME':
      return 'finished';
    case 'POSTPONED':
      return 'postponed';
    case 'CANCELLED':
      return 'cancelled';
    case 'SCHEDULED':
    case 'TIMED':
      return 'scheduled';
    // `INTERRUPTED` is the backend's own spelling; `SUSPENDED` and `ABANDONED`
    // are the provider spellings behind it, which its parser folds in too and
    // older cached rows still carry.
    case 'INTERRUPTED':
    case 'SUSPENDED':
    case 'ABANDONED':
      return 'interrupted';
    // Anything a newer backend starts emitting: shown by kickoff time, with
    // whatever score exists.
    default:
      return 'unknown';
  }
}

/** Whether the match is on the pitch right now — in play or at the break. */
export function isLiveStatusKind(kind: FixtureStatusKind): boolean {
  return kind === 'live' || kind === 'halftime';
}

/** Single source of truth for how a fixture's status is presented. */
export function getFixtureStatus(fixture: Fixture): FixtureStatusInfo {
  const kind = fixtureStatusKind(fixture);
  switch (kind) {
    case 'live':
      return { kind, label: 'LIVE', showScore: true };
    case 'halftime':
      return { kind, label: 'HT', showScore: true };
    case 'finished':
      return { kind, label: 'FT', showScore: true };
    case 'postponed':
      return { kind, label: 'PP', showScore: false };
    case 'cancelled':
      return { kind, label: 'CANC', showScore: false };
    // The match kicked off and stopped: the score it stopped at is the whole
    // story, so it is shown rather than a kickoff time that has long passed.
    case 'interrupted':
      return { kind, label: 'SUSP', showScore: true };
    case 'scheduled':
      return { kind, label: formatKickoffTime(fixture.kickoffTime), showScore: false };
    case 'unknown':
      return {
        kind,
        label: formatKickoffTime(fixture.kickoffTime),
        showScore: fixture.homeScore != null && fixture.awayScore != null,
      };
  }
}
