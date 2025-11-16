/**
 * NetworkContext - Network State Management
 *
 * This context provides centralized network state management for:
 * - Connection status (connected/disconnected)
 * - Internet reachability (whether we can reach the internet)
 * - Connection type (WiFi, Cellular, etc.)
 *
 * Uses @react-native-community/netinfo for cross-platform network detection.
 *
 * @example
 * ```tsx
 * // Wrap your app with the provider
 * <NetworkProvider>
 *   <App />
 * </NetworkProvider>
 *
 * // Use the context in components
 * const { isConnected, isInternetReachable, connectionType } = useNetwork();
 *
 * if (!isConnected) {
 *   console.log('Offline mode');
 * }
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Network state interface
 */
export interface NetworkState {
  /** Whether device is connected to a network (WiFi, Cellular, etc.) */
  isConnected: boolean | null;

  /** Whether the internet is actually reachable (can reach external servers) */
  isInternetReachable: boolean | null;

  /** Type of connection (wifi, cellular, ethernet, etc.) */
  connectionType: NetInfoStateType;

  /** Detailed connection info (optional) */
  details: {
    /** Is connection expensive (cellular data, metered WiFi) */
    isConnectionExpensive: boolean | null;

    /** Cellular generation (3g, 4g, 5g, etc.) - only for cellular */
    cellularGeneration: string | null;

    /** IP address - only available on some platforms */
    ipAddress: string | null;

    /** Subnet mask - only available on some platforms */
    subnet: string | null;
  };
}

/**
 * Context value interface - includes state and utilities
 */
export interface NetworkContextValue extends NetworkState {
  /** Manually refresh network state */
  refresh: () => Promise<void>;

  /** Whether network state has been initialized */
  isInitialized: boolean;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface NetworkProviderProps {
  children: ReactNode;
}

/**
 * NetworkProvider component that wraps the application and provides network state
 */
export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: null,
    isInternetReachable: null,
    connectionType: 'unknown' as NetInfoStateType,
    details: {
      isConnectionExpensive: null,
      cellularGeneration: null,
      ipAddress: null,
      subnet: null,
    },
  });

  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Update network state from NetInfo state
   * Fix #2: Removed isInitialized from dependencies to ensure callback stability
   * Safe to call setIsInitialized multiple times - React will batch updates
   */
  const updateNetworkState = useCallback((state: NetInfoState) => {
    console.log('[NetworkContext] Network state changed:', {
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });

    setNetworkState({
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      connectionType: state.type,
      details: {
        isConnectionExpensive: state.details?.isConnectionExpensive ?? null,
        cellularGeneration: state.details && 'cellularGeneration' in state.details
          ? (state.details.cellularGeneration as string) ?? null
          : null,
        ipAddress: state.details && 'ipAddress' in state.details
          ? (state.details.ipAddress as string) ?? null
          : null,
        subnet: state.details && 'subnet' in state.details
          ? (state.details.subnet as string) ?? null
          : null,
      },
    });

    // Always set initialized (safe to call multiple times)
    setIsInitialized(true);
  }, []); // Empty dependencies - always stable

  /**
   * Manually refresh network state
   */
  const refresh = useCallback(async () => {
    try {
      const state = await NetInfo.fetch();
      updateNetworkState(state);
    } catch (error) {
      console.error('[NetworkContext] Error refreshing network state:', error);
    }
  }, [updateNetworkState]);

  /**
   * Subscribe to network state changes on mount
   */
  useEffect(() => {
    console.log('[NetworkContext] Subscribing to network state changes');

    // Fetch initial state
    NetInfo.fetch().then(updateNetworkState);

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(updateNetworkState);

    return () => {
      console.log('[NetworkContext] Unsubscribing from network state changes');
      unsubscribe();
    };
  }, [updateNetworkState]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: NetworkContextValue = useMemo(() => ({
    ...networkState,
    refresh,
    isInitialized,
  }), [networkState, refresh, isInitialized]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

/**
 * Custom hook to access network context
 * Throws error if used outside of NetworkProvider
 *
 * @throws Error if used outside NetworkProvider
 * @returns NetworkContextValue with network state and utilities
 *
 * @example
 * ```tsx
 * const { isConnected, isInternetReachable, connectionType } = useNetwork();
 *
 * if (!isConnected) {
 *   return <OfflineIndicator />;
 * }
 * ```
 */
export const useNetwork = (): NetworkContextValue => {
  const context = useContext(NetworkContext);

  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }

  return context;
};
