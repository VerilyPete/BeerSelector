/**
 * OfflineIndicator Tests
 *
 * Tests for the OfflineIndicator component
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { OfflineIndicator } from '../OfflineIndicator';
import { NetworkProvider } from '@/context/NetworkContext';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock useColorScheme
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

describe('OfflineIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Offline State', () => {
    it('should show indicator when device is offline', async () => {
      const mockState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByText('No Internet Connection')).toBeTruthy();
      });
    });

    it('should show indicator when connected but internet not reachable', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: false,
        details: null,
        isWifiEnabled: true,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByText('Connected but No Internet Access')).toBeTruthy();
      });
    });

    it('should not show indicator when fully connected', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: true,
        isInternetReachable: true,
        details: null,
        isWifiEnabled: true,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { queryByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      // Wait a bit to ensure indicator doesn't appear
      await waitFor(() => {
        expect(queryByText('No Internet Connection')).toBeNull();
      });
    });
  });

  describe('Connection Type Display', () => {
    it('should show WiFi in message when offline via WiFi', async () => {
      const mockState: NetInfoState = {
        type: 'wifi' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
        isWifiEnabled: true,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByText('No Internet Connection (WiFi)')).toBeTruthy();
      });
    });

    it('should show Cellular in message when offline via Cellular', async () => {
      const mockState: NetInfoState = {
        type: 'cellular' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByText('No Internet Connection (Cellular)')).toBeTruthy();
      });
    });
  });

  describe('Custom Message', () => {
    it('should display custom message when provided', async () => {
      const mockState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator message="Custom Offline Message" />
        </NetworkProvider>
      );

      await waitFor(() => {
        expect(getByText('Custom Offline Message')).toBeTruthy();
      });
    });
  });

  describe('Dark Mode', () => {
    it('should render correctly in dark mode', async () => {
      const { useColorScheme } = require('@/hooks/useColorScheme');
      useColorScheme.mockReturnValue('dark');

      const mockState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      await waitFor(() => {
        const textElement = getByText('No Internet Connection');
        expect(textElement).toBeTruthy();
        // In dark mode, text color should be red (#ff6b6b)
        expect(textElement.props.style).toMatchObject(
          expect.arrayContaining([
            expect.objectContaining({ color: '#ff6b6b' })
          ])
        );
      });
    });

    it('should render correctly in light mode', async () => {
      const { useColorScheme } = require('@/hooks/useColorScheme');
      useColorScheme.mockReturnValue('light');

      const mockState: NetInfoState = {
        type: 'none' as NetInfoStateType,
        isConnected: false,
        isInternetReachable: false,
        details: null,
      };

      (NetInfo.fetch as jest.Mock).mockResolvedValue(mockState);

      const { getByText } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      await waitFor(() => {
        const textElement = getByText('No Internet Connection');
        expect(textElement).toBeTruthy();
        // In light mode, text color should be darker red (#dc3545)
        expect(textElement.props.style).toMatchObject(
          expect.arrayContaining([
            expect.objectContaining({ color: '#dc3545' })
          ])
        );
      });
    });
  });

  describe('Initialization', () => {
    it('should not show indicator before network state is initialized', async () => {
      // Mock fetch with a slow but eventually resolving promise
      let resolveFetch: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });
      (NetInfo.fetch as jest.Mock).mockReturnValue(fetchPromise);

      const { queryByText, unmount } = render(
        <NetworkProvider>
          <OfflineIndicator />
        </NetworkProvider>
      );

      // Should not show anything before initialization
      expect(queryByText('No Internet Connection')).toBeNull();

      // Resolve the promise to allow cleanup
      resolveFetch!({
        type: 'wifi',
        isConnected: true,
        isInternetReachable: true,
        details: null,
        isWifiEnabled: true,
      });
      await fetchPromise;

      unmount();
    });
  });
});
