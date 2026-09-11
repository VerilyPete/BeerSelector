# Migration checkpoint — 2026-09-11

## CURRENT HANDOFF — legacy schema-v8 compatibility verified with fixtures

Added LegacyV8Fixture using the exact six CREATE TABLE statements from React Native `src/database/schema.ts` / `schemaVersion.ts` at 363ac3ef, plus both operation-queue indexes and synthetic data. Raw SQLite builds the database before native BeerDatabase opens it. Tests cover a fresh v8 history and a migrated 3–8 history, all legacy beer/enrichment/review/tasting fields, redeemed/unredeemed rewards, preference values/descriptions, and all queued-operation states/payloads/retry metadata.

Three LegacyUpgradeTests pass: complete v8 preservation over repeated native opens; native replacement/enqueue writes against old tables; and a forced failure at the native-version preference write that rolls back schema additions plus row changes and succeeds after removing the fault. Legacy schema history and indexes remain intact. Interrupted retrying operations become pending as intentionally implemented; successful operations remain stored but are excluded from pending-operation reads.

Full suite **74/74 passed**, including all three compatibility tests, log `/private/tmp/BeerSelectorNative-legacy-all.log`. The first focused run had a test-only ORDER BY projection mistake, corrected before the full pass; no production migration bug was found and no production code changed. This verifies exact-schema synthetic fixtures, not an actual installation of the previous binary followed by a signed native update. Existing separate Expo Keychain service compatibility tests remain green.

Changes are uncommitted after `363ac3ef`. No build-number bump, archive, upload or external tester changes; build 61 remains installed and distribution remains paused. Next: commit these compatibility tests/docs. Remaining release evidence includes a real old-binary-to-native upgrade with an appropriate fixture account, physical Live Activity behavior, actual crash-report delivery, and the unresolved original phone exit. Do not repeat synthetic schema-v8 coverage as an outstanding gap.

## Previous checkpoint — post-login cleanup guarded; distribution paused

User requested keeping account-safety fixes committed and continuing development without another distribution. Build 61 remains the confirmed installed internal TestFlight build; no build-number bump or upload in this session.

Added three PostLoginCleanupTests: member completion after logout, visitor completion after logout, and a new member login while visitor-cookie cleanup is suspended. All three failed before the fix: old completions could close Settings after logout, and the new member could commit while old visitor cleanup was still active. AppModel now shares accountCleanupTask across both login and logout; new login waits before committing, old login checks its committed epoch after cleanup and after subsequent refresh/queue awaits, and an obsolete completion cannot clear newer cleanup ownership or perform further UI work. Activity cleanup has a per-model injection boundary for deterministic async tests, alongside the existing browser-cookie boundary.

Full suite **71/71 passed**, log `/private/tmp/BeerSelectorNative-postlogin-all.log`; red evidence `/private/tmp/BeerSelectorNative-postlogin-red.log`. HTTP is fixture-only, databases and Keychain namespaces are isolated, and no actual device/Live Activity timing guarantee is claimed. Integration and All include PostLoginCleanupTests. User authorization covers committing this follow-up after `76fc9626`. No live account mutation, phone installation or external tester change.

Next development area: full legacy React Native schema-v8 upgrade fixtures and compatibility checks. Build 62 remains available for a later explicitly requested internal release. The original phone exit and actual TestFlight crash-report delivery remain unresolved/unverified; do not characterize these account fixes as its cause or resolution.

## Previous checkpoint — overlapping logout/login cleanup fixed

User confirmed internal build 61 installed and login/logout/refresh work on the phone, then authorized overlapping logout/login testing. Added LogoutRaceTests with controlled asynchronous local-cookie cleanup, per-session HTTP fixtures, real unique Keychain namespaces and isolated SQLite. The initial tests reproduced old local cleanup blanking the new account's URLs and reopening Settings, plus a delayed server logout failure leaking into the new session's error UI.

AppModel now owns a shared local logout-cleanup task. Concurrent logout cleanups serialize; completeLogin waits for local cleanup before committing and rechecks its account epoch after waiting. The old remote logout request is independent and still uses captured old credentials; its completion cannot publish errors or navigation changes after the account epoch changes. A test-only injectable cleanup closure suspends the same production cleanup call boundary; no OS WebKit timing guarantees are claimed.

Validation: full suite **67/67 passed** with the first two race tests (`/private/tmp/BeerSelectorNative-logout-all.log`); then a third test verified that another logout invalidates a login waiting on cleanup. All **3/3 LogoutRaceTests passed** (`/private/tmp/BeerSelectorNative-logout-final.log`), with no further production changes after the full pass. There are now 68 tests in the correctness plan, but no full 68-test rerun was needed. Initial red evidence: `/private/tmp/BeerSelectorNative-logout-red.log` (also contained an unwaited test expectation, corrected before green). Integration and All include the class.

User authorized committing the logout/login race fixes after `16d168b6`. Next account-safety step: test successful-login and visitor cleanup that resumes after a newer account change. No new archive/upload or external tester changes; installed internal build remains 61. Next distribution number is 62. Remaining areas include successful-login/visitor post-commit asynchronous cleanup timing, full legacy schema upgrade, and real crash delivery; do not claim every account interleaving or the original phone exit is resolved.

## Previous checkpoint — internal build 61 uploaded

## Build 61 uploaded — 2026-09-11

User authorized completing the rollback task and proceeding to the next step while away. Committed the rollback guard as **35dab101**, then archived and uploaded **1.1.0 (61)** to internal-only TestFlight. Includes the credential-save fix from **f777ad21**. Full correctness suite **65/65 passed**; signed Release archive succeeded. Effective export flags verified: testFlightInternalTestingOnly=true, uploadSymbols=true, manageAppVersionAndBuildNumber=false. Xcode reported **Upload succeeded / EXPORT SUCCEEDED**; Apple processing has begun. Processing completion/internal-group assignment are not independently verified. No external testers, builds, groups or review submissions changed.

Archive retained at `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-61.xcarchive`, with source zip and `build61-evidence.json` alongside it, all ignored. App dSYM UUID **94D26D69-AE2A-33BF-9917-8C3CACC048E0**; widget **6C1D82BA-00D0-3D2B-8DFB-711F88B2A046**. Both archive bundle versions verified as 61 with matching binary/symbol UUIDs. Logs: `/private/tmp/BeerSelectorNative-internal61-archive.log` and `/private/tmp/BeerSelectorNative-internal61-upload.log`. Preserve separate symbols for builds 38 and 60.

Next user check: install build 61 through TestFlight when ready, then normal login/logout, Refresh All Data and reopening cached lists. The user already confirmed these basic flows on build 60. No manual storage failure is needed; automated tests cover those cases. Updated local WhatToTest.en-US.txt notes were prepared after archiving and have not been applied to App Store Connect group metadata. Further development priorities remain overlapping logout/login cleanup and full legacy schema upgrade coverage. The earlier phone exit is still not attributed to these fixes. Next distribution number must be at least 62.

## Previous checkpoint — database/credential rollback safety verified

Added three LoginRollbackTests for database failure after credential commit: existing-account rollback, first-login rollback, and a second Keychain failure while restoring the old credentials. Tests use a real SQLite trigger that aborts reward deletion after earlier cache deletes, proving partial transaction rollback. HTTP remains fixture-only, Keychain namespaces are unique, and the second failure is injected at the rollback commit marker.

The combined-failure regression initially exposed mixed account state: the running app retained the old account, while a fresh model loaded the new credentials with old tastings/rewards. Fixed with a durable `native_account_transition` preference written transactionally with the disabled data URL before credential changes. It is cleared in the successful account database transaction, or restored to its previous value only after rollback succeeds. A rollback failure clears active member state and requires sign-in again; persisted cache and operations remain intact. Startup now calls restoreCredentials(), which rejects a pending transition before exposing member data. A failed recovery retry preserves that marker; a later full successful login clears it with the replacement cache/configuration.

