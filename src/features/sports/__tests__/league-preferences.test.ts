import type { Competition } from 'expo-m3u-parser';

import { DEFAULT_LEAGUE_ORDER, moveLeague, resolveLeagueOrder } from '../league-preferences';

function competition(providerId: number, name: string): Competition {
  return { providerId, provider: 'sofascore', name, international: false };
}

const known: Competition[] = [
  competition(17, 'Premier League'),
  competition(8, 'La Liga'),
  competition(4242, 'New League'),
];

describe('resolveLeagueOrder', () => {
  it('falls back to the default order and appends unknown registry leagues', () => {
    const order = resolveLeagueOrder(undefined, known);
    // Only the defaults the registry actually knows, in default order...
    expect(order.slice(0, 2)).toEqual([17, 8]);
    // ...and the league the defaults don't mention, last.
    expect(order[order.length - 1]).toBe(4242);
  });

  it('keeps the saved order first and fills in leagues it does not mention', () => {
    const order = resolveLeagueOrder([8, 17], known);
    expect(order.slice(0, 2)).toEqual([8, 17]);
    expect(order).toContain(4242);
    expect(new Set(order).size).toBe(order.length);
  });

  it('drops ids the registry does not know', () => {
    // The settings screen moves leagues by row index and can only render a row
    // for a resolvable id, so an unresolvable one shifts every arrow below it.
    const order = resolveLeagueOrder([999, 17], known);
    expect(order).not.toContain(999);
    expect(order[0]).toBe(17);
  });

  it('leaves the order alone while the registry is still loading', () => {
    // Empty means "not loaded yet", not "nothing exists": filtering here would
    // leave the matches list unranked for the first frames after launch.
    expect(resolveLeagueOrder(undefined, [])).toEqual([...DEFAULT_LEAGUE_ORDER]);
  });
});

describe('moveLeague', () => {
  it('swaps neighbours and ignores moves past the edges', () => {
    expect(moveLeague([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveLeague([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveLeague([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
