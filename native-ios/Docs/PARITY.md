# BeerSelector native iOS migration

Reference: `60ff13dd74c99f7a666045fef9279d712a76834d` (`security/webview-origin-2026-09-01`, 2026-09-01). Remote fetched 2026-09-10; this is newer than both main and the auth-fix worktree and includes main. Reference checkout's uncommitted Xcode debugger selection is not a product change and was left untouched.

Worktree: `/Users/pete/claude/BeerSelector-native`; branch: `migration/native-swiftui`.

Requirements: preserve the custom Robocop design, iOS **17.6**, iPhone and iPad, existing App Store app identity, settings and sessions where technically possible, Live Activities. Android/Kotlin is out of this migration's scope.

This is a working parity ledger, not a release certification. “Implemented” means code exists; it does not mean live-account, upgrade, visual, or device verification has passed. `reference-symbols.json` inventories source symbols; `reference-interactions.json` inventories control/configuration references. Helper functions are translated by responsibility, not mechanically one Swift function per JS function.

## Current verification status

[RELEASE-READINESS.md](RELEASE-READINESS.md) consolidates the 2026-09-11 evidence and remaining gates. Historical pending labels below are superseded where that review records completed tests, the real iPad upgrade, and user-confirmed phone/Live Activity checks. Cloud build 22 now passes 74/74 tests; crash-report delivery remains unverified and distribution is paused.

## Screen and interaction map

