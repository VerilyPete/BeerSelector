# Release-readiness review — 2026-09-11

Reviewed source: `c7ab30c7` on `migration/native-swiftui`, plus documentation updates. Distribution remains paused. Installed internal build 61 predates the later logout/login cleanup fixes; the next distribution number is 62. This review neither certifies an external release nor requires repeating user-confirmed device checks.

## Cloud gate closed — 2026-09-11

[Native Correctness build 22](https://appstoreconnect.apple.com/teams/867cf0b5-1b9a-478f-b7df-8ce81f2ef11e/apps/6744178536/ci/builds/6f36cee7-d8cf-40b8-ae7d-c8a7ef805502) passed **74/74 tests** at pushed commit f11d8a79. Xcode 26.3; macOS 26.3; iPhone 17 Pro / iOS Simulator 26.3.1. Zero reported errors, failures or warnings. Workflow is testing only, restricted to migration/native-swiftui; distribution remains paused. User explicitly approved the public source push. This supersedes the pre-setup Cloud findings below. Build 23 was a canceled duplicate. See TESTING.md for artifact scope.

## Crash-channel update — 2026-09-11

Organizer retrieved a legacy build-53 TestFlight crash; matching archived dSYM and independent atos frame resolution verify Apple's delivery/symbolication channel for this app. Native builds 38/60/61 each show No Crash Logs in the selected two-week window. Native incident diagnosis and MetricKit delivery remain open; see INTERNAL-TESTFLIGHT.md. No forced crash or distribution occurred.

## Evidence and remaining gates

| Area | Established evidence | Remaining acceptance evidence |
| --- | --- | --- |
| Correctness/account safety | 74/74 local tests, including credential failure/rollback, account refresh isolation, serialized logout/login and visitor cleanup | Cloud run passed; device smoke check of the newer cleanup code when distribution resumes |
| Upgrade | Exact schema-v8 fixtures; actual iPad build 50/schema 7 → native 61 in-place upgrade; user-confirmed retained account; separate real-database no-network probe; persistent relaunch | No repeat of the basic upgrade rehearsal needed; evidence does not certify every historical schema |
| Phone behavior | User-confirmed login/logout/refresh; basic Live Activity appearance, updates, removal on logout/empty | Disabled activity authorization, long-duration/background cleanup, force-quit/foreground and deep-link cases are not all established by that report |
| Crash reporting | Internal TestFlight installation and JSON sharing confirmed; symbols retained for builds 38/60/61 | Retrieve a real Apple report for a known event/build and resolve its app frames with matching symbols; original Home Screen exit remains unexplained |
| MetricKit | Retained subscriber registered at normal launch; numeric payload summaries implemented | Actual device payload receipt; simulator tests or injected payloads cannot establish Apple's delivery |
| Broader parity | Approved chrome and fixture screenshots; restored tablet grid verified in portrait/landscape, largest-text beer-list, Rewards cancellation and Settings-control interactions passed; Reduce Motion enabled interaction checks passed; 88/88 local correctness tests including foreground/deep links and enrichment chunk/budget/payload/polling regressions | Accessibility (spoken VoiceOver/focus, remaining large-text screens, motion quality), Split View, minimum-supported OS runtime; live enrichment delivery, configuration overrides and remaining proxy/health contract parity and explicit live visitor/reward/delete evidence |

Existing live tests must retain their original scope: a general “all pass” response to the basic Live Activity request does not certify unrelated reward or account-switch scenarios. Older pending labels in the detailed parity ledger are historical where superseded by this table and linked evidence.

## Xcode Cloud finding and next action

Authenticated GitHub API access to `VerilyPete/BeerSelector` succeeded. The migration branch lookup returned “Branch not found” (404), and the current commit check-runs lookup returned “No commit found” (422). Thus this source is not available to Cloud in the configured origin. This does not prove that no workflow exists for a different branch/product. No authenticated App Store Connect workflow/run inventory was available through the current tools.

Local preparation is present: checked-in project/shared scheme, All plan with isolated test-host environment, and executable `native-ios/ci_scripts/ci_post_clone.sh` adjacent to the project. The hook supplies an empty service plist only when absent. Its location agrees with [Apple's custom script requirements](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts). Prior clean-checkout/hook checks remain local evidence, not a Cloud success.

The concrete next Cloud step is to publish the reviewed migration branch and configure/inspect a **test-only** workflow:

1. Select `native-ios/BeerSelectorNative.xcodeproj`, shared `BeerSelectorNative` scheme, Debug Test action, All plan and an available iPhone simulator. Pin Xcode 26.3 if offered; record any different toolchain.
2. Include the migration branch/native paths. Inspect workflow actions and post-actions before enabling a trigger: no archive, TestFlight distribution or release post-action during the distribution pause. No production service key is needed.
3. Run against the exact pushed commit. Save the run URL/ID, commit SHA, toolchain/runtime, hook log, expected **74 correctness tests**, result bundle and coverage. Investigate count mismatches and failures without retry-until-pass.
4. Only mark this gate passed from the actual successful run. See [TESTING.md](TESTING.md) and [Apple workflow setup](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow).

No push, workflow creation, Cloud run or distribution was performed during this review.

## Crash-report delivery finding and next action

Checked local Xcode Products/Crashes and macOS/device crash-log caches; no BeerSelector crash report was found. This is a local cache result, not a query of Apple's server or a fresh device log download. The supplied build-38 JSON has 128 entries and zero MetricKit journal entries; the retained iPad first-launch journal has 47 entries and zero MetricKit entries. These bounded windows cannot prove a payload was never delivered.

[Apple documents automatic crash sharing for TestFlight installations](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs). The separate Settings JSON export contains recent operation context, not crash stacks. Current MetricKit handling discards raw diagnostic payloads and cannot replace a symbolicated Apple crash report. Its persistent `metricReports` entry stores diagnostic count and CPU seconds; the separate metric payload count is only in the session aggregate. Do not interpret a zero journal count as “no metric payload.”

The next read-only check is Xcode Organizer → Crashes for BeerSelector and the relevant internal version/build, plus TestFlight crash feedback in [App Store Connect](https://appstoreconnect.apple.com/apps/6744178536/testflight/ios). If a report exists, retain its event time, build, exception/termination details and binary UUID, then use the matching archived dSYM to resolve application frames. A report with readable app frames is the required delivery/symbolication evidence. If absent, leave delivery unverified; use a device diagnostic log for a recurrence and export the app JSON promptly after reopening. A pre-TestFlight local installation's exit is not evidence for the TestFlight channel.

No forced crash, debugger termination, phone installation, or tester message was performed. Deliberate crash testing would be a separate controlled task; it is not needed to complete this review. MetricKit delivery remains a separate gate even if an Apple crash report is found.

## Recommended order

1. Completed: published source and verified test-only Cloud build 22 (74/74).
2. Completed Organizer inspection and legacy-report symbolication; retain the unresolved native incident and inspect any future report.
3. Close accessibility/device lifecycle and remaining behavior gaps before external release. Package internal build 62 only after distribution resumes.

Supporting records: [TESTING.md](TESTING.md), [UPGRADE-REHEARSAL.md](UPGRADE-REHEARSAL.md), [INTERNAL-TESTFLIGHT.md](INTERNAL-TESTFLIGHT.md), [PARITY.md](PARITY.md).

Remaining hands-on steps: [DEVICE-ACCESSIBILITY-CHECKS.md](DEVICE-ACCESSIBILITY-CHECKS.md).
