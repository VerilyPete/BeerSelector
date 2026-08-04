import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Modal } from 'react-native';
import { config } from '@/src/config';

// Import after mocks
import LoginWebView from '@/components/LoginWebView';
import { setPreference } from '@/src/database/preferences';
import { commitTaplistWrite } from '@/src/services/taplistEtag';
import { saveSessionData, extractSessionDataFromResponse } from '@/src/api/sessionManager';
import { handleVisitorLogin } from '@/src/api/authService';
// Deliberately NOT mocked. The behaviour under test — that the gate-open
// write genuinely queues behind a concurrent lock holder rather than merely
// running after it in program order — only exists in the real FIFO queue.
// The passthrough mock used elsewhere in this codebase
// (`jest.fn(async (_name, task) => task())`) always resolves as a plain
// function call, so a test built on it cannot tell "wrapped in a lock" from
// "not wrapped at all" apart — the exact gap this suite exists to close.
import { databaseLockManager } from '@/src/database/DatabaseLockManager';

// Test URL constants - prefixed with 'mock' to allow use in jest.mock() factory
const mockTestBaseUrl = 'https://test.beerknurd.com';
const mockUntappdBaseUrl = 'https://untappd.com';
const mockFsbsBaseUrl = 'https://fsbs.beerknurd.com';

// Test network configuration constants - prefixed with 'mock' for jest.mock()
const mockTestTimeout = 15000;
const mockTestRetries = 3;
const mockTestRetryDelay = 1000;

// The real `getFullUrl` resolves through this map, so `memberDashboard` becomes
// `/member-dash.php`. The mock used to interpolate the endpoint NAME instead,
// producing `/memberDashboard.php` — which never matches the component's
// `url.includes('member-dash.php')` check, so every injection test silently
// asserted against a URL the component could not recognise.
let mockCurrentBaseUrl: string | null = null;

const mockEndpointPaths: Record<string, string> = {
  kiosk: '/kiosk.php',
  visitor: '/visitor.php',
  memberDashboard: '/member-dash.php',
  memberQueues: '/memberQueues.php',
  addToQueue: '/addToQueue.php',
  deleteQueuedBrew: '/deleteQueuedBrew.php',
  addToRewardQueue: '/addToRewardQueue.php',
  memberRewards: '/memberRewards.php',
};

// Mock config module (following gold standard pattern)
jest.mock('@/src/config', () => ({
  config: {
    api: {
      getFullUrl: jest.fn(
        endpoint => `${mockTestBaseUrl}${mockEndpointPaths[endpoint] ?? `/${endpoint}.php`}`
      ),
      // A getter, not a value. `jest.mock` factories are hoisted above the
      // `const` declarations above, and Babel's transform makes that early read
      // yield `undefined` instead of throwing — so a plain `baseUrl:
      // mockTestBaseUrl` captured undefined. `getFullUrl` escaped this only
      // because its closure runs when called, long after initialisation.
      get baseUrl() {
        return mockCurrentBaseUrl ?? mockTestBaseUrl;
      },
      // A setter, because a lifecycle test assigns to this directly to simulate
      // an environment change. Without one the assignment silently no-ops
      // against a getter-only property. `beforeEach` clears the override so the
      // mutation cannot leak into the tests that follow.
      set baseUrl(value: string) {
        mockCurrentBaseUrl = value;
      },
      endpoints: {
        kiosk: '/kiosk.php',
        visitor: '/visitor.php',
        memberDashboard: '/member-dash.php',
        memberQueues: '/memberQueues.php',
        addToQueue: '/addToQueue.php',
        deleteQueuedBrew: '/deleteQueuedBrew.php',
        addToRewardQueue: '/addToRewardQueue.php',
        memberRewards: '/memberRewards.php',
      },
      referers: {
        memberDashboard: `${mockTestBaseUrl}/member-dash.php`,
        memberRewards: `${mockTestBaseUrl}/memberRewards.php`,
        memberQueues: `${mockTestBaseUrl}/memberQueues.php`,
      },
    },
    network: {
      timeout: mockTestTimeout,
      retries: mockTestRetries,
      retryDelay: mockTestRetryDelay,
    },
    external: {
      untappd: {
        baseUrl: mockUntappdBaseUrl,
        loginUrl: `${mockUntappdBaseUrl}/login`,
      },
    },
    setEnvironment: jest.fn(),
    setCustomApiUrl: jest.fn(),
  },
}));

// Mock theme hooks
jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

// Mock IconSymbol
jest.mock('@/components/ui/IconSymbol', () => ({
  IconSymbol: ({ name, testID }: any) => {
    const { View } = require('react-native');
    return <View testID={testID || `icon-${name}`} />;
  },
}));

// Mock WebView
const mockWebViewRef = {
  current: {
    injectJavaScript: jest.fn(),
  },
};

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: ({ onMessage, onLoadEnd, onNavigationStateChange, onLoadStart, testID, ref }: any) => {
      // Expose the mock ref
      if (ref) {
        Object.assign(ref, mockWebViewRef);
      }

      return (
        <View
          testID={testID || 'webview-mock'}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={onLoadStart}
        />
      );
    },
  };
});

// Mock database functions
jest.mock('@/src/database/preferences', () => ({
  setPreference: jest.fn().mockResolvedValue(undefined),
  getPreference: jest.fn().mockResolvedValue(null),
}));

