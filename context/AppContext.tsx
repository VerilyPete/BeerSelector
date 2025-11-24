/**
 * AppContext - Global Application State Management
 *
 * This context provides centralized state management for:
 * - User session state (login status, user info, visitor mode)
 * - Beer list state (allBeers, tastedBeers, rewards)
 * - Filter/search state
 * - Loading and error states
 *
 * Replaces scattered module-level state and provides a single source of truth
 * for all application state.
 *
 * @example
 * ```tsx
 * // Wrap your app with the provider
 * <AppProvider>
 *   <App />
 * </AppProvider>
 *
 * // Use the context in components
 * const { session, updateSession, clearSession } = useAppContext();
 *
 * if (session.isLoggedIn) {
 *   console.log('User:', session.userName);
 * }
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Alert } from 'react-native';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode as checkIsVisitorMode } from '@/src/api/authService';
import type { SessionData } from '@/src/types/api';
import type { BeerWithGlassType, BeerfinderWithGlassType } from '@/src/types/beer';
import type { Reward } from '@/src/types/database';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';

/**
 * ==========================================
 * STATE SYNCHRONIZATION GUIDELINES
 * ==========================================
 *
 * AppContext provides a single source of truth for beer data.
 * Components must follow these rules to keep context in sync:
 *
 * ✅ ALWAYS call refreshBeerData() after:
 * - rewardsRepository.insertMany()
 * - beerRepository.insertMany()
 * - myBeersRepository.insertMany()
 * - rewardsRepository.clear()
 * - beerRepository.clear()
 * - myBeersRepository.clear()
 * - Any direct database write operation
 *
 * ❌ NEVER call refreshBeerData() after:
 * - Reading from database (getAll, getById, etc.)
 * - UI-only state changes
 * - Using high-level refresh functions (they sync internally)
 *
 * Example - Manual Sync Required:
 * ```typescript
 * const handleAddReward = async (reward: Reward) => {
 *   await rewardsRepository.add(reward);
 *   await refreshBeerData(); // ← REQUIRED! Context is now stale
 * };
 * ```
 *
 * Example - No Sync Needed:
 * ```typescript
 * const rewards = await rewardsRepository.getAll(); // Just reading
 * // No refreshBeerData() needed - context already has this data
 * ```
 *
 * Why Manual Sync?
 * - Explicit: Clear when sync happens, easier to debug
 * - Flexible: Component decides when to sync (e.g., batch multiple writes)
 * - Testable: Easy to mock and verify in tests
 * - No Magic: Developers understand the data flow
 *
 * See docs/STATE_SYNC_GUIDELINES.md for full rationale.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Session state interface
 */
export interface SessionState {
  /** Whether a user is currently logged in (member or visitor) */
  isLoggedIn: boolean;

  /** Whether the current user is in visitor mode */
  isVisitor: boolean;

  /** Username (UFO Club members only) */
  userName?: string;

  /** User's email address (UFO Club members only) */
  userEmail?: string;

  /** User's first name (UFO Club members only) */
  firstName?: string;

  /** User's last name (UFO Club members only) */
  lastName?: string;

  /** Member ID from Flying Saucer */
  memberId?: string;

  /** Store ID */
  storeId?: string;

  /** Store name */
  storeName?: string;

  /** Card number (UFO Club members only) */
  cardNum?: string;

  /** Session ID */
  sessionId?: string;
}

/**
 * Beer list state interface
 */
export interface BeerState {
  /** All beers from the Flying Saucer API (with pre-computed glass types) */
  allBeers: BeerWithGlassType[];

  /** Beers the user has tasted (Beerfinder data with pre-computed glass types) */
  tastedBeers: BeerfinderWithGlassType[];

  /** User's rewards from UFO Club */
  rewards: Reward[];

  /** IDs of beers currently in the check-in queue (to prevent double check-ins) */
  queuedBeerIds: Set<string>;
}

/**
 * Filter and search state interface
 */
export interface FilterState {
  /** Current search text */
  searchText: string;

  /** Selected filters (e.g., { style: 'IPA', abv: '>7%' }) */
  selectedFilters: Record<string, string>;

  /** Sort order */
  sortBy?: string;
}

/**
 * Loading state interface
 */
export interface LoadingState {
  /** Whether beers are currently being loaded */
  isLoadingBeers: boolean;

  /** Whether rewards are currently being loaded */
  isLoadingRewards: boolean;

  /** Whether a refresh operation is in progress */
  isRefreshing: boolean;

  /** Whether session is currently being loaded from storage */
  isLoadingSession: boolean;
}

/**
 * Error state interface
 */
export interface ErrorState {
  /** Error message for beer operations */
  beerError: string | null;

  /** Error message for reward operations */
  rewardError: string | null;

  /** Error message for session operations */
  sessionError: string | null;
}