Full isolated-simulator correctness suite **65/65 passed**. Logs: `/private/tmp/BeerSelectorNative-rollback-red.log` (combined failure regression), `/private/tmp/BeerSelectorNative-rollback-green.log` (nine rollback/credential cases), `/private/tmp/BeerSelectorNative-rollback-all.log` (full suite including failed retry and successful recovery). Fresh-model/fresh-database checks exercise startup credential restoration; this is not a literal device process-kill test or a guarantee against hardware/power-loss durability failures.

User authorized finishing this work and proceeding to the next step while away. Committing this fix after `f777ad21` and reserving internal build **61** for upload, including the earlier credential-save fix. Build 60 remains the last confirmed phone installation. No live account calls or external tester changes. Broader overlapping logout/login cleanup races, full legacy upgrade testing and actual TestFlight crash delivery remain separate verification items.

## Previous checkpoint — credential-save failure tests and rollback fix

User confirmed build 60's logout/login/refresh work on the phone, then authorized credential-save failure testing. Added CredentialFailureTests with six tests (nine failure scenarios): existing-account registry, second cookie chunk, session and commit-marker failures; first-login failures at all four stages; and auto-login marker failure. CredentialStore exposes instance-local SecItemUpdate/SecItemAdd call boundaries for deterministic `errSecInteractionNotAllowed` injection; unblocked operations, reads, cleanup and recovery use real uniquely namespaced simulator Keychain entries. SQLite and HTTP fixtures are isolated; no live account calls.

Four new tests failed against the old login path. Persistent registry/session/marker write failure also broke the attempted credential rollback, leaving the previous account's all_beers_api_url blank. A partial chunk failure unnecessarily rewrote the previous committed generation. Login now tracks whether the credential save actually committed: a pre-commit failure retains the existing generation and restores the configuration without another Keychain write. Epoch invalidation follows successful credential commit, preserving in-flight work for an account that never changed. Successful credential commit followed by database failure still uses the existing credential rollback path; failures in that separate rollback and broader crash-between-stores atomicity remain unverified.

Full correctness suite **62/62 passed**, including 6/6 CredentialFailureTests and all prior account-race tests. Logs: `/private/tmp/BeerSelectorNative-credentials-red.log` (four failing tests) and `/private/tmp/BeerSelectorNative-credentials-all.log` (full green). Integration includes the new class; All discovers it. Tests verify persisted credentials through a fresh store value, unchanged commit marker/configuration/cache/pending operations, no follow-up HTTP on failure, and successful credential-save recovery without resetting storage.

User authorized committing this credential-save fix and its tests after `81ea29a5`. Next account-safety coverage: database failure after successful credential commit, including failure while restoring the previous credentials. No new archive/upload; installed TestFlight build remains 60. Before another distribution archive, reserve **61** using Scripts/bump-build-number.py. External testers remain unchanged. The earlier phone exit is not claimed fixed by this rollback change.

## Previous checkpoint — build 60 uploaded to internal TestFlight

## Build 60 uploaded — 2026-09-11

Committed account-safety fix as `3eb06ad0` and uploaded **1.1.0 (60)** successfully. Xcode reported **Upload succeeded / EXPORT SUCCEEDED** and Apple package processing began. Effective export settings verified: `testFlightInternalTestingOnly=true`, `uploadSymbols=true`, `manageAppVersionAndBuildNumber=false`. App and widget archive versions are both 1.1.0 (60), with matching executable/dSYM UUIDs. No external groups/builds/testers or beta review submissions were changed. Processing completion and internal-group assignment are not independently verified; use the existing internal group if manual assignment is needed.

Full pre-upload correctness suite: **56/56 passed**, including seven account-safety cases. Signed Release archive passed. Retained archive: `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-60.xcarchive`; source snapshot and `build60-evidence.json` alongside it are ignored. App dSYM UUID `CC76A5E4-9C6A-3E67-A4B7-4B8968030B4F`; widget UUID `6C1D82BA-00D0-3D2B-8DFB-711F88B2A046`. Logs: `/private/tmp/BeerSelectorNative-internal60-archive.log` and `/private/tmp/BeerSelectorNative-internal60-upload.log`. Preserve build 38's separate symbols for its reports.

Next: install build 60 through TestFlight after processing and verify logout/login/refresh on the phone. The earlier freeze/Home Screen exit remains unexplained; this build fixes a separately reproduced account-switch refresh bug. External testing stays unchanged. Build 60 has now been used; reserve the next build using Scripts/bump-build-number.py before a subsequent distribution archive.

## Previous checkpoint — account-safety regressions and refresh fix

Added **7 AccountSafetyTests** with per-session HTTP fixtures, isolated real SQLite, unique real simulator Keychain namespaces, and connectivity monitoring disabled. Tests exercise real completeLogin/logout transitions: late login and auto-login after logout cannot restore credentials; taplist/queue responses after logout cannot restore member state; in-flight check-in success/failure after a switch cannot mutate the new account's queue or replay the remaining old-account operation. An ambiguous submitted operation stays available for review without automatic resubmission under the new account.

Found and reproduced a refresh ownership bug: new login joined the previous account's in-flight refresh, which then rejected its old result and left the new lists empty. Red test failed with empty taplist/tastings and a withheld-response expectation. Fixed by associating the shared refresh task with its account epoch, capturing ownership before scheduling, protecting task/refresh-indicator cleanup, and stopping stale refreshes before starting member-data requests. Logout resets its refresh indicator. A new account can now finish refreshing before the old account's response is released. This is separate from the earlier unexplained phone exit; do not claim a crash fix.

Full isolated-simulator correctness suite **56/56 passed**, including all 7 new cases. Log `/private/tmp/BeerSelectorNative-account-all.log`; initial red evidence `/private/tmp/BeerSelectorNative-account-red.log`, first six green cases `/private/tmp/BeerSelectorNative-account-green.log`. Integration plan includes AccountSafetyTests; All includes them automatically. No live HTTP requests, account mutations, phone installs or uploads. Source remains **1.1.0 (60)**; changes in this account-safety session are uncommitted, following `a7238d01`. Next: review/commit this fix, then consider an internal-only build 60 for phone testing. Keychain write-failure injection, full legacy schema-v8 upgrade, further overlapping login/logout cleanup races, physical MetricKit and actual TestFlight crash delivery remain separate work.

## Previous checkpoint — TestFlight diagnostics verified; next build corrected to 60

User confirmed **1.1.0 (38) installed through TestFlight** and successfully shared its diagnostic JSON. Report reviewed from `/Users/pete/Downloads/BeerSelector-diagnostics.json`: 128 entries from one session, September 11 09:26:43–09:28:50 CDT; all 49 completed operations succeeded; two refreshes took 2.034 s and 1.173 s; no main-thread delay events; all retained starts have completions. One completion's start had rotated out of the bounded history. This verifies on-device export/sharing, not crash delivery or resolution of the earlier exit.

User clarified the previous 1.1.0 build was **59**. The legacy React Native Xcode project has an Increment Build Number phase that mutates its Info.plist on Release builds; the native project did not inherit it. Native `project.yml` and generated project now use **60** for app/widget. Native numbering is explicit: increment the shared value before each subsequent distribution archive and regenerate with XcodeGen. Export-time renumbering is disabled and the internal upload script rejects archives below 60. No build 60 archive/upload or external distribution change was performed. Build 38's retained archive, source snapshot and symbols remain associated with 38.