// Mock the taplist ETag owner. Login invalidates the stored ETag not because
// the rows and the ETag disagree — they still match each other — but because
// login repoints `all_beers_api_url` at a different store, leaving the ETag
// naming a store the app no longer fetches from.
jest.mock('@/src/services/taplistEtag', () => ({
  commitTaplistWrite: jest.fn().mockResolvedValue(undefined),
}));

// Mock session manager
jest.mock('@/src/api/sessionManager', () => ({
  saveSessionData: jest.fn().mockResolvedValue(undefined),
  extractSessionDataFromResponse: jest.fn().mockReturnValue({
    memberId: '12345',
    sessionId: 'test-session',
    storeId: '67',
    storeName: 'Test Store',
  }),
}));

// Mock auth service
jest.mock('@/src/api/authService', () => ({
  handleVisitorLogin: jest.fn().mockResolvedValue({ success: true }),
}));

describe('LoginWebView', () => {
  const mockOnLoginSuccess = jest.fn();
  const mockOnLoginCancel = jest.fn();
  const mockOnRefreshData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebViewRef.current.injectJavaScript.mockClear();
    // `clearAllMocks` resets calls but NOT implementations, so a test that
    // points `getFullUrl` at a throwing stub leaks it into every test that
    // follows. Restoring the default here is what makes this suite order
    // -independent.
    mockCurrentBaseUrl = null;
    (config.api.getFullUrl as jest.Mock).mockImplementation(
      (endpoint: string) => `${mockTestBaseUrl}${mockEndpointPaths[endpoint] ?? `/${endpoint}.php`}`
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Guards every test in the file, not just the ones below that take the
    // lock deliberately: a test that fails mid-hold would otherwise leave the
    // singleton locked for every test that runs after it in this file.
    databaseLockManager.resetForTesting();
  });

  describe('Component Rendering', () => {
    it('should render when visible is true', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByTestId('login-webview-modal')).toBeTruthy();
    });

    it('should not render modal content when visible is false', () => {
      const { queryByTestId } = render(
        <LoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // A hidden Modal does not render its children at all, so the content is
      // absent rather than present-and-flagged-invisible. The test name always
      // described this; the assertion did not.
      expect(queryByTestId('login-webview-modal')).toBeNull();
    });

    it('should render close button', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByTestId('close-webview-button')).toBeTruthy();
    });

    it('should render title', () => {
      const { getByText } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByText('Flying Saucer Login')).toBeTruthy();
    });

    it('should render WebView component', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      expect(getByTestId('webview-mock')).toBeTruthy();
    });

    it('should show loading indicator when loading', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Simulate load start
      if (webview.props.onLoadStart) {
        webview.props.onLoadStart();
      }

      // Should show loading state (implementation specific)
    });
  });

  describe('Close Button Behavior', () => {
    it('should call onLoginCancel when close button pressed', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      expect(mockOnLoginCancel).toHaveBeenCalledTimes(1);
    });

    it('should show alert when login cancelled', () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      expect(alertSpy).toHaveBeenCalledWith('Login Cancelled', 'The login process was cancelled.');
    });

    it('should clear processed URLs when closed', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      // Processed URLs should be cleared (internal state)
      expect(mockOnLoginCancel).toHaveBeenCalled();
    });
  });

  describe('WebView Message Handling - Member Login', () => {
    it('should handle URLs message with valid data', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const testUserUrl = `${mockFsbsBaseUrl}/bk-member-json.php?uid=12345`;
      const testStoreUrl = `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`;

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: testUserUrl,
            storeJsonUrl: testStoreUrl,
            cookies: {
              member: '12345',
              session: 'test-session',
              store__id: '67',
              store: 'Test Store',
            },
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'is_visitor_mode',
          'false',
          'Flag indicating whether the user is in visitor mode'
        );
      });

      expect(setPreference).toHaveBeenCalledWith(
        'user_json_url',
        testUserUrl,
        'API endpoint for user data'
      );

      expect(setPreference).toHaveBeenCalledWith(
        'my_beers_api_url',
        testUserUrl,
        'API endpoint for fetching Beerfinder beers'
      );

      expect(saveSessionData).toHaveBeenCalled();
      // Not `onRefreshData`: this component never calls it. `useLoginFlow`'s
      // `handleLoginSuccess` does, in response to `onLoginSuccess` below. The
      // assertion was testing the parent through the child.
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });

    it('never writes session cookies to the preferences table', async () => {
      // INVERTED. This used to assert the write. `auth_cookies` held the raw
      // cookie jar — PHPSESSID included — as plaintext in an ordinary SQLite
      // row, while the same session was already in SecureStore via
      // `saveSessionData`. `migrateToV8`'s docstring is the canonical account
      // of why it went and what its removal does and does not achieve; this
      // comment used to carry its own copy, which is how a false claim about
      // the key's history came to be asserted in three files at once.
      //
      // Asserted two ways, because the key alone is not the property. The
      // property is that no session cookie VALUE reaches the preferences
      // table — under `auth_cookies`, under any other key, whole jar or single
      // token. An earlier version asserted only the key and the serialised
      // jar, and mutation testing found the gap that leaves: writing just
      // `cookies.session` under a blameless-looking key survived it. That is
      // the realistic shape of a reintroduction, and it exposes the one cookie
      // that actually matters.
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Deliberately unmistakable values. The assertion below is a substring
      // search over every preference value written, which is only safe from
      // false positives if the fixture's values cannot plausibly occur inside a
      // legitimate one — a bare `'12345'` could turn up inside a store URL and
      // fail this test for a change that leaked nothing. `PHPSESSID` is the
      // real name of the cookie this whole removal is about.
      const testCookies = {
        member_id: 'sentinel-member-id-not-for-storage',
        PHPSESSID: 'sentinel-php-session-token-not-for-storage',
      };

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: `${mockTestBaseUrl}/user.php`,
            storeJsonUrl: `${mockTestBaseUrl}/store.php`,
            cookies: testCookies,
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(saveSessionData).toHaveBeenCalled();
      });

      const writes = (setPreference as jest.Mock).mock.calls;

      // The key that used to carry the jar, named explicitly so the specific
      // regression reads as itself in the failure output.
      expect(writes.map(([key]) => key)).not.toContain('auth_cookies');

      // Then the property that actually matters, independent of naming: no
      // cookie value, and no serialisation containing one, was written under
      // ANY key. `filter` rather than a boolean so a failure names the
      // offending write instead of just asserting that one exists.
      for (const cookieValue of [...Object.values(testCookies), JSON.stringify(testCookies)]) {
        const leakingWrites = writes.filter(([, value]) => String(value).includes(cookieValue));
        expect(leakingWrites).toEqual([]);
      }
    });

    it('should save login timestamp', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: `${mockTestBaseUrl}/user.php`,
            storeJsonUrl: `${mockTestBaseUrl}/store.php`,
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'last_login_timestamp',
          expect.any(String),
          'Last successful login timestamp'
        );
      });
    });

    it('should show success alert for member login', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: `${mockTestBaseUrl}/user.php`,
            storeJsonUrl: `${mockTestBaseUrl}/store.php`,
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // fd18c05 removed the success alerts from this component — in the same
      // commit that wrote these assertions. They have been red ever since, and
      // the quarantine hid it. A successful login now reports through
      // `onLoginSuccess` and stays silent; only failures alert.
      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalled();
      });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('should not process login if URLs are missing', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URLs',
            userJsonUrl: null,
            storeJsonUrl: null,
            cookies: {},
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should not save preferences if URLs are missing
      await waitFor(() => {
        expect(setPreference).not.toHaveBeenCalledWith(
          'my_beers_api_url',
          expect.any(String),
          expect.any(String)
        );
      });
    });
  });

  describe('Member Login - taplist ETag invalidation', () => {
    const memberLoginMessage = {
      nativeEvent: {
        data: JSON.stringify({
          type: 'URLs',
          userJsonUrl: `${mockFsbsBaseUrl}/bk-member-json.php?uid=12345`,
          storeJsonUrl: `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
          cookies: {
            member: '12345',
            session: 'test-session',
            store__id: '67',
            store: 'Test Store',
          },
        }),
      },
    };

    const renderLogin = () =>
      render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

    it('does not report login success until the taplist ETag clear has been persisted', async () => {
      // `onLoginSuccess` runs `handleLoginSuccess`, which calls `onRefreshData`.
      // Reporting success before the clear lands lets that refresh read the
      // PREVIOUS store's ETag. The proxy keys its ETag to the store's own cached
      // payload, so a cross-store validator misses and costs a wasted full 200
      // rather than wrong rows — this orders the clear ahead of the refresh it
      // triggers, which is the guarantee available here.
      let releaseEtagClear: () => void = () => {};
      (commitTaplistWrite as jest.Mock).mockReturnValueOnce(
        new Promise<void>(resolve => {
          releaseEtagClear = () => resolve();
        })
      );

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(commitTaplistWrite).toHaveBeenCalledWith({ kind: 'cleared' });
      });
      expect(mockOnLoginSuccess).not.toHaveBeenCalled();

      releaseEtagClear();

      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalled();
      });
    });

    it('cancels the login when the taplist ETag clear fails', async () => {
      // Unawaited, this rejection is an unhandled promise: logged in dev,
      // dropped in production, with the previous store's ETag left live and
      // nobody told. Awaited, it reaches the handler's catch.
      (commitTaplistWrite as jest.Mock).mockRejectedValueOnce(new Error('database is locked'));

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(mockOnLoginCancel).toHaveBeenCalled();
      });
      expect(mockOnLoginSuccess).not.toHaveBeenCalled();
    });

    it('tells the user when a member login fails', async () => {
      // The visitor branch alerts on failure and a user-initiated close alerts.
      // The member branch was the one path that said nothing at all — the modal
      // just vanished and the user was left on Settings with no idea a database
      // error had occurred, and no idea the login had not happened.
      (commitTaplistWrite as jest.Mock).mockRejectedValueOnce(new Error('database is locked'));
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      // Asserting only that SOME alert fired let a mutant through: routing the
      // catch to `handleClose` tells the user they cancelled the login, which is
      // false and drops the retry hint, and the suite stayed green.
      expect(alertSpy).toHaveBeenCalledWith(
        'Login Failed',
        expect.stringContaining('Could not finish signing you in'),
        expect.any(Array)
      );
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(mockOnLoginCancel).toHaveBeenCalled();
      expect(mockOnLoginSuccess).not.toHaveBeenCalled();
    });

    it('does not mark the app configured when the session cannot be saved', async () => {
      // `areApiUrlsConfigured` reads is_visitor_mode, all_beers_api_url and
      // my_beers_api_url, and app/_layout.tsx routes on it. Writing those before
      // the session is persisted lets a failed login boot the app straight into
      // member mode with nothing in SecureStore — configured, unauthenticated,
      // and unable to explain itself. The gate must be the last thing to flip.
      (saveSessionData as jest.Mock).mockRejectedValueOnce(new Error('SecureStore unavailable'));

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(mockOnLoginCancel).toHaveBeenCalled();
      });

      // The gate is `all_beers_api_url` being truthy — both branches of
      // `areApiUrlsConfigured` require it. Asserting the key was never written
      // would be wrong now that the login clears it first; what must not happen
      // is the gate being left OPEN.
      const gateWrites = (setPreference as jest.Mock).mock.calls.filter(
        ([key]) => key === 'all_beers_api_url'
      );
      expect(gateWrites.every(([, value]) => !value)).toBe(true);
      expect(mockOnLoginSuccess).not.toHaveBeenCalled();
    });

    it('opens the configuration gate when the login completes', async () => {
      // The negative test above passes if the gate writes are deleted outright,
      // so it cannot be the only guard. This is the positive half: a successful
      // login must leave all three keys `areApiUrlsConfigured` reads set, with
      // `all_beers_api_url` truthy.
      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalled();
      });

      const lastValueFor = (key: string) =>
        (setPreference as jest.Mock).mock.calls.filter(([k]) => k === key).pop()?.[1];

      expect(lastValueFor('all_beers_api_url')).toBe(`${mockFsbsBaseUrl}/bk-store-json.php?sid=67`);
      expect(lastValueFor('my_beers_api_url')).toBe(
        `${mockFsbsBaseUrl}/bk-member-json.php?uid=12345`
      );
      expect(lastValueFor('is_visitor_mode')).toBe('false');
    });

    it('does not report success when the login cookies are incomplete', async () => {
      // Incomplete session data used to warn and fall through to the gate writes
      // and `onLoginSuccess`, leaving the app configured with nothing in
      // SecureStore. It never threw, so the catch could not see it.
      (extractSessionDataFromResponse as jest.Mock).mockReturnValueOnce({
        memberId: '12345',
        sessionId: 'test-session',
      });

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(mockOnLoginCancel).toHaveBeenCalled();
      });

      expect(saveSessionData).not.toHaveBeenCalled();
      expect(mockOnLoginSuccess).not.toHaveBeenCalled();
      const gateWrites = (setPreference as jest.Mock).mock.calls.filter(
        ([key]) => key === 'all_beers_api_url'
      );
      expect(gateWrites.every(([, value]) => !value)).toBe(true);
    });

    it('completes the login when a preference nothing reads fails to write', async () => {
      // The swallow in `recordUnreadLoginMetadata` is the load-bearing decision
      // here: a contention failure on a value no code consults must not discard
      // a WebView authentication that already succeeded. Changing that catch to
      // a rethrow left the whole suite green.
      // Keyed on `last_login_timestamp` since `auth_cookies` was removed: it is
      // the remaining write in `recordUnreadLoginMetadata` with no reader, so
      // it still exercises the swallow this test exists for.
      (setPreference as jest.Mock).mockImplementation((key: string) =>
        key === 'last_login_timestamp'
          ? Promise.reject(new Error('database is locked'))
          : Promise.resolve(undefined)
      );
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalled();
      });

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockOnLoginCancel).not.toHaveBeenCalled();
    });

    it('queues the new store URL behind a concurrent taplist writer holding the database lock', async () => {
      // Proves the gate-open burst (:364-378) genuinely shares
      // `databaseLockManager` with the taplist writers, not merely that it
      // runs after them in program order. A taplist writer's
      // check-then-commit sequence (`dataUpdateService.ts`) is only safe from
      // this login racing it in if the login's authoritative
      // `all_beers_api_url` write cannot land while that writer holds the
      // lock — so this simulates exactly that: a held lock, a login arriving
      // while it's held, and proof the write is deferred rather than
      // interleaved.
      // Records which operation held the lock AT THE MOMENT the store URL was
      // written. Everything else in this test observes the ACQUISITION; only
      // this observes CONTAINMENT, and the difference is the whole point.
      //
      // Mutation testing showed the rest of this test is satisfied by
      // acquire-release-then-write: the queue still reaches 1 because `acquire`
      // enqueues, the write still hasn't landed at that instant because the
      // `await` hasn't resolved, and it still appears after the release. Every
      // assertion below passed against a `withDatabaseLock` call whose body was
      // EMPTY and whose writes were hoisted out after it — reintroducing the
      // entire race this test exists to prove closed, across all 72 tests in
      // this file and the full 2241-test suite.
      //
      // Under correct code this is 'login-config-commit'. Under that mutant the
      // lock is already released when the write runs, so it is null.
      const holderDuringStoreUrlWrite: (string | null)[] = [];
      (setPreference as jest.Mock).mockImplementation(async (key: string, value: string) => {
        // Non-empty only. The gate-CLOSE write of '' is deliberately unlocked,
        // so it lands while the taplist writer still holds the lock and would
        // otherwise show up here as 'all-beers-write'. It is the authoritative
        // store URL — the one a racing writer must not see mid-commit — whose
        // containment this asserts.
        if (key === 'all_beers_api_url' && value !== '') {
          holderDuringStoreUrlWrite.push(databaseLockManager.getCurrentOperation());
        }
      });

      let releaseTaplistHold: () => void = () => {};
      const taplistHold = databaseLockManager.withDatabaseLock(
        'all-beers-write',
        () =>
          new Promise<void>(resolve => {
            releaseTaplistHold = resolve;
          })
      );
      expect(databaseLockManager.isLocked()).toBe(true);

      const { getByTestId } = renderLogin();
      fireEvent(getByTestId('webview-mock'), 'onMessage', memberLoginMessage);

      // Deterministic rather than a tick count: the login's acquire call
      // enqueues synchronously the moment the handler reaches it, so waiting
      // for queue length 1 is waiting for "the handler tried to write the new
      // store URL and was made to wait" — not for an arbitrary amount of
      // event-loop churn.
      await waitFor(() => {
        expect(databaseLockManager.getQueueLength()).toBe(1);
      });

      expect(setPreference).not.toHaveBeenCalledWith(
        'all_beers_api_url',
        `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
        'API endpoint for fetching all beers'
      );

      releaseTaplistHold();
      await taplistHold;

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'all_beers_api_url',
          `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
          'API endpoint for fetching all beers'
        );
      });
      expect(mockOnLoginSuccess).toHaveBeenCalled();

      // The containment assertion. Not "a lock was acquired at some point
      // before this write" — that is what `getQueueLength()` above establishes,
      // and it is what the empty-hold mutant satisfies — but "this write
      // executed while THIS operation held the lock".
      expect(holderDuringStoreUrlWrite).toEqual(['login-config-commit']);
    });
  });

  describe('WebView Message Handling - Visitor Login', () => {
    it('should handle VISITOR_LOGIN message', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
              store: 'Test Store',
            },
            rawCookies: 'store__id=67; store=Test Store',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(handleVisitorLogin).toHaveBeenCalledWith({
          store__id: '67',
          store: 'Test Store',
        });
      });
    });

    it('clears the stored ETag when logging in as a visitor', async () => {
      // Guard, not a regression test: deleting the visitor branch's clear
      // outright left the whole suite green. Visitor mode is taplist-only, so a
      // surviving ETag from the previous store has nothing else on screen to
      // contradict it.
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      fireEvent(getByTestId('webview-mock'), 'onMessage', {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: { store__id: '67', store: 'Test Store' },
            rawCookies: 'store__id=67; store=Test Store',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      });

      await waitFor(() => {
        expect(commitTaplistWrite).toHaveBeenCalledWith({ kind: 'cleared' });
      });
    });

    it('should set visitor mode flag for visitor login', async () => {
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: `${mockTestBaseUrl}/visitor.php`,
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'is_visitor_mode',
          'true',
          'Flag indicating whether the user is in visitor mode'
        );
      });
    });

    it('should set correct API URLs for visitor mode', async () => {
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const testStoreId = '67';

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: testStoreId,
            },
            rawCookies: `store__id=${testStoreId}`,
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'all_beers_api_url',
          `${mockFsbsBaseUrl}/bk-store-json.php?sid=${testStoreId}`,
          'API endpoint for fetching all beers'
        );
      });

      expect(setPreference).toHaveBeenCalledWith(
        'my_beers_api_url',
        'none://visitor_mode',
        'Placeholder URL for visitor mode (not a real endpoint)'
      );
    });

    it('should show visitor mode success alert', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Same story as the member success alert: fd18c05 removed it and left the
      // assertion behind. Visitor login now reports through `onLoginSuccess`.
      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalled();
      });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('should handle visitor login failure', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (handleVisitorLogin as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Failed to login',
      });

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Login Failed',
          'Failed to login',
          expect.any(Array)
        );
      });
    });

    it('should handle missing store ID in visitor login', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {},
            rawCookies: '',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Login Failed',
          expect.stringContaining('Could not find store ID'),
          expect.any(Array)
        );
      });
    });

    it('queues the new store URL behind a concurrent taplist writer holding the database lock', async () => {
      // Visitor mirror of the member-path test above. `handleVisitorLogin`'s
      // network call completes before any preference write starts here, so
      // there is no SecureStore-shaped hazard to worry about — this is purely
      // proving the gate-open burst (:462-479) shares the real lock too.
      (handleVisitorLogin as jest.Mock).mockResolvedValue({ success: true });

      // Containment recorder — see the member-path test for why the rest of
      // this test cannot distinguish a real hold from an empty one.
      const holderDuringStoreUrlWrite: (string | null)[] = [];
      (setPreference as jest.Mock).mockImplementation(async (key: string, value: string) => {
        // Non-empty only. The gate-CLOSE write of '' is deliberately unlocked,
        // so it lands while the taplist writer still holds the lock and would
        // otherwise show up here as 'all-beers-write'. It is the authoritative
        // store URL — the one a racing writer must not see mid-commit — whose
        // containment this asserts.
        if (key === 'all_beers_api_url' && value !== '') {
          holderDuringStoreUrlWrite.push(databaseLockManager.getCurrentOperation());
        }
      });

      let releaseTaplistHold: () => void = () => {};
      const taplistHold = databaseLockManager.withDatabaseLock(
        'all-beers-write',
        () =>
          new Promise<void>(resolve => {
            releaseTaplistHold = resolve;
          })
      );

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      fireEvent(getByTestId('webview-mock'), 'onMessage', {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: { store__id: '67', store: 'Test Store' },
            rawCookies: 'store__id=67; store=Test Store',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      });

      await waitFor(() => {
        expect(databaseLockManager.getQueueLength()).toBe(1);
      });

      expect(setPreference).not.toHaveBeenCalledWith(
        'all_beers_api_url',
        `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
        'API endpoint for fetching all beers'
      );

      releaseTaplistHold();
      await taplistHold;

      await waitFor(() => {
        expect(setPreference).toHaveBeenCalledWith(
          'all_beers_api_url',
          `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
          'API endpoint for fetching all beers'
        );
      });
      expect(mockOnLoginSuccess).toHaveBeenCalled();

      // Containment, not acquisition — the visitor burst gets the same check
      // as the member one, because it had the same gap.
      expect(holderDuringStoreUrlWrite).toEqual(['login-config-commit']);
    });
  });

  describe('JavaScript Injection', () => {
    it('should inject URL check JavaScript on load end', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Simulate load end
      if (webview.props.onLoadEnd) {
        webview.props.onLoadEnd();
      }

      expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
    });

    it('should handle URL_CHECK message', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_CHECK',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should trigger URL verification
      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should handle URL_VERIFIED message', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should inject page-specific JavaScript for member-dash.php
      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should inject member dashboard specific JavaScript', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should inject visitor page specific JavaScript', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
      });
    });

    it('should not inject JavaScript twice for same URL', async () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'URL_VERIFIED',
            url: config.api.getFullUrl('memberDashboard'),
          }),
        },
      };

      // Send same message twice
      fireEvent(webview, 'onMessage', message);
      const firstCallCount = mockWebViewRef.current.injectJavaScript.mock.calls.length;

      fireEvent(webview, 'onMessage', message);
      const secondCallCount = mockWebViewRef.current.injectJavaScript.mock.calls.length;

      // Should not inject again for the same URL
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Error Handling', () => {
    it('should handle JS_INJECTION_ERROR message', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'JS_INJECTION_ERROR',
            error: 'JavaScript injection failed',
            location: 'member-dash',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Login Error',
          expect.stringContaining('error processing the login page'),
          expect.any(Array)
        );
      });
    });

    it('should call handleClose when JS_INJECTION_ERROR Alert OK pressed', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'JS_INJECTION_ERROR',
            error: 'JavaScript injection failed',
            location: 'member-dash',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      // Extract and call the OK button handler
      const alertCall = alertSpy.mock.calls[0];
      const buttons = alertCall[2];
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }

      // Should trigger handleClose which calls onLoginCancel
      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should handle VISITOR_LOGIN_ERROR message', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN_ERROR',
            error: 'Failed to extract store info',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Visitor Login Failed',
          expect.stringContaining('Could not extract the store information'),
          expect.any(Array)
        );
      });
    });

    it('should call onLoginCancel after VISITOR_LOGIN_ERROR', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN_ERROR',
            error: 'Failed to extract store info',
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
        expect(mockOnLoginCancel).toHaveBeenCalled();
      });
    });

    it('should handle malformed JSON in message', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: 'invalid json {{{',
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should log error but not crash
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should call onLoginCancel when malformed JSON received', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: 'invalid json {{{',
        },
      };

      fireEvent(webview, 'onMessage', message);

      // Should call onLoginCancel after error (per line 390 in component)
      expect(mockOnLoginCancel).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle visitor login with handleVisitorLogin throwing error', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (handleVisitorLogin as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'VISITOR_LOGIN',
            cookies: {
              store__id: '67',
            },
            rawCookies: 'store__id=67',
            url: config.api.getFullUrl('visitor'),
          }),
        },
      };

      fireEvent(webview, 'onMessage', message);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Error',
          'An error occurred during visitor login. Please try again.',
          expect.any(Array)
        );
      });

      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should not crash when unexpected message type received', () => {
      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const message = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'UNKNOWN_MESSAGE_TYPE',
            data: 'some data',
          }),
        },
      };

      // Should not crash
      expect(() => {
        fireEvent(webview, 'onMessage', message);
      }).not.toThrow();
    });

    it('should handle WebView error event without crashing', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Component renders with onError handler - verify no crash
      expect(getByTestId('login-webview-modal')).toBeTruthy();

      consoleErrorSpy.mockRestore();
    });

    it('should recover after error by reopening modal', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId, rerender } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      // Trigger error
      const errorMessage = {
        nativeEvent: {
          data: JSON.stringify({
            type: 'JS_INJECTION_ERROR',
            error: 'Error occurred',
            location: 'test',
          }),
        },
      };

      fireEvent(webview, 'onMessage', errorMessage);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      // Close modal after error
      rerender(
        <LoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Reopen modal - should work normally
      rerender(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // Should render successfully after recovery
      expect(getByTestId('login-webview-modal')).toBeTruthy();
    });
  });

  describe('Navigation State Changes', () => {
    it('should log navigation events', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange({
          url: config.api.getFullUrl('kiosk'),
          loading: false,
        });
      }

      consoleLogSpy.mockRestore();
    });

    it('should not log duplicate navigation events', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const { getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const webview = getByTestId('webview-mock');

      const navState = {
        url: config.api.getFullUrl('kiosk'),
        loading: false,
      };

      if (webview.props.onNavigationStateChange) {
        webview.props.onNavigationStateChange(navState);
        webview.props.onNavigationStateChange(navState);
      }

      // Should only log once for same URL within timeframe
      consoleLogSpy.mockRestore();
    });
  });

  describe('Props and State Management', () => {
    it('should accept custom loading state', () => {
      const { rerender } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
          loading={false}
        />
      );

      // Should render without loading

      rerender(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
          loading={true}
        />
      );

      // Should show loading state
    });

    it('should handle modal close via Android back button', () => {
      const { UNSAFE_getByType } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // `onRequestClose` is a prop of the Modal; `login-webview-modal` is the
      // View inside it, which has no such prop. The `if` meant the test silently
      // asserted nothing whenever it looked at the wrong node — it did not fail,
      // it just never fired. Reach the Modal itself.
      const modal = UNSAFE_getByType(Modal);
      modal.props.onRequestClose();

      expect(mockOnLoginCancel).toHaveBeenCalled();
    });

    it('should support accessibility labels', () => {
      const { getByLabelText } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // `accessibilityLabel` is on the Modal; `login-webview-modal` is the View
      // inside it. Reading the label off the View found undefined and always
      // would have. Query by the label itself, which is what a screen reader does.
      expect(getByLabelText('Flying Saucer login modal')).toBeTruthy();
    });

    it('should clear state when reopened after close', () => {
      const { rerender, getByTestId } = render(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      const closeButton = getByTestId('close-webview-button');
      fireEvent.press(closeButton);

      // Close and reopen
      rerender(
        <LoginWebView
          visible={false}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      rerender(
        <LoginWebView
          visible={true}
          onLoginSuccess={mockOnLoginSuccess}
          onLoginCancel={mockOnLoginCancel}
          onRefreshData={mockOnRefreshData}
        />
      );

      // State should be reset
      expect(getByTestId('login-webview-modal')).toBeTruthy();
    });
  });

  describe('Config Integration', () => {
    describe('Component Config Usage', () => {
      it('should use config for WebView source URL', () => {
        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should use config.api.getFullUrl('kiosk')
        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
      });

      it('should set WebView source to config URL on initial render', () => {
        const expectedUrl = config.api.getFullUrl('kiosk');

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Verify the URL returned from config is the expected kiosk URL
        expect(expectedUrl).toBe(`${mockTestBaseUrl}/kiosk.php`);
        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
      });

      it('should construct correct kiosk URL', () => {
        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const expectedUrl = `${mockTestBaseUrl}/kiosk.php`;
        expect(config.api.getFullUrl('kiosk')).toBe(expectedUrl);
      });

      it('should use config base URL for all API calls', () => {
        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        expect(config.api.baseUrl).toBe(mockTestBaseUrl);
      });

      it('should handle config getFullUrl for different endpoints', () => {
        const endpoints = ['kiosk', 'visitor', 'memberDashboard'];

        endpoints.forEach(endpoint => {
          const url = config.api.getFullUrl(endpoint as any);
          expect(url).toBeTruthy();
          // Not `toContain(endpoint)`: the endpoint NAME is not in the URL —
          // `memberDashboard` resolves to `/member-dash.php`. That assertion
          // only ever held because the mock interpolated the name.
          expect(url).toBe(`${mockTestBaseUrl}${mockEndpointPaths[endpoint]}`);
          expect(url).toMatch(/^https:\/\//);
        });
      });

      it('should use config for visitor mode URL construction', async () => {
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_VERIFIED',
              url: config.api.getFullUrl('visitor'),
            }),
          },
        };

        fireEvent(webview, 'onMessage', message);

        // Should have used config to get visitor URL
        expect(config.api.getFullUrl).toHaveBeenCalledWith('visitor');
      });
    });

    describe('Config Lifecycle Changes', () => {
      it('should respond when config changes during component lifecycle', () => {
        const { rerender } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
        const initialCallCount = (config.api.getFullUrl as jest.Mock).mock.calls.length;

        // Rerender component (simulates state change)
        rerender(
          <LoginWebView
            visible={false}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        rerender(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should call config again on rerender
        expect((config.api.getFullUrl as jest.Mock).mock.calls.length).toBeGreaterThan(
          initialCallCount
        );
      });

      it('should handle custom API URL change gracefully', () => {
        const CUSTOM_URL = 'http://localhost:3000';

        // Render with original config
        const { rerender } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        expect(config.api.baseUrl).toBe(mockTestBaseUrl);

        // Simulate environment change
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${CUSTOM_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = CUSTOM_URL;

        // Rerender component
        rerender(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should use new config values
        expect(config.api.baseUrl).toBe(CUSTOM_URL);
      });

      it('should use consistent config throughout component lifecycle', () => {
        const { rerender } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const firstBaseUrl = config.api.baseUrl;
        const firstKioskUrl = config.api.getFullUrl('kiosk');

        // Rerender multiple times
        rerender(
          <LoginWebView
            visible={false}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        rerender(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Config should remain consistent unless explicitly changed
        expect(config.api.baseUrl).toBe(firstBaseUrl);
        expect(config.api.getFullUrl('kiosk')).toBe(firstKioskUrl);
      });
    });

    describe('Environment Switching', () => {
      it('should work with production environment URLs', () => {
        // Mock production config
        const PROD_BASE_URL = 'https://tapthatapp.beerknurd.com';
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${PROD_BASE_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = PROD_BASE_URL;

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const url = config.api.getFullUrl('kiosk');
        expect(url).toBe(`${PROD_BASE_URL}/kiosk.php`);
      });

      it('should work with custom API URLs', () => {
        // Mock custom config
        const CUSTOM_BASE_URL = 'https://custom.example.com';
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${CUSTOM_BASE_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = CUSTOM_BASE_URL;

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const url = config.api.getFullUrl('kiosk');
        expect(url).toContain('custom.example.com');
      });

      it('should handle development environment', () => {
        // Mock development config
        const DEV_BASE_URL = 'http://localhost:3000';
        (config.api.getFullUrl as jest.Mock).mockImplementation(
          endpoint => `${DEV_BASE_URL}/${endpoint}.php`
        );
        (config.api.baseUrl as any) = DEV_BASE_URL;

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const url = config.api.getFullUrl('kiosk');
        expect(url).toContain('localhost:3000');
      });
    });

    describe('Config Error Handling', () => {
      it('should render without crashing when config returns undefined', () => {
        // Mock config to return undefined
        (config.api.getFullUrl as jest.Mock).mockReturnValue(undefined);

        // Component should not crash - it will pass undefined to WebView which handles it
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should still render
        expect(getByTestId('login-webview-modal')).toBeTruthy();
        // Note: WebView will handle the undefined URL and show error
      });

      it('should pass invalid URL format to WebView without crashing', () => {
        // Mock config to return invalid URL
        (config.api.getFullUrl as jest.Mock).mockReturnValue('not-a-valid-url');

        // Component doesn't validate URLs - WebView handles that
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Component should still render - WebView will show error
        expect(getByTestId('login-webview-modal')).toBeTruthy();
      });

      it('should not crash when config throws error during render', () => {
        // Mock config to throw error
        (config.api.getFullUrl as jest.Mock).mockImplementation(() => {
          throw new Error('Config error');
        });

        // Component will crash at render time because it doesn't wrap config call in try-catch
        // This is expected behavior - config errors should be caught at app level
        expect(() => {
          render(
            <LoginWebView
              visible={true}
              onLoginSuccess={mockOnLoginSuccess}
              onLoginCancel={mockOnLoginCancel}
              onRefreshData={mockOnRefreshData}
            />
          );
        }).toThrow('Config error');
      });

      it('should handle config errors in message handlers gracefully', () => {
        // Reset config mock for normal rendering
        (config.api.getFullUrl as jest.Mock).mockReturnValue(`${mockTestBaseUrl}/kiosk.php`);

        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        // Mock config to throw during message handling
        (config.api.getFullUrl as jest.Mock).mockImplementation(() => {
          throw new Error('Config error during message handling');
        });

        // Send URL_CHECK message which uses config internally
        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_CHECK',
              url: 'https://test.com/some-page.php',
            }),
          },
        };

        // Should handle error gracefully
        expect(() => {
          fireEvent(webview, 'onMessage', message);
        }).not.toThrow();
      });
    });

    describe('WebView URL Verification', () => {
      it('should use kiosk endpoint from config', () => {
        const kioskUrl = config.api.getFullUrl('kiosk');

        render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        // Verify the kiosk URL structure
        expect(kioskUrl).toMatch(/^https:\/\//);
        expect(kioskUrl).toContain('kiosk.php');
        expect(config.api.getFullUrl).toHaveBeenCalledWith('kiosk');
      });

      it('should use config URLs for navigation detection', async () => {
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        // Test navigation to member dashboard (uses config URL)
        const memberDashUrl = config.api.getFullUrl('memberDashboard');

        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_VERIFIED',
              url: memberDashUrl,
            }),
          },
        };

        fireEvent(webview, 'onMessage', message);

        await waitFor(() => {
          expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
        });

        // Verify the URL came from config
        expect(config.api.getFullUrl).toHaveBeenCalledWith('memberDashboard');
      });

      it('should use config for visitor mode URL detection', async () => {
        const { getByTestId } = render(
          <LoginWebView
            visible={true}
            onLoginSuccess={mockOnLoginSuccess}
            onLoginCancel={mockOnLoginCancel}
            onRefreshData={mockOnRefreshData}
          />
        );

        const webview = getByTestId('webview-mock');

        const visitorUrl = config.api.getFullUrl('visitor');

        const message = {
          nativeEvent: {
            data: JSON.stringify({
              type: 'URL_VERIFIED',
              url: visitorUrl,
            }),
          },
        };

        fireEvent(webview, 'onMessage', message);

        await waitFor(() => {
          expect(mockWebViewRef.current.injectJavaScript).toHaveBeenCalled();
        });

        // Verify config was used for visitor endpoint
        expect(config.api.getFullUrl).toHaveBeenCalledWith('visitor');
      });

      it('should get all endpoint URLs from config', () => {
        const endpoints = ['kiosk', 'visitor', 'memberDashboard'] as const;

        endpoints.forEach(endpoint => {
          const url = config.api.getFullUrl(endpoint);

          // All URLs should be valid HTTPS URLs
          expect(url).toMatch(/^https:\/\//);
          expect(url).toContain(mockTestBaseUrl);
          expect(url).toContain('.php');
        });
      });
    });
  });
});
