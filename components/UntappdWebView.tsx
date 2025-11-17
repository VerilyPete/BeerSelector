import React, { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { config } from '@/src/config';

interface UntappdWebViewProps {
  visible: boolean;
  onClose: () => void;
  beerName: string;
}

/**
 * UntappdWebView component
 *
 * Opens Untappd beer search in SFSafariViewController (iOS) or Chrome Custom Tabs (Android).
 * This allows users to leverage their existing Untappd session in Safari/Chrome without
 * needing to log in separately within the app.
 *
 * Workflow:
 * 1. User selects a beer in All Beers or Beerfinder
 * 2. User clicks "Check Untappd" button
 * 3. SFSafariViewController opens with Untappd search results
 * 4. User can immediately check-in, rate, or add photos using their existing login
 * 5. User closes the browser when done
 */
export const UntappdWebView = ({ visible, onClose, beerName }: UntappdWebViewProps) => {
  useEffect(() => {
    if (visible && beerName) {
      // Generate Untappd search URL
      const searchUrl = config.external.untappd.searchUrl(beerName);

      // Open in SFSafariViewController (iOS) or Chrome Custom Tabs (Android)
      // This shares cookies with the system browser, so users can use their existing login
      WebBrowser.openBrowserAsync(searchUrl, {
        // iOS: Use SFSafariViewController
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        // Android: Use Chrome Custom Tabs
        toolbarColor: '#FFC107', // Untappd yellow
        enableBarCollapsing: true,
        showTitle: true,
      }).then(() => {
        // Browser was dismissed, close our modal state
        onClose();
      }).catch((error) => {
        console.error('Error opening Untappd browser:', error);
        onClose();
      });
    }
  }, [visible, beerName, onClose]);

  // This component doesn't render any UI
  // The browser is presented by the OS
  return null;
}; 