import { defineConfig } from 'vitest/config';

/**
 * Spike config: can the pure-logic suites under `src/` run without jest-expo?
 *
 * Deliberately minimal. Everything here that is NOT boilerplate is evidence of
 * a real migration cost, so keep it honest — if this file grows a transform, a
 * transformIgnorePatterns equivalent, or a pile of native-module mocks, the
 * split has stopped being cheap.
 */
export default defineConfig({
  resolve: {
    // Array form: vite matches these against the RESOLVED id, which is the only
    // way to intercept a relative import made from inside node_modules.
    alias: [
      {
        // `react-native` ships untranspiled Flow source, so it can never be
        // imported for real here. Logic suites only ever touch `Alert`, which
        // they already mock; this alias makes that mock the only version that
        // exists.
        find: /^react-native$/,
        replacement: new URL('./src/__vitest__/react-native-stub.ts', import.meta.url).pathname,
      },
      {
        // See the stub's own note: CJS `require` inside Expo's TS source.
        find: /expo\/src\/winter\/runtime(\.native)?(\.ts)?$/,
        replacement: new URL('./src/__vitest__/expo-winter-stub.ts', import.meta.url).pathname,
      },
      {
        // `expo-sqlite` imports the bare package; see the stub's note.
        find: /^expo$/,
        replacement: new URL('./src/__vitest__/expo-stub.ts', import.meta.url).pathname,
      },
      {
        // The real package puts JSX in a `.ts` file; see the stub's note.
        find: /^expo-sqlite$/,
        replacement: new URL('./src/__vitest__/expo-sqlite-stub.ts', import.meta.url).pathname,
      },
      {
        // Throws on import without a native runtime; see the stub's note.
        find: /^expo-secure-store$/,
        replacement: new URL('./src/__vitest__/expo-secure-store-stub.ts', import.meta.url)
          .pathname,
      },
      {
        // A few suites import it explicitly; it throws outside jest.
        find: /^@jest\/globals$/,
        replacement: new URL('./src/__vitest__/jest-globals-shim.ts', import.meta.url).pathname,
      },
      {
        // tsconfig's `@/*` -> `./*`; vite does not read tsconfig paths.
        find: /^@\//,
        replacement: new URL('./', import.meta.url).pathname,
      },
    ],
  },
  // Expo's runtime reads RN's `__DEV__` global at import time; anything that
  // imports `src/config` drags it in. Metro/babel inject this — outside them we
  // have to.
  define: { __DEV__: 'true' },
  test: {
    globals: true,
    environment: 'node',
    // Jest fakes a wider set of APIs than vitest does by default; these three
    // are the ones the retry/deadline suites drive through advanceTimersByTime.
    // `setImmediate`/`clearImmediate` are in the list because jest's default
    // `useFakeTimers()` controls them and this file claims parity with it. An
    // earlier version omitted them, which left node's real `setImmediate` live
    // under fake timers — a difference that races event-loop work rather than
    // failing honestly.
    fakeTimers: {
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'Date',
        'performance',
        'queueMicrotask',
      ],
    },
    setupFiles: ['./src/__vitest__/setup.ts'],
    // The transformIgnorePatterns equivalent, and the honest cost of leaving
    // jest-expo: Expo ships untranspiled TS/Flow, so these packages must go
    // through vite's transform rather than node's loader.
    server: { deps: { inline: [/expo/, /@expo/, /expo-modules-core/] } },
    // The boundary with jest-expo, stated as a rule rather than a directory
    // list: every `.test.ts` in the repo is logic and runs here; every
    // `.test.tsx` needs the renderer and stays on jest-expo. That holds for all
    // 108 suites, so there is nothing to keep in sync when a file moves.
    // `jest.config.js` ignores the complement of this pattern.
    include: ['**/*.test.ts'],
    // Setting `exclude` replaces vitest's defaults rather than adding to them,
    // so `node_modules` and `dist` are restored here by hand. All six are
    // gitignored; a compiled copy of a suite under `dist/` after an
    // `expo export` would otherwise be collected a second time.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/coverage/**',
      'ios/**',
      'android/**',
    ],
  },
});
