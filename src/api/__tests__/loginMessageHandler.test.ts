import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { Alert } from 'react-native';
import { handleLoginMessage, type LoginMessageDeps } from '../loginMessageHandler';
import { setPreference } from '@/src/database/preferences';
import { commitTaplistWrite } from '@/src/services/taplistEtag';
import { saveSessionData, extractSessionDataFromResponse } from '@/src/api/sessionManager';
import { handleVisitorLogin } from '@/src/api/authService';
// Deliberately NOT mocked. The behaviour under test — that the gate-open
// write genuinely queues behind a concurrent lock holder rather than merely
// running after it in program order — only exists in the real FIFO queue.
// A passthrough mock that always resolves as a plain function call cannot
// tell "wrapped in a lock" from "not wrapped at all" apart — the exact gap
// the lock-contention tests below exist to close.
import { databaseLockManager } from '@/src/database/DatabaseLockManager';

const mockTestBaseUrl = 'https://test.beerknurd.com';
const mockFsbsBaseUrl = 'https://fsbs.beerknurd.com';

const defaultSessionData = {
  memberId: '12345',
  sessionId: 'test-session',
  storeId: '67',
  storeName: 'Test Store',
};

vi.mock('@/src/database/preferences', () => ({
  setPreference: vi.fn().mockResolvedValue(undefined),
  getPreference: vi.fn().mockResolvedValue(null),
}));

// Mock the taplist ETag owner. Login invalidates the stored ETag not because
// the rows and the ETag disagree — they still match each other — but because
// login repoints `all_beers_api_url` at a different store, leaving the ETag
// naming a store the app no longer fetches from.
vi.mock('@/src/services/taplistEtag', () => ({
  commitTaplistWrite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/src/api/sessionManager', () => ({
  saveSessionData: vi.fn().mockResolvedValue(undefined),
  extractSessionDataFromResponse: vi.fn().mockReturnValue({
    memberId: '12345',
    sessionId: 'test-session',
    storeId: '67',
    storeName: 'Test Store',
  }),
}));

vi.mock('@/src/api/authService', () => ({
  handleVisitorLogin: vi.fn().mockResolvedValue({ success: true }),
}));

function createDeps(overrides: Partial<LoginMessageDeps> = {}): LoginMessageDeps {
  return {
    onLoginSuccess: vi.fn(),
    onLoginCancel: vi.fn(),
    clearProcessedUrls: vi.fn(),
    injectUrlVerification: vi.fn(),
    injectPageSpecificJavaScript: vi.fn(),
    onInjectionError: vi.fn(),
    ...overrides,
  };
}

/**
 * Poll an assertion until it stops throwing, without a real timer.
 *
 * `handleLoginMessage` is called without being awaited in the lock-contention
 * tests below, so the assertion has to wait for microtask continuations to
 * run rather than for a fixed number of ticks. There is no real setTimeout to
 * wait on here — every mocked dependency resolves on the microtask queue, and
 * `setup.ts` arms fake timers for the whole file — so flushing the microtask
 * queue with a bare `await Promise.resolve()` is what actually advances the
 * handler, not a real clock.
 */
async function waitFor(assertion: () => void): Promise<void> {
  for (let tick = 0; tick < 50; tick += 1) {
    try {
      assertion();
      return;
    } catch {
      await Promise.resolve();
    }
  }
  assertion();
}

/**
 * Drain the microtask queue without asserting anything.
 *
 * Used where a test needs to prove a NEGATIVE — "this has not happened yet" —
 * which `waitFor` cannot do: `waitFor` returns the instant its assertion
 * stops throwing, so checking "not called" immediately after firing the
 * handler is true trivially, before the handler has had any chance to run,
 * whether or not the code under test is actually blocked. Flushing first
 * gives an unblocked (buggy) handler every opportunity to race ahead and
 * complete; a correctly-blocked handler is unaffected, since it is genuinely
 * waiting on a promise this helper cannot resolve.
 */
async function flushMicrotasks(ticks = 30): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) {
    await Promise.resolve();
  }
}