/**
 * Complete app state interface
 */
export interface AppState {
  /** Session/user state */
  session: SessionState;

  /** Beer list state */
  beers: BeerState;

  /** Filter and search state */
  filters: FilterState;

  /** Loading state */
  loading: LoadingState;

  /** Error state */
  errors: ErrorState;
}

/**
 * Context value interface - includes state and actions
 */
export interface AppContextValue extends AppState {
  // Session actions
  /** Update session state after login */
  updateSession: (sessionData: SessionData, isVisitor: boolean) => void;

  /** Clear session state on logout */
  clearSession: () => void;

  /** Reload session from storage */
  refreshSession: () => Promise<void>;

  // Beer list actions
  /** Update all beers list */
  setAllBeers: (beers: BeerWithGlassType[]) => void;

  /** Update tasted beers list */
  setTastedBeers: (beers: BeerfinderWithGlassType[]) => void;

  /** Update rewards list */
  setRewards: (rewards: Reward[]) => void;

  /** Reload all beer data from database (call after data refresh) */
  refreshBeerData: () => Promise<void>;

  /** Add a beer ID to the queued set (called after successful check-in) */
  addQueuedBeer: (beerId: string) => void;

  /** Remove a beer ID from the queued set */
  removeQueuedBeer: (beerId: string) => void;

  /** Sync queued beer IDs from API response */
  syncQueuedBeerIds: (ids: string[]) => void;

  // Filter actions
  /** Update search text */
  setSearchText: (text: string) => void;

  /** Update selected filters */
  setSelectedFilters: (filters: Record<string, string>) => void;

  /** Update sort order */
  setSortBy: (sortBy: string | undefined) => void;

  /** Clear all filters */
  clearFilters: () => void;

  // Loading actions
  /** Update beer loading state */
  setLoadingBeers: (loading: boolean) => void;

  /** Update rewards loading state */
  setLoadingRewards: (loading: boolean) => void;

  /** Update refreshing state */
  setRefreshing: (refreshing: boolean) => void;

  // Error actions
  /** Set beer error */
  setBeerError: (error: string | null) => void;

  /** Set reward error */
  setRewardError: (error: string | null) => void;

  /** Set session error */
  setSessionError: (error: string | null) => void;

  /** Clear all errors */
  clearErrors: () => void;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const AppContext = createContext<AppContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface AppProviderProps {
  children: ReactNode;
}

/**
 * AppProvider component that wraps the application and provides global state
 */
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // Session state
  const [session, setSession] = useState<SessionState>({
    isLoggedIn: false,
    isVisitor: false,
    userName: undefined,
    userEmail: undefined,
    firstName: undefined,
    lastName: undefined,
    memberId: undefined,
    storeId: undefined,
    storeName: undefined,
    cardNum: undefined,
    sessionId: undefined,
  });

