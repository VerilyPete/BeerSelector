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
