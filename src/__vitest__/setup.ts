import { vi } from 'vitest';

/**
 * `expo-modules-core` reads `globalThis.expo.EventEmitter` at import time — the
 * native runtime installs it, and neither Metro nor node does. Anything that
 * pulls in `expo-constants` (which `src/config` does) reaches this line.
 */
(globalThis as Record<string, unknown>).expo = {
  EventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
    emit() {}
  },
  modules: {},
  uuidv4: () => '00000000-0000-0000-0000-000000000000',
};

/**
 * `jest.setup.js` calls `jest.useFakeTimers()` for EVERY suite, and several
 * suites rely on that rather than arming timers themselves — the retry/backoff
 * tests advance timers with no `useFakeTimers()` call of their own. Mirror it
 * here or those suites fail with "timers APIs are not mocked".
 */
vi.useFakeTimers();

// Polyfill setImmediate, as jest.setup.js does for React Native animations.
globalThis.setImmediate =
  globalThis.setImmediate ??
  (((fn: (...a: unknown[]) => void, ...args: unknown[]) =>
    globalThis.setTimeout(fn, 0, ...args)) as typeof globalThis.setImmediate);

/**
 * `jest.setup.js` replaces console.* with mocks to suppress output. Mirror it:
 * suites assert on `console.log.mock.calls` (the URL-redaction fence in
 * beerApi.retryPolicy does), and without this vitest prints every line the
 * suites produce.
 */
globalThis.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};