Numbering validation: Xcode resolves 1.1.0 (60) for both app and widget; upload preflight rejects 38/59 and accepts 60/61; temporary bump-script fixtures verify the minimum, normal increment, and source rollback on generator failure. Prior app validation remains 49/49 plus 5/5 journal refinement tests; no app logic changed during numbering maintenance.

User authorized committing the accumulated sorting, diagnostics, internal distribution and numbering work. Continue normal internal testing; export promptly if a failure recurs. Actual TestFlight crash delivery and physical MetricKit delivery remain unverified.

## Previous checkpoint — internal-only TestFlight build uploaded

User authorized internal TestFlight plus persistent diagnostic export and explicitly required **no disruption to external beta testers**. Uploaded **1.1.0 (38)** to App Store Connect app **6744178536** using `testFlightInternalTestingOnly=true` and symbol upload. Effective options and actual uploaded version/build were verified; Xcode reports **Upload succeeded / EXPORT SUCCEEDED**, package processing begun. Existing external builds/groups/testers were not changed. No beta review or App Store submission. Internal group assignment/processing completion are not yet independently verified; see [INTERNAL-TESTFLIGHT.md](INTERNAL-TESTFLIGHT.md) and its direct TestFlight link for the final internal installation step. Do not claim the user's phone was updated by this upload.

Added bounded persistent DiagnosticJournal history (128 fixed-label entries across launches), off-main atomic/coalesced writes, foreground main-thread delay/recovery monitor, and Release Settings → Support → Prepare/Share Diagnostic Report plus Clear History. No account/request data, raw errors or raw MetricKit payloads enter the history; no custom backend/automatic telemetry upload. TestFlight provides crash stacks; MetricKit handler remains numeric-only. Prepared tester notes in TestFlight/WhatToTest.en-US.txt are not uploaded group metadata.

Validation: full **49/49** tests passed; after flush/background refinement **5/5 journal tests** passed. Optimized coverage-free signed archive and matching app/widget dSYMs verified. Includes prior measured sorting improvement. Archive retained in ignored `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-38.xcarchive`; app/dSYM UUID `B4A2F4C7-0157-3D10-A0D3-3F57FC906FFD`. Build source version is 38. Upload log `/private/tmp/BeerSelectorNative-internal-upload-retry.log`. Initial packaging failed from mismatched rsync on PATH; upload script now pins Apple system tools. No external distribution changes occurred.

The prior phone freeze/Home Screen exit remains unexplained; normal attach-only reproduction is not a crash fix. Physical MetricKit delivery, a true full-download performance pass, actual TestFlight crash delivery, and on-device diagnostic sharing remain verification items. No need to repeat old readiness questions. See INTERNAL-TESTFLIGHT.md for exact evidence, retained artifacts and future internal-only upload safeguards.

---

## Previous checkpoint — physical profiling complete for this pass; earlier exit unresolved

User clarified the earlier refresh appeared frozen (they manually exited/reopened), and a separate scrolling/tapping event returned to the iPhone Home Screen. A new **60-second attach-only reproduction behaved normally**, explicitly confirmed by the user. Do not treat delayed replies to prior readiness questions as a new request to record.

The attach run used the existing installed phone build (base `0e64a6d7` plus numeric URLSession Task signpost), not the locally optimized sorting build. PID 24609 stayed alive through seven periodic checks and after detaching. Two refreshes succeeded in **1,069.745 ms and 625.499 ms**; six real task-metric callbacks; all 18 operation intervals balanced; max parsing 2.408 ms and transaction 1.115 ms; zero Hangs/Hitches rows. No new BeerSelector crash or contemporaneous Jetsam report was found. Earlier 45-second launch recording had three successful refreshes and real task metrics too. The earlier Home Screen exit and initial full-fetch freeze remain unexplained, not dismissed or marked fixed. MetricKit daily delivery and a true cold/full taplist profiling pass remain unverified.

A separate measured responsiveness fix is prepared locally: tasted-date sorting now precomputes per-row keys and BeerListScreen evaluates its filtered list once per body. Synthetic optimized 200-row mean improved **87.449 ms → 2.838 ms** (~31x). **44/44 correctness tests pass**, performance case passes before/after, signed Release phone build passes without coverage flags. The optimized build is **not installed**; current phone remains on the version used for reproduction. Code/tests/docs after `0e64a6d7` remain uncommitted; no new commit/push requested.

See [PHONE-PROFILING.md](PHONE-PROFILING.md) for evidence and limits. Latest trace `/private/tmp/BeerSelectorNative-phone-attach-repro.trace`; fixed-label exports/process observations `BeerSelectorNative-attach-*` under `/private/tmp`. Previous valid trace `/private/tmp/BeerSelectorNative-phone-refresh-ready.trace`; initial locked-phone `BeerSelectorNative-phone-refresh.trace` is empty/invalid. Mac xctrace exports crashed repeatedly but allocator/zombie workarounds recovered tables; these host crashes are distinct from phone exits. No running recording/build/test process remains. No live check-in/reward/delete or account reset was performed.

Next concrete options: commit the measured sorting/diagnostics follow-up, install the tested sorting build for a separate phone comparison, or proceed to planned account-safety tests. If the Home Screen exit recurs, obtain its exact time and fresh device reports and reproduce by attaching to the running process. Do not claim a crash fix from the sorting change.

---

## Previous checkpoint — profiling fixes implemented and validated

Resumed the authorized profiling fixes. **43/43 correctness tests and 2/2 opt-in performance tests pass.** No build/test processes remain after validation. User requested a commit after validation. This checkpoint is included with the accumulated phone/UI/testing and profiling fixes on `migration/native-swiftui`. No push, phone reinstall, or live account mutations were performed in the profiling/commit sessions.

- Fixed enrichment accounting with a generic request/decode boundary: malformed payloads fail; cancellations have their own count; cache hits require validated 304 semantics. Tests cover server/local rate-limit accounting and redirect protection.
- Added `Core/Diagnostics.swift`: bounded, thread-safe operation aggregates; balanced OSSignposter intervals and structured Logger outcomes for refresh, parsing, transactions, login, queue processing and HTTP requests. Existing RedirectPolicy collects task timings without weakening cross-origin rejection. Retained MetricKit subscriber collects only report counts and CPU seconds. Debug Settings displays/shares numeric diagnostics; no sensitive input or raw reports enter telemetry.
- Added shared **BeerSelectorProfile** scheme and **Performance** test plan/configuration. Profile/Run use Release; optimized tests enable testability. Actual unsigned device Release build passes with `-O`, whole-module optimization, `-g`, dSYM, and **no coverage flags**. Debug correctness coverage remains enabled. Use this dedicated scheme for profiling, not the original coverage scheme.
- Measured a contended SQLite write at **5.162 seconds** before changing busy timeout from 5000ms to zero. After: **0.00069 seconds**. MainActor serialization remains; no detached database work. New real-connection refresh regression verifies cache/timestamp preservation and successful retry after unlock. The 1,000-beer parse/write/read experiment averaged **17ms** before and after; simulator observations are not device budgets.
- `Scripts/run-tests.sh` now accepts `BEERSELECTOR_TEST_SCHEME`; default remains BeerSelectorNative. Performance runs separately with no coverage/parallel workers/timing gate. Unit includes DiagnosticsTests; All excludes PerformanceTests. Project regenerated using XcodeGen.

Evidence and exact commands/semantics: [TESTING.md](TESTING.md), section “Profiling fixes and measurements”. Logs: `/private/tmp/BeerSelectorNative-profiling-final.log` (43 tests), `BeerSelectorNative-performance-before.log` / `BeerSelectorNative-performance-after.log` (2 tests each), `BeerSelectorNative-profile-clean.log` (unsigned device build). Isolated simulator remains `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`; test derived data `/private/tmp/BeerSelectorNative-testing` and `/private/tmp/BeerSelectorNative-performance`.

