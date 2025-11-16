/**
 * NetworkContext Tests
 *
 * Tests for the NetworkContext provider and useNetwork hook
 */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import { NetworkProvider, useNetwork } from '../NetworkContext';

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));

// Test component that uses the network context
const TestComponent = () => {
  const { isConnected, isInternetReachable, connectionType, isInitialized } = useNetwork();

  return (
    <>
      <Text testID="is-connected">{String(isConnected)}</Text>
      <Text testID="is-reachable">{String(isInternetReachable)}</Text>
      <Text testID="connection-type">{connectionType}</Text>
      <Text testID="is-initialized">{String(isInitialized)}</Text>
    </>
  );
};

describe('NetworkContext', () => {
  let mockUnsubscribe: jest.Mock;
  let mockEventListener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    mockEventListener = jest.fn();

    // Default mock implementation
    (NetInfo.addEventListener as jest.Mock).mockReturnValue(mockUnsubscribe);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should provide initial null state before network info is fetched', async () => {
      // Mock fetch with a slow but eventually resolving promise
      let resolveFetch: (value: NetInfoState) => void;
      const fetchPromise = new Promise<NetInfoState>((resolve) => {
        resolveFetch = resolve;
      });
      (NetInfo.fetch as jest.Mock).mockReturnValue(fetchPromise);

      const { getByTestId, unmount } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      // Check initial state before fetch completes
      expect(getByTestId('is-connected').props.children).toBe('null');
      expect(getByTestId('is-reachable').props.children).toBe('null');
      expect(getByTestId('connection-type').props.children).toBe('unknown');
      expect(getByTestId('is-initialized').props.children).toBe('false');

      // Resolve the promise to allow cleanup
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: null,
        isWifiEnabled: true,
      };
      resolveFetch!(mockState);
      await fetchPromise;

      unmount();
    });
  });

  describe('Network State Changes', () => {
    it('should update state when network becomes connected (WiFi)', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: false,
          ipAddress: '192.168.1.1',
          subnet: '255.255.255.0',
          ssid: 'TestNetwork',
          bssid: '00:00:00:00:00:00',
          strength: 100,
          frequency: 2400,
          linkSpeed: 100,
          rxLinkSpeed: 100,
          txLinkSpeed: 100,
        },
        isWifiEnabled: true,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByTestId } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByTestId('is-connected').props.children).toBe('true');
        expect(getByTestId('is-reachable').props.children).toBe('true');
        expect(getByTestId('connection-type').props.children).toBe('wifi');
        expect(getByTestId('is-initialized').props.children).toBe('true');
      });
    });

    it('should update state when network becomes disconnected', async () => {
      const mockState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByTestId } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByTestId('is-connected').props.children).toBe('false');
        expect(getByTestId('is-reachable').props.children).toBe('false');
        expect(getByTestId('connection-type').props.children).toBe('none');
        expect(getByTestId('is-initialized').props.children).toBe('true');
      });
    });

    it('should update state when connected but internet not reachable', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: false,
        details: {
          isConnectionExpensive: false,
          ipAddress: '192.168.1.1',
          subnet: '255.255.255.0',
          ssid: 'TestNetwork',
          bssid: '00:00:00:00:00:00',
          strength: 100,
          frequency: 2400,
          linkSpeed: 100,
          rxLinkSpeed: 100,
          txLinkSpeed: 100,
        },
        isWifiEnabled: true,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByTestId } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByTestId('is-connected').props.children).toBe('true');
        expect(getByTestId('is-reachable').props.children).toBe('false');
        expect(getByTestId('connection-type').props.children).toBe('wifi');
      });
    });

    it('should update state for cellular connection', async () => {
      const mockState: NetInfoState = {
        type: 'cellular' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: true,
          cellularGeneration: '4g',
          carrier: 'TestCarrier',
        },
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByTestId } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByTestId('is-connected').props.children).toBe('true');
        expect(getByTestId('connection-type').props.children).toBe('cellular');
      });
    });
  });

  describe('Event Listener', () => {
    it('should subscribe to network state changes on mount', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(NetInfo.fetch).toHaveBeenCalled();
        expect(NetInfo.addEventListener).toHaveBeenCalled();
      });
    });

    it('should unsubscribe from network state changes on unmount', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { unmount } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(NetInfo.addEventListener).toHaveBeenCalled();
      });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should handle network state changes from event listener', async () => {
      const initialState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: null,
      };

      const updatedState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(initialState);

      // Capture the event listener callback
      let eventCallback: ((state: NetInfoState) => void) | null = null;
      (NetInfo.addEventListener as jest.Mock).mockImplementation((callback) => {
        eventCallback = callback;
        return mockUnsubscribe;
      });

      const { getByTestId } = render(
        <NetworkProvider>
          <TestComponent />
        </NetworkProvider>
      );

      // Wait for initial state
      await waitFor(() => {
        expect(getByTestId('is-connected').props.children).toBe('true');
      });

      // Simulate network state change
      act(() => {
        if (eventCallback) {
          eventCallback(updatedState);
        }
      });

      // Verify state updated
      await waitFor(() => {
        expect(getByTestId('is-connected').props.children).toBe('false');
        expect(getByTestId('is-reachable').props.children).toBe('false');
        expect(getByTestId('connection-type').props.children).toBe('none');
      });
    });
  });

  describe('Refresh Function', () => {
    it('should manually refresh network state when refresh is called', async () => {
      const initialState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: null,
      };

      const refreshedState: NetInfoState = {
        type: 'cellular' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: true,
          cellularGeneration: '4g',
          carrier: 'TestCarrier',
        },
      };

      (NetInfo.fetch as jest.Mock)
        .mockResolvedValueOnce(initialState)
        .mockResolvedValueOnce(refreshedState);

      const TestComponentWithRefresh = () => {
        const network = useNetwork();

        return (
          <>
            <TestComponent />
            <Text testID="refresh-button" onPress={network.refresh}>
              Refresh
            </Text>
          </>
        );
      };

      const { getByTestId } = render(
        <NetworkProvider>
          <TestComponentWithRefresh />
        </NetworkProvider>
      );

      // Wait for initial state
      await waitFor(() => {
        expect(getByTestId('connection-type').props.children).toBe('wifi');
      });

      // Trigger refresh
      await act(async () => {
        getByTestId('refresh-button').props.onPress();
      });

      // Verify state updated
      await waitFor(() => {
        expect(getByTestId('connection-type').props.children).toBe('cellular');
      });
    });
  });

  describe('Hook Error Handling', () => {
    it('should throw error when useNetwork is used outside NetworkProvider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useNetwork must be used within a NetworkProvider');

      console.error = originalError;
    });
  });

  describe('Details Extraction', () => {
    it('should extract connection details for WiFi', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: {
          isConnectionExpensive: false,
          ipAddress: '10.0.0.1',
          subnet: '255.255.255.0',
          ssid: 'MyNetwork',
          bssid: '00:11:22:33:44:55',
          strength: 80,
          frequency: 5000,
          linkSpeed: 1000,
          rxLinkSpeed: 1000,
          txLinkSpeed: 1000,
        },
        isWifiEnabled: true,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const TestDetailsComponent = () => {
        const { details } = useNetwork();
        return (
          <>
            <Text testID="is-expensive">{String(details.isConnectionExpensive)}</Text>
            <Text testID="ip-address">{details.ipAddress ?? 'null'}</Text>
            <Text testID="subnet">{details.subnet ?? 'null'}</Text>
          </>
        );
      };

      const { getByTestId } = render(
        <NetworkProvider>
          <TestDetailsComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByTestId('is-expensive').props.children).toBe('false');
        expect(getByTestId('ip-address').props.children).toBe('10.0.0.1');
        expect(getByTestId('subnet').props.children).toBe('255.255.255.0');
      });
    });

    it('should handle null details gracefully', async () => {
      const mockState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const TestDetailsComponent = () => {
        const { details } = useNetwork();
        return (
          <>
            <Text testID="is-expensive">{String(details.isConnectionExpensive)}</Text>
            <Text testID="cellular-gen">{details.cellularGeneration ?? 'null'}</Text>
            <Text testID="ip-address">{details.ipAddress ?? 'null'}</Text>
          </>
        );
      };

      const { getByTestId } = render(
        <NetworkProvider>
          <TestDetailsComponent />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByTestId('is-expensive').props.children).toBe('null');
        expect(getByTestId('cellular-gen').props.children).toBe('null');
        expect(getByTestId('ip-address').props.children).toBe('null');
      });
    });
  });
});
