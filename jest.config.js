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
    //
    // LoginWebView.test.tsx is NOT here any more. The stated reason for the
    // quarantine did not hold: it does not hang, it runs in ~9s. It was red —
    // 14 stale assertions, most of them from a single leaked mock
    // implementation, a config mock that resolved endpoint names instead of
    // paths, and two tests asserting a success alert that fd18c05 deleted in the
    // same commit that wrote them. Quarantining it hid all of that, and it is
    // where the login/ETag guards from plan 05 live.
    //
    // AllBeers.loading and Beerfinder.loading are NOT here any more either. They
    // were not hanging: both run in ~1s. They were 54 assertions asserting
    // nothing, because MP-4 Step 2 moved both components onto AppContext and
    // neither suite was updated. AllBeers threw "useAppContext must be used
    // within an AppProvider" on all 26; Beerfinder's 28 additionally drove every
    // state through beerRepository.getUntasted() and fetchMyBeersFromAPI(), which
    // that component no longer calls at all. Both now render inside a real
    // AppProvider and drive state through the repositories it loads from.
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
