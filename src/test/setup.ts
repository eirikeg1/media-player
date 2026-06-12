/**
 * Global Jest setup, run before each test file.
 *
 * Native-boundary modules (expo-sqlite, expo-m3u-parser, expo-crypto) are
 * replaced automatically via the root `__mocks__/` directory — see
 * `src/test/fakes/` for the implementations. Everything above that boundary
 * (repositories, services, stores, hooks, components) runs for real.
 */

// jest-expo's preset setup registers its own legacy-API factory for
// expo-file-system (no `Paths`/`File`), which beats the automatic root
// manual mock. Re-register here (this setup file runs after the preset's)
// so `__mocks__/expo-file-system.ts` wins.
jest.mock('expo-file-system', () => jest.requireActual('../../__mocks__/expo-file-system'));

// Repositories and stores log verbosely; keep test output readable.
// Run with KEEP_TEST_LOGS=1 to see them while debugging.
if (!process.env.KEEP_TEST_LOGS) {
  console.log = () => {};
}
