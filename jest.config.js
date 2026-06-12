module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.@(ts|tsx)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Keep the haste crawler out of the Rust build output and the submodule's
  // own JS tests (the expo module ships its own jest setup).
  modulePathIgnorePatterns: ['<rootDir>/native/rust-backend/target'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/native/'],
  watchPathIgnorePatterns: ['<rootDir>/native/rust-backend/target'],
  clearMocks: true,
};
