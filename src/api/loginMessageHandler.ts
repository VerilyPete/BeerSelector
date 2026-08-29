import { Alert } from 'react-native';
import { setPreference } from '@/src/database/preferences';
import { commitTaplistWrite } from '@/src/services/taplistEtag';
import { databaseLockManager } from '@/src/database/DatabaseLockManager';
import { handleVisitorLogin } from '@/src/api/authService';
import {
  captureStoredAuthCredentials,
  clearAuthCookies,
  clearSessionData,
  restoreStoredAuthCredentials,
  saveAuthCookies,
  saveSessionData,
  extractSessionDataFromResponse,
  type StoredAuthCredentials,
} from '@/src/api/sessionManager';
import { isSessionData } from '@/src/types/api';
import { createErrorResponse, getUserFriendlyErrorMessage } from '@/src/utils/notificationUtils';
import { clearNativeCookies } from '@/src/api/nativeCookieManager';

/**
 * The login WebView's message handling, lifted out of the component.
 *
 * This is the whole of what a `postMessage` from the Flying Saucer login page
 * does: the member and visitor configuration commits, their lock ordering, the
 * session write, and every failure path. None of it needs a renderer — it was
 * only ever reachable through one because it lived inside a `useCallback`.
 *
 * What the component still owns is expressed as the six seams in
 * `LoginMessageDeps`: two WebView ref calls, the processed-URL set, the modal's
 * close, and the two login outcomes. Everything else is plain async work over
 * modules that already run under vitest, which is the point of the extraction:
 * the cookie and lock-ordering invariants below are the ones worth having fast
 * tests for, and they were previously reachable only through a rendered modal.
 */
export type LoginMessageDeps = {
  /** Login completed and the configuration gate is open. */
  readonly onLoginSuccess: () => void;
  /** Login did not complete; the caller should close and reset. */
  readonly onLoginCancel: () => void;
  /** Clear the component's processed-URL set so a retry can re-inject. */
  readonly clearProcessedUrls: () => void;
  /** Ask the WebView to confirm it is still on `url` before injecting. */
  readonly injectUrlVerification: (url: string) => void;
  /** Inject the member-dashboard or visitor script for a verified `url`. */
  readonly injectPageSpecificJavaScript: (url: string) => void;
  /** Injection failed; run the component's cancel-and-close path. */
  readonly onInjectionError: () => void;
};

/**
 * Write the login preferences that nothing reads.
 *
 * `user_json_url`, `store_json_url` and `last_login_timestamp` are each written
 * at exactly one site — this one — and, in the tree as it stands, read nowhere
 * in production. No `getPreference` call site references any of them, and
 * `getAllPreferences` — the OTHER way to read a preference, and the one an
 * argument from `getPreference` call sites alone would miss — does load them,
 * but its only caller (`hooks/useSettingsState.ts:86`) has that value dropped
 * by `app/settings.tsx:30`, and DeveloperSection's preference dump names five
 * other keys. So there is currently no way to see them in the app at all.
 *
 * Scoped to the current tree deliberately. The same reasoning about
 * `auth_cookies` was written as a claim about all history, and was false —
 * `migrateToV8`'s docstring has the details. Re-verify rather than inherit.
 *
 * They are kept because they cost nothing and describe the login, but a
 * contention failure on a value nothing consults must not abort a login whose
 * WebView authentication has already succeeded — the caller's catch would
 * discard the whole thing and send the user back through the auth flow.
 *
 * Note this is deliberately NOT justified by `autoLogin`: `autoLogin` does not
 * read the stored session, it POSTs `/auto-login.php` and calls
 * `saveSessionData` itself. The real dependents of that write are the
 * `getSessionData` readers — check-in, rewards, session validation.
 */
