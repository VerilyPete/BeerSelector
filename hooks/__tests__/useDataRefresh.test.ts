import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useDataRefresh } from '../useDataRefresh';
import { areApiUrlsConfigured } from '@/src/database/db';
import { manualRefreshAllData } from '@/src/services/dataUpdateService';
import { ApiErrorType } from '@/src/utils/notificationUtils';

// Mock dependencies
jest.mock('@/src/database/db');
jest.mock('@/src/services/dataUpdateService');
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

const mockAreApiUrlsConfigured = areApiUrlsConfigured as jest.MockedFunction<typeof areApiUrlsConfigured>;
const mockManualRefreshAllData = manualRefreshAllData as jest.MockedFunction<typeof manualRefreshAllData>;
const mockAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

describe('useDataRefresh', () => {
  let onDataReloaded: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    onDataReloaded = jest.fn().mockResolvedValue(undefined);

    // Default mocks - success scenario
    mockAreApiUrlsConfigured.mockResolvedValue(true);
    mockManualRefreshAllData.mockResolvedValue({
      allBeersResult: { success: true, dataUpdated: true, itemCount: 100 },
      myBeersResult: { success: true, dataUpdated: true, itemCount: 50 },
      rewardsResult: { success: true, dataUpdated: true, itemCount: 10 },
      hasErrors: false,
      allNetworkErrors: false,
    });
  });

  describe('Initialization', () => {
    it('should initialize with refreshing false and no error', () => {
      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'TestComponent',
        })
      );

      expect(result.current.refreshing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.handleRefresh).toBe('function');
    });

    it('should work without componentName parameter', () => {
      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
        })
      );

      expect(result.current.refreshing).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Success Case - Full Refresh', () => {
    it('should successfully refresh all data and reload local data', async () => {
      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should check API URLs
      expect(mockAreApiUrlsConfigured).toHaveBeenCalledTimes(1);

      // Should call unified refresh
      expect(mockManualRefreshAllData).toHaveBeenCalledTimes(1);

      // Should reload local data
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      // Should not show any alerts on success
      expect(mockAlert).not.toHaveBeenCalled();

      // Refreshing should be false after completion
      expect(result.current.refreshing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set refreshing to true during refresh operation', async () => {
      let resolveRefresh: any;
      const delayedRefresh = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      mockManualRefreshAllData.mockReturnValue(delayedRefresh as any);

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      // Start refresh
      act(() => {
        result.current.handleRefresh();
      });

      // Should be refreshing immediately
      await waitFor(() => {
        expect(result.current.refreshing).toBe(true);
      });

      // Complete refresh
      await act(async () => {
        resolveRefresh({
          allBeersResult: { success: true, dataUpdated: true },
          myBeersResult: { success: true, dataUpdated: true },
          rewardsResult: { success: true, dataUpdated: true },
          hasErrors: false,
          allNetworkErrors: false,
        });
      });

      // Should be done refreshing
      expect(result.current.refreshing).toBe(false);
    });
  });

  describe('API URLs Not Configured', () => {
    it('should show alert and not refresh when API URLs are not configured', async () => {
      mockAreApiUrlsConfigured.mockResolvedValue(false);

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should check API URLs
      expect(mockAreApiUrlsConfigured).toHaveBeenCalledTimes(1);

      // Should NOT call refresh
      expect(mockManualRefreshAllData).not.toHaveBeenCalled();

      // Should NOT reload local data
      expect(onDataReloaded).not.toHaveBeenCalled();

      // Should show alert
      expect(mockAlert).toHaveBeenCalledWith(
        'API URLs Not Configured',
        'Please log in via the Settings screen to configure API URLs before refreshing.'
      );

      // Refreshing should be false
      expect(result.current.refreshing).toBe(false);
    });
  });

  describe('Network Error Case - All Network Errors', () => {
    it('should show generic network error alert when all errors are network-related', async () => {
      mockManualRefreshAllData.mockResolvedValue({
        allBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR,
            message: 'Network connection error',
          },
        },
        myBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR,
            message: 'Network connection error',
          },
        },
        rewardsResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR,
            message: 'Network connection error',
          },
        },
        hasErrors: true,
        allNetworkErrors: true,
      });

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should still reload local data (offline-first)
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      // Should show generic network error alert
      expect(mockAlert).toHaveBeenCalledWith(
        'Server Connection Error',
        'Unable to connect to the server. Please check your internet connection and try again later.',
        [{ text: 'OK' }]
      );

      expect(result.current.refreshing).toBe(false);
    });
  });

  describe('Partial Error Case - Some Errors', () => {
    it('should show detailed error messages when some data types fail', async () => {
      mockManualRefreshAllData.mockResolvedValue({
        allBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.SERVER_ERROR,
            message: 'Server error: 500',
          },
        },
        myBeersResult: {
          success: true,
          dataUpdated: true,
          itemCount: 50,
        },
        rewardsResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.PARSE_ERROR,
            message: 'Failed to parse response',
          },
        },
        hasErrors: true,
        allNetworkErrors: false,
      });

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should still reload local data
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      // Should show detailed error alert
      expect(mockAlert).toHaveBeenCalledWith(
        'Data Refresh Error',
        expect.stringContaining('All Beer data:'),
        [{ text: 'OK' }]
      );

      expect(result.current.refreshing).toBe(false);
    });

    it('should include only failed data types in error message', async () => {
      mockManualRefreshAllData.mockResolvedValue({
        allBeersResult: {
          success: true,
          dataUpdated: true,
          itemCount: 100,
        },
        myBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.VALIDATION_ERROR,
            message: 'Invalid data format',
          },
        },
        rewardsResult: {
          success: true,
          dataUpdated: true,
          itemCount: 10,
        },
        hasErrors: true,
        allNetworkErrors: false,
      });

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'Beerfinder',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should reload local data
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      // Should show error alert with only My Beers error
      expect(mockAlert).toHaveBeenCalledWith(
        'Data Refresh Error',
        expect.stringContaining('Beerfinder data:'),
        [{ text: 'OK' }]
      );

      // Should NOT include All Beer data in error message
      const alertCall = mockAlert.mock.calls[0];
      expect(alertCall[1]).not.toContain('All Beer data:');

      expect(result.current.refreshing).toBe(false);
    });
  });

  describe('Local Data Reload Error', () => {
    it('should handle error when reloading local data fails', async () => {
      const reloadError = new Error('Database error');
      onDataReloaded.mockRejectedValue(reloadError);

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should attempt to reload local data
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      // Should set error state
      expect(result.current.error).toBe('Failed to load beer data from local storage.');

      // Should not crash
      expect(result.current.refreshing).toBe(false);
    });
  });

  describe('Refresh Operation Error', () => {
    it('should handle error when refresh operation throws', async () => {
      const refreshError = new Error('Unexpected error');
      mockManualRefreshAllData.mockRejectedValue(refreshError);

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should set error state
      expect(result.current.error).toBe('Failed to refresh beer data. Please try again later.');

      // Should show alert
      expect(mockAlert).toHaveBeenCalledWith(
        'Error',
        'Failed to refresh beer data. Please try again later.'
      );

      // Should not crash
      expect(result.current.refreshing).toBe(false);
    });
  });

  describe('Already Refreshing Case', () => {
    it('should ignore duplicate refresh requests when already refreshing', async () => {
      let resolveRefresh: any;
      const delayedRefresh = new Promise((resolve) => {
        resolveRefresh = resolve;
      });

      mockManualRefreshAllData.mockReturnValue(delayedRefresh as any);

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      // Start first refresh
      act(() => {
        result.current.handleRefresh();
      });

      // Wait for refreshing to be true
      await waitFor(() => {
        expect(result.current.refreshing).toBe(true);
      });

      // Attempt second refresh while first is in progress
      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should still be refreshing (first refresh not completed)
      expect(result.current.refreshing).toBe(true);

      // Should only call manualRefreshAllData once (second request ignored)
      expect(mockManualRefreshAllData).toHaveBeenCalledTimes(1);

      // Complete first refresh
      await act(async () => {
        resolveRefresh({
          allBeersResult: { success: true, dataUpdated: true },
          myBeersResult: { success: true, dataUpdated: true },
          rewardsResult: { success: true, dataUpdated: true },
          hasErrors: false,
          allNetworkErrors: false,
        });
      });

      // Should be done refreshing
      expect(result.current.refreshing).toBe(false);

      // Should only reload data once
      expect(onDataReloaded).toHaveBeenCalledTimes(1);
    });
  });

  describe('Component Name Logging', () => {
    it('should log component name in console messages', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'TastedBrewList',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Check that component name appears in logs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TastedBrewList')
      );

      consoleSpy.mockRestore();
    });

    it('should use default component name when not provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Check that default component name appears in logs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Component')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Multiple Refresh Cycles', () => {
    it('should handle multiple sequential refresh operations', async () => {
      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      // First refresh
      await act(async () => {
        await result.current.handleRefresh();
      });

      expect(onDataReloaded).toHaveBeenCalledTimes(1);
      expect(result.current.refreshing).toBe(false);

      // Second refresh
      await act(async () => {
        await result.current.handleRefresh();
      });

      expect(onDataReloaded).toHaveBeenCalledTimes(2);
      expect(result.current.refreshing).toBe(false);

      // Should call refresh twice
      expect(mockManualRefreshAllData).toHaveBeenCalledTimes(2);
    });
  });

  describe('Offline-First Behavior', () => {
    it('should reload local data even when refresh fails completely', async () => {
      mockManualRefreshAllData.mockResolvedValue({
        allBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR,
            message: 'No internet connection',
          },
        },
        myBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR,
            message: 'No internet connection',
          },
        },
        rewardsResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.NETWORK_ERROR,
            message: 'No internet connection',
          },
        },
        hasErrors: true,
        allNetworkErrors: true,
      });

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'AllBeers',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should still reload local data even when API fails
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      expect(result.current.refreshing).toBe(false);
    });

    it('should reload local data when refresh partially succeeds', async () => {
      mockManualRefreshAllData.mockResolvedValue({
        allBeersResult: { success: true, dataUpdated: true, itemCount: 100 },
        myBeersResult: {
          success: false,
          dataUpdated: false,
          error: {
            type: ApiErrorType.SERVER_ERROR,
            message: 'Server error',
          },
        },
        rewardsResult: { success: true, dataUpdated: true, itemCount: 10 },
        hasErrors: true,
        allNetworkErrors: false,
      });

      const { result } = renderHook(() =>
        useDataRefresh({
          onDataReloaded,
          componentName: 'Beerfinder',
        })
      );

      await act(async () => {
        await result.current.handleRefresh();
      });

      // Should reload local data with partial success
      expect(onDataReloaded).toHaveBeenCalledTimes(1);

      expect(result.current.refreshing).toBe(false);
    });
  });
});
