# Physical iPhone profiling — 2026-09-11

Status: useful performance evidence captured; user-reported app exits remain unresolved.

## Build and recording

- Base commit `0e64a6d7`; one additional numeric-only `URLSession Task` signpost in Diagnostics.recordTask is installed and uncommitted.
- BeerSelectorProfile Release, signed development build, iPhone 17 Pro / iOS 26.6.1. Build passed with `-O`, whole-module optimization, `-g`, dSYM and no coverage flags. Build log `/private/tmp/BeerSelectorNative-profile-phone.log`; derived data `/private/tmp/BeerSelectorNative-profile-phone`.
- Installed in place, preserving account and cache. A private local SQLite copy showed zero pending/interrupted check-ins before launch; the copy was deleted. No check-in, reward or queue deletion was performed.
- Time Profiler + os_signpost + Hangs + Hitches, 45-second launch recording. User was asked to refresh, scroll All Beers and switch tabs. The trace contains three completed refresh intervals; exact gestures were not independently recorded.
- Trace `/private/tmp/BeerSelectorNative-phone-refresh-ready.trace`; record log `/private/tmp/BeerSelectorNative-phone-refresh-ready-record.log`. Raw artifacts remain private/local and are not committed.

## Observations

| Measurement | Observed result |
| --- | --- |
| Completed refresh intervals | 3: 842.231, 891.821, 906.297 ms; all successful |
| URLSession task metric callbacks | 14; durations approximately 66–593 ms; no redirects reported |
| Instrumented parsing | 10 intervals; maximum 3.426 ms |
| Instrumented transactions | 10 intervals; maximum 0.933 ms |
| Operation interval balance | All 39 begins have matching ends |
| HTTP operation outcomes | 13 successes, 1 failure; all three refreshes succeeded |
| Hangs table | 0 events at the configured 250 ms threshold |
| Hitches table | 0 events |
| CPU samples | 6,057; 5,689 ms of sample weight on Main Thread; samples continue to 45.886 s |

The initial HTTP failure precedes the first refresh. Fixed-label telemetry does not identify its endpoint or error, so its cause is not established. A failed HTTP operation is not itself an app crash. Transaction timings on this capture are small and do not establish cold/full-taplist replacement cost; the earlier 1,000-row simulator experiment remains a separate workload.

CPU leaf samples are led by AttributeGraph update/dirty propagation and SwiftUI-related work. AppModel.performRefresh appears in roughly 45 ms of inclusive sample weight; these are sampled CPU observations, not elapsed refresh durations or a performance budget. No change to SwiftUI rendering or account logic is justified by this short trace alone. Empty detector tables are limited to this recording; they do not certify all interactions or exclude short stalls.

Exports: `/private/tmp/BeerSelectorNative-phone-signposts.xml`, `BeerSelectorNative-phone-cpu.xml`, `BeerSelectorNative-phone-hangs.xml`, `BeerSelectorNative-phone-hitches.xml`.

## Reported exits — open investigation

User reported one, possibly two apparent crashes while refreshing/profiling. No BeerSelector crash reports were found in device systemCrashLogs (including retired entries) or local CrashReporter/DiagnosticReports during this inspection. No recent Jetsam report coincided with this session. The recorded process (24596) was sampled through the end of the trace; a later process inventory showed BeerSelector running as 24609. This proves a process change, not its cause. Profiling-controlled launch/stop and genuine app termination must be distinguished; do not classify the reported exits as fixed or disproven.

User clarified: the initial full refresh appeared frozen; they exited and reopened the app. A separate apparent crash occurred while scrolling and tapping with the profiler running. This explains at least one user-initiated restart but does not establish the cause of the later exit. Rechecking device crash reports still found no BeerSelector report or contemporaneous Jetsam report. The phone was subsequently locked; attachment reproduction is pending user readiness. Next reproduction should attach to the already-running process, record the exact exit time, and retrieve any new device crash/termination report. Avoid an intentional relaunch while testing this symptom.

## Tooling failures and limits

The first recording attempt, before the user said ready, was blocked by the locked phone. `/private/tmp/BeerSelectorNative-phone-refresh.trace` has no run data and is not evidence.