  // Beer state
  const [beers, setBeers] = useState<BeerState>({
    allBeers: [],
    tastedBeers: [],
    rewards: [],
    queuedBeerIds: new Set(),
  });

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    selectedFilters: {},
    sortBy: undefined,
  });

  // Loading state
  const [loading, setLoading] = useState<LoadingState>({
    isLoadingBeers: false,
    isLoadingRewards: false,
    isRefreshing: false,
    isLoadingSession: true,
  });

  // Error state
  const [errors, setErrors] = useState<ErrorState>({
    beerError: null,
    rewardError: null,
    sessionError: null,
  });

  // ============================================================================
  // SESSION HELPERS
  // ============================================================================

  /**
   * Creates an empty session state (logged out)
   */
  const createEmptySession = useCallback((): SessionState => ({
    isLoggedIn: false,
    isVisitor: false,
    userName: undefined,
    userEmail: undefined,
    firstName: undefined,
    lastName: undefined,
    memberId: undefined,
    storeId: undefined,
    storeName: undefined,
    cardNum: undefined,
    sessionId: undefined,
  }), []);

  /**
   * Creates session state from SessionData
   */
  const createSessionFromData = useCallback((sessionData: SessionData, isVisitor: boolean): SessionState => ({
    isLoggedIn: true,
    isVisitor,
    userName: sessionData.username,
    userEmail: sessionData.email,
    firstName: sessionData.firstName,
    lastName: sessionData.lastName,
    memberId: sessionData.memberId,
    storeId: sessionData.storeId,
    storeName: sessionData.storeName,
    cardNum: sessionData.cardNum,
    sessionId: sessionData.sessionId,
  }), []);

  // ============================================================================
  // SESSION ACTIONS
  // ============================================================================

  /**
   * Load session data from storage on mount
   */
  const loadSessionFromStorage = useCallback(async () => {
    try {
      const sessionData = await getSessionData();
      const isVisitor = await checkIsVisitorMode(true); // Force refresh

      if (sessionData) {
        setSession(createSessionFromData(sessionData, isVisitor));
      } else {
        // No session data - user is not logged in
        setSession(createEmptySession());
      }
    } catch (error) {
      console.error('Error loading session from storage:', error);
      // On error, set to logged out state
      setSession(createEmptySession());
    } finally {
      setLoading(prev => ({ ...prev, isLoadingSession: false }));
    }
  }, [createEmptySession, createSessionFromData]);

  // ============================================================================
  // SHARED DATABASE LOADING FUNCTION
  // ============================================================================

  /**
   * Shared function to load all beer data from database
   * Used by both mount effect and refreshBeerData()
   * Avoids code duplication and ensures consistent loading behavior
   */
  const loadBeerDataFromDatabase = useCallback(async () => {
    // Load all data in parallel for better performance
    const [allBeersData, tastedBeersData, rewardsData] = await Promise.all([
      beerRepository.getAll(),
      myBeersRepository.getAll(),
      rewardsRepository.getAll()
    ]);

    // Update state with all data at once, preserving queuedBeerIds
    setBeers((prev) => ({
      allBeers: allBeersData,
      tastedBeers: tastedBeersData,
      rewards: rewardsData,
      queuedBeerIds: prev.queuedBeerIds,
    }));

    console.log(`[AppContext] Loaded beer data: ${allBeersData.length} all beers, ${tastedBeersData.length} tasted beers, ${rewardsData.length} rewards`);

    return { allBeersData, tastedBeersData, rewardsData };
  }, []);

  /**
   * Load session on mount
   */
  useEffect(() => {
    loadSessionFromStorage();
  }, [loadSessionFromStorage]);

  /**
   * Load beer data from database on mount with auto-retry and exponential backoff
   */
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 3;
    let isCancelled = false;
    const timers: Set<NodeJS.Timeout> = new Set();

    const loadBeerData = async (): Promise<void> => {
      if (isCancelled) return;

      try {
        setLoading(prev => ({ ...prev, isLoadingBeers: true }));
        await loadBeerDataFromDatabase();
        setBeerError(null); // Clear error on success
        console.log('[AppContext] Beer data loaded successfully');
      } catch (error) {
        console.error(`[AppContext] Error loading beer data (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);

        if (retryCount < maxRetries && !isCancelled) {
          retryCount++;
          const delay = 1000 * Math.pow(2, retryCount - 1); // 1s, 2s, 4s
          console.log(`[AppContext] Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);

          const timer = setTimeout(() => {
            timers.delete(timer);
            if (!isCancelled) {
              loadBeerData();
            }
          }, delay);
          timers.add(timer);
        } else if (!isCancelled) {
          // Final failure after all retries
          const errorMessage = 'Failed to load beer data from database';
          setBeerError(errorMessage);

          // Show toast notification on final failure (only if not cancelled)
          if (!isCancelled) {
            Alert.alert(
              'Data Load Failed',
              'Unable to load beer data after multiple attempts. Please check your connection and restart the app.',
              [
                { text: 'OK', style: 'default' }
              ]
            );
          }
        }
      } finally {
        if (isCancelled) return;
        setLoading(prev => ({ ...prev, isLoadingBeers: false }));
      }
    };

    loadBeerData();

    return () => {
      isCancelled = true;
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    };
  }, [loadBeerDataFromDatabase]); // Depends on shared loading function

  /**
   * Update session state after login
   */
  const updateSession = useCallback((sessionData: SessionData, isVisitor: boolean) => {
    setSession(createSessionFromData(sessionData, isVisitor));
  }, [createSessionFromData]);

  /**
   * Clear session state on logout
   */
  const clearSession = useCallback(() => {
    setSession(createEmptySession());
  }, [createEmptySession]);

  /**
   * Reload session from storage
   */
  const refreshSession = useCallback(async () => {
    await loadSessionFromStorage();
  }, [loadSessionFromStorage]);

  // ============================================================================
  // BEER LIST ACTIONS
  // ============================================================================

  const setAllBeers = useCallback((newBeers: BeerWithGlassType[]) => {
    setBeers((prev) => ({ ...prev, allBeers: newBeers }));
  }, []);

  const setTastedBeers = useCallback((newBeers: BeerfinderWithGlassType[]) => {
    setBeers((prev) => ({ ...prev, tastedBeers: newBeers }));
  }, []);

  const setRewards = useCallback((newRewards: Reward[]) => {
    setBeers((prev) => ({ ...prev, rewards: newRewards }));
  }, []);

  /**
   * Reload all beer data from database
   * Call this after data refresh operations to update AppContext state
   * Uses shared loading function to avoid code duplication
   */
  const refreshBeerData = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, isLoadingBeers: true }));
      await loadBeerDataFromDatabase();
      console.log('[AppContext] Refreshed beer data from database');
    } catch (error) {
      console.error('[AppContext] Error refreshing beer data:', error);
      setBeerError('Failed to refresh beer data from database');
    } finally {
      setLoading(prev => ({ ...prev, isLoadingBeers: false }));
    }
  }, [loadBeerDataFromDatabase]);

  /**
   * Add a beer ID to the queued set (prevents double check-ins)
   */
  const addQueuedBeer = useCallback((beerId: string) => {
    setBeers((prev) => {
      const newSet = new Set(prev.queuedBeerIds);
      newSet.add(beerId);
      return { ...prev, queuedBeerIds: newSet };
    });
  }, []);

  /**
   * Remove a beer ID from the queued set
   */
  const removeQueuedBeer = useCallback((beerId: string) => {
    setBeers((prev) => {
      const newSet = new Set(prev.queuedBeerIds);
      newSet.delete(beerId);
      return { ...prev, queuedBeerIds: newSet };
    });
  }, []);

  /**
   * Sync queued beer IDs from API response
   * Called when viewing queues to keep local state in sync with server
   */
  const syncQueuedBeerIds = useCallback((ids: string[]) => {
    setBeers((prev) => ({ ...prev, queuedBeerIds: new Set(ids) }));
  }, []);

  // ============================================================================
  // FILTER ACTIONS
  // ============================================================================

  const setSearchText = useCallback((text: string) => {
    setFilters((prev) => ({ ...prev, searchText: text }));
  }, []);

  const setSelectedFilters = useCallback((newFilters: Record<string, string>) => {
    setFilters((prev) => ({ ...prev, selectedFilters: newFilters }));
  }, []);

  const setSortBy = useCallback((sortBy: string | undefined) => {
    setFilters((prev) => ({ ...prev, sortBy }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      searchText: '',
      selectedFilters: {},
      sortBy: undefined,
    });
  }, []);

  // ============================================================================
  // LOADING ACTIONS
  // ============================================================================

  const setLoadingBeers = useCallback((isLoading: boolean) => {
    setLoading((prev) => ({ ...prev, isLoadingBeers: isLoading }));
  }, []);

  const setLoadingRewards = useCallback((isLoading: boolean) => {
    setLoading((prev) => ({ ...prev, isLoadingRewards: isLoading }));
  }, []);

  const setRefreshing = useCallback((isRefreshing: boolean) => {
    setLoading((prev) => ({ ...prev, isRefreshing }));
  }, []);

  // ============================================================================
  // ERROR ACTIONS
  // ============================================================================

  const setBeerError = useCallback((error: string | null) => {
    setErrors((prev) => ({ ...prev, beerError: error }));
  }, []);

  const setRewardError = useCallback((error: string | null) => {
    setErrors((prev) => ({ ...prev, rewardError: error }));
  }, []);

  const setSessionError = useCallback((error: string | null) => {
    setErrors((prev) => ({ ...prev, sessionError: error }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({
      beerError: null,
      rewardError: null,
      sessionError: null,
    });
  }, []);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: AppContextValue = useMemo(() => ({
    // State
    session,
    beers,
    filters,
    loading,
    errors,

    // Session actions
    updateSession,
    clearSession,
    refreshSession,

    // Beer list actions
    setAllBeers,
    setTastedBeers,
    setRewards,
    refreshBeerData,
    addQueuedBeer,
    removeQueuedBeer,
    syncQueuedBeerIds,

    // Filter actions
    setSearchText,
    setSelectedFilters,
    setSortBy,
    clearFilters,

    // Loading actions
    setLoadingBeers,
    setLoadingRewards,
    setRefreshing,

    // Error actions
    setBeerError,
    setRewardError,
    setSessionError,
    clearErrors,
  }), [
    // Only include state variables, NOT the action functions
    // (action functions are stable thanks to useCallback with empty deps)
    session,
    beers,
    filters,
    loading,
    errors,
    // Action functions are automatically stable due to useCallback
    updateSession,
    clearSession,
    refreshSession,
    setAllBeers,
    setTastedBeers,
    setRewards,
    refreshBeerData,
    addQueuedBeer,
    removeQueuedBeer,
    syncQueuedBeerIds,
    setSearchText,
    setSelectedFilters,
    setSortBy,
    clearFilters,
    setLoadingBeers,
    setLoadingRewards,
    setRefreshing,
    setBeerError,
    setRewardError,
    setSessionError,
    clearErrors,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

/**
 * Custom hook to access app context
 * Throws error if used outside of AppProvider
 *
 * @throws Error if used outside AppProvider
 * @returns AppContextValue with all state and actions
 *
 * @example
 * ```tsx
 * const { session, updateSession, beers } = useAppContext();
 * ```
 */
export const useAppContext = (): AppContextValue => {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }

  return context;
};
