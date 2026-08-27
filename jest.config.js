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

    // Ceded to vitest: every `.test.ts` in the repo, wherever it lives. Those
    // are pure logic — no renderer, no RN runtime — and run under
    // vitest.config.ts with a node environment and no jest-expo preset. They
    // use `vi.*` and would fail here.
    //
    // The boundary is a rule, not a directory list: `.test.ts` is vitest's,
    // `.test.tsx` is jest's, because TSX is what needs the renderer and the
    // preset's native mocks. Note `$` — this does not match `.test.tsx`.
    // Everything left in this config is TSX, so a suite changes runner only by
    // gaining or losing a renderer, which is the thing that actually decides it.
    '\\.test\\.ts$',

    '/ios/',
    '/android/',
    '/.cursor/',
    '/assets/',
    '/scripts/',
    '/reports/',
    '/__mocks__/',

    // The four `__tests__/performance/*` entries that used to sit here named
    // files that do not exist — there is no `__tests__/` directory in this repo.
    // Dead config carrying a live-looking TODO. Removed rather than left to
    // imply there is a Flashlight migration pending on something real.
    //
    // THIS LIST IS NOW EMPTY, and the bar for adding to it is: run the file,
    // and write down what it actually does. Every entry ever removed from here
    // was excluded on a premise that turned out to be false when someone
    // finally checked.
    //
    // BeerList.virtualization was the last one. It was 17 pass / 9 fail, not a
    // hang — the 9 asserted FlatList props the component has never had, because
    // the suite was a RED-first spec for an optimization that shipped different
    // numbers, and it was quarantined instead of reconciled. Eight of the 17
    // "passing" tests asserted arithmetic on their own local constants and could
    // not fail. It is now one test that pins the real config; see its header.
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
    //
    // useBeerFilters.optimization.test.ts is NOT here any more, for the third
    // time in the same pattern. Its stated reason — "uses renderHook() with RN
    // context - causes Jest hangs" — is false: 23 tests, all green, 0.2s. It
    // was 23 tests of real coverage excluded from CI on a premise nobody
    // rechecked. If you are about to add a line to this list, run the file
    // first and write down what it actually does.
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
