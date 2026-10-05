import type { Href } from 'expo-router';
import type { EpgProgramme, SeriesInfo } from 'expo-m3u-parser';

import type { Channel } from '@/types/playlist.types';

/**
 * Objects a screen hands the next route as a search parameter.
 *
 * The detail surfaces (movie, series, channel, match…) are routes rather than
 * in-screen modals, so the title they are about has to travel with the
 * navigation. It travels serialised rather than as an id the target looks up
 * again: the launching screen already holds the record, a second lookup costs a
 * round-trip per open, and an id would miss a title the provider has dropped
 * since the list was fetched.
 *
 * A route parameter is untrusted input — it survives a process restart, an app
 * update that changed the shape, and hand-edited deep links — so it is
 * validated on the way back in rather than cast. Decoding therefore never
 * throws: a malformed parameter means the route shows an error state, not that
 * the app crashes on a field that is simply absent.
 */
export interface RouteParam<T> {
  /** Serialise a value for `router.push` params. */
  encode(value: T): string;
  /** Read a value back out, or `null` when there is none and when it is not one. */
  decode(raw: string | string[] | undefined): T | null;
}

/**
 * Build the serialise/validate pair for one kind of route parameter.
 *
 * @param validate The fields the receiving route cannot render without.
 */
export function defineRouteParam<T>(validate: (value: unknown) => value is T): RouteParam<T> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => {
      // Expo Router hands over an array when a parameter appears more than once.
      const serialized = Array.isArray(raw) ? raw[0] : raw;
      if (!serialized) return null;
      try {
        const parsed: unknown = JSON.parse(serialized);
        return validate(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
  };
}

/** A JSON object — neither `null` (which is also `'object'`) nor an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChannel(value: unknown): value is Channel {
  if (!isRecord(value)) return false;
  // `tvg` and `group` are dereferenced unconditionally by `getChannelId` and by
  // every detail header, so their presence is as load-bearing as the name.
  return (
    typeof value.name === 'string' &&
    typeof value.url === 'string' &&
    isRecord(value.tvg) &&
    isRecord(value.group)
  );
}

function isSeriesInfo(value: unknown): value is SeriesInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.seriesName === 'string' &&
    typeof value.groupName === 'string' &&
    typeof value.episodeCount === 'number' &&
    (value.poster == null || typeof value.poster === 'string')
  );
}

function isEpgProgramme(value: unknown): value is EpgProgramme {
  if (!isRecord(value)) return false;
  // The programme surface renders the title and lays the times out as a clock
  // range and a duration; the channel it belongs to is what "Watch Channel"
  // resolves against. Everything else on a programme is decoration.
  return (
    typeof value.channelId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.start === 'number' &&
    typeof value.stop === 'number'
  );
}

/** A channel (movie, episode or live channel) as a route parameter. */
export const channelParam = defineRouteParam<Channel>(isChannel);

/** A series — the catalogue entry, not its episodes — as a route parameter. */
export const seriesInfoParam = defineRouteParam<SeriesInfo>(isSeriesInfo);

/** An EPG programme — one guide cell — as a route parameter. */
export const epgProgrammeParam = defineRouteParam<EpgProgramme>(isEpgProgramme);

/**
 * The team a detail route is opened for.
 *
 * Everything a fixture already knows about a side, which is all the team
 * surface needs to render its header while the schedule is still loading.
 * Shaped like `Team` (provider plus the provider's id) so a stored parameter
 * says whose id it carries rather than leaving it implied.
 */
export interface TeamRef {
  /** Sports data provider the id belongs to ("sofascore"). */
  provider: string;
  providerId: number;
  name: string;
  crest?: string | null;
}

/** The section of the competition surface a press opens it on. */
export type LeagueTab = 'matches' | 'standings' | 'scorers';

const LEAGUE_TABS: readonly string[] = ['matches', 'standings', 'scorers'];

/**
 * The competition a detail route is opened for, on the day it was opened from.
 *
 * The header fields travel so the surface has something to show before its
 * fixtures arrive; `key` and `dateIso` are what it re-resolves the day's group
 * by, so the matches it lists keep following the poll instead of freezing at
 * the snapshot it was opened with.
 */
export interface LeagueRef {
  /** Grouping key — `league:<competitionId>`; see `groupFixturesByLeague`. */
  key: string;
  /** Provider competition id; without one there is no table and no scorers. */
  competitionId?: number;
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  /** The local day whose fixtures the surface lists, ISO-8601. */
  dateIso: string;
  tab: LeagueTab;
}

function isTeamRef(value: unknown): value is TeamRef {
  if (!isRecord(value)) return false;
  return (
    typeof value.provider === 'string' &&
    typeof value.providerId === 'number' &&
    typeof value.name === 'string' &&
    (value.crest == null || typeof value.crest === 'string')
  );
}

function isLeagueRef(value: unknown): value is LeagueRef {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === 'string' &&
    typeof value.title === 'string' &&
    // Read back as a `Date`: an unparseable day would quietly list a window
    // around `NaN` rather than the day the user was looking at.
    typeof value.dateIso === 'string' &&
    Number.isFinite(Date.parse(value.dateIso)) &&
    typeof value.tab === 'string' &&
    LEAGUE_TABS.includes(value.tab) &&
    (value.competitionId == null || typeof value.competitionId === 'number') &&
    (value.subtitle == null || typeof value.subtitle === 'string') &&
    (value.logoUrl == null || typeof value.logoUrl === 'string')
  );
}

/**
 * A route and the parameters it was pushed with, as an href object.
 *
 * Only the object form is accepted. The string form of `Href` carries its
 * parameters in the query string, which would have to be re-parsed to be
 * checked at all — and nothing in this app produces one.
 */
function isHref(value: unknown): value is Href {
  if (!isRecord(value)) return false;
  if (typeof value.pathname !== 'string' || value.pathname === '') return false;
  return value.params === undefined || isRecord(value.params);
}

/**
 * A whole route — pathname plus parameters — as a route parameter.
 *
 * It is what a playback session remembers about where it was launched from, so
 * expanding the mini player bar can put that surface back underneath the player
 * however far the user has navigated away in the meantime.
 */
export const hrefParam = defineRouteParam<Href>(isHref);

/** The team a match's score line leads to, as a route parameter. */
export const teamRefParam = defineRouteParam<TeamRef>(isTeamRef);

/** The competition a league header leads to, as a route parameter. */
export const leagueRefParam = defineRouteParam<LeagueRef>(isLeagueRef);
