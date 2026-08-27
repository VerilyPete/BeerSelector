import { vi } from 'vitest';

/**
 * Jest-compat shim for the spike.
 *
 * `vi` is API-compatible with `jest` for the surface these logic suites use
 * (`fn`, `mock`, `spyOn`, timers, `clearAllMocks`). The ONE thing it does not
 * cover is hoisting: vitest's transform hoists `vi.mock(...)` to the top of the
 * module, and a call spelled `vi.mock(...)` is invisible to it. Those calls
 * therefore run in source order, after the imports they mean to intercept.
 *
 * That is the real migration cost, and it is why the alias in vitest.config.ts
 * does the substitution instead: aliasing is hoisting-independent.
 *
 * NOT general jest compatibility — one known divergence in the surface these
 * files actually use:
 *
 *   `jest.fn(impl).mockReset()` drops the implementation, so the next call
 *   returns `undefined`. `vi.fn(impl).mockReset()` RESTORES `impl` instead.
 *   `resetAllMocks()` inherits the difference.
 *
 * Every current call site is safe — the reset mocks are bare, or are
 * reconfigured immediately after — but a new test that resets a mock and then
 * expects `undefined` will pass here and mean something different than it would
 * under jest. `mockClear` queues and `restoreAllMocks` for `spyOn` were checked
 * and do match.
 */
(globalThis as Record<string, unknown>).jest = vi;

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
