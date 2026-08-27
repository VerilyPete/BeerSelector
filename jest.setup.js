/* eslint-env jest */

// This file sets up the 17 `.test.tsx` suites only. Every `.test.ts` runs on
// vitest, which has its own setup in `src/__vitest__/setup.ts` and its own
// stubs — nothing here is shared with it. Adding a mock here does not affect
// the logic suites, and vice versa.

// Mock the expo-sqlite module.
// Only the async API is mocked: the codebase is on expo-sqlite 16.x and uses
// `withTransactionAsync` / `getAllAsync` / `runAsync`. The legacy
// `transaction()` + `executeSql` callback API and `openDatabase()` were
// dropped after a probe confirmed no suite reaches them.
jest.mock('expo-sqlite', () => {
  const mockDatabase = {
    closeAsync: jest.fn().mockResolvedValue(),
    deleteAsync: jest.fn().mockResolvedValue(),
    execAsync: jest.fn().mockResolvedValue([{ rows: { _array: [] } }]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn().mockImplementation(async callback => {
      return await callback();
    }),
  };

  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDatabase),
  };
});

// Mock the expo-secure-store module.
// Stateful on purpose — a real object, not bare `jest.fn()`s — so a
// setItemAsync/getItemAsync round trip behaves like the real store.
jest.mock('expo-secure-store', () => {
  const secureStore = {};
  return {
    getItemAsync: jest.fn().mockImplementation(key => Promise.resolve(secureStore[key])),
    setItemAsync: jest.fn().mockImplementation((key, value) => {
      secureStore[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn().mockImplementation(key => {
      delete secureStore[key];
      return Promise.resolve();
    }),
  };
});

// Mock the expo-constants module
jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.0.0',
    extra: {
      apiUrl: 'https://test-api.example.com',
    },
  },
  platform: {
    ios: {
      buildNumber: '24',
    },
  },
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: React.createContext(insets),
    SafeAreaFrameContext: React.createContext(frame),
    initialWindowMetrics: {
      insets,
      frame,
    },
  };
});

// Mock the LiveActivity module.
// Registered under both specifiers because both are live: components import
// `@/modules/live-activity`, while `src/services/liveActivityService.ts`
// imports bare `live-activity`. The bare one is not redundant — the linked
// package in node_modules is native-only and ships no JS entry point, so
// without this mock any suite reaching that service fails to resolve it.
// A probe confirmed two suites reach it.
//
// The two factories must stay inline: babel-plugin-jest-hoist rejects
// `jest.mock(name, someConst)` with "The second argument of `jest.mock` must
// be an inline function". They delegate to a shared builder instead, whose
// `mock` prefix is what lets the hoisted factory reference it at all.
const mockLiveActivityModule = () => ({
  __esModule: true,
  default: {
    areActivitiesEnabled: jest.fn().mockResolvedValue(true),
    startActivity: jest.fn().mockResolvedValue('mock-activity-id'),
    updateActivity: jest.fn().mockResolvedValue(undefined),
    endActivity: jest.fn().mockResolvedValue(undefined),
    endAllActivities: jest.fn().mockResolvedValue(undefined),
    restartActivity: jest.fn().mockResolvedValue('mock-activity-id'),
    getAllActivityIds: jest.fn().mockResolvedValue([]),
    endActivitiesOlderThan: jest.fn().mockResolvedValue(0),
    endAllActivitiesSync: jest.fn().mockReturnValue(true),
  },
});

jest.mock('@/modules/live-activity', () => mockLiveActivityModule());
jest.mock('live-activity', () => mockLiveActivityModule());

// Mock fetch. This is a safety net as much as a convenience: without it a
// component suite that reaches a data path would issue a real request.
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
);

// Add console.* mocks to suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Mock timers
jest.useFakeTimers();

// Polyfill setImmediate for React Native animations
global.setImmediate = global.setImmediate || ((fn, ...args) => global.setTimeout(fn, 0, ...args));
global.clearImmediate = global.clearImmediate || (id => global.clearTimeout(id));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: React.forwardRef((props, ref) => {
      return React.createElement(View, { ...props, ref }, props.children);
    }),
  };
});