Remaining validation requires a physical-device Instruments trace, real task-metric and MetricKit delivery, and the earlier migration release gates. Actual Xcode Cloud workflow execution and full RN upgrade/device Live Activity coverage are still unverified. Prior 4/4 mutation smoke result was not rerun or expanded in this profiling session. Do not claim the entire migration complete. Preserve the approved ghost DSEG7 counters/chrome and ignored configuration; never print credentials.

---

## Previous handoff — resolved by the profiling fixes above (historical)

Latest user: **“compact or handoff”**. Stop here and resume the authorized fixes from this entry next session.

### Active objective

User said **“ok, fix those issues”** after the instrumentation/profiling audit. Implement the fixes; do not stop at another audit. Their earlier request requires meaningful unit/integration tests for Xcode Cloud, consideration of mutation testing, and Farley's eight properties. No subagents unless explicitly requested.

### Exact stopping point

- Added **two regression tests** in `Tests/NetworkTests.swift`: `testMalformedEnrichmentIsAFailureNotASuccess` (line 140) and `testCancelledEnrichmentDoesNotCountAsFailure` (line 154).
- Ran ONLY these two against unchanged enrichment code: **both fail, 3 expected assertion failures**. Log `/private/tmp/BeerSelectorNative-metrics-red.log`.
- Malformed HTTP-200 taplist currently increments successes and not failures. Cancelled request currently increments failures. Tests establish the intended behavior before implementation.
- **No production profiling fixes have been implemented yet.** No telemetry file, Release config fix, database timeout/concurrency change, or new performance suite exists. The current overall suite must be considered red until these two cases are fixed. Last green full suite before these additions: **34/34**, also **68/68** repeated parallel executions.
- No running build or test process remains from this turn.

### Findings to fix

1. **Coverage contaminates Release builds through the shared scheme.** Actual unsigned Release audit compiler commands contain `-O`, `-whole-module-optimization`, `-g` AND `-profile-generate` / `-profile-coverage-mapping`. Release dSYM is configured. Log `/private/tmp/BeerSelectorNative-profile-audit.log`, settings `/private/tmp/BeerSelectorNative-profile-settings.json`; build passed. Explicitly disable coverage in a profiling configuration/scheme, preserve Debug unit-test coverage, and verify actual emitted flags rather than relying on configuration names.
2. **Enrichment counters have wrong semantics and no consumer.** `Core/EnrichmentService.swift` increments successes in `call` before parsing/validation. Cancellation counts as failure. Proposed approach: validate within a generic request/decode helper so each request records exactly one validated success/failure/cancellation; keep rate-limit/cache-hit semantics explicit. Add safe diagnostics display/export through Debug Settings. No credentials, URLs/query values, cookies, bodies, member names/IDs in telemetry.
3. **Missing operation instrumentation.** No OSSignposter, structured Logger, URLSessionTaskMetrics collection, MetricKit subscriber or XCTest performance measurements. Proposed initial intervals: refresh, parsing, persistence/transactions, login, queue processing; outcome-aware completion on success/failure/cancel and balanced begin/end. Add URLSessionTaskMetrics collection while preserving `RedirectPolicy` cross-origin protection. Consider bounded, thread-safe aggregates with fixed operation names; avoid an unbounded event store. Add useful diagnostics consumer and focused performance plan rather than putting noisy timing gates into the fast unit gate.
4. **MainActor synchronous SQLite/parsing risk.** `AppModel` is MainActor; `Database.swift` uses synchronous calls and `sqlite3_busy_timeout(handle,5000)`. This is a measured-code-location risk, NOT a proven production hitch. Assistant told user: measure first before changing database concurrency. Suggested next experiment: isolated realistic snapshot workload and lock-contention test; if retaining synchronous access, bound main-thread lock waits and preserve cache on busy failures. Do not blindly move SQLite to detached tasks without serialization and account-epoch safety. No experiment/change for this has been made yet.

### Tools and validation commands

- Worktree `/Users/pete/claude/BeerSelector-native`, branch `migration/native-swiftui`, base native commit `014e173c`. Many subsequent phone/UI/testing edits are **uncommitted**; preserve them. No push requested.
- Graph query for native Swift symbols returned zero; use known-file reads after that fallback. Graph project `Users-pete-claude-BeerSelector-native`.
- Xcode 26.3; review simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`, iOS 26.3.1. Keep fixture/testing activity isolated from user's signed-in simulator and physical phone.
- Last red command from repo root:
  `BEERSELECTOR_TEST_DESTINATION='platform=iOS Simulator,id=6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3' BEERSELECTOR_TEST_PARALLEL=NO BEERSELECTOR_TEST_BUILD_DIR=/private/tmp/BeerSelectorNative-testing native-ios/Scripts/run-tests.sh -only-testing:BeerSelectorNativeTests/NetworkTests/testMalformedEnrichmentIsAFailureNotASuccess -only-testing:BeerSelectorNativeTests/NetworkTests/testCancelledEnrichmentDoesNotCountAsFailure`
- Reuse `Scripts/run-tests.sh` and shared All/Unit/Integration plans; see TESTING.md. Simulator tests require ad hoc signing; unsigned host breaks Keychain. Regenerate project with XcodeGen after new Swift files/plans.
- Local Instruments templates available: Time Profiler, SwiftUI, Swift Concurrency, Allocations, Network, Animation Hitches, etc. No actual trace has been recorded.
- Primary docs read: Apple OSSignposter (`https://developer.apple.com/documentation/os/ossignposter`), Recording Performance Data (`https://developer.apple.com/documentation/os/recording-performance-data`), MXMetricManager (`https://developer.apple.com/documentation/metrickit/mxmetricmanager`). Website exposes newer deprecations; use SDK-available API compatible with app minimum iOS 17.6. MetricKit real delivery requires physical-device validation; do not claim simulator compilation proves it.

### Preserve prior accepted work

- User confirmed physical-phone existing account survived the in-place update and Beerfinder cancellation fix works.
- Home counter must retain **ghost seven-segment markings**, DSEG7Classic-Bold, enlarged full-width title, tighter layout, approved chrome. User specifically rejected ghost removal. Latest screenshot `Docs/Screenshots/iphone-home-segments.png`.
- Physical iPhone device ID `66EAEFE2-8C90-54FC-8F07-447104BECB2B`, Xcode UDID `00008150-00060C9C2247801C`. Last ghost update installed; reopening failed only because phone was locked. No profiling/test changes installed on phone afterward.
- All configuration secrets stay in ignored `Resources/ServiceConfiguration.plist`; never print values. Cloud post-clone supplies an empty plist only when absent. Real Xcode Cloud workflow/run remains unconfigured/unverified.
- Muter config is prepared but Muter is NOT installed/validated. Actual tested mutation runner is `Scripts/mutation-smoke.py`, with four seeded mutations in temporary secret-free copies. All four killed after fixing an ABV-input-order test gap. Preserve distinction from a whole-project mutation score.

---


## Profiling wiring inspection — 2026-09-10

User asked to inspect the wiring. Audited Profile scheme, effective Release settings, local Instruments templates, telemetry call sites, and an actual unsigned Release build. Findings recorded at the end of TESTING.md.

Release build succeeds with optimization and dSYM, **but includes coverage compiler instrumentation** (`-profile-generate`, `-profile-coverage-mapping`), so a clean profiling configuration is needed before measuring. Enrichment counters are unconsumed and count HTTP success before payload validation. No signposts, task metrics, MetricKit, structured logs or performance tests. MainActor SQLite/parsing is a profiling target, not a proven performance defect. No app behavior changes or device trace in this inspection. Build log `/private/tmp/BeerSelectorNative-profile-audit.log`.

