import type { Competition } from 'expo-m3u-parser';

import { DEFAULT_LEAGUE_ORDER, moveLeague, resolveLeagueOrder } from '../league-preferences';

const known: Competition[] = [
  { providerId: 17, provider: 'sofascore', name: 'Premier League' },
  { providerId: 4242, provider: 'sofascore', name: 'New League' },
];

describe('resolveLeagueOrder', () => {
  it('falls back to the default order and appends unknown registry leagues', () => {
    const order = resolveLeagueOrder(undefined, known);
    expect(order.slice(0, DEFAULT_LEAGUE_ORDER.length)).toEqual([...DEFAULT_LEAGUE_ORDER]);
    expect(order[order.length - 1]).toBe(4242);
  });

  it('keeps the saved order first and fills in leagues it does not mention', () => {
    const order = resolveLeagueOrder([8, 17], known);
    expect(order.slice(0, 2)).toEqual([8, 17]);
    expect(order).toContain(7);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('moveLeague', () => {
  it('swaps neighbours and ignores moves past the edges', () => {
    expect(moveLeague([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveLeague([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveLeague([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
