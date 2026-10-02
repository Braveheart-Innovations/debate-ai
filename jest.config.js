module.exports = {
  preset: 'jest-expo',
  watchman: false,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: [
    '@testing-library/react-native/extend-expect',
    '<rootDir>/jest.setupAfterEnv.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test-utils/(.*)$': '<rootDir>/test-utils/$1',
    '\\.(jpg|jpeg|png|gif|mp4|mp3|svg)$': '<rootDir>/__mocks__/fileMock.js',
    // Ensure functions folder uses root axios so mocks work correctly
    '^axios$': '<rootDir>/node_modules/axios',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|expo-modules-core|expo-asset|expo-font|expo-constants|expo-linear-gradient|expo-blur|expo-apple-authentication|expo-device|expo-secure-store|expo-av|expo-video|expo-video-thumbnails|expo-audio|expo-image-picker|expo-document-picker|react-native-gesture-handler|react-native-keyboard-controller|react-native-reanimated|@react-native-firebase|react-native-svg|react-native-sse|react-native-safe-area-context|react-native-markdown-display|react-native-webview|@react-native-google-signin|react-native-code-highlighter|react-syntax-highlighter|trim-newlines)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '<rootDir>/functions/'],
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