---

## Unit/integration testing and Cloud preparation — 2026-09-10

User requested meaningful unit/integration tests aimed at Xcode Cloud, mutation testing consideration, and Farley's eight properties. See [TESTING.md](TESTING.md) for strategy, commands, evidence, remaining gaps and Cloud setup. User also asked about instrumentation/profiling: current Profile action, coverage, basic enrichment counters exist; structured signposts/performance baseline remain absent. No profiling implementation was requested or added.

- Retained XCTest. Split pure rules into `BeerRuleTests`, persistence/resources into `PersistenceIntegrationTests`, and kept `NetworkTests`. Fixed misleading names and the missing-chunk test that actually failed on missing session first. Added direct Expo legacy Keychain fixtures across all three services.
- Replaced global HTTP script with per-session fixture routing; unscripted requests fail locally. AppModel accepts connectivity monitoring disabled for tests; test host suppresses startup/foreground/background registration. SQLite and Keychain remain real, uniquely namespaced integrations.
- Added contract cases for description-only ABV, stable equal-key order, foreign member/store pending operation rejection, malformed taplist preserving cache while member data refreshes, and malformed rewards preserving rewards while authoritative empty tastings clear.
- Added shared `All`, `Unit`, `Integration` test plans: random order, coverage, timeouts, parallel eligibility. Generated Xcode project updated. Cloud post-clone hook creates an empty ignored config only when absent; no Node/Pods/XcodeGen install required in Cloud.
- **34/34 tests pass**: Unit **11**, Integration **23**, independently validated. All plan passed twice with parallel workers and process relaunch: **68/68 executions**. Results `/private/tmp/BeerSelectorNative-parallel-repeat.xcresult`, `BeerSelectorNative-unit-plan.xcresult`, `BeerSelectorNative-integration-plan.xcresult`. Unit execution ~0.01s; integration ~2.2s, excluding build/host startup. Xcode 26.3, simulator iOS 26.3.1.
- Four seeded mutation probes run against disposable secret-free copies. First unknown-ABV mutant survived; strengthening all six input permutations in both sort directions killed it. Final **4/4 killed**, each by its intended test; **34/34 baseline**. Report `/var/folders/qf/fq1jmj9n3y10c_sw_nr1_9jh0000gn/T/beerselector-mutations-brgi9fu0/report.json`. Runner `Scripts/mutation-smoke.py` preserves checkout, excludes production config, separates test failures from compile/launch errors/timeouts. This is not a whole-project mutation score.
- Muter investigated from primary docs; config prepared but tool not installed/validated. Semicolon-compressed Swift may require transformation cleanup before broad Muter use.
- Cloud hook exercised for absent and existing files; temporary secret-free checkout baseline built successfully. **Actual Cloud workflow/run is not created or certified.** Activation instructions are in TESTING.md; commit/push and connect workflow remain. Changes from this work and previous phone fixes remain uncommitted. No phone reinstall in this testing session.
- Next risk-based testing priorities: precise login/account-switch races, Keychain write-failure injection, full RN schema-v8 upgrade, enrichment rate/polling contracts and physical Live Activities. AppModel line coverage ~50%, LiveActivity ~19%; higher coverage elsewhere is not a correctness guarantee.

---

## Restore ghost seven-segment styling — 2026-09-10

User explicitly requested restoring ghost seven-segment markings as part of the Robocop styling. This supersedes the preceding removal. MetricPanel now uses DSEG7Classic-Bold for both lit digits and aligned cyan 12%-opacity ghost 8s, with three right-aligned slots. Keep this styling. The enlarged full-width title and tighter layout remain.

Simulator and signed phone builds pass (`/private/tmp/BeerSelectorNative-segments-simulator.log`, `/private/tmp/BeerSelectorNative-segments-phone.log`). Visually reviewed `Docs/Screenshots/iphone-home-segments.png`; installed in place on the paired iPhone for user review.

---

## Home counter revision — 2026-09-10

User requested less black space, larger count and larger BEERS TASTED label. MetricPanel now has a full-width cyan 22-point bold title, 112-point count (previously 64), clearer 30-point /200, larger progress caption, tighter inset/vertical spacing, and no ghost 888 digits. Approved surrounding chrome remains.

Simulator and signed phone builds pass (`/private/tmp/BeerSelectorNative-counter-simulator.log`, `/private/tmp/BeerSelectorNative-counter-phone.log`). Final isolated fixture screenshot reviewed: `Docs/Screenshots/iphone-home-counter.png`. Installed on paired iPhone in place for review. User acceptance and large-text/iPad review remain pending. No new unit tests for this layout-only revision; previous logic suite passed 27/27.

---

## Phone refresh cancellation fix — 2026-09-10

User confirmed their existing account appeared on the physical iPhone after the in-place install; saved credential retention is user-confirmed. They reported Beerfinder pull-to-refresh showing “cancelled cancelled”.

Refresh previously ran directly in the caller's task, treated cancellation as a source failure, attempted proxy fallback, and continued to the next source. AppModel now owns a shared refresh task so cancellation of a SwiftUI refresh action does not abort its work. Network/Swift cancellation exits quietly before fallback/subsequent sources. Existing account epoch guards remain.

27/27 isolated simulator tests pass, including cancelled-caller cache completion and cancelled-proxy preservation/no fallback/subsequent successful retry. Log `/private/tmp/BeerSelectorNative-cancellation-test.log`. Signed phone build passed (`/private/tmp/BeerSelectorNative-phone-cancellation-build.log`); updated the paired iPhone in place. User confirmed the physical iPhone pull-to-refresh retest is fixed.

---

## Paired iPhone run — 2026-09-10

User requested step-by-step tests for signed-in/cache/navigation/offline behavior and login/account/enrichment/statistics, and requested running on the paired phone. See [PHONE-TESTS.md](PHONE-TESTS.md) for 16 ordered steps and expected outcomes.

- Signed Debug build succeeded with the existing team and automatic provisioning. Log `/private/tmp/BeerSelectorNative-phone-build.log`; derived data `/private/tmp/BeerSelectorNative-phone`.
- Installed `org.verily.FSbeerselector` in place on Pete's paired iPhone 17 Pro and successfully launched via devicectl. Existing installed app reported version 1.1.0 build 59; native build is 1.1.0 build 37. No uninstall, reset, or fixture launch.
- Installation/launch success does not establish session/data retention or complete RN upgrade parity; user must report what appeared. No agent-selected check-in/reward/delete action. Normal startup/reconnect can process pre-existing pending operations.
- Migration implementation committed as `014e173c`; this phone checklist and checkpoint update are subsequent documentation changes, not yet committed.

---

## Commit checkpoint — 2026-09-10

User requested committing `migration/native-swiftui` with secrets excluded. The native migration is being committed as `Add native SwiftUI migration with approved chrome and enrichment follow-up`. Prior notes describing it as uncommitted are historical. No push or deployment was requested.

All 63 candidate files passed Gitleaks 8.30.1 with redaction and inline allow comments disabled; an exact-byte check also found no production configuration secrets in the candidate files. `Resources/ServiceConfiguration.plist` remains ignored and excluded. The latest verification remains 25/25 tests and a passing unsigned device SDK build.

Next priority: signed-in data/cache/navigation verification, then login cancellation/account-switch and interrupted persistence coverage; complete enrichment contracts/rate policy/polling and statistics; accessibility/rotation; signed RN-to-native upgrade and physical-device Live Activities. Live check-in/reward/delete tests still require a concrete agreed action.

---

## Resume — enrichment follow-up, 2026-09-10

User resumed this checkpoint. Approved chrome and the original signed-in simulator were left intact.

