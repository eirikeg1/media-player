import type { Fixture } from 'expo-m3u-parser';

/**
 * Helpers for the SofaScore match overlay.
 *
 * Every tab is now rendered natively from the SofaScore API (team statistics,
 * the lineups pitch with player ratings, the incident timeline and the
 * head-to-head preview) — there is no embedded WebView. Only fixtures sourced from SofaScore
 * expose a usable event id, so the overlay is gated on the provider:
 * `Fixture.providerId` is the SofaScore event id.
 */

const SOFASCORE_PROVIDER = 'sofascore';

/** The tabs shown in the match overlay; each is rendered natively. */
export type MatchTabKind = 'stats' | 'timeline' | 'lineups' | 'preview';

export interface MatchTab {
  /** Stable key used for tab selection and content switching. */
  key: MatchTabKind;
  /** Short label shown in the tab strip. */
  label: string;
}

/** A SofaScore-sourced fixture is required for the overlay to resolve. */
export function supportsMatchWidgets(
  fixture: Fixture | null | undefined
): fixture is Fixture {
  return (
    !!fixture &&
    fixture.provider === SOFASCORE_PROVIDER &&
    Number.isFinite(fixture.providerId) &&
    fixture.providerId > 0
  );
}

/**
 * Whether the match has kicked off — decides the default tab and ordering.
 * Postponed/cancelled/unknown fixtures count as not started: their in-play tabs
 * have no content, so the preview should lead just like before kickoff.
 */
export function matchHasStarted(fixture: Fixture): boolean {
  const status = fixture.status.toUpperCase();
  return isMatchLive(fixture) || status === 'FINISHED' || status === 'FULL_TIME';
}

/** Whether the match is currently in play — gates live polling of stats/score. */
export function isMatchLive(fixture: Fixture): boolean {
  switch (fixture.status.toUpperCase()) {
    // `IN_PROGRESS`/`PAUSED` are what the backend emits (FixtureStatus::to_str);
    // the others are accepted defensively.
    case 'IN_PROGRESS':
    case 'IN_PLAY':
    case 'LIVE':
    case 'PAUSED':
    case 'HALFTIME':
      return true;
    default:
      return false;
  }
}

/**
 * Whether the match has reached a state it cannot go (back) live from — used to
 * stop score polling for good. Scheduled and unknown/interrupted statuses are
 * *not* concluded: polling must keep running to catch kickoff or a resumption.
 */
export function isMatchConcluded(status: string): boolean {
  switch (status.toUpperCase()) {
    case 'FINISHED':
    case 'FULL_TIME':
    case 'POSTPONED':
    case 'CANCELLED':
    case 'SUSPENDED':
    case 'ABANDONED':
      return true;
    default:
      return false;
  }
}

/**
 * Build the overlay tabs for a fixture. Live/finished matches lead with the
 * statistics that now exist; upcoming matches lead with the form & head-to-head
 * preview, since the in-play tabs would only show "not available yet".
 */
export function buildMatchTabs(fixture: Fixture): MatchTab[] {
  const stats: MatchTab = { key: 'stats', label: 'Stats' };
  const timeline: MatchTab = { key: 'timeline', label: 'Timeline' };
  const preview: MatchTab = { key: 'preview', label: 'Form & H2H' };
  const lineups: MatchTab = { key: 'lineups', label: 'Lineups' };

  return matchHasStarted(fixture)
    ? [stats, timeline, lineups, preview]
    : [preview, lineups, stats, timeline];
}

export interface FixtureScoreDisplay {
  /** Short label for the home side. */
  home: string;
  /** Short label for the away side. */
  away: string;
  /** `"2 - 1"` when a score exists, otherwise null (pre-match). */
  score: string | null;
  /** Short status text e.g. "LIVE", "FT", "HT", or the kickoff time. */
  status: string;
  /** Accent colour for the status text. */
  statusColor: string;
  /** Whether the match is currently in play (for live styling). */
  isLive: boolean;
}

/** Format the compact score line shown on the in-player score button. */
export function getFixtureScoreDisplay(fixture: Fixture): FixtureScoreDisplay {
  const home = fixture.homeTeamShort || fixture.homeTeam;
  const away = fixture.awayTeamShort || fixture.awayTeam;
  const normalized = fixture.status.toUpperCase();

  const hasScore =
    normalized !== 'SCHEDULED' &&
    normalized !== 'TIMED' &&
    fixture.homeScore != null &&
    fixture.awayScore != null;

  const score = hasScore ? `${fixture.homeScore} - ${fixture.awayScore}` : null;

  switch (normalized) {
    // `IN_PROGRESS` is what the backend actually emits (FixtureStatus::to_str);
    // the others are accepted defensively.
    case 'IN_PROGRESS':
    case 'IN_PLAY':
    case 'LIVE':
      return { home, away, score, status: 'LIVE', statusColor: '#FF3B30', isLive: true };
    case 'PAUSED':
    case 'HALFTIME':
      return { home, away, score, status: 'HT', statusColor: '#FF9500', isLive: true };
    case 'FINISHED':
      return { home, away, score, status: 'FT', statusColor: '#8E8E93', isLive: false };
    default: {
      const kickoff = new Date(fixture.kickoffTime * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { home, away, score, status: kickoff, statusColor: '#FFFFFF', isLive: false };
    }
  }
}