describe('handleLoginMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` resets calls but NOT implementations, so a test that
    // points a mock at a throwing/custom stub leaks it into every test that
    // follows. Restoring the defaults here is what makes this suite order
    // -independent.
    (setPreference as Mock).mockResolvedValue(undefined);
    (commitTaplistWrite as Mock).mockResolvedValue(undefined);
    (saveSessionData as Mock).mockResolvedValue(undefined);
    (extractSessionDataFromResponse as Mock).mockReturnValue(defaultSessionData);
    (handleVisitorLogin as Mock).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    // Guards every test in the file, not just the ones below that take the
    // lock deliberately: a test that fails mid-hold would otherwise leave the
    // singleton locked for every test that runs after it in this file.
    databaseLockManager.resetForTesting();
  });

  describe('Member Login', () => {
    it('should handle URLs message with valid data', async () => {
      const deps = createDeps();
      const testUserUrl = `${mockFsbsBaseUrl}/bk-member-json.php?uid=12345`;
      const testStoreUrl = `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`;

      await handleLoginMessage(
        JSON.stringify({
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
        deps
      );

      expect(setPreference).toHaveBeenCalledWith(
        'is_visitor_mode',
        'false',
        'Flag indicating whether the user is in visitor mode'
      );
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
      // Not `onRefreshData`: this handler never calls it. `useLoginFlow`'s
      // `handleLoginSuccess` does, in response to `onLoginSuccess` below. The
      // assertion was testing the parent through the child.
      expect(deps.onLoginSuccess).toHaveBeenCalled();
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
      const deps = createDeps();

      // Deliberately unmistakable values. The assertion below is a substring
      // search over every preference value written, which is only safe from
      // false positives if the fixture's values cannot plausibly occur inside
      // a legitimate one — a bare `'12345'` could turn up inside a store URL
      // and fail this test for a change that leaked nothing. `PHPSESSID` is
      // the real name of the cookie this whole removal is about.
      const testCookies = {
        member_id: 'sentinel-member-id-not-for-storage',
        PHPSESSID: 'sentinel-php-session-token-not-for-storage',
      };

      await handleLoginMessage(
        JSON.stringify({
          type: 'URLs',
          userJsonUrl: `${mockTestBaseUrl}/user.php`,
          storeJsonUrl: `${mockTestBaseUrl}/store.php`,
          cookies: testCookies,
        }),
        deps
      );

      expect(saveSessionData).toHaveBeenCalled();

      const writes = (setPreference as Mock).mock.calls;

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
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'URLs',
          userJsonUrl: `${mockTestBaseUrl}/user.php`,
          storeJsonUrl: `${mockTestBaseUrl}/store.php`,
          cookies: {},
        }),
        deps
      );

      expect(setPreference).toHaveBeenCalledWith(
        'last_login_timestamp',
        expect.any(String),
        'Last successful login timestamp'
      );
    });

    it('should show success alert for member login', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'URLs',
          userJsonUrl: `${mockTestBaseUrl}/user.php`,
          storeJsonUrl: `${mockTestBaseUrl}/store.php`,
          cookies: {},
        }),
        deps
      );

      // fd18c05 removed the success alerts from this handler — in the same
      // commit that wrote these assertions. They have been red ever since,
      // and the quarantine hid it. A successful login now reports through
      // `onLoginSuccess` and stays silent; only failures alert.
      expect(deps.onLoginSuccess).toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should not process login if URLs are missing', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'URLs',
          userJsonUrl: null,
          storeJsonUrl: null,
          cookies: {},
        }),
        deps
      );

      // Should not save preferences if URLs are missing
      expect(setPreference).not.toHaveBeenCalledWith(
        'my_beers_api_url',
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Member Login - taplist ETag invalidation', () => {
    const memberLoginRaw = JSON.stringify({
      type: 'URLs',
      userJsonUrl: `${mockFsbsBaseUrl}/bk-member-json.php?uid=12345`,
      storeJsonUrl: `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
      cookies: {
        member: '12345',
        session: 'test-session',
        store__id: '67',
        store: 'Test Store',
      },
    });

    it('does not report login success until the taplist ETag clear has been persisted', async () => {
      // `onLoginSuccess` runs `handleLoginSuccess`, which calls `onRefreshData`.
      // Reporting success before the clear lands lets that refresh read the
      // PREVIOUS store's ETag. The proxy keys its ETag to the store's own cached
      // payload, so a cross-store validator misses and costs a wasted full 200
      // rather than wrong rows — this orders the clear ahead of the refresh it
      // triggers, which is the guarantee available here.
      let releaseEtagClear: () => void = () => {};
      (commitTaplistWrite as Mock).mockReturnValueOnce(
        new Promise<void>(resolve => {
          releaseEtagClear = () => resolve();
        })
      );

      const deps = createDeps();
      const loginPromise = handleLoginMessage(memberLoginRaw, deps);

      // `commitTaplistWrite` is the very first `await` in the handler's
      // member-login branch, so by the time the promise above has been
      // constructed the mock has already been invoked with its argument —
      // no polling needed to observe that.
      expect(commitTaplistWrite).toHaveBeenCalledWith({ kind: 'cleared' });

      // Flushed before checking "not called": an implementation that forgot
      // to `await` the clear would otherwise race straight past every
      // remaining step (all mocked to resolve instantly) and call
      // `onLoginSuccess` well before this assertion ever ran, and a
      // synchronous check right after firing the handler would be unable to
      // tell that apart from a genuinely blocked one.
      await flushMicrotasks();
      expect(deps.onLoginSuccess).not.toHaveBeenCalled();

      releaseEtagClear();
      await loginPromise;

      expect(deps.onLoginSuccess).toHaveBeenCalled();
    });

    it('cancels the login when the taplist ETag clear fails', async () => {
      // Unawaited, this rejection is an unhandled promise: logged in dev,
      // dropped in production, with the previous store's ETag left live and
      // nobody told. Awaited, it reaches the handler's catch.
      (commitTaplistWrite as Mock).mockRejectedValueOnce(new Error('database is locked'));

      const deps = createDeps();
      await handleLoginMessage(memberLoginRaw, deps);

      expect(deps.onLoginCancel).toHaveBeenCalled();
      expect(deps.onLoginSuccess).not.toHaveBeenCalled();
    });

    it('tells the user when a member login fails', async () => {
      // The visitor branch alerts on failure and a user-initiated close alerts.
      // The member branch was the one path that said nothing at all — the
      // handler just returned quietly and the user was left on Settings with
      // no idea a database error had occurred, and no idea the login had not
      // happened.
      (commitTaplistWrite as Mock).mockRejectedValueOnce(new Error('database is locked'));

      const deps = createDeps();
      await handleLoginMessage(memberLoginRaw, deps);

      // Asserting only that SOME alert fired let a mutant through: routing the
      // catch to the close path tells the user they cancelled the login, which
      // is false and drops the retry hint, and the suite stayed green.
      expect(Alert.alert).toHaveBeenCalledWith(
        'Login Failed',
        expect.stringContaining('Could not finish signing you in'),
        expect.any(Array)
      );
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(deps.onLoginCancel).toHaveBeenCalled();
      expect(deps.onLoginSuccess).not.toHaveBeenCalled();
    });

    it('does not mark the app configured when the session cannot be saved', async () => {
      // `areApiUrlsConfigured` reads is_visitor_mode, all_beers_api_url and
      // my_beers_api_url, and app/_layout.tsx routes on it. Writing those before
      // the session is persisted lets a failed login boot the app straight into
      // member mode with nothing in SecureStore — configured, unauthenticated,
      // and unable to explain itself. The gate must be the last thing to flip.
      (saveSessionData as Mock).mockRejectedValueOnce(new Error('SecureStore unavailable'));

      const deps = createDeps();
      await handleLoginMessage(memberLoginRaw, deps);

      expect(deps.onLoginCancel).toHaveBeenCalled();

      // The gate is `all_beers_api_url` being truthy — both branches of
      // `areApiUrlsConfigured` require it. Asserting the key was never written
      // would be wrong now that the login clears it first; what must not happen
      // is the gate being left OPEN.
      const gateWrites = (setPreference as Mock).mock.calls.filter(
        ([key]) => key === 'all_beers_api_url'
      );
      expect(gateWrites.every(([, value]) => !value)).toBe(true);
      expect(deps.onLoginSuccess).not.toHaveBeenCalled();
    });

    it('opens the configuration gate when the login completes', async () => {
      // The negative test above passes if the gate writes are deleted outright,
      // so it cannot be the only guard. This is the positive half: a successful
      // login must leave all three keys `areApiUrlsConfigured` reads set, with
      // `all_beers_api_url` truthy.
      const deps = createDeps();
      await handleLoginMessage(memberLoginRaw, deps);

      expect(deps.onLoginSuccess).toHaveBeenCalled();

      const lastValueFor = (key: string) =>
        (setPreference as Mock).mock.calls.filter(([k]) => k === key).pop()?.[1];

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
      (extractSessionDataFromResponse as Mock).mockReturnValueOnce({
        memberId: '12345',
        sessionId: 'test-session',
      });

      const deps = createDeps();
      await handleLoginMessage(memberLoginRaw, deps);

      expect(deps.onLoginCancel).toHaveBeenCalled();
      expect(saveSessionData).not.toHaveBeenCalled();
      expect(deps.onLoginSuccess).not.toHaveBeenCalled();
      const gateWrites = (setPreference as Mock).mock.calls.filter(
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
      (setPreference as Mock).mockImplementation((key: string) =>
        key === 'last_login_timestamp'
          ? Promise.reject(new Error('database is locked'))
          : Promise.resolve(undefined)
      );

      const deps = createDeps();
      await handleLoginMessage(memberLoginRaw, deps);

      expect(deps.onLoginSuccess).toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(deps.onLoginCancel).not.toHaveBeenCalled();
    });

    it('queues the new store URL behind a concurrent taplist writer holding the database lock', async () => {
      // Proves the gate-open burst genuinely shares `databaseLockManager` with
      // the taplist writers, not merely that it runs after them in program
      // order. A taplist writer's check-then-commit sequence
      // (`dataUpdateService.ts`) is only safe from this login racing it in if
      // the login's authoritative `all_beers_api_url` write cannot land while
      // that writer holds the lock — so this simulates exactly that: a held
      // lock, a login arriving while it's held, and proof the write is
      // deferred rather than interleaved.
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
      // entire race this test exists to prove closed.
      //
      // Under correct code this is 'login-config-commit'. Under that mutant the
      // lock is already released when the write runs, so it is null.
      const holderDuringStoreUrlWrite: (string | null)[] = [];
      (setPreference as Mock).mockImplementation(async (key: string, value: string) => {
        // Non-empty only, isolating the authoritative store URL — the write a
        // racing taplist writer must not see mid-commit.
        if (key === 'all_beers_api_url' && value !== '') {
          holderDuringStoreUrlWrite.push(databaseLockManager.getCurrentOperation());
        }
      });

      let releaseTaplistHold: () => void = () => {};
      // `withDatabaseLock` wraps `acquire()` in an async function, which adds
      // an extra microtask hop before its task callback actually runs. Without
      // this signal, the login's own acquire call can reach the queue (and
      // this test's `waitFor` below can observe queue length 1) BEFORE
      // `releaseTaplistHold` has been reassigned from its no-op default —
      // so `releaseTaplistHold()` later would silently release nothing and
      // the test would hang forever. Waiting on this makes the hold genuinely
      // established before the login is allowed to race it.
      let holdTaskStarted: () => void = () => {};
      const holdTaskStartedPromise = new Promise<void>(resolve => {
        holdTaskStarted = resolve;
      });
      const taplistHold = databaseLockManager.withDatabaseLock('all-beers-write', () => {
        holdTaskStarted();
        return new Promise<void>(resolve => {
          releaseTaplistHold = resolve;
        });
      });
      await holdTaskStartedPromise;
      expect(databaseLockManager.isLocked()).toBe(true);

      const deps = createDeps();
      const loginPromise = handleLoginMessage(memberLoginRaw, deps);

      // Deterministic rather than a tick count: the login's acquire call
      // enqueues synchronously the moment the handler reaches it, so waiting
      // for queue length 1 is waiting for "the handler tried to write the new
      // store URL and was made to wait" — not for an arbitrary amount of
      // microtask churn.
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
      await loginPromise;

      expect(setPreference).toHaveBeenCalledWith(
        'all_beers_api_url',
        `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
        'API endpoint for fetching all beers'
      );
      expect(deps.onLoginSuccess).toHaveBeenCalled();

      // The containment assertion. Not "a lock was acquired at some point
      // before this write" — that is what `getQueueLength()` above establishes,
      // and it is what the empty-hold mutant satisfies — but "this write
      // executed while THIS operation held the lock".
      expect(holderDuringStoreUrlWrite).toEqual(['login-config-commit']);
    });

    it('does not clear the store URL while a taplist writer holds the lock', async () => {
      // `taplistConfigurationHeld`'s docstring justified leaving the
      // gate-CLOSE write of '' outside the lock: "racing to '' unlocked only
      // ever causes a safe, cheap abandon, never a bad commit."
      //
      // That holds only if the '' lands BEFORE the writer's guard read. It can
      // equally land AFTER the guard read and BEFORE the commit, which is the
      // window the lock exists to close: the writer reads store A, the guard
      // passes, this '' lands, and the writer then commits A's rows, A's ETag
      // and a fresh timestamp under a configuration that no longer says A.
      //
      // This test stages exactly that — a writer holding the lock while a login
      // arrives — and asserts the clear cannot interleave with it.
      const holderDuringClear: (string | null)[] = [];
      (setPreference as Mock).mockImplementation(async (key: string, value: string) => {
        if (key === 'all_beers_api_url' && value === '') {
          holderDuringClear.push(databaseLockManager.getCurrentOperation());
        }
      });

      let releaseTaplistHold: () => void = () => {};
      // See the containment test above for why this signal is needed: without
      // it, the login's acquire call can reach the queue before
      // `releaseTaplistHold` has been reassigned from its no-op default.
      let holdTaskStarted: () => void = () => {};
      const holdTaskStartedPromise = new Promise<void>(resolve => {
        holdTaskStarted = resolve;
      });
      const taplistHold = databaseLockManager.withDatabaseLock('all-beers-write', () => {
        holdTaskStarted();
        return new Promise<void>(resolve => {
          releaseTaplistHold = resolve;
        });
      });
      await holdTaskStartedPromise;

      const deps = createDeps();
      const loginPromise = handleLoginMessage(memberLoginRaw, deps);

      await waitFor(() => {
        expect(databaseLockManager.getQueueLength()).toBe(1);
      });

      // The clear must not have happened yet — it is queued behind the writer.
      expect(holderDuringClear).toEqual([]);

      releaseTaplistHold();
      await taplistHold;
      await loginPromise;

      expect(deps.onLoginSuccess).toHaveBeenCalled();

      // And when it does happen, it happens under the lock — never interleaved
      // into someone else's hold.
      expect(holderDuringClear).toEqual(['login-config-commit']);
    });
  });

  describe('Visitor Login', () => {
    it('should handle VISITOR_LOGIN message', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {
            store__id: '67',
            store: 'Test Store',
          },
          rawCookies: 'store__id=67; store=Test Store',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(handleVisitorLogin).toHaveBeenCalledWith({
        store__id: '67',
        store: 'Test Store',
      });
    });

    it('clears the stored ETag when logging in as a visitor', async () => {
      // Guard, not a regression test: deleting the visitor branch's clear
      // outright left the whole suite green. Visitor mode is taplist-only, so a
      // surviving ETag from the previous store has nothing else on screen to
      // contradict it.
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: { store__id: '67', store: 'Test Store' },
          rawCookies: 'store__id=67; store=Test Store',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(commitTaplistWrite).toHaveBeenCalledWith({ kind: 'cleared' });
    });

    it('should set visitor mode flag for visitor login', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {
            store__id: '67',
          },
          rawCookies: 'store__id=67',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(setPreference).toHaveBeenCalledWith(
        'is_visitor_mode',
        'true',
        'Flag indicating whether the user is in visitor mode'
      );
    });

    it('should set correct API URLs for visitor mode', async () => {
      const deps = createDeps();
      const testStoreId = '67';

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {
            store__id: testStoreId,
          },
          rawCookies: `store__id=${testStoreId}`,
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(setPreference).toHaveBeenCalledWith(
        'all_beers_api_url',
        `${mockFsbsBaseUrl}/bk-store-json.php?sid=${testStoreId}`,
        'API endpoint for fetching all beers'
      );
      expect(setPreference).toHaveBeenCalledWith(
        'my_beers_api_url',
        'none://visitor_mode',
        'Placeholder URL for visitor mode (not a real endpoint)'
      );
    });

    it('should show visitor mode success alert', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {
            store__id: '67',
          },
          rawCookies: 'store__id=67',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      // Same story as the member success alert: fd18c05 removed it and left
      // the assertion behind. Visitor login now reports through
      // `onLoginSuccess`.
      expect(deps.onLoginSuccess).toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should handle visitor login failure', async () => {
      (handleVisitorLogin as Mock).mockResolvedValue({
        success: false,
        error: 'Failed to login',
      });

      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {
            store__id: '67',
          },
          rawCookies: 'store__id=67',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalledWith(
        'Visitor Login Failed',
        'Failed to login',
        expect.any(Array)
      );
    });

    it('should handle missing store ID in visitor login', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {},
          rawCookies: '',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalledWith(
        'Visitor Login Failed',
        expect.stringContaining('Could not find store ID'),
        expect.any(Array)
      );
    });

    it('queues the new store URL behind a concurrent taplist writer holding the database lock', async () => {
      // Visitor mirror of the member-path test above. `handleVisitorLogin`'s
      // network call completes before any preference write starts here, so
      // there is no SecureStore-shaped hazard to worry about — this is purely
      // proving the visitor gate-open burst shares the real lock too.
      // Containment recorder — see the member-path test for why the rest of
      // this test cannot distinguish a real hold from an empty one.
      const holderDuringStoreUrlWrite: (string | null)[] = [];
      (setPreference as Mock).mockImplementation(async (key: string, value: string) => {
        if (key === 'all_beers_api_url' && value !== '') {
          holderDuringStoreUrlWrite.push(databaseLockManager.getCurrentOperation());
        }
      });

      let releaseTaplistHold: () => void = () => {};
      // See the member-path containment test for why this signal is needed:
      // without it, the login's acquire call can reach the queue before
      // `releaseTaplistHold` has been reassigned from its no-op default.
      let holdTaskStarted: () => void = () => {};
      const holdTaskStartedPromise = new Promise<void>(resolve => {
        holdTaskStarted = resolve;
      });
      const taplistHold = databaseLockManager.withDatabaseLock('all-beers-write', () => {
        holdTaskStarted();
        return new Promise<void>(resolve => {
          releaseTaplistHold = resolve;
        });
      });
      await holdTaskStartedPromise;

      const deps = createDeps();
      const loginPromise = handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: { store__id: '67', store: 'Test Store' },
          rawCookies: 'store__id=67; store=Test Store',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

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
      await loginPromise;

      expect(setPreference).toHaveBeenCalledWith(
        'all_beers_api_url',
        `${mockFsbsBaseUrl}/bk-store-json.php?sid=67`,
        'API endpoint for fetching all beers'
      );
      expect(deps.onLoginSuccess).toHaveBeenCalled();

      // Containment, not acquisition — the visitor burst gets the same check
      // as the member one, because it had the same gap.
      expect(holderDuringStoreUrlWrite).toEqual(['login-config-commit']);
    });

    it('does not clear the store URL while a taplist writer holds the lock (visitor)', async () => {
      // Visitor path. The member-path test above covers the reasoning in
      // full — this stages the identical race on the other branch.
      const holderDuringClear: (string | null)[] = [];
      (setPreference as Mock).mockImplementation(async (key: string, value: string) => {
        if (key === 'all_beers_api_url' && value === '') {
          holderDuringClear.push(databaseLockManager.getCurrentOperation());
        }
      });

      let releaseTaplistHold: () => void = () => {};
      // See the member-path containment test for why this signal is needed:
      // without it, the login's acquire call can reach the queue before
      // `releaseTaplistHold` has been reassigned from its no-op default.
      let holdTaskStarted: () => void = () => {};
      const holdTaskStartedPromise = new Promise<void>(resolve => {
        holdTaskStarted = resolve;
      });
      const taplistHold = databaseLockManager.withDatabaseLock('all-beers-write', () => {
        holdTaskStarted();
        return new Promise<void>(resolve => {
          releaseTaplistHold = resolve;
        });
      });
      await holdTaskStartedPromise;

      const deps = createDeps();
      const loginPromise = handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: { store__id: '67', store: 'Test Store' },
          rawCookies: 'store__id=67; store=Test Store',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      await waitFor(() => {
        expect(databaseLockManager.getQueueLength()).toBe(1);
      });

      // The clear must not have happened yet — it is queued behind the writer.
      expect(holderDuringClear).toEqual([]);

      releaseTaplistHold();
      await taplistHold;
      await loginPromise;

      expect(deps.onLoginSuccess).toHaveBeenCalled();

      // And when it does happen, it happens under the lock — never interleaved
      // into someone else's hold.
      expect(holderDuringClear).toEqual(['login-config-commit']);
    });
  });

  describe('Error Handling', () => {
    it('should handle JS_INJECTION_ERROR message', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'JS_INJECTION_ERROR',
          error: 'JavaScript injection failed',
          location: 'member-dash',
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalledWith(
        'Login Error',
        expect.stringContaining('error processing the login page'),
        expect.any(Array)
      );
    });

    it('should call handleClose when JS_INJECTION_ERROR Alert OK pressed', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'JS_INJECTION_ERROR',
          error: 'JavaScript injection failed',
          location: 'member-dash',
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalled();

      // Extract and call the OK button handler
      const alertCall = (Alert.alert as Mock).mock.calls[0];
      const buttons = alertCall[2];
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }

      // The OK button's `onPress` IS `deps.onInjectionError` — that is the
      // seam the component wires to its own cancel-and-close path. Asserting
      // `onLoginCancel` here would be testing the component through this
      // handler; `onInjectionError` is what this level owns.
      expect(deps.onInjectionError).toHaveBeenCalled();
    });

    it('should handle VISITOR_LOGIN_ERROR message', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN_ERROR',
          error: 'Failed to extract store info',
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalledWith(
        'Visitor Login Failed',
        expect.stringContaining('Could not extract the store information'),
        expect.any(Array)
      );
    });

    it('should call onLoginCancel after VISITOR_LOGIN_ERROR', async () => {
      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN_ERROR',
          error: 'Failed to extract store info',
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalled();
      expect(deps.onLoginCancel).toHaveBeenCalled();
    });

    it('should handle malformed JSON in message', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const deps = createDeps();

      await handleLoginMessage('invalid json {{{', deps);

      // Should log error but not crash
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should call onLoginCancel when malformed JSON received', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const deps = createDeps();

      await handleLoginMessage('invalid json {{{', deps);

      // Should call onLoginCancel after error
      expect(deps.onLoginCancel).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle visitor login with handleVisitorLogin throwing error', async () => {
      (handleVisitorLogin as Mock).mockRejectedValue(new Error('Network error'));

      const deps = createDeps();

      await handleLoginMessage(
        JSON.stringify({
          type: 'VISITOR_LOGIN',
          cookies: {
            store__id: '67',
          },
          rawCookies: 'store__id=67',
          url: `${mockTestBaseUrl}/visitor.php`,
        }),
        deps
      );

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'An error occurred during visitor login. Please try again.',
        expect.any(Array)
      );
      expect(deps.onLoginCancel).toHaveBeenCalled();
    });

    it('should not crash when unexpected message type received', () => {
      const deps = createDeps();

      // Should not crash
      expect(() => {
        handleLoginMessage(
          JSON.stringify({
            type: 'UNKNOWN_MESSAGE_TYPE',
            data: 'some data',
          }),
          deps
        );
      }).not.toThrow();
    });
  });
});