- `EnrichmentService.enrich` now performs one follow-up batch lookup for successfully synced missing beers and merges the result before returning. Still-missing IDs cannot trigger recursive sync. Existing AppModel epoch guards remain responsible for rejecting writes after an account change.
- Sync responses now decode the required `synced`, `queued_for_cleanup`, and `requestId` fields plus optional errors. Malformed/zero-success responses do not trigger a follow-up. Sync inputs reject empty/overlong IDs/names, deduplicate IDs, and retain the 50-row limit.
- **25/25 XCTest cases pass** on isolated review simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`. Three added cases cover immediate merge/source normalization, still-missing termination, and invalid/zero-success sync preservation. Log `/private/tmp/BeerSelectorNative-enrichment-test.log`.
- Unsigned device SDK build passes: `/private/tmp/BeerSelectorNative-enrichment-device.log`.
- No live API mutations, original simulator installation, commit, push, or deployment in this resume.
- Remaining enrichment work: complete batch/proxy/health schema validation, configurable rate-window/chunk-reservation parity and diagnostics, and delayed cleanup polling/persistence (one immediate fetch does not guarantee Worker cleanup has finished).
- Other remaining gates below still apply: signed-in/cache/navigation verification, cancellation/account switch coverage, statistics, accessibility/rotation, full RN upgrade and physical-device Live Activities.

The prior handoff below is historical; its stop instruction applied to the previous session and was superseded by the user's resume request.

---

## Handoff — latest state, 2026-09-10

**Latest user message: “it's good, you need to handoff”.** The user accepted the chrome implementation. Stop further implementation in this session; resume from this handoff next time.

### Accepted outcome
- User signed into the test account directly in the original iPhone simulator.
- User rejected the initial Beers/Beerfinder buttons; corrected compact chrome filters, direction labels/icons, Queue/Rewards, and expanded actions.
- User emphasized that the Pen chrome is crucial. Rebuilt shared materials from saved `RobocopChrome.pen`: brushed status/footer bands, reflective multi-stop rims, inset wells, etched steel icons, rivets, steel labels, cyan scanline titles, amber controls. **User now says it is good. Preserve this approved appearance.**
- Updated original simulator app in place and reopened it. Do not uninstall or overwrite its data with fixtures. No agent-initiated live check-in, reward redemption, or queue deletion occurred.

### Workspace and verification
- Worktree `/Users/pete/claude/BeerSelector-native`, branch `migration/native-swiftui`; migration is still uncommitted under `native-ios/`. No commit, push, or deployment.
- Latest **22/22 XCTest cases pass**; simulator and unsigned device SDK builds pass. Logs: `/private/tmp/BeerSelectorNative-chrome-test.log`, `/private/tmp/BeerSelectorNative-chrome-device.log`.
- User simulator: `3A8B89DC-35F0-4FCB-886B-448EA2B961AA` (iPhone 17 Pro). Isolated fixture/review simulator: `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`. iPad fixture simulator: `F71D5F8F-61FB-44F0-BE87-D8136C7A47C2`.
- Latest visual evidence: six `Docs/Screenshots/iphone-*-chrome.png` images and `ipad-home-chrome.png`, `ipad-finder-chrome.png`. Earlier screenshots document superseded appearances.
- Read `native-ios/README.md` for reproducible commands, `Docs/CHROME.md` for approved material values, and `Docs/PARITY.md` for incomplete migration gates.
- Production configuration is in ignored `Resources/ServiceConfiguration.plist`, imported without printing values. Do not expose configuration, cookies, or credentials.

### Next session
1. Preserve approved chrome and existing sign-in. Continue migration verification from PARITY.md, rather than redesigning the approved screens.
2. Verify signed-in data/cache/navigation and remaining login cancellation/account-switch behavior. User's sign-in is confirmed by their report; a complete live-flow certification has not been performed.
3. Complete enrichment contract/rate-policy/post-sync-fetch gaps and remaining statistics/debug behavior.
4. Validate accessibility, large text, rotation, and full in-place RN upgrade. Physical-device Live Activity lifecycle remains required; simulator builds do not certify it.
5. Get a concrete agreed test action before sending live check-in/reward/delete mutations. Do not ask for credentials in chat.

Graph-first discovery remains required. Native Swift previously returned no graph nodes, so direct known-file reads were used after that result. No subagents unless explicitly requested. Keep output narrow and persist progress.

---

## User objective and accepted decisions
Rebuild every BeerSelector RN screen/feature/function in native Swift/SwiftUI; Kotlin later. Map the complete app first and maintain parity evidence. Use newest source, match custom Robocop theme in open pen.dev, same minimum iOS, iPad support, Live Activities, same App Store identity; retain settings and logins wherever possible. User has a test account. User accepted isolated migration branch/worktree. User asked to manage context; keep tool output narrow and persist progress.

## Workspace
- Reference `/Users/pete/claude/BeerSelector`, newest branch `security/webview-origin-2026-09-01`, commit `60ff13dd74c99f7a666045fef9279d712a76834d`. Fetched origin; includes main `05574df9`. Auth-fix checkout older.
- New worktree `/Users/pete/claude/BeerSelector-native`, branch `migration/native-swiftui`, same reference commit. All work currently uncommitted under `native-ios/`.
- Reference original has one uncommitted xcscheme LLDB change; left intact.
- Xcode 26.3, xcodegen available. iOS app AND widget minimum 17.6 (project fallback 15.1 irrelevant).
- No subagents allowed unless user explicitly requests; none used.
- User/developer require graph-first code discovery. Native reference indexed as `Users-pete-claude-BeerSelector-native`; original graph `BeerSelector` was stale. Tool `get_code_snippet` for File only returns first 51 lines, hence file-read fallback used for whole files.

## Files produced
`native-ios/project.yml` generates `BeerSelectorNative.xcodeproj`, app target, widget extension, XCTest target. All app logic Swift; no RN dependency. App/Info.plist, entitlements; Shared/BeerQueueSharedTypes.swift and Widget/BeerQueueWidgetLiveActivity.swift copied from RN native extension, Widget entry point. Original bundled fonts/icon assets reused.
Core: Models.swift, Database.swift, Credentials.swift, API.swift, AppModel.swift, LiveActivityController.swift.
UI: RobocopTheme.swift, RootView.swift (home/custom tabs), BeerListScreen.swift, SettingsScreen.swift, RewardsAndQueue.swift, Browsers.swift (WKWebView Flying Saucer login; ASWebAuthenticationSession Untappd).
Docs: PARITY.md comprehensive **working** map, explicit incomplete states; reference-symbols.json (graph source inventory); reference-interactions.json (531 control/config anchors).
Tests: ParityTests.swift and NetworkTests.swift (22 passing contract/database/keychain/network/resource tests).

## Build/tests — refreshed after resume
- **22/22 XCTest cases pass**, iPhone 17 Pro iOS 26.3, ad hoc signing, parallel testing disabled. Log `/private/tmp/BeerSelectorNative-resume-test.log`; xcresult `/private/tmp/BeerSelectorNative-build/Logs/Test/Test-BeerSelectorNative-2026.09.10_22-40-22--0500.xcresult`.
- Simulator app/extension and final unsigned device SDK build pass. Device log `/private/tmp/BeerSelectorNative-device-build.log`; derived data `/private/tmp/BeerSelectorNative-device`.
- Simulator tests require `CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES`. Unsigned builds caused Keychain error -34018. A later runner-launch error recovered by booting the actual simulator and using `-parallel-testing-enabled NO`.
- Derived data `/private/tmp/BeerSelectorNative-build`.
- iPhone `3A8B89DC-35F0-4FCB-886B-448EA2B961AA`; iPad 11 `F71D5F8F-61FB-44F0-BE87-D8136C7A47C2` (both booted). iPad 13 `B0E290E8-7ED7-47FD-8471-ACDA4874B5C2`.
- Reproducible generation/build/test/preview commands are in `native-ios/README.md`.
- XcodeGen originally ignored top-level `resources`; fixed to a `sources` entry with `buildPhase: resources`, plus AppIcon build setting. All fonts and optional configuration now bundle correctly. Added resource/font registration test. BeerIcons.ttf PostScript name is **Untitled** (`Robo.beerIconFont`).
- `NetworkTests.swift` uses URLProtocol fixtures; tests POST non-retry inside HTTP client, cookie origin guard, pending retry success, logout while member enrichment is awaiting and rejection of stale reward/tasting writes. No production test writes.

## Current user handoff
- User explicitly agreed: **“Yes, open login after checks.”**
- Offline checks finished. Launched the normal iPhone app (no fixture flags), opened `beerselector://settings?action=login`, and brought Simulator forward on the iPhone 17 Pro.
- User reported **“I signed in”**. Sign-in is user-confirmed; no credential values were collected. They then reported Beers/Beerfinder buttons were wrong; current task corrects those controls.
- No check-in, reward, or deletion has been performed on a live account. Authenticated mutation tests still need a concrete agreed test action.

