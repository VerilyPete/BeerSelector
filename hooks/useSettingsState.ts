import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { getAllPreferences } from '@/src/database/preferences';

/**
 * Preference type matching database structure
 */
interface Preference {
  key: string;
  value: string;
  description: string;
  editable?: boolean;
}

/**
 * Return value of the useSettingsState hook
 */
export interface UseSettingsStateReturn {
  /**
   * All preferences loaded from database
   */
  preferences: Preference[];

  /**
   * Whether preferences are currently being loaded
   */
  loading: boolean;

  /**
   * Whether API URLs are configured
   */
  apiUrlsConfigured: boolean;

  /**
   * Whether this is the first login (no API URLs set)
   */
  isFirstLogin: boolean;

  /**
   * Whether the app can navigate back (affects UI)
   */
  canGoBack: boolean;

  /**
   * Reload preferences from database
   */
  loadPreferences: () => Promise<void>;
}

/**
 * Custom hook to manage settings screen state
 *
 * This hook handles:
 * - Loading preferences from database
 * - Determining if API URLs are configured
 * - Determining if this is first login
 * - Checking if navigation can go back
 *
 * **State Management:**
 * - Automatically loads preferences on mount
 * - Provides reload function for manual refresh
 * - Derives configuration state from preferences
 * - Checks router navigation stack
 *
 * @example
 * ```tsx
 * const {
 *   preferences,
 *   loading,
 *   apiUrlsConfigured,
 *   isFirstLogin,
 *   canGoBack,
 *   loadPreferences
 * } = useSettingsState();
 *
 * // After successful login:
 * await loadPreferences();
 * ```
 *
 * @returns Object containing settings state and control functions
 */
export const useSettingsState = (): UseSettingsStateReturn => {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUrlsConfigured, setApiUrlsConfigured] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  /**
   * Load preferences from database and derive state
   */
  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const prefs = await getAllPreferences();
      setPreferences(prefs);

      // Check if API URLs are set
      const allBeersApiUrl = prefs.find(p => p.key === 'all_beers_api_url')?.value;
      const myBeersApiUrl = prefs.find(p => p.key === 'my_beers_api_url')?.value;

      // Set state based on whether URLs are configured
      const configured = !!(allBeersApiUrl && myBeersApiUrl);
      setApiUrlsConfigured(configured);
      setIsFirstLogin(!configured);
    } catch (error) {
      console.error('Failed to load preferences:', error);
      // Don't show alert here - let component handle it if needed
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Check navigation state and load preferences on mount
   */
  useEffect(() => {
    loadPreferences();

    // Check if this is the initial route or if we can go back
    try {
      setCanGoBack(router.canGoBack());
    } catch (error) {
      // If router.canGoBack() throws, we can't go back
      setCanGoBack(false);
    }
  }, [loadPreferences]);

  return {
    preferences,
    loading,
    apiUrlsConfigured,
    isFirstLogin,
    canGoBack,
    loadPreferences,
  };
};
