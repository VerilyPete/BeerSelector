# Migration checkpoint — 2026-09-10

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