## Changes verified on resume
- Independent cache reads continue after a bad taplist/reward/operation source; Keychain load failure does not prevent cache loading.
- Epoch recheck after asynchronous member enrichment prevents stale reward writes following logout/account switch.
- Credential load fails closed when committed cookies lack their matching session. New real simulator Keychain tests pass.
- Review fields round-trip through SQLite; reward inserts name columns so extra legacy columns do not break replacement.
- Pending check-ins now match reference: failures remain pending for up to three retries, then failed; backoff between previously retried operations, reconnect debounce, retry timestamp, no cross-account/store replay. Clear All confirmation added and disabled while processing; removed queued rows are rechecked before submission.
- Rewards journey ring and separate milestones implemented from local Pen structure. Debug fixture launch accepts `--preview-screen home|beers|finder|tasted|rewards|settings`, and fixture entry invalidates in-flight account work.
- Eight screenshots captured/reviewed in `Docs/Screenshots`: six iPhone screens plus iPad Home/Rewards. Basic layout/assets confirmed; exact design match, large text, VoiceOver, rotation, interactions remain unverified. Home's ghost digits and system sheet headers still merit design refinement.
- Production app configuration imported from original checkout via `Scripts/import-configuration.py`, without printing values, into ignored `Resources/ServiceConfiguration.plist`; verified ignored. Regenerate project after importing/removing optional config.
- Existing on-disk enrichment service, BG AppDelegate/cleanup, review fields, fixture data, login cancellation checks, and legacy/keychain tests were ahead of the old checkpoint. PARITY.md now records their actual status.

## Design source
No Pen/Pencil tool is exposed in ALL_TOOLS; plugin-management skill read but search_plugins not exposed. MCP bundled binary exists `/Applications/Pen.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64`.
Python stdio MCP client `/private/tmp/beerselector-pen-mcp.py`, `-app desktop -agent codex`; tools/list works. get_app_state/read_skill failed connection in sandbox, then escalated get_app_state timed out (20s). Do not claim connected.
**Located actual design locally:** `/Users/pete/claude/RobocopChrome.pen` (JSON), newest in `~/Library/Application Support/Pen/recent-documents.json`. Read palette/root screen structures. Contains six screen frames: XrnMG Home, RDJdp AllBeers, SWeEn Beerfinder, Y0i06 TastedBrews, GU0K2 Rewards, nyKDF Settings; 393x852 each. Main content padding [8,18,0,18], gap 16 or 20. Components SteelPanel, BeerRow, SearchBar, TabBar, StatusBar, NavCard, FilterButton, ActionButton. Palette matches RN. Can inspect relevant subtrees from JSON without dumping entire file. Local Rewards subtree inspected; native screenshots reviewed (see resume evidence). No Pen-rendered design screenshot yet.
Palette bg #0A0A0A, display #0D1117, panel #1A1D22, border #2A2E35, cyan #00FFD0, amber #FFB300, red #FF3333, steel #8A919A, text #C8CDD3, chrome gradient #D4D8DD → #8A919A → #6B727B. Fonts SpaceGrotesk, SpaceMono, DSEG7Classic, BeerIcons f000 tulip f001 pint f002 can f003 bottle f004 flight.

## Key reference contracts
- SQLite exactly Documents/SQLite/beers.db (confirmed installed expo-sqlite native source). Tables allbeers, tasted_brew_current_round, rewards, preferences, operation_queue, schema_version. Latest RN schema 8 (CLAUDE.md stale says 6). Native opens in place/adds columns transactionally, preserves user settings, deletes plaintext auth_cookies.
- Review fields now persist and have round-trip coverage. A pre-versioned SQLite fixture upgrades successfully; a complete real RN schema-v8 signed upgrade remains unverified.
- Keychain Expo services `app:no-auth`, `app`, `app:auth`; kSecAttrAccount and Generic are Data(key.utf8), class generic password. Session `beerknurd_session` unless committed chunk generation hasSession true, then `beerknurd_auth_cookies_{generation}_session`. Marker `beerknurd_auth_cookies_meta` {generation,count,hasSession?}; chunk keys `beerknurd_auth_cookies_{generation}_{index}`, 1500 chars base64 of JSON dictionary; registry `_generations`. Native save writes immutable generation + session then marker, retains old registry until logout. Post-commit generation cleanup, login rollback/cancellation guards, and real simulator Keychain tests exist. Failure-injection and full legacy-service matrix still need coverage.
- Bundle org.verily.FSbeerselector, team N9F7839KSX. Widget org.verily.FSbeerselector.BeerQueueWidget. App entitlement group.org.verily.FSbeerselector.shared; widget entitlement empty. Old docs claim other app group; don't invent it.
- Member auth hosted https://tapthatapp.beerknurd.com/kiosk.php; terminal member-dash.php, visitor.php. WK native cookies provide store__id/store, store_name, PHPSESSID, member_id, optional username/first_name/last_name/email/cardNum. Swift fetches authenticated dashboard and regex extracts https://fsbs.beerknurd.com/bk-member-json.php?uid=N and bk-store-json.php?sid=N. No JS injected in native app. Validate exact auth origin/path and data origin. Visitor store-only, memberId visitor, clear old member cookies. Coordinator cancels completion task on teardown; completion checks Task cancellation before committing. Detailed cancellation timing tests remain.
- GET store URL gives `[{}, {brewInStock:[...]}]`, alternatives direct array or object keys; empty store taplist must NOT erase cache. GET member URL single fetch supplies `[1].tasted_brew_current_round` and `[2].reward`; explicit empty valid; malformed preserves cache. Mixed invalid rows handling in native stricter than reference.
- Auto-login POST /auto-login.php form, returns session. Logout POST /logout.php best effort with mandatory local cleanup. API cookies scoped to auth host; redirect delegate rejects cross-origin redirects.
- Check-in POST /addToQueue.php form chitCode=`beerId-storeId-memberId`, chitBrewId,chitBrewName,chitStoreName. Empty successful body valid; must NOT add tasted until staff confirms. Finder excludes tasted and already queued IDs.
- Queue GET /memberQueues.php HTML h3.brewName + div.brew_added_date + deleteQueuedBrew.php?cid; deletion **GET** /deleteQueuedBrew.php?cid (mock graph says POST but production code GET).
- Reward POST /addToRewardQueue.php form chitCode=rewardId,chitRewardType,chitStoreName,chitUserId; available/redeemed; user confirmation; success even non-JSON HTTP200.
- Pending operation only CHECK_IN_BEER actually implemented in RN; other enumerated operation types are TODO in reference. RN retries network failures up to 3, exponential 1s base/30s cap, 2s reconnect debounce. Native now retains failures pending through the reference retry bound, with explicit review feedback and backoff. No idempotency guarantee is inferred. Offline first attempts auto-send on reconnect. Unknown types preserved failed, user/store guard added.
- Untappd uses ASWebAuthenticationSession (not SFSafariViewController) for Safari cookie reuse. Strip parenthetical name then encode search query.
- Enrichment optional config current .env.production/.development/.staging exist in original checkout, NOT worktree (ignored). Need generate ignored plist from selected environment without printing secrets. Source config EXPO_PUBLIC_ENRICHMENT_API_URL/API_KEY. Native has ignored environment import, proxy GET, batch, missing sync, health and metrics. Immediate re-fetch after sync and full contract/rate-limit parity remain incomplete. GET /beers?sid with X-API-Key and ETag. POST /beers/batch JSON {ids:[...]} max100 → {enrichments:{id:{enriched_abv,enrichment_confidence,enrichment_source,brew_description,has_cleaned_description}},missing:[...],requestId}. POST /beers/sync JSON {beers:[{id,brew_name,brewer?,brew_description?}]} max50; GET /health. Source description-fallback normalized to description. Proxy response must validate storeId and expected fields (native validates storeId). Description ABV used only for container icon fallback, never persist description-derived ABV (native now includes display-only description fallback).
- Live Activity uses existing attrs/SwiftUI UI, 500ms debounce, restarts with queue changes, 3h stale, end empty/logout, foreground expiry. Native AppDelegate registers/schedules BGTaskScheduler cleanup; runtime device verification remains. Reference identifier org.verily.FSbeerselector.liveactivity.cleanup (modules/live-activity/ios/LiveActivityAppDelegate.swift + LiveActivityModule.swift), BGAppRefreshTaskRequest 3h. Add native AppDelegate and Info.plist permitted IDs/background fetch. staleDate != exact removal guarantee. Physical-device tests required.

