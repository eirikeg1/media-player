import type { Fixture } from 'expo-m3u-parser';

import { defineRouteParam } from '@/lib/route-params';

/**
 * The fixture a screen hands the video player, as a route parameter.
 *
 * It travels serialised rather than as an id the player looks up again, and
 * that is deliberate: the player needs the static half of a fixture — the two
 * team names, the crests, the competition — which only the screen that launched
 * it has in hand, and an id lookup would miss a fixture the nightly prune has
 * already dropped. Everything that *changes* is polled separately by
 * `useLiveMatchScore`, so nothing here goes stale on screen.
 *
 * See `@/lib/route-params` for why the value is validated on the way back in.
 */

/** The fields the player and its widgets cannot render without. */
function isFixture(value: unknown): value is Fixture {
  if (typeof value !== 'object' || value === null) return false;
  const fixture = value as Partial<Fixture>;
  return (
    typeof fixture.providerId === 'number' &&
    typeof fixture.provider === 'string' &&
    typeof fixture.homeTeam === 'string' &&
    typeof fixture.awayTeam === 'string' &&
    typeof fixture.competitionName === 'string' &&
    typeof fixture.kickoffTime === 'number' &&
    typeof fixture.status === 'string'
  );
}

const fixtureParam = defineRouteParam<Fixture>(isFixture);

/** Serialise a fixture for `router.push` params. */
export const fixtureRouteParam = fixtureParam.encode;

/**
 * Read a fixture back out of a route parameter, or `null` when there is none
 * and when what is there is not one. Never throws: a malformed parameter means
 * the player opens without match widgets, not that it fails to open.
 */
export const parseFixtureParam = fixtureParam.decode;
