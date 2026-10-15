/**
 * Jest config scoped to the mobile app. Kept intentionally light: the auth
 * module under test only imports AsyncStorage (mapped to an in-memory mock),
 * so we don't need the full React Native runtime — a plain node environment
 * plus babel-preset-expo for TS/JSX transpilation is enough.
 */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { babelrc: false, configFile: false, presets: ['babel-preset-expo'] },
    ],
  },
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/src/services/__tests__/asyncStorageMock.ts',
  },
};
