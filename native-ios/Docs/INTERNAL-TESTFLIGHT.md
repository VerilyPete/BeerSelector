# Internal TestFlight diagnostics

## Build 61 uploaded — 2026-09-11

User authorized completing the rollback task and proceeding to the next step while away. Committed the rollback guard as **35dab101**, then archived and uploaded **1.1.0 (61)** to internal-only TestFlight. Includes the credential-save fix from **f777ad21**. Full correctness suite **65/65 passed**; signed Release archive succeeded. Effective export flags verified: testFlightInternalTestingOnly=true, uploadSymbols=true, manageAppVersionAndBuildNumber=false. Xcode reported **Upload succeeded / EXPORT SUCCEEDED**; Apple processing has begun. Processing completion/internal-group assignment are not independently verified. No external testers, builds, groups or review submissions changed.

Archive retained at `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-61.xcarchive`, with source zip and `build61-evidence.json` alongside it, all ignored. App dSYM UUID **94D26D69-AE2A-33BF-9917-8C3CACC048E0**; widget **6C1D82BA-00D0-3D2B-8DFB-711F88B2A046**. Both archive bundle versions verified as 61 with matching binary/symbol UUIDs. Logs: `/private/tmp/BeerSelectorNative-internal61-archive.log` and `/private/tmp/BeerSelectorNative-internal61-upload.log`. Preserve separate symbols for builds 38 and 60.

Next user check: install build 61 through TestFlight when ready, then normal login/logout, Refresh All Data and reopening cached lists. The user already confirmed these basic flows on build 60. No manual storage failure is needed; automated tests cover those cases. Updated local WhatToTest.en-US.txt notes were prepared after archiving and have not been applied to App Store Connect group metadata. Further development priorities remain overlapping logout/login cleanup and full legacy schema upgrade coverage. The earlier phone exit is still not attributed to these fixes. Next distribution number must be at least 62.

## Build 60 uploaded — 2026-09-11

Committed account-safety fix as `3eb06ad0` and uploaded **1.1.0 (60)** successfully. Xcode reported **Upload succeeded / EXPORT SUCCEEDED** and Apple package processing began. Effective export settings verified: `testFlightInternalTestingOnly=true`, `uploadSymbols=true`, `manageAppVersionAndBuildNumber=false`. App and widget archive versions are both 1.1.0 (60), with matching executable/dSYM UUIDs. No external groups/builds/testers or beta review submissions were changed. Processing completion and internal-group assignment are not independently verified; use the existing internal group if manual assignment is needed.

Full pre-upload correctness suite: **56/56 passed**, including seven account-safety cases. Signed Release archive passed. Retained archive: `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-60.xcarchive`; source snapshot and `build60-evidence.json` alongside it are ignored. App dSYM UUID `CC76A5E4-9C6A-3E67-A4B7-4B8968030B4F`; widget UUID `6C1D82BA-00D0-3D2B-8DFB-711F88B2A046`. Logs: `/private/tmp/BeerSelectorNative-internal60-archive.log` and `/private/tmp/BeerSelectorNative-internal60-upload.log`. Preserve build 38's separate symbols for its reports.

Next: install build 60 through TestFlight after processing and verify logout/login/refresh on the phone. The earlier freeze/Home Screen exit remains unexplained; this build fixes a separately reproduced account-switch refresh bug. External testing stays unchanged. Build 60 has now been used; reserve the next build using Scripts/bump-build-number.py before a subsequent distribution archive.

## Installed build and numbering correction — 2026-09-11

User confirmed build **38** installed through TestFlight and shared its diagnostic report successfully. The retained 128 entries cover 09:26:43–09:28:50 CDT: 49 successful completions, refreshes of 2.034 s and 1.173 s, no main-thread delay events, and no unmatched retained operation starts. This verifies local export/sharing, not Apple's crash-report delivery.

The previous 1.1.0 release was **59**, as confirmed by the user. The legacy React Native project's Release build-number increment phase was not migrated. The native source is now **60**, shared by the app and widget; no replacement archive or upload has been made. Build 38's archive/symbols remain unchanged. Native numbering is explicit rather than incremented during ordinary Release/profile runs.

## Uploaded build — 2026-09-11 (historical upload record)

**BeerSelector 1.1.0 (38)** was uploaded successfully to App Store Connect app **6744178536**, team N9F7839KSX. Apple's uploader reported “Uploaded package is processing” and “Upload succeeded”; `xcodebuild -exportArchive` finished with EXPORT SUCCEEDED. Actual uploaded version/build were verified in ContentDelivery's build request.

The effective export options included `testFlightInternalTestingOnly=true`, `uploadSymbols=true`, `method=app-store-connect`, and `destination=upload`. Apple restricts such builds to internal tester groups; they cannot be submitted to external TestFlight or the App Store. No existing external builds, groups, testers, public links, or beta-review submissions were changed. Internal tester-group assignment and post-processing readiness have not been independently verified; the CLI upload is not evidence that every internal tester can already install it.

