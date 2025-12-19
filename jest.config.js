module.exports = {
  preset: 'jest-expo',
  watchman: false,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(jpg|jpeg|png|gif|mp4|mp3|svg)$': '<rootDir>/__mocks__/fileMock.js',
    // Ensure functions folder uses root axios so mocks work correctly
    '^axios$': '<rootDir>/node_modules/axios',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|expo-modules-core|expo-asset|expo-font|expo-constants|expo-linear-gradient|expo-blur|expo-apple-authentication|expo-device|expo-secure-store|expo-av|expo-video|expo-audio|expo-image-picker|react-native-gesture-handler|react-native-reanimated|@react-native-firebase|react-native-svg|react-native-sse|react-native-safe-area-context|react-native-markdown-display|react-native-webview|@react-native-google-signin)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/types/**',
    // Exclude low-value files from coverage
    '!src/assets/demo/**',
    '!src/components/molecules/demo/**',
    '!src/components/organisms/help/*WebView*.tsx',
    '!src/components/organisms/api-config/*WebView*.tsx',
    '!src/components/organisms/api-config/*Guidance*.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 65,
      lines: 70,
      statements: 70,
    },
  },
};
