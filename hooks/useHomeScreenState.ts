import { useState, useCallback, useEffect, useMemo } from 'react';
import { router, useFocusEffect, Href } from 'expo-router';
import { areApiUrlsConfigured } from '@/src/database/preferences';
import { useAppContext } from '@/context/AppContext';

/**
 * View state type representing the different UI states of the home screen
 */
export type HomeScreenView = 'loading' | 'setup' | 'visitor' | 'member';

/**
 * User data available from the session
 */
export type HomeScreenUserData = {
  memberName?: string;
  email?: string;
  storeId?: string;
  storeName?: string;
  memberId?: string;
  tastedBeerCount: number;
  allBeerCount: number;
};

/**
 * Navigation action functions
 */
export type HomeScreenActions = {
  /** Navigate to settings screen */
  navigateToSettings: () => void;
  /** Navigate to all beers tab */
  navigateToAllBeers: () => void;
  /** Navigate to beerfinder tab */
  navigateToBeerfinder: () => void;
  /** Navigate to tasted brews tab */
  navigateToTastedBrews: () => void;
  /** Navigate to rewards screen */
  navigateToRewards: () => void;
};

/**
 * Return value of the useHomeScreenState hook
 */
export type UseHomeScreenStateReturn = {
  /**
   * Current view state of the home screen
   * - 'loading': Initial state while checking configuration
   * - 'setup': API URLs not configured, show login prompt
   * - 'visitor': User is in visitor mode with limited access
   * - 'member': User is logged in as UFO Club member with full access
   */
  view: HomeScreenView;

  /**
   * Whether the hook is still loading initial state
   */
  isLoading: boolean;

  /**
   * Whether the user is in visitor mode
   */
  isVisitorMode: boolean;

  /**
   * User data from the session (null if not logged in or in visitor mode)
   */
  userData: HomeScreenUserData | null;

  /**
   * Navigation action functions
   */
  actions: HomeScreenActions;
};

/**
 * Custom hook to manage home screen business logic and state
 *
 * This hook handles:
 * - API URL validation
 * - Visitor mode detection
 * - View state calculation
 * - Navigation actions
 *
 * **State Management:**
 * - Automatically checks API URL configuration on mount
 * - Re-checks on screen focus to catch login state changes
 * - Uses AppContext for session state
 * - Derives view state from configuration and session
 *
 * **View State Logic:**
 * - 'loading': apiUrlsConfigured is null (initial check in progress)
 * - 'setup': apiUrlsConfigured is false (needs login)
 * - 'visitor': apiUrlsConfigured is true AND session.isVisitor is true
 * - 'member': apiUrlsConfigured is true AND session.isVisitor is false
 *
 * @example
 * ```tsx
 * const { view, isLoading, isVisitorMode, userData, actions } = useHomeScreenState();
 *
 * if (view === 'loading') {
 *   return <LoadingSpinner />;
 * }
 *
 * if (view === 'setup') {
 *   return (
 *     <LoginPrompt onLogin={actions.navigateToSettings} />
 *   );
 * }
 *
 * // Render based on visitor/member state
 * ```
 *
 * @returns Object containing view state, user data, and navigation actions
 */
export const useHomeScreenState = (): UseHomeScreenStateReturn => {
  const { session, beers } = useAppContext();
  const [apiUrlsConfigured, setApiUrlsConfigured] = useState<boolean | null>(null);

  /**
   * Check if API URLs are configured
   * Called on mount and when screen is focused
   */
  const checkApiUrls = useCallback(async () => {
    try {
      const isConfigured = await areApiUrlsConfigured();
      setApiUrlsConfigured(isConfigured);

      if (!isConfigured && __DEV__) {
        if (session.isVisitor) {
          console.log(
            '[useHomeScreenState] Warning: All beers API URL not configured in visitor mode'
          );
        } else {
          console.log(
            '[useHomeScreenState] Warning: API URLs not configured, showing login prompt'
          );
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[useHomeScreenState] Error checking API URLs:', error);
      }
      setApiUrlsConfigured(false);
    }
  }, [session.isVisitor]);

  // Check API URLs on mount
  useEffect(() => {
    if (__DEV__) {
      console.log('[useHomeScreenState] Mounted, checking API URLs');
    }
    checkApiUrls();
  }, [checkApiUrls]);

  // Re-check API URLs when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (__DEV__) {
        console.log('[useHomeScreenState] Screen focused, checking API URLs');
      }
      checkApiUrls();
      return () => {
        // Cleanup if needed
      };
    }, [checkApiUrls])
  );

  // Calculate the current view state (memoized to prevent unnecessary recalculations)
  const view = useMemo<HomeScreenView>(() => {
    if (apiUrlsConfigured === null) {
      return 'loading';
    }
    if (!apiUrlsConfigured) {
      return 'setup';
    }
    if (session.isVisitor) {
      return 'visitor';
    }
    return 'member';
  }, [apiUrlsConfigured, session.isVisitor]);

  // Build user data from session (memoized to prevent unnecessary object creation)
  const userData = useMemo<HomeScreenUserData | null>(() => {
    if (!session.isLoggedIn || session.isVisitor) {
      return null;
    }
    return {
      memberName: session.firstName || session.userName,
      email: session.userEmail,
      storeId: session.storeId,
      storeName: session.storeName,
      memberId: session.memberId,
      tastedBeerCount: beers.tastedBeers.length,
      allBeerCount: beers.allBeers.length,
    };
  }, [
    session.isLoggedIn,
    session.isVisitor,
    session.firstName,
    session.userName,
    session.userEmail,
    session.storeId,
    session.storeName,
    session.memberId,
    beers.tastedBeers.length,
    beers.allBeers.length,
  ]);

  // Navigation actions (memoized to prevent new object creation on every render)
  const actions = useMemo<HomeScreenActions>(
    () => ({
      navigateToSettings: () => {
        router.navigate('/settings');
      },
      navigateToAllBeers: () => {
        router.navigate('/(tabs)/beerlist');
      },
      navigateToBeerfinder: () => {
        router.navigate('/(tabs)/mybeers');
      },
      navigateToTastedBrews: () => {
        router.navigate('/(tabs)/tastedbrews');
      },
      navigateToRewards: () => {
        router.push('/screens/rewards' as Href);
      },
    }),
    []
  );

  return {
    view,
    isLoading: apiUrlsConfigured === null,
    isVisitorMode: session.isVisitor,
    userData,
    actions,
  };
};
