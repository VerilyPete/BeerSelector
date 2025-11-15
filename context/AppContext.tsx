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
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode as checkIsVisitorMode } from '@/src/api/authService';
import type { SessionData } from '@/src/types/api';
import type { Beer, Beerfinder } from '@/src/types/beer';
import type { Reward } from '@/src/types/database';

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
  /** All beers from the Flying Saucer API */
  allBeers: Beer[];

  /** Beers the user has tasted (Beerfinder data) */
  tastedBeers: Beerfinder[];

  /** User's rewards from UFO Club */
  rewards: Reward[];
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
  setAllBeers: (beers: Beer[]) => void;

  /** Update tasted beers list */
  setTastedBeers: (beers: Beerfinder[]) => void;

  /** Update rewards list */
  setRewards: (rewards: Reward[]) => void;

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

  /**
   * Load session on mount
   */
  useEffect(() => {
    loadSessionFromStorage();
  }, [loadSessionFromStorage]);

  /**
   * Load beer data from database on mount
   */
  useEffect(() => {
    const loadBeerData = async () => {
      try {
        setLoading(prev => ({ ...prev, isLoadingBeers: true }));

        // Import repositories dynamically to avoid circular dependencies
        const { beerRepository } = await import('@/src/database/repositories/BeerRepository');
        const { myBeersRepository } = await import('@/src/database/repositories/MyBeersRepository');
        const { rewardsRepository } = await import('@/src/database/repositories/RewardsRepository');

        // Load all beers
        const allBeersData = await beerRepository.getAll();
        setBeers(prev => ({ ...prev, allBeers: allBeersData }));

        // Load tasted beers (my beers)
        const tastedBeersData = await myBeersRepository.getAll();
        setBeers(prev => ({ ...prev, tastedBeers: tastedBeersData }));

        // Load rewards
        const rewardsData = await rewardsRepository.getAll();
        setBeers(prev => ({ ...prev, rewards: rewardsData }));

        console.log(`[AppContext] Loaded beer data: ${allBeersData.length} all beers, ${tastedBeersData.length} tasted beers, ${rewardsData.length} rewards`);
      } catch (error) {
        console.error('[AppContext] Error loading beer data:', error);
        setBeerError('Failed to load beer data from database');
      } finally {
        setLoading(prev => ({ ...prev, isLoadingBeers: false }));
      }
    };

    loadBeerData();
  }, []); // Empty deps - load only on mount

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

  const setAllBeers = useCallback((newBeers: Beer[]) => {
    setBeers((prev) => ({ ...prev, allBeers: newBeers }));
  }, []);

  const setTastedBeers = useCallback((newBeers: Beerfinder[]) => {
    setBeers((prev) => ({ ...prev, tastedBeers: newBeers }));
  }, []);

  const setRewards = useCallback((newRewards: Reward[]) => {
    setBeers((prev) => ({ ...prev, rewards: newRewards }));
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
