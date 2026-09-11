# Release-readiness review — 2026-09-11

Reviewed source: `c7ab30c7` on `migration/native-swiftui`, plus documentation updates. Distribution remains paused. Installed internal build 61 predates the later logout/login cleanup fixes; the next distribution number is 62. This review neither certifies an external release nor requires repeating user-confirmed device checks.

## Evidence and remaining gates

| Area | Established evidence | Remaining acceptance evidence |
| --- | --- | --- |
| Correctness/account safety | 74/74 local tests, including credential failure/rollback, account refresh isolation, serialized logout/login and visitor cleanup | Actual Cloud run on the reviewed source; device smoke check of the newer cleanup code when distribution resumes |
| Upgrade | Exact schema-v8 fixtures; actual iPad build 50/schema 7 → native 61 in-place upgrade; user-confirmed retained account; separate real-database no-network probe; persistent relaunch | No repeat of the basic upgrade rehearsal needed; evidence does not certify every historical schema |
| Phone behavior | User-confirmed login/logout/refresh; basic Live Activity appearance, updates, removal on logout/empty | Disabled activity authorization, long-duration/background cleanup, force-quit/foreground and deep-link cases are not all established by that report |
| Crash reporting | Internal TestFlight installation and JSON sharing confirmed; symbols retained for builds 38/60/61 | Retrieve a real Apple report for a known event/build and resolve its app frames with matching symbols; original Home Screen exit remains unexplained |
| MetricKit | Retained subscriber registered at normal launch; numeric payload summaries implemented | Actual device payload receipt; simulator tests or injected payloads cannot establish Apple's delivery |
| Broader parity | Approved chrome and existing fixture screenshots; API/persistence regression coverage | Accessibility (VoiceOver, large text, Reduce Motion), iPad rotation, minimum-supported OS runtime; unresolved enrichment rate/chunk/polling behavior and explicit live visitor/reward/delete evidence |

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

1. Make the current source available to a verified test-only Cloud workflow and obtain its first recorded result.
2. Inspect Apple's crash/feedback view for existing reports; retain the unresolved original incident if none is available.
3. Close accessibility/device lifecycle and remaining behavior gaps before external release. Package internal build 62 only after distribution resumes.

Supporting records: [TESTING.md](TESTING.md), [UPGRADE-REHEARSAL.md](UPGRADE-REHEARSAL.md), [INTERNAL-TESTFLIGHT.md](INTERNAL-TESTFLIGHT.md), [PARITY.md](PARITY.md).