async function recordUnreadLoginMetadata({
  userJsonUrl,
  storeJsonUrl,
}: {
  userJsonUrl: string;
  storeJsonUrl: string;
}): Promise<void> {
  try {
    await setPreference('user_json_url', userJsonUrl, 'API endpoint for user data');
    await setPreference('store_json_url', storeJsonUrl, 'API endpoint for store data');
    await setPreference(
      'last_login_timestamp',
      new Date().toISOString(),
      'Last successful login timestamp'
    );
    // Authentication cookies are deliberately absent here. They are committed
    // to SecureStore alongside the validated session in the caller below;
    // ordinary SQLite preferences must never receive credential material.
  } catch (error) {
    console.warn('Login metadata write failed; login continues because nothing reads it:', error);
  }
}

export async function handleLoginMessage(raw: string, deps: LoginMessageDeps): Promise<void> {
  try {
    const data = JSON.parse(raw);

    if (data.type === 'JS_INJECTION_ERROR') {
      console.error('JavaScript injection failed:', data.error, 'at', data.location);
      Alert.alert(
        'Login Error',
        'There was an error processing the login page. Please try again.',
        [{ text: 'OK', onPress: deps.onInjectionError }]
      );
      return;
    }

    if (data.type === 'URL_CHECK') {
      // The verification script itself stays in the component: it is a
      // WebView concern, and its only observable effect is the ref call.
      deps.injectUrlVerification(data.url);
      return;
    }

    if (data.type === 'URL_VERIFIED') {
      deps.injectPageSpecificJavaScript(data.url);
      return;
    }

    if (data.type === 'URLs') {
      const { userJsonUrl, storeJsonUrl, cookies } = data;

      console.log('Received member login data from WebView');
      console.log('Cookies received:', Object.keys(cookies || {}).join(', '));

      if (userJsonUrl && storeJsonUrl) {
        let previousCredentials: StoredAuthCredentials | null = null;
        let credentialsCommitted = false;
        try {
          // The ETag is scoped to a store; the preference key is not. The
          // rows and the stored ETag still correspond to each other — what
          // changes at login is `all_beers_api_url`, so the ETag now names a
          // store the app is no longer pointed at. Cleared FIRST, before the
          // URL that orphans it, so that a throw or app death anywhere below
          // costs one extra full fetch rather than leaving the new store's
          // URL paired with the old store's validator.
          await commitTaplistWrite({ kind: 'cleared' });

          // Close the configuration gate before touching anything else.
          //
          // `areApiUrlsConfigured` has two branches and BOTH require
          // `all_beers_api_url`, so clearing it is the one write that shuts
          // the gate no matter what state the device was in. Ordering alone
          // cannot do this: on a fresh install `null` and `'false'` are
          // equivalent for `is_visitor_mode`, so the gate opens as soon as
          // the URLs land; and for a visitor upgrading to member the visitor
          // branch keeps it open for the whole login. Writing
          // `all_beers_api_url` last then reopens it exactly once, at the end.
          //
          // The trade is deliberate: a login that fails partway now costs the
          // user their previous configuration and returns them to Settings.
          // That is worse than leaving a working config alone, and better
          // than the alternative it replaces — silently configured in the
          // wrong mode, or pointed at a mix of two stores, while being told
          // the login failed.
          // Under the SAME lock as the gate-open burst below. The docstring on
          // `taplistConfigurationHeld` used to argue this write was exempt —
          // "racing to '' unlocked only ever causes a safe, cheap abandon, never
          // a bad commit" — which is true only if the '' lands BEFORE a writer's
          // guard read. Landing after the guard and before the commit leaves the
          // old store's rows, its ETag and a fresh timestamp committed under a
          // configuration that no longer names it. Taking the lock removes the
          // interleaving entirely: this now lands either before the guard (read
          // as "changed", safe abandon) or after the commit completes.
          await databaseLockManager.withDatabaseLock('login-config-commit', async () => {
            await setPreference('all_beers_api_url', '', 'API endpoint for fetching all beers');
          });

          // Three keys, and nothing reads any of them; the argument for that
          // is in `recordUnreadLoginMetadata`'s docstring, which is where it
          // belongs. It said "these four" until now — `auth_cookies` was
          // removed from the list at the top of this file and left in the
          // count 300 lines down. A contention failure on a value nothing
          // consults must not abort a login whose WebView authentication
          // already succeeded.
          await recordUnreadLoginMetadata({ userJsonUrl, storeJsonUrl });

          const sessionData = extractSessionDataFromResponse(new Headers(), cookies);
          console.log('Extracted session data:', sessionData);

          if (!isSessionData(sessionData)) {
            // This used to warn four times and carry on to open the gate and
            // report success — configured, nothing in SecureStore, and the
            // user told they were signed in. It does not throw on its own, so
            // the catch below could never see it. A missing `member_id` or
            // `store_name` cookie is all it takes.
            console.warn('Got:', {
              hasMemberId: !!(sessionData && sessionData.memberId),
              hasSessionId: !!(sessionData && sessionData.sessionId),
              hasStoreId: !!(sessionData && sessionData.storeId),
              hasStoreName: !!(sessionData && sessionData.storeName),
            });
            throw new Error(
              'Incomplete session data from member login cookies — required: memberId, sessionId, storeId, storeName'
            );
          }

          previousCredentials = await captureStoredAuthCredentials();
          await saveAuthCookies(JSON.stringify(cookies));
          credentialsCommitted = true;
          await saveSessionData(sessionData);
          console.log('Member credentials saved to SecureStore successfully');

          // Reopen the gate only now, with `all_beers_api_url` last — it is
          // the key both branches of `areApiUrlsConfigured` require, so it is
          // the single point at which this login becomes visible to
          // app/_layout.tsx's routing.
          //
          // Under the SAME lock the taplist writers hold
          // (`dataUpdateService.ts`'s `taplistConfigurationHeld`/
          // `writeAllBeers`/`writeAllBeersOnLogin`), and only this burst —
          // not the gate-close above, not `recordUnreadLoginMetadata`, not
          // `saveSessionData`. That guard re-reads `all_beers_api_url` while
          // holding the lock and compares it to the URL its rows were
          // fetched against; the comparison only means anything if the
          // write that could invalidate it cannot land mid-hold. Before
          // this, it could: `setPreference` takes no lock of its own (~8
          // sites in `dataUpdateService` already call it from inside a held
          // lock, so it deliberately never will), so a taplist writer's
          // check could pass and this write could still land before that
          // writer's commit — same store URL at check time, different rows
          // in the table by the time the write actually happens.
          //
          // Scoped to just this burst on purpose. `LOCK_TIMEOUT_MS` is 15s
          // and a forced release does not hand the lock to the next
          // waiter — it blocks every database consumer until the
          // abandoned holder itself returns. `saveSessionData` is
          // uncontrolled Keychain I/O with no such bound, so it and
          // everything before it stay outside any hold.
          //
          // EVERY writer of `all_beers_api_url` needs this lock, including
          // writes of `''`. This comment used to say the opposite — that
          // only a NEW, non-empty store URL needed it, because the guard
          // treats `''` as "changed" and abandons — and that reasoning was
          // refuted: it covers a `''` landing BEFORE a writer's guard read,
          // and says nothing about one landing after the guard and before
          // the commit, which leaves the old store's rows committed under a
          // configuration that no longer names them.
          //
          // The gate-close writes above and in `DeveloperSection` now take
          // this same lock for that reason. See `taplistConfigurationHeld`
          // in `dataUpdateService.ts` for the full argument. Line numbers
          // are deliberately not cited here: the two that were have both
          // gone stale on this branch already.
          //
          // WHAT THIS COSTS, recorded because taking the lock here created
          // a way for the login itself to fail that did not exist before.
          // `acquire` rejects with `DatabaseContentionError` after 30s, and
          // `_forceRelease` grants the lock to nobody — not the queue, not a
          // new arrival — until an abandoned holder returns, which it may
          // never do. A login landing in that window rejects here, into the
          // catch below: the user is alerted "Could not finish signing you
          // in" and `onLoginCancel()` runs.
          //
          // The sharp edge is that the gate-close `''` write above has
          // ALREADY committed by then, so the user's previous
          // `all_beers_api_url` is gone and they are routed to Settings with
          // no configuration — having done nothing wrong. The visitor branch
          // below is identical in both respects.
          //
          // Accepted rather than fixed: a restart clears it, the window
          // requires an abandoned 15s hold to coincide with a login, and the
          // alternative — writing the new configuration before closing the
          // gate — reopens the cross-store commit this lock exists to
          // prevent. Plan 01 Phase 6 removes the hold timeout that creates
          // the abandoned state at all, which is the real fix.
          await databaseLockManager.withDatabaseLock('login-config-commit', async () => {
            await setPreference(
              'is_visitor_mode',
              'false',
              'Flag indicating whether the user is in visitor mode'
            );
            await setPreference(
              'my_beers_api_url',
              userJsonUrl,
              'API endpoint for fetching Beerfinder beers'
            );
            await setPreference(
              'all_beers_api_url',
              storeJsonUrl,
              'API endpoint for fetching all beers'
            );
          });

          deps.clearProcessedUrls();

          deps.onLoginSuccess();
        } catch (error) {
          try {
            // The message is sent only after the WebView has authenticated.
            // If any later commit fails, revoke that native/WebKit session as
            // well as rolling back the SecureStore pair below.
            await clearNativeCookies();
          } catch (nativeCookieError) {
            console.error(
              'Failed to clear native cookies after member login failure:',
              nativeCookieError
            );
          }
          if (credentialsCommitted && previousCredentials) {
            try {
              await restoreStoredAuthCredentials(previousCredentials);
            } catch (rollbackError) {
              // The restore attempts both halves before rejecting. Keep the
              // original login error user-facing and record the rollback
              // failure separately for diagnosis.
              console.error(
                'Failed to restore credentials after member login failure:',
                rollbackError
              );
            }
          } else if (credentialsCommitted) {
            // Defensive fallback: a committed cookie generation must never be
            // retained if its matching pre-login state could not be captured.
            await Promise.allSettled([clearAuthCookies(), clearSessionData()]);
          }
          // The member branch used to be the only path here that said
          // nothing: the modal closed and the user was returned to Settings
          // with no indication that anything had failed. The visitor branch
          // below has alerted on its own failures all along.
          console.error('Error completing member login:', error);
          // Classified rather than hardcoded: contention really is transient
          // and retrying works, but a SecureStore failure is durable and
          // telling that user "usually temporary" sends them retrying against
          // a wall. `createErrorResponse` already types both.
          Alert.alert(
            'Login Failed',
            `Could not finish signing you in. ${getUserFriendlyErrorMessage(
              createErrorResponse(error)
            )}`,
            [{ text: 'OK' }]
          );
          deps.onLoginCancel();
        }
      } else {
        // No `else` here left the modal open and inert: the injected regex
        // posts `type: 'URLs'` with nulls whenever the member-dash HTML
        // changes shape, and `injectPageSpecificJavaScript` has already added
        // the URL to `processedUrlsRef`, so it will not retry. The user was
        // left staring at a dashboard with no way forward but the close
        // button, and nothing was logged for them or for us.
        console.error('Member login message missing URLs:', {
          hasUserJsonUrl: !!userJsonUrl,
          hasStoreJsonUrl: !!storeJsonUrl,
        });
        Alert.alert(
          'Login Failed',
          'Could not read your account details from the Flying Saucer page. Please try again.',
          [{ text: 'OK' }]
        );
        deps.onLoginCancel();
      }
    } else if (data.type === 'VISITOR_LOGIN_ERROR') {
      console.error('Error extracting visitor login data in WebView:', data.error);
      Alert.alert(
        'Visitor Login Failed',
        'Could not extract the store information needed for visitor mode. Please try again.',
        [{ text: 'OK' }]
      );
      deps.onLoginCancel();
    } else if (data.type === 'VISITOR_LOGIN') {
      const { cookies, rawCookies, url } = data;
      console.log('Received visitor login data', cookies);
      console.log('Raw cookies from WebView:', rawCookies);
      console.log('URL at login time:', url);

      const storeId = cookies.store__id || cookies.store;
      if (!storeId) {
        console.error(
          'No store ID found in visitor cookies. Cookies received:',
          JSON.stringify(cookies)
        );
        Alert.alert(
          'Visitor Login Failed',
          'Could not find store ID in cookies. Please try again or contact support.',
          [{ text: 'OK' }]
        );
        deps.onLoginCancel();
        return;
      }

      try {
        const loginResult = await handleVisitorLogin(cookies);
        console.log('Visitor login result:', loginResult);

        if (loginResult.success) {
          // Same shape as the member branch above, and for the same reasons.
          // Clearing `all_beers_api_url` closes the gate whichever branch
          // `areApiUrlsConfigured` takes; the ETag is invalidated before the
          // URL that orphans it; and the same key, written last, is the
          // single point where this login becomes visible to routing.
          // Under the SAME lock as the gate-open burst below. The docstring on
          // `taplistConfigurationHeld` used to argue this write was exempt —
          // "racing to '' unlocked only ever causes a safe, cheap abandon, never
          // a bad commit" — which is true only if the '' lands BEFORE a writer's
          // guard read. Landing after the guard and before the commit leaves the
          // old store's rows, its ETag and a fresh timestamp committed under a
          // configuration that no longer names it. Taking the lock removes the
          // interleaving entirely: this now lands either before the guard (read
          // as "changed", safe abandon) or after the commit completes.
          await databaseLockManager.withDatabaseLock('login-config-commit', async () => {
            await setPreference('all_beers_api_url', '', 'API endpoint for fetching all beers');
          });
          await commitTaplistWrite({ kind: 'cleared' });

          // Same lock, same reasoning, as the member branch's gate-open
          // burst above — see the comment there. No SecureStore step on
          // this path (`handleVisitorLogin` already completed above,
          // before the gate-close write), so there is nothing slow to keep
          // out of the hold; the scoping still matches for consistency
          // with the member branch and so a future addition here doesn't
          // have to rediscover why it's scoped this way.
          await databaseLockManager.withDatabaseLock('login-config-commit', async () => {
            await setPreference(
              'is_visitor_mode',
              'true',
              'Flag indicating whether the user is in visitor mode'
            );
            await setPreference(
              'my_beers_api_url',
              'none://visitor_mode',
              'Placeholder URL for visitor mode (not a real endpoint)'
            );

            const storeJsonUrl = `https://fsbs.beerknurd.com/bk-store-json.php?sid=${storeId}`;
            console.log('Setting all_beers_api_url to:', storeJsonUrl);
            await setPreference(
              'all_beers_api_url',
              storeJsonUrl,
              'API endpoint for fetching all beers'
            );
          });

          deps.clearProcessedUrls();

          deps.onLoginSuccess();
        } else {
          Alert.alert(
            'Visitor Login Failed',
            loginResult.error || 'Could not log in as visitor. Please try again.',
            [{ text: 'OK' }]
          );
          deps.onLoginCancel();
        }
      } catch (error) {
        console.error('Error during visitor login:', error);
        Alert.alert('Error', 'An error occurred during visitor login. Please try again.', [
          { text: 'OK' },
        ]);
        deps.onLoginCancel();
      }
    }
  } catch (error) {
    console.error('Error handling WebView message:', error);
    deps.onLoginCancel();
  }
}
