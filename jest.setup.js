/* eslint-env jest */

// Mock the expo-sqlite module
jest.mock('expo-sqlite', () => {
  const mockDatabase = {
    transaction: jest.fn().mockImplementation(callback => {
      const mockTransaction = {
        executeSql: jest.fn().mockImplementation((query, params, successCallback) => {
          if (successCallback) {
            successCallback(mockTransaction, { rows: { _array: [], length: 0 } });
          }
          return Promise.resolve({ rows: { _array: [], length: 0 } });
        }),
      };
      callback(mockTransaction);
      return Promise.resolve();
    }),
    exec: jest.fn().mockResolvedValue([{ rows: { _array: [] } }]),
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
    openDatabase: jest.fn().mockReturnValue(mockDatabase),
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDatabase),
  };
});

// Mock the expo-secure-store module
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

// Mock the LiveActivity module
jest.mock('@/modules/live-activity', () => ({
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
}));

// Also mock the path without @ alias
jest.mock('live-activity', () => ({
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
}));

// No expo-network mock needed as we're not using it anymore

// Mock fetch
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

// Note: ScrollView and FlatList deep import mocks removed
// React Native 0.79+ deprecates deep imports - jest-expo preset handles these properly

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
