/**
 * Jest runs the Analyze server-loop code ported from the web app
 * (src/analyze/**), keeping its tests verbatim. Everything else in functions
 * stays on node:test against the compiled lib/ (test/*.test.js).
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/analyze'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }] },
};
