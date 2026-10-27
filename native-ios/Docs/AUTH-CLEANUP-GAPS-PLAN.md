# Auth cleanup gaps plan

Branch: `fix/native-auth-cleanup-gaps`

## Why

The retired Expo client carried three unmerged auth-hardening commits (tip
`7b678118`, since discarded). A parity review against the native
client found most of that behaviour already present, with gaps that leave
credentials or browser cookies behind after a failure. This plan closes the
three credential gaps in the native client only; a fourth (login web view
cookies) was evaluated and dropped. The archived TypeScript is not ported.

## Invariants to keep

- Account-switch, logout, and asynchronous completion guards (`epoch`,
  `accountCleanupTask` chaining, `BeerError.changedAccount`) behave as today.
- `native_account_transition` non-nil means "do not restore saved credentials";
  `restoreCredentials()` already refuses and asks the user to sign in again.
  It is cleared only when saved credentials and account configuration are
  consistent again (a fully successful `completeLogin`) or the credentials have
  been cleared (a logout whose `credentials.clear()` succeeded).
  `setPreference(key, nil)` stores a NULL value; `preference(_:)` reads it as nil.
- Credential key formats, Keychain services, and the legacy schema-v8 fixtures
  are unchanged.
- tapthatapp stays the source of truth: every fix removes local state, none adds
  local-only state.

## Slice 1 — Credential clear is best-effort across Keychain read failures

**Gap.** `CredentialStore.clear()` (`Core/Credentials.swift:85`) enumerates each
Keychain service and throws on the first non-success status, before deleting
anything, including the keys it already knows by name. One transient
`errSecInteractionNotAllowed` leaves every saved generation in place.

**Change.**
- Add an injectable enumeration seam beside `updateItem`/`addItem`, used only by
  `clear()`'s `kSecMatchLimitAll` attribute query:
  `var enumerateItems: (CFDictionary, UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus = { SecItemCopyMatching($0,$1) }`.
- Add an injectable delete seam used by `delete(_:)`:
  `var deleteItem: (CFDictionary) -> OSStatus = { SecItemDelete($0) }` (needed by
  slices 2 and 3 to simulate a failed clear).
- In `clear()`, record an enumeration failure and continue with the next
  service instead of throwing.
- Also derive keys from the committed marker and generation registry
  (`_meta`, `_generations`) on a best-effort basis (read/decode failures are
  recorded, not thrown), adding each valid generation's chunk and `_session`
  keys. Validation matches `save()`'s pruning rule (count 1...1000, id regex).
- Attempt every delete, then throw the first recorded error if any.

**Tests (new, `Tests/CredentialFailureTests.swift`).**
- Saved credentials + enumeration fails for every service → `clear()` throws,
  and afterwards `load()` returns `(nil, [:])` and the generation's chunk and
  session keys read as nil.
- Saved credentials across two generations (second save whose pruning failed,
  so both are registered; the pruning-failure injection is disabled before
  `clear()`) + enumeration fails → both generations' keys removed.
- Regression (passes today): enumeration succeeds, one delete fails → remaining
  keys still deleted, error thrown.
- The seams are introduced first as a neutral refactor (defaults call the real
  Keychain); the enumeration tests are then behavioural RED.

## Slice 2 — Failed logout cleanup cannot be restored on next launch

**Gap.** `logout()` (`Core/AppModel.swift:781`) records a `credentials.clear()`
failure in the user-visible error but leaves the Keychain session in place. On
the next launch `restoreCredentials()` loads it and the "logged out" member is
signed in again. The same happens if the app is terminated between the start of
cleanup and the preference resets.

**Change.** In logout's cleanup task, before any destructive step:
1. Persist `native_account_transition = "pending"` as its own write, separate
   from the URL resets, so an unrelated preference failure cannot roll it back.
   If that write fails, record the failure and continue cleanup anyway.
2. Run `credentials.clear()` (now best-effort per slice 1).
   Each marker write is caught independently so it cannot stop the remaining
   cleanup.
3. Only if the clear succeeded, set `native_account_transition` back to nil (no
   credentials remain, so nothing needs blocking; this also retires a marker left
   by an earlier interrupted login). If the clear failed, the marker stays and
   `restoreCredentials()` refuses on next launch; the next successful
   `completeLogin` clears it as it already does.
4. The rest of cleanup (activities, browser cookies, URL resets) is unchanged.

Residual risk, documented not solved: if both the marker write and the Keychain
clear fail, leftover credentials are restorable. Both failures are reported.

`logout()` becomes `@discardableResult func logout() async -> LogoutOutcome`
where `LogoutOutcome` is `(credentialsCleared: Bool, current: Bool)`;
`current` is `token == epoch` at return (no newer login/logout took over).
Existing call sites ignore it.

