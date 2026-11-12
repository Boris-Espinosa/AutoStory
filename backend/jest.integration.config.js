/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/src/testing/setup-env.ts'],
  testMatch: ['**/*.integration.test.ts'],
  clearMocks: true,
  maxWorkers: 1,
  testTimeout: 30000,
};
