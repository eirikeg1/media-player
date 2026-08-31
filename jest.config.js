module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.@(ts|tsx)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Keep the haste crawler out of the Rust build output, the submodule's own
  // JS tests (the expo module ships its own jest setup), and agent worktrees
  // under .claude/ — a checkout there is a second copy of this repo and makes
  // every package and manual mock look duplicated to jest-haste-map.
  modulePathIgnorePatterns: ['<rootDir>/native/rust-backend/target', '<rootDir>/.claude/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/native/', '<rootDir>/.claude/'],
  watchPathIgnorePatterns: ['<rootDir>/native/rust-backend/target', '<rootDir>/.claude/'],
  clearMocks: true,
};