The Mac's xctrace exporter repeatedly crashed in Objective-C object release/forwarding while opening the valid later recording. These were host-tool crashes, not BeerSelector crash reports. Exporting one table at a time with process-local `MallocNanoZone=0` recovered signposts, hangs and CPU samples; adding `MallocStackLogging=1` recovered the hitch table. `NSZombieEnabled=YES` recovered the table of contents but did not reliably recover data tables. These environment changes applied only to the Mac exporter, never the phone app or recording. Some frames remain unsymbolicated; do not infer an exhaustive hotspot analysis.

Real URLSessionTaskMetrics callback delivery is now verified. Real MetricKit daily payload delivery remains unverified; no claim is made from subscriber compilation/registration alone. Keep personal data and raw trace details out of commits and reports.


## Measured sorting issue addressed — 2026-09-11

The CPU export includes 164 ms of inclusive sample weight in BeerFilter.apply and 51 ms in DateFormatter-related frames. Code inspection showed tasted-date parsing inside each sort comparison and multiple evaluations of the filtered/sorted list within a SwiftUI body update. This is a concrete responsiveness cost, not a proven explanation of the initial full-refresh freeze or scrolling crash.

Added an opt-in 200-row synthetic tasted-date performance measurement. Before change, optimized simulator clock samples averaged 87.449 ms (five samples, ~2% variation). Precomputing each date key once reduced the mean to 2.838 ms (about 31x faster, ~2.3% variation). The view now computes its filtered list once per body evaluation. No shared mutable formatter or global cache was added. Calendar ordering, original order for equal/missing/malformed dates, and ABV ordering are retained.

Validation: 44/44 correctness tests pass (`/private/tmp/BeerSelectorNative-sort-regressions.log`), including the added tie/missing-date contract. One performance test passed before/after (`BeerSelectorNative-sort-before.log`, `BeerSelectorNative-sort-after.log`). Signed Release device build passes with optimization, dSYM and no coverage flags (`BeerSelectorNative-profile-phone-sort.log`). The new build is prepared at `/private/tmp/BeerSelectorNative-profile-phone/Build/Products/Release-iphoneos/BeerSelectorNative.app` but has **not been installed**, so the phone retains the version used in the original recording for the next crash reproduction. No claim of a crash fix or a new physical speed measurement is made. Changes remain uncommitted.


## Attach-only reproduction — 2026-09-11

User confirmed the earlier apparent crash returned to the iPhone Home Screen. The initial refresh freeze led them to exit and reopen manually; the later Home Screen exit during scrolling/tapping is a separate unresolved event.

Attached Time Profiler + os_signpost + Hangs + Hitches to the existing BeerSelectorNative process for 60 seconds. Initial numeric-PID attachment failed to find the process; attachment by name immediately afterward succeeded against the same PID 24609. No launch, termination, install, or app-data changes were performed for this run. User repeated refresh/scroll/tap interactions and explicitly reported that **everything behaved normally**.

- Two successful refreshes: **1,069.745 ms** and **625.499 ms**.
- Six URLSessionTaskMetrics callbacks; all six HTTP intervals succeeded.
- All **18 operation intervals balanced** (6 network, 6 transaction, 4 parsing, 2 refresh).
- Maximum measured parsing: **2.408 ms**; transaction: **1.115 ms**.
- Hangs and Hitches tables: **zero rows**. The hang detector remains configured at 250 ms.
- Seven process checks during the reproduction and the post-detach check all showed the same PID 24609. The app stayed alive after the profiler detached.
- No new BeerSelector crash report or contemporaneous Jetsam report was found.

Trace: `/private/tmp/BeerSelectorNative-phone-attach-repro.trace`; record log `BeerSelectorNative-phone-attach-repro.log`; exports `BeerSelectorNative-attach-signposts.xml`, `BeerSelectorNative-attach-hangs.xml`, `BeerSelectorNative-attach-hitches.xml`; process observations `BeerSelectorNative-attach-process-monitor.jsonl` and `BeerSelectorNative-attach-process-after.json`, all under `/private/tmp`. Exports again required exporter-local allocator/zombie workarounds; no recording/app runtime settings were altered by those workarounds.

Conclusion: normal behavior reproduced under attach-only profiling on the existing phone build, with real network timing delivery confirmed. This does not identify or fix the earlier Home Screen exit, nor prove the initial full-download freeze is gone. The sorting optimization remains built/tested locally and **not installed** on the phone; this successful recording must not be attributed to that optimization. If the exit recurs, capture its exact time and fresh device reports before relaunching where practical. MetricKit daily delivery and a true cold/full taplist performance pass remain unverified. No additional recording is requested by the delayed replies to the earlier readiness questions.
