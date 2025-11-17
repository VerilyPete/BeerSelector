// Mock the expo-sqlite module
jest.mock('expo-sqlite', () => {
  const mockDatabase = {
    transaction: jest.fn().mockImplementation((callback) => {
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
    withTransactionAsync: jest.fn().mockImplementation(async (callback) => {
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
    getItemAsync: jest.fn().mockImplementation((key) => Promise.resolve(secureStore[key])),
    setItemAsync: jest.fn().mockImplementation((key, value) => {
      secureStore[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn().mockImplementation((key) => {
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
global.clearImmediate = global.clearImmediate || ((id) => global.clearTimeout(id));

// Mock React Native's ScrollView to avoid transform issues with internal specs
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const RealComponent = jest.requireActual('react-native/Libraries/Components/ScrollView/ScrollView');
  const React = require('react');
  class ScrollView extends React.Component {
    scrollTo = jest.fn();
    scrollToEnd = jest.fn();
    flashScrollIndicators = jest.fn();
    
    render() {
      const View = require('react-native').View;
      return React.createElement(View, this.props, this.props.children);
    }
  }
  return ScrollView;
});

// Mock FlatList to avoid ScrollView dependency issues
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  
  class FlatList extends React.Component {
    scrollToEnd = jest.fn();
    scrollToIndex = jest.fn();
    scrollToItem = jest.fn();
    scrollToOffset = jest.fn();
    flashScrollIndicators = jest.fn();
    
    render() {
      const { data, renderItem, ListEmptyComponent, testID } = this.props;
      
      if (!data || data.length === 0) {
        if (ListEmptyComponent) {
          if (typeof ListEmptyComponent === 'function') {
            return React.createElement(ListEmptyComponent);
          }
          return ListEmptyComponent;
        }
        return null;
      }
      
      return React.createElement(
        View,
        { testID },
        data.map((item, index) => {
          const key = this.props.keyExtractor ? this.props.keyExtractor(item, index) : index;
          return React.createElement(
            View,
            { key },
            renderItem({ item, index, separators: {} })
          );
        })
      );
    }
  }
  
  return FlatList;
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy'
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error'
  }
}));

// Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  
  return {
    WebView: React.forwardRef((props, ref) => {
      return React.createElement(View, { ...props, ref }, props.children);
    })
  };
});
