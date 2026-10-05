/**
 * The sports database is opened once per process. Every hook on the sports tab
 * asks for it in the same tick, and each native handle carries its own
 * SofaScore rate limiter — a second handle would fire its requests unspaced and
 * trip the provider's cooldown.
 */

/** A fresh module registry, so the cached open promise starts empty per test. */
function loadService(): {
  getSportsDatabase: typeof import('../sports-service').getSportsDatabase;
  SportsDatabase: typeof import('expo-m3u-parser').SportsDatabase;
} {
  let service!: typeof import('../sports-service');
  let parser!: typeof import('expo-m3u-parser');
  // `require` is the point here: a static import would be hoisted out of the
  // isolated registry, and the module-level open promise is what's under test.
  /* eslint-disable @typescript-eslint/no-require-imports */
  jest.isolateModules(() => {
    parser = require('expo-m3u-parser');
    service = require('../sports-service');
  });
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { getSportsDatabase: service.getSportsDatabase, SportsDatabase: parser.SportsDatabase };
}

describe('getSportsDatabase', () => {
  it('opens once for callers that arrive in the same tick', async () => {
    const { getSportsDatabase, SportsDatabase } = loadService();
    const open = jest.spyOn(SportsDatabase, 'open');

    const [first, second, third] = await Promise.all([
      getSportsDatabase(),
      getSportsDatabase(),
      getSportsDatabase(),
    ]);

    expect(open).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('returns the same instance to later callers', async () => {
    const { getSportsDatabase, SportsDatabase } = loadService();
    const open = jest.spyOn(SportsDatabase, 'open');

    const first = await getSportsDatabase();
    const second = await getSportsDatabase();

    expect(open).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('clears the cached promise on failure so the next call retries', async () => {
    const { getSportsDatabase, SportsDatabase } = loadService();
    const open = jest.spyOn(SportsDatabase, 'open').mockRejectedValueOnce(new Error('locked'));

    await expect(getSportsDatabase()).rejects.toThrow('locked');
    await expect(getSportsDatabase()).resolves.toBeDefined();

    expect(open).toHaveBeenCalledTimes(2);
  });
});
