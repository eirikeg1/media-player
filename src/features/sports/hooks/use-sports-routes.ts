import { leagueRefParam, teamRefParam, type LeagueRef, type TeamRef } from '@/lib/route-params';
import type { Fixture } from 'expo-m3u-parser';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';

import { fixtureRouteParam } from '../fixture-param';

/** A match's detail surface. */
export function matchHref(fixture: Fixture): Href {
  return { pathname: '/match', params: { fixture: fixtureRouteParam(fixture) } };
}

/** A side's detail surface. */
export function teamHref(team: TeamRef): Href {
  return { pathname: '/team', params: { team: teamRefParam.encode(team) } };
}

/** A competition's detail surface, on the day it was opened from. */
export function leagueHref(league: LeagueRef): Href {
  return { pathname: '/league', params: { league: leagueRefParam.encode(league) } };
}

export interface SportsRoutes {
  /** Open a match's detail surface. */
  openMatch: (fixture: Fixture) => void;
  /** Open a side's upcoming matches. */
  openTeam: (team: TeamRef) => void;
  /** Open a competition on the day it was opened from. */
  openLeague: (league: LeagueRef) => void;
}

/**
 * The pushes between the sports detail routes, in one place.
 *
 * A match opens from the day list, from a competition and from a team; a team
 * opens from a match — the surfaces push each other, so the pathname and the
 * encoding of what travels with it belong here rather than in each of them.
 * The hrefs are exported on their own too: a match surface that launches
 * playback has to name itself as the session's launch origin.
 *
 * The object is stable for the life of the screen: the fixture rows below it
 * are memoised on their press handler.
 */
export function useSportsRoutes(): SportsRoutes {
  const router = useRouter();

  return useMemo<SportsRoutes>(
    () => ({
      openMatch: (fixture) => router.push(matchHref(fixture)),
      openTeam: (team) => router.push(teamHref(team)),
      openLeague: (league) => router.push(leagueHref(league)),
    }),
    [router]
  );
}