**Tests (new `Tests/LogoutCleanupTests.swift`).** All use an isolated store
prefix. Failure cases use a `deleteItem` seam that rejects every delete, so a
complete, readable credential pair survives (not an orphan).
- RED: delete fails → fresh `AppModel` on the same database and store throws
  from `restoreCredentials()` and leaves `session == nil`; `logout()` reports
  `credentialsCleared == false`; `error` is non-nil.
- RED: the `deleteItem` hook reads `native_account_transition` from the
  database on its first call and records it; the recorded value is `"pending"`
  (protection is persisted before destructive cleanup, so termination mid-clear
  is safe).
- RED: the URL resets fail (the test installs
  `CREATE TRIGGER reject_url BEFORE INSERT ON preferences WHEN NEW.key = 'all_beers_api_url' BEGIN SELECT RAISE(ABORT,'injected'); END`
  through `db.execute`, plus the matching `BEFORE UPDATE` trigger because
  `setPreference` is an upsert) and deletes also fail → the marker is still `"pending"`
  and a fresh model refuses to restore. Today this fails because the marker does
  not exist.
- Regression: delete succeeds → marker nil, fresh model restores
  `session == nil`, outcome `credentialsCleared == true`.
- Regression: failed-cleanup logout followed by a successful `completeLogin` →
  marker nil, fresh model restores the new session.

## Slice 3 — Reset keeps the restore block and cannot wipe a newer account

**Gaps.**
- Settings → Reset (`UI/SettingsScreen.swift:111`) deletes every preference row
  after `logout()`, wiping the marker from slice 2, so leftover credentials are
  restored next launch.
- `logout()` releases local cleanup before awaiting remote logout
  (`Core/AppModel.swift:803`). A login during that wait is supported
  (`Tests/LogoutRaceTests.swift:101`), and Reset then deletes the new account's
  data.
- `localRetry()` clears `error` on a successful reload
  (`Core/AppModel.swift:220`), hiding a credential-cleanup failure.
- The logic is in a SwiftUI closure with no test coverage.

**Change.** Move the closure body into `AppModel.resetAppData() async`; the view
calls it.
1. `let outcome = await logout()`.
2. If `!outcome.current`, return silently without deleting anything or touching
   `error`: a newer account owns the database and its UI (matching the existing
   rule that stale logout completions publish nothing, `Core/AppModel.swift:811`).
3. Otherwise, synchronously on the main actor (no suspension between the check
   and the delete), in one transaction delete the same tables as today, with
   preferences deleted `WHERE key <> 'native_account_transition' OR value IS NULL`.
   The marker therefore survives exactly when slice 2 left it set.
4. `localRetry()`, then, if `!outcome.credentialsCleared`, re-set `error` to the
   credential-cleanup failure so it remains visible.
5. Database error handling as today. `beer_feedback` is still kept.

Implementation order for TDD: first extract `resetAppData()` with today's
behaviour unchanged (behaviour-preserving refactor, covered by a regression
test that reset empties the listed tables and keeps `beer_feedback`), then add
RED tests for the changes.

**Tests (new, same file as slice 2).**
- Regression (written first, passes before and after extraction): reset empties
  `allbeers`, `tasted_brew_current_round`, `rewards`, `operation_queue`,
  `recent_tastings`, `tasting_baseline`, `beer_choices`, and `preferences`
  (zero rows, so it holds after the fix too, because a successful logout leaves
  only a NULL marker row which reset deletes), and keeps `beer_feedback`.
- RED: delete fails → after reset, fresh model's `restoreCredentials()` throws
  and `session == nil`; `model.error` is non-nil after reset completes.
- RED: remote logout suspended (HTTP fixture holds `/logout.php`), a new member
  `completeLogin` succeeds meanwhile, then the logout is released → the new
  account's `allbeers` rows, credentials, and `all_beers_api_url` survive, and
  `model.error` is unchanged by the stale reset.

## Dropped — login web view cookie isolation

A fourth slice would have given the login `WKWebView` a non-persistent data
store so a failed or cancelled login leaves no tapthatapp cookies in the default
store. A live check on 2026-10-26 showed the leftover cookies do not sign anyone
in: with a valid session `kiosk.php` shows the Visitor/Member choice and Member
asks for the card number again. The persistent store only remembers the store
choice (`store__id`, `store_name`, `store__state`, `store_code`, `store`,
`storeFoodMenu`). Keeping that convenience would need async cookie seeding in
the login sheet, so the login path stays as it is.

## Order and verification

Slices run in order 1 → 3; 2 and 3 depend on the `deleteItem` seam from 1.
Each slice is RED → GREEN → refactor with the new tests named above.

Per slice:

```sh
BEERSELECTOR_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 17 Pro Max' \
  sh native-ios/Scripts/run-tests.sh -only-testing:BeerSelectorNativeTests/<Suite>
```

Before review: the full All plan via `native-ios/Scripts/run-tests.sh`.

## Out of scope

- Porting the archived TypeScript commits.
- Remote logout semantics, Live Activity cleanup, and visitor-mode cookie
  handling, which the parity review found already covered.
- Any change to the login web view or its cookie handling (see "Dropped").