| Surface | Reference source | Behavior and controls | Native implementation | Verification |
|---|---|---|---|---|
| Startup | app/_layout.tsx; src/database/startupMigrationCheck.ts; src/utils/coldStartNavigation.ts | Fonts, DB open/migrate, startup progress, error/retry, configuration gate, deep link handling, retained caches | App/BeerSelectorApp.swift; Core/Database.swift; Core/AppModel.swift | Pending upgrade tests |
| First launch | app/(tabs)/index.tsx; hooks/useHomeScreenState.ts | Loading, Get Started; route to Settings when no configuration | UI/RootView.swift | Pending simulator |
| Member Home | app/(tabs)/index.tsx; components/ui/MetricCard.tsx | WELCOME BACK, member name, store, Settings gear; count /200, percentage, progress bar; All Beers, Beerfinder, Tasted Brews, Rewards cards | UI/RootView.swift; UI/RobocopTheme.swift | Pending design comparison |
| Visitor Home | same | GUEST MODE, Visitor name, All Beers enabled; member navigation disabled; no personal count | UI/RootView.swift | Pending live visitor login |
| Tab bar | app/(tabs)/_layout.tsx; src/utils/tabBarFiltering.ts | HOME, BEERS, FINDER, TASTED; selected and dim states; member tabs hidden for visitors; haptics | UI/RootView.swift | Pending simulator |
| All Beers | app/(tabs)/beerlist.tsx; components/AllBeers.tsx | Full taplist; search and clear; container cycle; sort and direction; count; pull refresh; expandable cards; UNTAPPD | UI/BeerListScreen.swift | Pending simulator |
| Beerfinder | app/(tabs)/mybeers.tsx; components/Beerfinder.tsx | All minus tasted minus queued IDs; list/search/filter/sort; CHECK IN and UNTAPPD; VIEW QUEUE | UI/BeerListScreen.swift; Core/AppModel.swift | Pending live check-in |
| Tasted Brews | app/(tabs)/tastedbrews.tsx; components/TastedBrewList.tsx | Current round; search/filter/sort; tasted-date sort; expand description; refresh; no check-in action | UI/BeerListScreen.swift | Pending live member data |
| Beer row | components/beer/BeerItem.tsx; components/icons/* | Beer name, brewer, style/container, ABV badge; serving glyph; collapse/expand; added/tasted date; description; actions; one expanded row; expansion resets on search/filter | UI/BeerListScreen.swift | Pending visual comparison |
| Filter controls | hooks/useBeerFilters.ts; components/beer/FilterBar.tsx; components/SearchBar.tsx | Search name/brewer/style/location (300ms); all→draft→cans/bottles→all; date→name→ABV; date desc, others asc; null ABV always last | Core/Models.swift; UI/BeerListScreen.swift | Contract tests passing; UI timing checks pending |
| List states | components/beer/SkeletonLoader.tsx; src/utils/beerListViewState.ts; hooks/useDataRefresh.ts | Loading placeholders, keep search usable, cached data on network failure, distinct empty/malformed/unavailable states, retry local read, manual refresh failure feedback | Core/API.swift; Core/AppModel.swift; UI/BeerListScreen.swift | Unit + simulator planned |
| Remote beer queue modal | components/Beerfinder.tsx; src/api/queueService.ts; src/utils/htmlParser.ts | Queue loading/error/empty, beer/date, DELETE confirmation and busy state, CLOSE; match queue names to beer IDs | UI/RewardsAndQueue.swift; Core/API.swift | Pending live HTML verification |
| Check-in | hooks/useOptimisticCheckIn.ts; hooks/useQueuedCheckIn.ts; src/api/beerService.ts | Member session required; reject tasted; queue offline; send chitCode and beer/store details; success removes beer from Finder, does NOT increment tasted until employee confirmation; Live Activity update; haptics and success/error | Core/AppModel.swift | Pending live mutation |
| Pending operations | components/QueuedOperationsModal.tsx; context/OperationQueueContext.tsx | Indicator/count; rows with name/status/time/retries/error; per-row retry/delete; Clear All confirmation; reconnect debounce; bounded backoff; reload interrupted operations | UI/RewardsAndQueue.swift; Core/Database.swift; Core/AppModel.swift | Pending retry parity review |
| Rewards | app/screens/rewards.tsx; components/Rewards.tsx | Journey progress/ring, count/remaining, 50/100/150/200 milestones; available/redeemed rows; confirmation Queue It!; already redeemed alert; per-row loading; refresh; no rewards/members-only/error states | UI/RewardsAndQueue.swift | Pending visual/live verification |
| Settings first run | app/settings.tsx; components/settings/WelcomeSection.tsx | Welcome copy; Sign In to Flying Saucer; hosted member/visitor selection; sign-in/loading/error/cancel | UI/SettingsScreen.swift; UI/Browsers.swift | Pending live account |
| Settings configured | components/settings/DataManagementSection.tsx | Refresh All Data, Login to Flying Saucer, Go to Home when needed, LOG OUT confirmation; disable overlapping refresh/login | UI/SettingsScreen.swift | Pending simulator |
| About | components/settings/AboutSection.tsx | Version/build, copyright; optional Help/Privacy only when URLs passed (current settings passes none) | UI/SettingsScreen.swift | Pending simulator |
| Developer tools | components/settings/DeveloperSection.tsx | Debug only: statistics/refresh times, clear timestamps confirmation, view preferences, create mock session, reset first-run confirmation | UI/SettingsScreen.swift | Mock session implemented; refresh-time statistics still partial |
| Flying Saucer login | components/LoginWebView.tsx; src/api/loginMessageHandler.ts; src/api/loginOrigin.ts | Hosted kiosk; exact trusted origin and terminal path; extract member/store JSON URLs and native cookies; visitor transition clears member credentials; session/config commit; cancel and errors | UI/Browsers.swift; Core/AppModel.swift; Core/Credentials.swift | Pending cancel/race/live tests |
| Untappd | components/UntappdWebView.tsx; src/config/config.ts | Strip parenthetical suffixes from name, percent-encoded search, ASWebAuthenticationSession sharing existing Safari login, dismiss returns to list | UI/Browsers.swift; Core/AppModel.swift | Pending device |
| Offline indicator | context/NetworkContext.tsx; components/OfflineIndicator.tsx | Connectivity status, retain cache, pending operation badge, retry after reconnect | NWPathMonitor in Core/AppModel.swift | Pending airplane mode |
| Live Activity | src/services/liveActivityService.ts; modules/live-activity/ios/*; ios/BeerQueueWidget/* | Queue snapshot; 500ms coalescing/restart; IDs and cleaned names; 3h stale; end empty/logout; foreground reconciliation; Lock Screen top 5, expanded Island top 3, compact mugs max 5; deep link beerselector://mybeers | Core/LiveActivityController.swift; Shared/*; Widget/* | Widget copied from reference; lifecycle/device testing pending |
| Deep links | src/utils/coldStartNavigation.ts; app/beerfinder.tsx | mybeers→Finder directly, beerfinder compatibility, settings?action=login; avoid duplicate tab stacks | Core/AppModel.swift | Cold-start sequencing review pending |
| Accessibility | animations/useReducedMotion.ts; components/ui/*; components/beer/* | Labels, progress values, selected/disabled state, touch targets, reduced motion, scalable text | Native labels, SwiftUI environment and custom relative fonts | VoiceOver + large text pending |
| iPad | hooks/useBreakpoint.ts; components/Rewards.tsx | Tablet support, usable wide layout, readable bounds, adaptive navigation/modal presentations | iPhone+iPad targets; bounded SwiftUI layouts | Portrait/landscape review pending |

## API contracts

All live URLs below come from the reference; no production writes were used to discover the app.

| Operation | Wire contract | Caller / native location |
|---|---|---|
| Login UI | GET https://tapthatapp.beerknurd.com/kiosk.php; success member-dash.php or visitor.php | Browsers.swift |
| Store taplist | GET https://fsbs.beerknurd.com/bk-store-json.php?sid={id}; stored all_beers_api_url; standard `[{}, {brewInStock: [...]}]`; direct arrays and named alternative envelopes supported in reference | API.parseBeers, AppModel.refresh |
| Member + rewards | GET stored my_beers_api_url, extracted bk-member-json.php?uid={id}; one body supplies `[1].tasted_brew_current_round` and `[2].reward` | AppModel.refresh; API parsers |
| Auto-login | POST /auto-login.php, form body, saved cookies; `{session: ...}` | AppModel.autoLogin; invoked at startup, live verification pending |
| Password login helper | POST /login.php username/password; exported reference service helper, current screen uses hosted kiosk | Map only: not a separate native UI |
| Logout | POST /logout.php; best effort remote, mandatory independent local Keychain + native/WebKit cookie cleanup | AppModel.logout |
| Beer check-in | POST /addToQueue.php, application/x-www-form-urlencoded; chitCode=`beerId-storeId-memberId`, chitBrewId, chitBrewName, chitStoreName; empty successful body accepted | AppModel.processOperations |
| Queue read | GET /memberQueues.php; HTML brewName + brew_added_date + deleteQueuedBrew.php?cid=... | AppModel.refreshQueue; API.parseQueue |
| Queue delete | **GET** /deleteQueuedBrew.php?cid={id}; reference production implementation uses GET even though mock/graph route says POST | AppModel.deleteQueueEntry |
| Reward queue | POST /addToRewardQueue.php; chitCode=reward ID, chitRewardType, chitStoreName, chitUserId; empty/non-JSON HTTP success accepted | AppModel.queueReward |
| Enriched taplist | GET {enrichmentURL}/beers?sid={store}; X-API-Key, If-None-Match; 304 only useful with matching nonempty cache; validate store ID, response, enrichment; fallback direct | EnrichmentService; imported ignored production configuration, store/ETag checks and typed proxy contract validation implemented; live verification pending |
| Batch enrichment | POST /beers/batch; chunked lookup, missing IDs; description/source normalization | EnrichmentService.enrich; configurable lookup chunks capped at 100 IDs, upfront budget reservation, typed nullable row contract, and cross-chunk immediate merge fixture-tested; live verification pending |
| Missing beer sync | POST /beers/sync, max 50 beers; then enriched fetch | Validated sync, immediate post-sync re-fetch and model-owned bounded delayed cleanup polling implemented; local fixture-tested, live Worker verification pending |
| Enrichment health/metrics | GET /health; rate-window handling, metrics/reset; service helpers | Default 10/60-second shared budget, upfront reservations, 429 blocking and reset/window behavior fixture-tested; health database and optional quota contract validated; environment overrides and Retry-After cooldowns fixture-tested |
| Untappd search | https://untappd.com/search?q={clean name}; system browser | AppModel.openUntappd |

Session requests contain PHPSESSID, store__id, member_id, store_name, and optional username/first_name/last_name/email/cardNum. Never forward member cookies or enrichment headers across origins. Reference's removed X-Client-ID must stay removed. Credential values must not appear in logs or checked-in fixtures.

## Persistence and upgrade map

| Existing storage | Native migration rule |
|---|---|
| App identity org.verily.FSbeerselector | Preserve same team/signing identity for update and Keychain access. Do not uninstall between old/new builds during upgrade test. |
| Documents/SQLite/beers.db | Open in place using SQLite3 (confirmed from installed expo-sqlite native source). Retain WAL; add missing columns transactionally; do not copy only main db while WAL is active. |
| allbeers | Preserve IDs, names, metadata, description, added date, serving type, ABV and enrichment. Network failure/malformed/empty taplist must not erase cache. |
| tasted_brew_current_round | Preserve IDs, round, tasted date, ratings/chit code and enrichment. Explicit empty current round is authoritative. A queued check-in does not count as tasted. |
| rewards | Preserve reward_id/redeemed/reward_type. Validate before atomic replacement. Explicit empty is authoritative. |
| preferences | Preserve all existing keys, including unused metadata. Known: all_beers_api_url, my_beers_api_url, is_visitor_mode, first_launch, last_all_beers_refresh, last_my_beers_refresh, store_code, store_state, API URLs and refresh/ETag metadata. Purge plaintext auth_cookies, as schema v8 already does. |
| operation_queue | Preserve id/type/payload/timestamp/retry_count/status/error_message/last_retry_timestamp. Do not execute one member/store's operation with another's credentials. Unknown/unimplemented legacy types remain reviewable. |
| schema_version | Preserve legacy version history; additive native_schema_version preference is separate. Older version migration semantics require fixture coverage. |
| Expo SecureStore | Binary Data account/generic keys, services app:no-auth / app / app:auth. Read committed beerknurd_auth_cookies_meta generation; base64 1500-char chunks; matching generation session or beerknurd_session fallback. Retain registry for cleanup. |
| WebKit / native cookie jars | Read via WKHTTPCookieStore; retain login where still accepted by server; clear all local authentication representations on logout and visitor transition. Untappd uses the system browser. |
| Live Activity identity | Preserve BeerQueueAttributes structure and extension bundle ID. App entitlement currently has group.org.verily.FSbeerselector.shared; reference widget entitlement is empty, despite older docs naming another group. Inspect implementation before inventing new entitlements. |

## Required completion gates

- [x] Compile app and extension for simulator and device SDK (Debug; device build unsigned).
- [x] Contract tests: decoding, invalid-vs-empty responses, sorting, set difference, form encoding, queue parser, origin validation.
- [x] Migration/account-safety regression coverage: exact legacy-v8 fixtures, preserved data/operations, interrupted credential generations, injected Keychain failures and logout/login cleanup (74-test suite; not exhaustive OS failure coverage).
- [ ] iPhone/iPad screenshots compared to current app and the open pen.dev design.
- [ ] Native rebuild of remaining behavior listed as partial/pending above.
- [ ] Test-account member/visitor/login/logout/check-in/delete/reward flows, with user participating in authentication.
- [x] Actual signed in-place upgrade: iPad legacy build 50/schema 7 → native 61, retained account and relaunch persistence; see UPGRADE-REHEARSAL.md.
- [ ] Physical-device Live Activity lifecycle, disabled authorization, empty queue, logout, foreground, 3-hour stale/cleanup, deep links, force quit.
- [ ] Offline/reconnect, slow network, 401, 429, 5xx, corrupt response, duplicate tap, account switch and interrupted persistence.
- [ ] VoiceOver, Reduce Motion and remaining large-text screens. Initial Home/beer-list large-text fixture review and expanded-card action reachability passed on 2026-09-11; tablet grid restored and portrait/landscape navigation/expansion verified on isolated iPad simulator. Split View and physical-device accessibility remain open.

## Native framework references

- [Apple: WKHTTPCookieStore getAllCookies](https://developer.apple.com/documentation/webkit/wkhttpcookiestore/getallcookies(_:))
- [Apple: Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)

A staleDate marks content outdated; it does not guarantee exact-time removal while the process is suspended. Background cleanup parity needs device verification and must not be claimed from a simulator compile.

## Resume verification — 2026-09-10

- 22 XCTest cases passed on iPhone 17 Pro / iOS 26.3 with ad hoc signing. Coverage includes real simulator Keychain generations, incomplete session rejection, an older SQLite schema, independent cache loading, review fields, account changes during enrichment, pending retry success, cookie origin checks, and bundled font registration.
- Fixed XcodeGen resource inclusion: fonts, app icon, and optional service configuration now enter the app bundle. `BeerIcons.ttf` uses the PostScript name `Untitled`; SwiftUI now references that name.
- Failed cache reads no longer block unrelated caches. Account changes after asynchronous enrichment prevent both old tasting and old reward writes.
- Pending check-ins now retain pending state through three retries, with reference inter-operation exponential delay and reconnect debounce. Clear All requires confirmation and is disabled during submission. Unknown operation types remain reviewable. The upstream API has no verified idempotency contract; a lost response can still leave an uncertain result, as in the reference.
- Rewards now uses the local Pen design's journey ring and separate milestones. Six iPhone fixture screens and iPad Home/Rewards are captured in `Screenshots/`. These are offline visual evidence, not proof of authenticated API parity.
- Background cleanup registration/scheduling, configuration import, batch enrichment, sync, health, and rate metrics were already present on resume; their presence has now been reconciled in this ledger. Device lifecycle, detailed enrichment behavior, full visual matching, and accessibility remain incomplete.
- User agreed to enter the test account credentials directly in the iPhone simulator after offline checks. Authentication and subsequent account actions have not yet been verified.

### Button correction after signed-in review

User confirmed signing in and reported incorrect Beers/Beerfinder buttons. Restored the current RN FilterBar's compact chrome container/sort/direction controls (including NEW/OLD, A-Z/Z-A, HIGH/LOW labels), cyan selected container state, icons and haptics. Restored compact amber QUEUE and missing REWARDS on Finder, amber CHECK IN/UNTAPPD in Finder cards, and the All Beers cyan Untappd control. Hit areas remain at least 44 points. Queue requests expose loading/disabled state. The controls use a second row if they cannot fit together.

22 existing tests pass on an isolated iPhone simulator. Expanded fixture screenshots `Screenshots/iphone-beers-buttons.png` and `Screenshots/iphone-finder-buttons.png` were visually reviewed. Updated the user's simulator app in place; no uninstall or live check-in/reward/delete was performed. Full Pen matching remains open; this correction follows current RN control behavior where its layout differs from Pen.

### Chrome is a required part of parity

The user explicitly emphasized matching the saved Pen chrome. See [CHROME.md](CHROME.md) for exact source components and native implementation. Material gradients, inset depths, edge strokes, brushed status/footer bands, etched steel icon wells, rivets, and title displays now use the saved design values. This supersedes the earlier generic single-gradient chrome approximation. Settings/Rewards titles use custom chrome headers. Existing navigation/filter/API behavior is preserved.

Chrome validation: 22/22 regression tests pass; simulator and device SDK builds pass. Six iPhone chrome screenshots plus iPad Home/Finder screenshots captured, with visual inspection of the shared metal surfaces. The signed-in simulator app was updated in place. Exact whole-screen layout and accessibility validation remain separate from these material corrections.

### User acceptance and handoff

On 2026-09-10 the user accepted the revised chrome (“it's good”) and requested a handoff. Preserve the approved material treatment. This visual acceptance does not close the remaining live-account, upgrade, accessibility, enrichment, and physical-device verification gates. The current resume entry is at the top of WORK-CHECKPOINT.md.

### Enrichment follow-up — resumed 2026-09-10

Missing beers now receive one batch lookup after a valid successful sync, merged before returning to the existing account-guarded persistence flow. Still-missing results cannot start another sync. Sync validates required response fields, rejects invalid input identities/names, deduplicates IDs and retains the 50-row chunk limit. Invalid or zero-success sync responses preserve upstream data without a follow-up.

25/25 tests pass on the isolated review simulator, including three new post-sync regression cases; unsigned device SDK build passes. Logs: `/private/tmp/BeerSelectorNative-enrichment-test.log` and `/private/tmp/BeerSelectorNative-enrichment-device.log`. No original simulator data or live account actions were touched. Full batch/proxy/health schema checks, configurable rate/chunk reservation policy, and delayed cleanup polling remain open; this change does not certify completion of asynchronous Worker cleanup.

### Physical iPhone retention and refresh cancellation

User confirmed the existing account appeared after the signed native in-place installation. This establishes observed credential retention on that phone, not every upgrade gate. Beerfinder pull-to-refresh reported duplicate “cancelled” errors; refresh now runs in an AppModel-owned task and stops quietly on cancellation without proxy fallback or subsequent source requests. 27/27 simulator tests pass, including two cancellation regressions. User confirmed the physical iPhone pull-to-refresh retest passes.

### Test suite and Cloud preparation — 2026-09-10

34 tests pass: 11 unit rules and 23 HTTP/persistence integrations, independently selectable via shared Xcode test plans. Parallel randomized runs with fresh processes passed twice (68 executions). HTTP scripts are scoped per session; connectivity monitoring and app lifecycle startup are disabled in tests. Added direct Expo legacy service compatibility and foreign account/store operation rejection coverage. The missing-chunk case now exercises missing chunks rather than failing earlier on the session.

Four deliberate regression probes are killed by the expected tests after repairing an initially surviving ABV-order probe. A secret-free temporary checkout also passes. Cloud preparation and setup instructions are in [TESTING.md](TESTING.md); no actual Xcode Cloud run is claimed, and remaining migration gates stay open.


## Profiling follow-up — 2026-09-11

Implemented validated enrichment outcome counters, fixed-label signposts/logging, URLSession task timing aggregation, a MetricKit subscriber, and Debug Settings diagnostics display/share. Added a coverage-free profiling scheme plus isolated performance plan. Measured SQLite contention led to zero busy wait while retaining serialized transactions and cache/account guards. Correctness: 43/43; performance: 2/2; unsigned Release device build passes with optimized coverage-free compiler flags and dSYM. See TESTING.md for evidence and limits. Physical Instruments/MetricKit delivery, Cloud execution, and migration release gates remain unverified.


## Internal beta diagnostics — 2026-09-11

Internal-only TestFlight build 1.1.0 (38) uploaded with symbols. Added persistent local operation/lifecycle/delay history and user-initiated Release Settings JSON export, separate from TestFlight's crash-report channel. External beta distribution is unchanged. 49 correctness tests pass, plus final targeted persistence checks. See INTERNAL-TESTFLIGHT.md; actual TestFlight installation/crash-report delivery and MetricKit delivery remain unverified.

- Legacy schema-v8 database compatibility is now fixture-verified: exact React Native tables/indexes, cached fields/settings/rewards/operation metadata and migration history survive native opening; subsequent native writes and failed-upgrade rollback/retry pass. Full suite 74/74. Actual signed old-binary-to-native update remains separate device evidence; see TESTING.md.

- Real iPad upgrade verified (legacy 1.1.0 build 50/schema 7 → native build 61): installation preserved the database, a no-network probe preserved all original legacy values, user confirmed existing login survived, and native relaunch preserved the refreshed cache/settings. Initial refresh transport is unknown despite success diagnostics; user confirmed Wi-Fi off. See UPGRADE-REHEARSAL.md for scope and evidence.

- User reports all basic Live Activity checks passed on a physical phone: Lock Screen/Dynamic Island appearance, queue updates, and removal on logout/empty queue. Exact build not restated (last confirmed phone build 61). No additional fixture/device run required for those checks. Long-duration expiry/background execution and crash/MetricKit delivery remain separate evidence.

### Accessibility and lifecycle follow-up — 2026-09-11

76/76 correctness tests pass, including foreground refresh throttling and member-aware deep-link routing. Rewards ring labels now move below the ring at accessibility sizes; queue Delete labels identify their beer. Maximum-text Rewards confirmation now uses an alert with reachable Queue/Cancel choices. Offline Maestro checks passed reward scrolling/cancel and Settings refresh/diagnostic-control reachability. Spoken VoiceOver, runtime Reduce Motion, physical Live Activity expiry/authorization/force-quit, Split View and minimum OS remain open; these simulator checks do not close those gates.

Reduce Motion follow-up: actual iOS setting visibly enabled on the isolated simulator; card expansion/collapse, filtering/sorting, tabs and Settings navigation all passed. This is interaction coverage, not a frame-by-frame motion audit. Remaining hands-on checklist: [DEVICE-ACCESSIBILITY-CHECKS.md](DEVICE-ACCESSIBILITY-CHECKS.md).

Tablet Home follow-up: account/progress and Explore now occupy two columns from 768 points, with larger navigation cards; phone/narrow/accessibility layouts stay stacked. Offline simulator portrait/landscape navigation and phone screenshot checked; build passed.

Tablet Home revision: user rejected the side-by-side stack as still half empty. Current design is an account/progress row plus four navigation tiles in a 2×2 grid that fills the remaining height, with existing local counts. User subsequently rejected the oversized tiles as empty in a different way; retain as unfinished checkpoint work. Content-focused redesign proposed but not implemented. No distribution.

Tablet Home content revision: removed oversized tiles/fixed height. Displays six latest taplist beers with expandable details, journey progress, three recent tastings and up to three unclaimed rewards, with compact navigation and full-list links. Uses current local model data; visitor prompt and phone/accessibility layouts retained. User accepted this layout and requested leaving it in this shape. Hands-on checks deferred at user request; distribution remains paused.

### Enrichment review — 2026-09-11

82/82 local tests pass after upfront lookup/sync request reservations and typed batch payload validation. Tested 101 unique beers plus duplicate preservation through seven lookup/sync/follow-up requests; sync never starts if the whole sync chunk set exceeds the remaining budget. Concurrent callers cannot steal reserved slots. Invalid payloads preserve upstream fields, valid nulls remain accepted, and health requires database status. No live Worker verification. Delayed cleanup polling remains open and must not block foreground refresh or bypass the shared rate budget.

### Delayed enrichment handoff — 2026-09-11

88/88 local tests pass. After initial refresh publication/completion, optional polling follows successfully synced pending IDs with at most seven attempts inside a two-minute scheduling window, shared rate budget and 100-ID chunks. Queued cleanup remains pending after ABV-only responses. Current-row enrichment-only writes preserve names/reviews/tasting metadata and timestamps; removed rows are not inserted. Account/store/URL/database/generation guards and cancellation stop stale work. Polling state is not persisted across app restarts and a new refresh supersedes the old task. This is not an OS background execution or live Worker delivery guarantee.

### Enrichment configuration overrides — 2026-09-11

The importer supports EXPO_PUBLIC_ENRICHMENT_TIMEOUT, EXPO_PUBLIC_ENRICHMENT_BATCH_SIZE, EXPO_PUBLIC_ENRICHMENT_RATE_WINDOW and EXPO_PUBLIC_ENRICHMENT_RATE_MAX. Millisecond durations become seconds; absent/invalid/nonpositive values retain 15-second timeout, 100-ID lookup batches and 10 requests/60 seconds. Counts must be positive integers and lookup batches are capped at the Worker limit of 100. Sync retains its separate 50-row limit. Initial/follow-up/poll lookups share the configured batch size and reservation budget; the fallback 429 cooldown uses the configured window. Enrichment has a separate URLSession resource timeout so overrides do not alter member request timeouts. URLRequest timeout is an idle timeout; no exact wall-clock cancellation timing is claimed. Existing ignored configuration must be re-imported to pick up environment changes.

90/90 local correctness tests passed (`/private/tmp/BeerSelectorNative-enrichment-config-final-tests.log`), including parsing/defaults, custom chunk boundaries, effective timeout and budget expiry. An isolated importer fixture verified the four supported mappings and omission of unrelated keys. Broader proxy/health quota validation, Retry-After handling and live Worker checks remain open.

### Proxy/health contract and server cooldowns — 2026-09-11

96/96 local correctness tests passed (`/private/tmp/BeerSelectorNative-enrichment-contract-tests.log`). Proxy validation now requires the checked-in contract's brewer and nullable enrichment fields and validates optional envelope/row fields before parsing; native retains its ABV range guard. Health accepts absent quota details and validates complete, correctly typed details when present. Quota values are not newly displayed in Settings.

Enrichment honors Retry-After seconds or HTTP dates on 429 and on 503 with a valid header ([HTTP semantics, RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)). Invalid/missing 429 values fall back to the configured rate window; zero/past dates do not bypass local reservations. Concurrent responses cannot shorten an existing cooldown; reset does not clear it. Fixture tests cover these rules without real sleeps or live requests. Other API retry behavior is unchanged. Live Worker verification and deferred migration/device gates remain open.

### Live Worker attempt and compatibility follow-up — 2026-09-11

Live health request blocked by Cloudflare HTTP 403/error 1010 before Worker contract verification. No live proxy/batch/sync/polling claim; site-owner action required. See WORKER-VERIFICATION.md.

104/104 local correctness tests and the signed Release device build pass. Account epoch guards protect reward/delete completions; queue request ownership permits a new login's queue to load independently of the previous account. Cancellation and combined schema-v8/Expo Keychain fixtures extend existing migration coverage. Final fixtures isolate Live Activity updates after initial runs exposed an unregistered-background-task assertion. UPGRADE-REHEARSAL.md retains the already-completed physical build-50 upgrade and documents current signing identity continuity; a new physical rehearsal was not performed.
