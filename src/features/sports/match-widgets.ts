import type { Fixture } from 'expo-m3u-parser';

import { fixtureStatusKind, getFixtureStatus, isLiveStatusKind, type FixtureStatusKind } from './fixture-status';
import { liveMinuteLabel } from './live-minute';

/**
 * Helpers for the SofaScore match overlay: which tabs a fixture supports, and
 * how its status and scoreline read on screen.
 *
 * Every tab is rendered natively from the SofaScore API — team statistics, the
 * lineups pitch with player ratings, the incident timeline, the head-to-head
 * preview. Only fixtures sourced from SofaScore expose a usable event id, so
 * the overlay is gated on the provider: `Fixture.providerId` *is* the SofaScore
 * event id.
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
 * have no content, so the preview should lead just like before kickoff. An
 * interrupted match did kick off, so its statistics and timeline lead.
 */
export function matchHasStarted(fixture: Fixture): boolean {
  const kind = fixtureStatusKind(fixture);
  return isLiveStatusKind(kind) || kind === 'finished' || kind === 'interrupted';
}

/** Whether the match is currently in play — gates live polling of stats/score. */
export function isMatchLive(fixture: Fixture): boolean {
  return isLiveStatusKind(fixtureStatusKind(fixture));
}

/**
 * How long past kickoff a match of unresolved status is still polled. Nothing
 * takes six hours, so a status that says neither "on" nor "over" — interrupted,
 * or a spelling this build doesn't know — is treated as over by then.
 */
const UNRESOLVED_STATUS_POLL_HOURS = 6;

/** The kinds that say nothing about whether the match can still resume. */
function isUnresolvedKind(kind: FixtureStatusKind): boolean {
  return kind === 'interrupted' || kind === 'unknown';
}

/**
 * Whether the match has reached a state it cannot go (back) live from — used to
 * stop score polling for good.
 *
 * Decided from {@link fixtureStatusKind}, not from the raw status text: the
 * backend emits one lowercase vocabulary (`FixtureStatus::to_str`) and matching
 * other spellings against it only ever produced false negatives. `interrupted`
 * covers both a match that resumes and one that never does — the provider does
 * not say which — so it keeps polling until
 * {@link UNRESOLVED_STATUS_POLL_HOURS} past kickoff rather than freezing the
 * surface on a suspended match or polling an abandoned one for the rest of the
 * day. A status this build doesn't recognise is treated the same way.
 */
export function isMatchConcluded(
  fixture: Pick<Fixture, 'status' | 'kickoffTime'>,
  now: Date = new Date()
): boolean {
  const kind = fixtureStatusKind(fixture);
  if (!isUnresolvedKind(kind)) return isConcludedKind(kind);
  const secondsSinceKickoff = now.getTime() / 1000 - fixture.kickoffTime;
  return secondsSinceKickoff > UNRESOLVED_STATUS_POLL_HOURS * 3600;
}

/**
 * Whether a status on its own says the match is over.
 *
 * For the score poll, which is handed a scoreline with no kickoff time. It is
 * the same rule minus the unresolved-status timeout — an interrupted or
 * unrecognised status keeps polling — and the poll's own `enabled` gate applies
 * {@link isMatchConcluded} to the fixture it belongs to.
 */
export function isConcludedStatus(status: string): boolean {
  return isConcludedKind(fixtureStatusKind({ status }));
}

function isConcludedKind(kind: FixtureStatusKind): boolean {
  return kind === 'finished' || kind === 'postponed' || kind === 'cancelled';
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

/**
 * Accent for the status text. Hard-coded rather than taken from the sports
 * palette: every surface showing this line (the in-player button, the overlay
 * header) sits on a dark card over the video, whatever the app theme is.
 */
const STATUS_COLOR: Record<FixtureStatusKind, string> = {
  live: '#FF3B30',
  halftime: '#FF9500',
  finished: '#8E8E93',
  scheduled: '#FFFFFF',
  postponed: '#FFFFFF',
  cancelled: '#FFFFFF',
  // Amber like the break: play has stopped, but the match is not over.
  interrupted: '#FF9500',
  unknown: '#FFFFFF',
};

/**
 * Format the compact score line shown on the in-player score button.
 *
 * The label and whether a scoreline belongs there both come from
 * {@link getFixtureStatus}, so a postponed or cancelled match reads as such
 * instead of advertising a kickoff time next to a stale 0-0.
 *
 * `now` decides the live match minute; it is a parameter so callers can pin it
 * in tests or advance it on their own tick, and defaults to the current time.
 */
export function getFixtureScoreDisplay(fixture: Fixture, now: Date = new Date()): FixtureScoreDisplay {
  const status = getFixtureStatus(fixture);
  const hasScore = status.showScore && fixture.homeScore != null && fixture.awayScore != null;

  return {
    home: fixture.homeTeamShort || fixture.homeTeam,
    away: fixture.awayTeamShort || fixture.awayTeam,
    score: hasScore ? `${fixture.homeScore} - ${fixture.awayScore}` : null,
    // The match minute when the backend captured the clock, "LIVE" otherwise.
    status: (status.kind === 'live' ? liveMinuteLabel(fixture, now) : null) ?? status.label,
    statusColor: STATUS_COLOR[status.kind],
    isLive: isLiveStatusKind(status.kind),
  };
}