## Next work (do not claim whole migration complete)
1. User signs into test account in the open iPhone simulator. Verify member data, cache reload, and account flow without printing credentials. Agree on concrete live check-in/reward/delete test actions before sending mutations.
2. Audit remaining login cancellation/rollback timing, logout interleaving, interrupted operations, and full RN schema/Keychain compatibility. Test account switching and cold-start deep links.
3. Complete enrichment contract validation, immediate post-sync fetch, rate-policy parity, and health/metrics diagnostics. Do not print configuration values.
4. Refine full Pen visual match (status/header chrome, card details, ghost digits), full statistics control, accessibility, large text, iPad rotation, and screen interactions. Existing screenshots are fixtures only.
5. Full signed in-place RN-to-native upgrade and physical Live Activity lifecycle remain release gates. Minimum 17.6 compatibility runtime also remains untested (build deployment target is 17.6).
6. Keep PARITY.md and this checkpoint current. Changes remain uncommitted under native-ios; no push/deploy.

## Tool hygiene
Discover tool metadata via ALL_TOOLS only when necessary; use structuredContent and output selected fields, never entire graph nodes (fingerprints huge). Persist retrieved data/inventories. Do not read broad credential config slices: unrelated secret accidentally appeared once in a config read; never repeat it. No credential values need user-facing output.

## Button correction after user sign-in
- Reference FilterBar has compact chrome ALL/DRAFT/CANS, icon + DATE/NAME/ABV, and NEW/OLD, A-Z/Z-A, HIGH/LOW direction controls. Native oversized outlines and bare direction arrows were incorrect.
- Beerfinder needs compact amber QUEUE and REWARDS alongside filters; expanded CHECK IN and UNTAPPD both use amber ActionButton. All Beers keeps its cyan outlined Untappd action, as the current RN source does.
- Added BeerControlStyle with chrome/selected/amber/outline appearances and 44-point hit areas; compact controls wrap to two rows when needed. Added queue loading state and restored Finder Rewards access.
- Dedicated simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3` (BeerSelector UI Review, iPhone 17 Pro) isolates fixture screenshots/tests from user's signed-in `3A8B89DC-35F0-4FCB-886B-448EA2B961AA`.
- `--preview-expanded` opens the first fixture row for visual review of its action buttons.

- Button correction verification: 22/22 existing tests pass; log `/private/tmp/BeerSelectorNative-buttons-test.log`. Expanded All Beers/Finder screenshots captured and reviewed (`iphone-beers-buttons.png`, `iphone-finder-buttons.png`). Both fit all controls at standard text size.
- Installed corrected build in place on user's signed-in iPhone simulator, preserving its data container/Keychain; reopened normal app for review. No live account mutations were sent by the agent. Latest device SDK build predates the button correction; simulator build/tests cover this UI change.

## Chrome priority correction — latest user steering
- User: **“you gotta match the chrome of my design too. the chrome is crucial.”** Treat saved Pen material values as visual source of truth, ahead of RN visual approximations. Preserve control behavior.
- Read all reusable Pen components plus Home overrides from `/Users/pete/claude/RobocopChrome.pen`. Wrote `Docs/CHROME.md` with source IDs, stop positions, rims, radii, and status-bar documentation.
- Implemented five-stop polished card/search/nav rims; separate three-stop filter/steel rims; seven-stop brushed status/footer bands; five-stop tab pill; steel overlay on major panels; recessed etched steel icon wells; radial rivets; dark steel label plates; cyan scanline title displays; amber action gradients/edges/glows and red milestones.
- Real system status icons now render dark on the chrome status band (`UIViewControllerBasedStatusBarAppearance=false`, `UIStatusBarStyleDarkContent`), per Apple documentation. Native system indicators are retained.
- Settings/Rewards have custom chrome back controls and cyan display titles. Rewards rows retain the design's dark surfaces instead of adding unrequested bright rims. Home metric font now follows Pen's Space Grotesk rather than the previous DSEG approximation.
- Shared SwiftUI primitives live in `UI/RobocopTheme.swift`; RootView, BeerListScreen, SettingsScreen, RewardsAndQueue use them. Pen MCP `get_app_state` again timed out; no rendered Pen pixel comparison is claimed.
- Initial chrome screenshot review confirmed metal safe-area bands, card/search rims, etched glyphs, titles, rivets on iPhone. Final screenshot/build results recorded below.

- Final chrome validation: **22/22 tests pass** (`/private/tmp/BeerSelectorNative-chrome-test.log`); unsigned device SDK build also passes (`/private/tmp/BeerSelectorNative-chrome-device.log`).
- Final fixture screenshots captured: six `iphone-*-chrome.png` screens plus `ipad-home-chrome.png` and `ipad-finder-chrome.png`. Reviewed safe-area bands, glyphs, panels, search, header, tab and Rewards materials on iPhone/iPad. Updated user's original simulator app in place and reopened it; no uninstall or live account mutation was performed.
- Remaining visual work includes exact full layout/type-size/rotation comparison; the Pen renderer remains unavailable. Do not equate matching saved material values with complete pixel parity.

### Build-number maintenance

Build 60 is already reserved. For the following distribution archive, run `native-ios/Scripts/bump-build-number.py` once from the repository root (or invoke its absolute path). It increments the single shared XcodeGen setting, enforces a floor of 60, and regenerates the project for both app and widget. XcodeGen must be installed; generation failure restores the prior source setting and attempts project restoration. Review and commit project.yml and project.pbxproj together. Check the latest uploaded build across native and legacy releases first; the local script does not query App Store Connect or coordinate concurrent release branches. Routine Run, Profile, Test and Archive actions do not mutate source versions. Failed archives can reuse their reserved number until it has been uploaded.
