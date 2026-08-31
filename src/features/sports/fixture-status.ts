import type { Fixture } from 'expo-m3u-parser';

import { isMatchLive } from './match-widgets';

export type FixtureStatusKind = 'live' | 'halftime' | 'finished' | 'scheduled' | 'postponed' | 'cancelled' | 'unknown';

export interface FixtureStatusInfo {
  kind: FixtureStatusKind;
  /** Short label: "LIVE", "HT", "FT", "PP", "CANC" or the kickoff time. */
  label: string;
  /** Whether a scoreline should be shown instead of the kickoff time. */
  showScore: boolean;
}

export function formatKickoffTime(kickoffTime: number): string {
  return new Date(kickoffTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Single source of truth for how a fixture's status is presented. Accepts the
 * backend vocabulary (`FixtureStatus::to_str`: `in_progress`, `paused`,
 * `finished`, `postponed`, `cancelled`, `scheduled`) plus legacy variants.
 */
export function getFixtureStatus(fixture: Fixture): FixtureStatusInfo {
  const status = fixture.status.toUpperCase();
  switch (status) {
    case 'PAUSED':
    case 'HALFTIME':
      return { kind: 'halftime', label: 'HT', showScore: true };
    case 'FINISHED':
    case 'FULL_TIME':
      return { kind: 'finished', label: 'FT', showScore: true };
    case 'POSTPONED':
      return { kind: 'postponed', label: 'PP', showScore: false };
    case 'CANCELLED':
      return { kind: 'cancelled', label: 'CANC', showScore: false };
    default:
      if (isMatchLive(fixture)) {
        return { kind: 'live', label: 'LIVE', showScore: true };
      }
      if (status === 'SCHEDULED' || status === 'TIMED') {
        return { kind: 'scheduled', label: formatKickoffTime(fixture.kickoffTime), showScore: false };
      }
      return {
        kind: 'unknown',
        label: formatKickoffTime(fixture.kickoffTime),
        showScore: fixture.homeScore != null && fixture.awayScore != null,
      };
  }
}
