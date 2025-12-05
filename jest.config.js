module.exports = {
  preset: 'jest-expo',
  // Let jest-expo preset handle transformIgnorePatterns for React Native 0.79+ compatibility
  // The preset includes proper patterns for react-native/src/private/* modules
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/.cursor/**',
    '!**/babel.config.js',
    '!**/jest.setup.js',
    '!**/metro.config.js',
    '!**/app.config.js',
    '!**/ios/**',
    '!**/android/**',
    '!**/assets/**',
    '!**/*.json',
    '!**/allbeers.json',
    '!**/mybeers.json',
    '!**/__mocks__/**',
    '!**/scripts/**',
    '!**/docs/TEST_TEMPLATE_CONFIG_MODULE.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/ios/',
    '/android/',
    '/.cursor/',
    '/assets/',
    '/scripts/',
    '/reports/',
    '/__mocks__/',

    // === Performance Tests - Pending Flashlight Migration ===
    // These performance tests require full RN environment for accurate profiling
    // TODO: Migrate to Flashlight for E2E performance testing
    '__tests__/performance/BeerList.performance.test.tsx',
    '__tests__/performance/ComponentReRenders.test.tsx',
    '__tests__/performance/FlatListPerformance.test.tsx',
    '__tests__/performance/useBeerFilters.performance.test.ts',
    'components/beer/__tests__/BeerList.virtualization.test.tsx',
    // Optimization test uses renderHook() with RN context - causes Jest hangs
    'hooks/__tests__/useBeerFilters.optimization.test.ts',
    // Component tests that use WebView, Alert, or RN context - migrate to Maestro
    'components/__tests__/LoginWebView.test.tsx',
    'components/__tests__/Beerfinder.loading.test.tsx',
    'components/__tests__/AllBeers.loading.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  reporters: ['default', 'jest-junit'],
  // Let jest-expo preset handle testEnvironment (react-native-env.js)
  moduleNameMapper: {
    '\\.svg': '<rootDir>/__mocks__/svgMock.js',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__mocks__/fileMock.js',
  },
  testTimeout: 30000, // Increase default timeout to 30 seconds
  // Let jest-expo preset handle transform with proper metro caller config for RN 0.79+
};
