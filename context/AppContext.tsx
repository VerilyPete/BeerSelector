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

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode as checkIsVisitorMode } from '@/src/api/authService';
import type { SessionData } from '@/src/types/api';
import type { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';
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
  /** All beers from the Flying Saucer API (with pre-computed container types) */
  allBeers: BeerWithContainerType[];

  /** Beers the user has tasted (Beerfinder data with pre-computed container types) */
  tastedBeers: BeerfinderWithContainerType[];

  /** User's rewards from UFO Club */
  rewards: Reward[];

  /**
   * IDs of beers currently in the check-in queue (to prevent double check-ins).
   * Exposed as ReadonlySet so consumers can't bypass addQueuedBeer/removeQueuedBeer
   * with a direct .add()/.delete(); internal updates copy-then-mutate via new Set().
   */
  queuedBeerIds: ReadonlySet<string>;
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
  setAllBeers: (beers: BeerWithContainerType[]) => void;

  /** Update tasted beers list */
  setTastedBeers: (beers: BeerfinderWithContainerType[]) => void;

  /** Update rewards list */
  setRewards: (rewards: Reward[]) => void;

  /**
   * Reload all beer data from database (call after data refresh).
   *
   * Resolves `false` only when THIS call failed and its failure is now on
   * screen as `beerError`. It never rejects, which is why the boolean exists:
   * a caller that awaits it and reports success cannot otherwise tell that the
   * re-read it just triggered failed. Superseded calls resolve `true` — a newer
   * load owns the outcome, and there is nothing for this caller to report.
   */
  refreshBeerData: () => Promise<boolean>;

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
  const createEmptySession = useCallback(
    (): SessionState => ({
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
    }),
    []
  );

  /**
   * Creates session state from SessionData
   */
  const createSessionFromData = useCallback(
    (sessionData: SessionData, isVisitor: boolean): SessionState => ({
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
    }),
    []
  );

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
   * True once any load has committed data to context. The mount effect's retry
   * chain outlives the load that started it — a transient fault can have the
   * chain still running while a manual refresh succeeds — and its final-failure
   * branch would otherwise raise a fatal error over a fully populated list.
   *
   * A plain latch rather than a request-generation counter, because
   * `loadBeerDataFromDatabase` is a `useCallback([])` and the effect that owns
   * the retry chain therefore runs once per provider: "any load has committed"
   * and "a load newer than this chain committed" are the same predicate here.
   *
   * It never resets, which is why that equivalence is load-bearing rather than
   * incidental. Give that effect a real dependency, or add a flow that re-arms
   * the retry chain, and the latch silently disarms the fatal-error branch
   * forever. That is the point at which this must become a counter.
   */
  const hasLoadedBeerData = useRef(false);

  /**
   * Monotonic id for each call to `loadBeerDataFromDatabase`, so a load that
   * settles after a newer one can recognise itself as stale and commit nothing.
   *
   * Distinct from `hasLoadedBeerData` and not a replacement for it. The latch
   * answers "has ANY load ever committed", which is what the retry chain's
   * final-failure branch needs. This answers "is MY result still the newest",
   * which is what every writer needs. The latch alone cannot tell a late loser
   * from a first arrival, so a slow rewards read could raise an error over a
   * completed refresh — the failure this counter exists to stop.
   */
  const loadGeneration = useRef(0);

  // ============================================================================
  // SHARED DATABASE LOADING FUNCTION
  // ============================================================================

  /**
   * Shared function to load all beer data from database
   * Used by both mount effect and refreshBeerData()
   * Avoids code duplication and ensures consistent loading behavior
   */
  const loadBeerDataFromDatabase = useCallback(async (generation: number) => {
    // Load all data in parallel for better performance.
    //
    // The rewards read is caught separately rather than sharing the others'
    // rejection. Rewards are the least load-bearing of the three — nothing in
    // the 200 Beer Challenge depends on them — so an unreadable rewards table
    // must not blank the catalog and the tasted list, which is what one
    // Promise.all did: the whole load failed, the mount effect spent 7s
    // retrying, and the user was told "Failed to load beer data from database",
    // naming the wrong subsystem and offering nothing to act on.
    //
    // It goes to `rewardError` instead, which `Rewards.tsx` already renders and
    // which nothing in the app had ever written.
    const [allBeersData, tastedBeersData, rewardsOutcome] = await Promise.all([
      beerRepository.getAll(),
      myBeersRepository.getAll(),
      rewardsRepository.getAll().then(
        rewards => ({ loaded: true as const, rewards }),
        (error: unknown) => {
          console.error('[AppContext] Error loading rewards from database:', error);
          return { loaded: false as const };
        }
      ),
    ]);

    // A newer load has claimed a generation since this one started, so this
    // result is history. Commit nothing — not the rows, not the rewards error,
    // not the latch. Without this, a mount load whose rewards query sat on a
    // lock for ten seconds would surface a full-screen rewards error over data
    // a manual refresh had already loaded correctly, and there is no retry
    // chain behind `rewardError` to undo it.
    //
    // "Claimed", not "committed": the newer load may still be in flight, or may
    // yet fail. Either way it owns the outcome, and the caller must treat this
    // return as no outcome at all rather than as a success — see the callers.
    if (generation !== loadGeneration.current) {
      console.log('[AppContext] Discarding a superseded load; a newer one has started');
      return { superseded: true as const };
    }

    // Update state with all data at once, preserving queuedBeerIds — and, when
    // the rewards read failed, the rewards already in context.
    //
    // Writing [] would blank rewards the user may be reading, replacing them
    // with nothing beside a banner that says only that the last read failed.
    // (It would NOT produce "No Rewards Yet": Rewards.tsx suppresses its empty
    // state while `rewardError` is set. An earlier version of this comment
    // claimed that, and the two changes ended up justifying each other in a
    // circle — the reason to keep the rows is the rows, not the caption.)
    setBeers(prev => ({
      allBeers: allBeersData,
      tastedBeers: tastedBeersData,
      rewards: rewardsOutcome.loaded ? rewardsOutcome.rewards : prev.rewards,
      queuedBeerIds: prev.queuedBeerIds,
    }));

    // Called, not listed in the dependency array below — the same way the retry
    // chain and `refreshBeerData` already use `setBeerError`. Naming any of
    // them there would NOT be inert: they are `const`s declared ~200 lines
    // further down, and a dependency array is evaluated during render, so the
    // reference lands in their temporal dead zone and throws
    // "Cannot access 'setRewardError' before initialization" — a white screen
    // on first render, not a no-op. Keeping this callback's dependencies empty
    // is also what makes the `hasLoadedBeerData` latch above sound.
    setRewardError(rewardsOutcome.loaded ? null : 'Failed to load rewards from database');

    hasLoadedBeerData.current = true;

    console.log(
      `[AppContext] Loaded beer data: ${allBeersData.length} all beers, ${tastedBeersData.length} tasted beers, ` +
        (rewardsOutcome.loaded ? `${rewardsOutcome.rewards.length} rewards` : 'rewards unreadable')
    );

    return { allBeersData, tastedBeersData, rewardsOutcome, superseded: false as const };
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
    const timers: Set<ReturnType<typeof setTimeout>> = new Set();

    const loadBeerData = async (): Promise<void> => {
      if (isCancelled) return;

      // Claimed here, not inside the read, because ownership has to span this
      // whole try/catch/finally. A load that loses the race must not clear the
      // winner's error, must not raise its own, and must not lower the loading
      // flag out from under the load still running.
      const generation = ++loadGeneration.current;

      try {
        setLoading(prev => ({ ...prev, isLoadingBeers: true }));
        const outcome = await loadBeerDataFromDatabase(generation);

        // Superseded is not success. Returning here without clearing the error
        // is the point: a newer load owns the outcome, and if that newer load
        // FAILED, its error is the one the user should still be looking at.
        // Treating this as a success cleared it and exited the retry chain,
        // leaving no data, no error and nothing pending.
        if (outcome.superseded) return;

        setBeerError(null); // Clear error on success
        console.log('[AppContext] Beer data loaded successfully');
      } catch (error) {
        console.error(
          `[AppContext] Error loading beer data (attempt ${retryCount + 1}/${maxRetries + 1}):`,
          error
        );

        // A stale rejection is history too. The generation check inside the
        // read is skipped when the read throws, so without this a load that
        // lost the race would still retry and still raise a fatal error over
        // whatever the winner committed.
        if (generation !== loadGeneration.current) {
          console.log('[AppContext] Ignoring a superseded load failure; a newer load has started');
          return;
        }

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
          // A load that started before this chain gave up may have succeeded
          // meanwhile — a manual refresh inside the 7s retry window is the
          // ordinary case, and SQLITE_BUSY contention at launch makes it a
          // transient fault, not a permanent one. Raising the fatal error here
          // would paint a full-screen failure and a "restart the app" alert
          // over a complete, freshly loaded list. The data on screen is good;
          // say nothing.
          if (hasLoadedBeerData.current) {
            console.log(
              '[AppContext] Retries exhausted, but a later load already succeeded - keeping data'
            );
            return;
          }

          // Final failure after all retries
          const errorMessage = 'Failed to load beer data from database';
          setBeerError(errorMessage);

          // Show toast notification on final failure (only if not cancelled)
          if (!isCancelled) {
            Alert.alert(
              'Data Load Failed',
              'Unable to load beer data after multiple attempts. Please check your connection and restart the app.',
              [{ text: 'OK', style: 'default' }]
            );
          }
        }
      } finally {
        if (isCancelled) return;
        // Only the newest load lowers the flag. A superseded load doing it
        // retracts the skeleton while the load that actually owns the screen is
        // still reading.
        if (generation === loadGeneration.current) {
          setLoading(prev => ({ ...prev, isLoadingBeers: false }));
        }
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
  const updateSession = useCallback(
    (sessionData: SessionData, isVisitor: boolean) => {
      setSession(createSessionFromData(sessionData, isVisitor));
    },
    [createSessionFromData]
  );

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

  const setAllBeers = useCallback((newBeers: BeerWithContainerType[]) => {
    setBeers(prev => ({ ...prev, allBeers: newBeers }));
  }, []);

  const setTastedBeers = useCallback((newBeers: BeerfinderWithContainerType[]) => {
    setBeers(prev => ({ ...prev, tastedBeers: newBeers }));
  }, []);

  const setRewards = useCallback((newRewards: Reward[]) => {
    setBeers(prev => ({ ...prev, rewards: newRewards }));
  }, []);

  /**
   * Reload all beer data from database
   * Call this after data refresh operations to update AppContext state
   * Uses shared loading function to avoid code duplication
   */
  const refreshBeerData = useCallback(async (): Promise<boolean> => {
    // Same ownership rule as the mount effect: this refresh owns the error and
    // the loading flag only for as long as no newer load has been claimed. Two
    // overlapping refreshes are ordinary — Rewards' Try Again beside its own
    // pull-to-refresh, FINDER's pull-to-refresh beside AllBeers' Try Again.
    const generation = ++loadGeneration.current;

    try {
      setLoading(prev => ({ ...prev, isLoadingBeers: true }));
      const outcome = await loadBeerDataFromDatabase(generation);
      if (outcome.superseded) return true;

      setBeerError(null); // Clear error on success — mirrors the mount effect
      console.log('[AppContext] Refreshed beer data from database');
      return true;
    } catch (error) {
      console.error('[AppContext] Error refreshing beer data:', error);

      // A rejection that lost the race is history: raising it here would paint
      // a full-screen error over rows a newer refresh had just committed.
      if (generation !== loadGeneration.current) {
        console.log('[AppContext] Ignoring a superseded refresh failure');
        return true;
      }

      setBeerError('Failed to refresh beer data from database');
      return false;
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(prev => ({ ...prev, isLoadingBeers: false }));
      }
    }
  }, [loadBeerDataFromDatabase]);

  /**
   * Add a beer ID to the queued set (prevents double check-ins)
   */
  const addQueuedBeer = useCallback((beerId: string) => {
    setBeers(prev => {
      const newSet = new Set(prev.queuedBeerIds);
      newSet.add(beerId);
      return { ...prev, queuedBeerIds: newSet };
    });
  }, []);

  /**
   * Remove a beer ID from the queued set
   */
  const removeQueuedBeer = useCallback((beerId: string) => {
    setBeers(prev => {
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
    setBeers(prev => ({ ...prev, queuedBeerIds: new Set(ids) }));
  }, []);

  // ============================================================================
  // FILTER ACTIONS
  // ============================================================================

  const setSearchText = useCallback((text: string) => {
    setFilters(prev => ({ ...prev, searchText: text }));
  }, []);

  const setSelectedFilters = useCallback((newFilters: Record<string, string>) => {
    setFilters(prev => ({ ...prev, selectedFilters: newFilters }));
  }, []);

  const setSortBy = useCallback((sortBy: string | undefined) => {
    setFilters(prev => ({ ...prev, sortBy }));
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
    setLoading(prev => ({ ...prev, isLoadingBeers: isLoading }));
  }, []);

  const setLoadingRewards = useCallback((isLoading: boolean) => {
    setLoading(prev => ({ ...prev, isLoadingRewards: isLoading }));
  }, []);

  const setRefreshing = useCallback((isRefreshing: boolean) => {
    setLoading(prev => ({ ...prev, isRefreshing }));
  }, []);

  // ============================================================================
  // ERROR ACTIONS
  // ============================================================================

  const setBeerError = useCallback((error: string | null) => {
    setErrors(prev => ({ ...prev, beerError: error }));
  }, []);

  const setRewardError = useCallback((error: string | null) => {
    setErrors(prev => ({ ...prev, rewardError: error }));
  }, []);

  const setSessionError = useCallback((error: string | null) => {
    setErrors(prev => ({ ...prev, sessionError: error }));
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

  const value: AppContextValue = useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

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
