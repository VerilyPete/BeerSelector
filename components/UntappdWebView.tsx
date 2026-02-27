import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { config } from '@/src/config';

type UntappdWebViewProps = {
  visible: boolean;
  onClose: () => void;
  beerName: string;
};

/**
 * UntappdWebView component
 *
 * Opens Untappd beer search using ASWebAuthenticationSession (iOS) which shares
 * cookies with Safari. This allows users to leverage their existing Untappd login.
 *
 * Note: Uses openAuthSessionAsync instead of openBrowserAsync because:
 * - openBrowserAsync uses SFSafariViewController which does NOT share cookies with Safari
 * - openAuthSessionAsync uses ASWebAuthenticationSession which DOES share cookies
 * - User will see a brief consent prompt ("BeerSelector wants to use untappd.com")
 *
 * Workflow:
 * 1. User selects a beer in All Beers or Beerfinder
 * 2. User clicks "Check Untappd" button
 * 3. ASWebAuthenticationSession opens with Untappd search results (shares Safari cookies)
 * 4. User can immediately check-in, rate, or add photos using their existing login
 * 5. User closes the browser when done
 */
export const UntappdWebView = ({ visible, onClose, beerName }: UntappdWebViewProps) => {
  useEffect(() => {
    if (visible && beerName) {
      // Generate Untappd search URL
      const searchUrl = config.external.untappd.searchUrl(beerName);

      // Open using ASWebAuthenticationSession (iOS) which shares cookies with Safari
      // This allows users to use their existing Untappd login from Safari
      WebBrowser.openAuthSessionAsync(searchUrl, undefined, {
        // iOS: Use ASWebAuthenticationSession (shares Safari cookies)
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        // Android: Use Chrome Custom Tabs
        toolbarColor: '#FFC107', // Untappd yellow
        showTitle: true,
      })
        .then(() => {
          // Browser was dismissed, close our modal state
          onClose();
        })
        .catch(error => {
          console.error('Error opening Untappd browser:', error);
          onClose();
        });
    }
  }, [visible, beerName, onClose]);

  // This component doesn't render any UI
  // The browser is presented by the OS
  return null;
};
