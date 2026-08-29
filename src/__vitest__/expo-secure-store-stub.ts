import { vi } from 'vitest';

/**
 * Stand-in for `expo-secure-store` in node-environment runs.
 *
 * The real module throws `Cannot find native module 'ExpoSecureStore'` on
 * import when there is no native runtime, so it has to be aliased away rather
 * than merely mocked per-suite.
 *
 * The store is **stateful**, matching `jest.setup.js`'s own mock, and that is
 * deliberate. An earlier version returned a fixed `null` from `getItemAsync`:
 * shape parity without behaviour parity, the same mistake that made the
 * `expo-sqlite` stand-in exit non-zero while printing green. No committed suite
 * depends on this round-trip today — every one installs its own factory — but a
 * suite that reaches the fallback should get storage that behaves like storage,
 * not one that silently answers `null` to every read.
 */
const store = new Map<string, string>();

const assertValidKey = (key: string): void => {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) {
    throw new Error(`Invalid SecureStore key: ${key}`);
  }
};

export const getItemAsync = vi.fn(async (key: string) => {
  assertValidKey(key);
  return store.get(key) ?? null;
});
export const setItemAsync = vi.fn(async (key: string, value: string) => {
  assertValidKey(key);
  if (value.length > 2048) throw new Error(`SecureStore value too large: ${value.length}`);
  store.set(key, value);
});
export const deleteItemAsync = vi.fn(async (key: string) => {
  assertValidKey(key);
  store.delete(key);
});
export const isAvailableAsync = vi.fn(async () => true);
export const WHEN_UNLOCKED = 'whenUnlocked';
