import { vi } from 'vitest';

/**
 * Stand-in for `react-native` in node-environment vitest runs.
 *
 * Only the surface the logic suites (and the Expo packages they pull in) touch.
 * `Platform` is here because `expo-modules-core` reads `ReactNativePlatform.OS`
 * at import time, so anything importing an Expo module needs it to exist.
 *
 * A suite needing more than this belongs on jest-expo — growing this file is
 * the signal that a test has crossed back into needing the real RN runtime.
 */
export const Alert = {
  alert: vi.fn(),
};

export const Platform = {
  OS: 'ios' as const,
  Version: 17,
  select: <T>(spec: { ios?: T; android?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.default,
};

export const NativeModules: Record<string, unknown> = {};

export class NativeEventEmitter {
  addListener() {
    return { remove: () => {} };
  }
  removeAllListeners() {}
}

export default { Alert, Platform, NativeModules, NativeEventEmitter };
