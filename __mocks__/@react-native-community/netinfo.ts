/**
 * Mock for @react-native-community/netinfo
 */

export default {
  fetch: jest.fn(() =>
    Promise.resolve({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
      details: null,
    })
  ),
  addEventListener: jest.fn(() => jest.fn()),
};