[Open this app's TestFlight page](https://appstoreconnect.apple.com/apps/6744178536/testflight/ios). Once processing completes, look for build 38's **Internal** indicator. If it is not automatically assigned, select an existing group under **Internal Testing** and add build 38. Do not use External Testing or change existing group membership. Prepared test notes are in `TestFlight/WhatToTest.en-US.txt`; they have not been uploaded as group metadata by this session. Install through TestFlight for Apple's beta crash-reporting flow; the previous directly installed phone build is not automatically replaced by uploading.

Apple references: [Internal testers and internal-only restrictions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers), [distribution options](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases), [crash reports](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs).

## What is collected

TestFlight provides Apple's crash-report/feedback channel; no custom signal handler or remote reporting backend was added. Preserve the matching archive/dSYMs to analyze its crash stacks. MetricKit is registered, but its payload handler still retains only numeric counts/CPU totals, not raw diagnostic stacks; physical MetricKit delivery remains unverified.

The app now keeps a separate local JSON diagnostic history, available in Release Settings → Support:

1. After a freeze or unexpected exit, reopen the app and select **Prepare Diagnostic Report**.
2. Select **Share Diagnostic Report** and choose the destination yourself. Preparing a file does not upload it.
3. **Clear Diagnostic History** removes retained history and the prepared export; subsequent app activity can create new entries.

The history includes at most 128 recent entries across launches: random process-session/interval identifiers, app version/build, timestamps, fixed lifecycle/operation names, outcomes, durations, network metric counters, MetricKit summary counts, and sustained foreground main-thread delay/recovery events. No member identity, cookies, keys, URLs, request/response bodies, raw exceptions, or raw MetricKit payloads are recorded. This is a rotating recent history, not a complete recording of every prior session.

A serial utility queue performs bounded-history updates and coalesces atomic file writes (250 ms). Explicit export/background flushes cancel pending writes and flush without blocking MainActor. Files are excluded from backup and protected until the first unlock. An abrupt kill can lose the latest buffered events. Corrupt/oversized history is ignored so it cannot prevent app startup. A main-thread heartbeat runs only while active, probing roughly once a second and reporting a pending main-thread response after at least two seconds; this is best-effort delay detection, not a crash classifier. Background/inactive transitions invalidate old probes. An unfinished operation is never labeled proof of a crash.

The export should be combined with TestFlight feedback and the approximate event time. It may help explain a user-killed freeze for which no crash stack exists, but it does not guarantee diagnosis of every termination.

## Validation and reproducibility

- Full suite: **49/49 tests pass**, including persistent restart recovery, operation outcome correlation, retention/clear behavior, corrupt-data recovery and deterministic main-thread delay/recovery rules. Log `/private/tmp/BeerSelectorNative-internal-diagnostics-tests.log`.
- After refining flush scheduling/background flushing: targeted **5/5 DiagnosticJournalTests** pass, log `/private/tmp/BeerSelectorNative-internal-journal-final.log`.
- Archive succeeded through BeerSelectorProfile Release with `-O`, whole-module optimization, no coverage flags, and app/widget dSYMs. Log `/private/tmp/BeerSelectorNative-internal-archive.log`.
- Matching app executable/dSYM UUID: `B4A2F4C7-0157-3D10-A0D3-3F57FC906FFD` (arm64).
- Retained archive: `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-38.xcarchive` (ignored; includes the app configuration and must not be committed).
- Successful upload log: `/private/tmp/BeerSelectorNative-internal-upload-retry.log`. Distribution logs: `/private/var/folders/qf/fq1jmj9n3y10c_sw_nr1_9jh0000gn/T/BeerSelectorProfile_2026-09-11_09-13-54.146.xcdistributionlogs`. Distribution logs may contain authentication-related data; do not publish or broadly dump them.
- Initial upload failed during packaging because Apple's rsync spawned an incompatible Homebrew rsync. Upload script now pins PATH to Apple's system tools. The failed attempt did not upload a package; the retry succeeded.
- Settings support text and Prepare Diagnostic Report control were inspected with offline simulator fixtures. The simulator's pending deep-link confirmation overlay limited the visual inspection; shared-file behavior is covered by integration tests, not a completed on-device share-sheet test.
- Includes the earlier measured sorting optimization (200-row optimized simulator mean 87.449 ms → 2.838 ms). The earlier Home Screen exit/initial refresh freeze remain unresolved. The successful attach-only phone run used the older build and is not evidence that the uploaded optimization fixed the crash.

## Future internal uploads

Build **60** has been uploaded. Before each later distribution archive, increment the shared CURRENT_PROJECT_VERSION in project.yml above the latest uploaded build (including legacy/external builds), regenerate with XcodeGen, run the correctness suite, and create a fresh Release archive through BeerSelectorProfile. Keep secrets in ignored Resources/ServiceConfiguration.plist.

Upload with:

```sh
native-ios/Scripts/upload-internal-testflight.sh /absolute/path/to/BeerSelectorNative.xcarchive
```

The script refuses to run without the internal-only option, symbol upload, the expected bundle ID, and app dSYM. It also rejects build numbers below 60 and requires upload-time renumbering to be disabled. Keep the archive and uploaded build number identical; verify the resulting number. This script uploads only and never edits tester groups or submits beta/App Store review. Distribution/InternalTestFlight.plist is deliberately unsuitable for external release.

### Build-number maintenance

Build 60 has been uploaded. For the following distribution archive, run `native-ios/Scripts/bump-build-number.py` once from the repository root (or invoke its absolute path). It increments the single shared XcodeGen setting, enforces a floor of 60, and regenerates the project for both app and widget. XcodeGen must be installed; generation failure restores the prior source setting and attempts project restoration. Review and commit project.yml and project.pbxproj together. Check the latest uploaded build across native and legacy releases first; the local script does not query App Store Connect or coordinate concurrent release branches. Routine Run, Profile, Test and Archive actions do not mutate source versions. Failed archives can reuse their reserved number until it has been uploaded.
