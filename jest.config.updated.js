module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ],
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
    '!**/docs/TEST_TEMPLATE_CONFIG_MODULE.ts'
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
    
    // === CATEGORY 1: Native Module Dependencies ===
    // React Native component/context tests that hang due to native module dependencies
    // These require full RN environment and are covered by Maestro E2E tests instead
    'NetworkContext.test.tsx',           // NetInfo native module
    'OfflineIndicator.test.tsx',         // Wraps NetworkProvider (NetInfo dependency)
    
    // === CATEGORY 2: WebView Async Operations ===
    // WebView components with complex async navigation/cookie handling
    'LoginWebView.test.tsx',             // WebView async operations + cookie handling
    'UntappdLoginWebView.test.tsx',      // WebView navigation + async state
    
    // === CATEGORY 3: Full Integration Tests ===
    // Multi-component integration tests with multiple async patterns
    'settings.integration.test.tsx',     // Full integration - multiple async patterns
    
    // === CATEGORY 4: Hooks with React Native Context ===
    // Hooks that use renderHook() with RN context (Alert, theme hooks, etc.)
    // renderHook() + RN context causes hangs in jsdom environment
    'useLoginFlow.test.ts',              // Hook with timers/refs + Alert
    'useDataRefresh.test.ts',            // Hook with Alert.alert
    'useUntappdLogin.test.ts',           // Hook with Alert.alert
    'useDebounce.test.ts',               // Hook with jest.useFakeTimers() + renderHook
    'useBeerFilters.optimization.test.ts', // Hook performance testing with renderHook
    
    // === CATEGORY 5: Context with Async State ===
    // Large context providers with complex async state management
    'AppContext.test.tsx',               // Large context with async state
    'AppContext.beerData.test.tsx',      // Context with database operations
    
    // === CATEGORY 6: Component Tests with Theme Hooks ===
    // Components that use useThemeColor/useColorScheme - even mocked, cause render hangs
    'AboutSection.test.tsx',             // Uses theme hooks
    'DataManagementSection.test.tsx',    // Uses theme hooks
    'BeerItem.memo.test.tsx',            // Memoization testing with theme hooks
    'BeerList.callbacks.test.tsx',       // Callback stability testing with theme hooks
    'BeerList.getItemLayout.test.tsx',   // FlatList optimization with theme hooks
    'BeerList.virtualization.test.tsx',  // Virtualization testing with theme hooks
    'SkeletonLoader.test.tsx',           // Loading component with theme hooks
    'ErrorBoundary.test.tsx',            // Error boundary with theme hooks
    'Rewards.repository.test.tsx',       // Repository pattern with theme hooks
    'TastedBrewList.loading.test.tsx',   // Loading states with multiple hook mocks
    'TastedBrewList.repository.test.tsx', // Repository pattern with theme hooks
    
    // === CATEGORY 7: Performance/Profiling Tests ===
    // Performance tests require full RN environment for accurate profiling
    // Use Maestro/Flashlight for E2E performance testing instead
    'BeerList.performance.test.tsx',     // Render performance profiling
    'ComponentReRenders.test.tsx',       // Re-render counting
    'FlatListPerformance.test.tsx',      // FlatList virtualization profiling
    'useBeerFilters.performance.test.ts', // Filter execution timing
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  reporters: ['default', 'jest-junit'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.svg': '<rootDir>/__mocks__/svgMock.js',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js'
  },
  testTimeout: 30000, // Increase default timeout to 30 seconds
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
      presets: ['babel-preset-expo'],
      plugins: [
        '@babel/plugin-transform-modules-commonjs',
        '@babel/plugin-transform-class-static-block'
      ]
    }]
  }
};
