import type { Fixture } from 'expo-m3u-parser';

/**
 * Helpers for embedding SofaScore match widgets (https://corporate.sofascore.com/widgets).
 *
 * The widgets are official, publicly embeddable pages served from
 * `widgets.sofascore.com`. They update live and are the same data shown in the
 * SofaScore app, so we surface them in a WebView overlay instead of
 * re-implementing match stats natively.
 *
 * Only fixtures sourced from SofaScore expose a usable event id, so widgets are
 * gated on the provider. `Fixture.providerId` is the SofaScore event id and the
 * team ids are SofaScore team ids — everything the embeds need.
 */

const WIDGET_BASE = 'https://widgets.sofascore.com/en/embed';
const SOFASCORE_PROVIDER = 'sofascore';

export interface MatchWidgetTab {
  /** Stable key used for tab selection and WebView remounting. */
  key: string;
  /** Short label shown in the tab strip. */
  label: string;
  /** Fully-qualified embed URL for this widget. */
  url: string;
}

/** A SofaScore-sourced fixture is required for the widgets to resolve. */
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
 * Whether a URL belongs to SofaScore (the widget pages, their static assets,
 * and their API all do). Used to keep the embed WebView from navigating away to
 * unrelated sites while still allowing every resource the widget needs. Non-http
 * schemes (e.g. `about:blank`, `data:`) are allowed so the WebView can bootstrap.
 */
export function isSofascoreUrl({ url }: { url: string }): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return true;
  try {
    const host = new URL(url).hostname;
    return host === 'sofascore.com' || host.endsWith('.sofascore.com') || host.endsWith('.sofascore.app');
  } catch {
    return false;
  }
}

/** Append the dark theme that matches the player's black backdrop. */
function widgetUrl(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${WIDGET_BASE}/${path}${separator}widgetTheme=dark`;
}

/**
 * Build the set of widget tabs for a fixture. The match-level widgets only need
 * the event id; team info widgets need the SofaScore team ids, which may be
 * absent for some fixtures, so they are added conditionally.
 */
export function buildMatchWidgetTabs(fixture: Fixture): MatchWidgetTab[] {
  const eventId = fixture.providerId;

  const tabs: MatchWidgetTab[] = [
    { key: 'lineups', label: 'Lineups', url: widgetUrl(`lineups?id=${eventId}`) },
    { key: 'momentum', label: 'Momentum', url: widgetUrl(`attackMomentum?id=${eventId}`) },
  ];

  if (fixture.homeTeamId) {
    tabs.push({
      key: 'home',
      label: fixture.homeTeamShort || fixture.homeTeam,
      url: widgetUrl(`team/${fixture.homeTeamId}/info`),
    });
  }

  if (fixture.awayTeamId) {
    tabs.push({
      key: 'away',
      label: fixture.awayTeamShort || fixture.awayTeam,
      url: widgetUrl(`team/${fixture.awayTeamId}/info`),
    });
  }

  return tabs;
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
