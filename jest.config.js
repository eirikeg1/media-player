module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/setup.ts'],
  // Pins the process timezone before workers spawn; see the file for why a
  // test cannot do this itself.
  globalSetup: '<rootDir>/src/test/global-setup.js',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.@(ts|tsx)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Mirror metro.config.js: `.bin` (the recommendation model) is an asset, so
  // requiring it must yield an asset stub instead of being parsed as source.
  transform: {
    '^.+\\.bin$': require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  // Keep the haste crawler out of the Rust build output, the submodule's own
  // JS tests (the expo module ships its own jest setup), and agent worktrees
  // under .claude/ — a checkout there is a second copy of this repo and makes
  // every package and manual mock look duplicated to jest-haste-map.
  modulePathIgnorePatterns: ['<rootDir>/native/rust-backend/target', '<rootDir>/.claude/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/native/', '<rootDir>/.claude/'],
  watchPathIgnorePatterns: ['<rootDir>/native/rust-backend/target', '<rootDir>/.claude/'],
  clearMocks: true,
  // On a cold transform cache (every CI run) the first render in a suite pays
  // for transpiling its whole component tree inside the test's own clock,
  // which overruns the 5 s default. The tests themselves are quick.
  testTimeout: 30000,
};
