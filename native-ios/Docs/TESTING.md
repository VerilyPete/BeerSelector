# Native test strategy and Xcode Cloud setup

The suite tests observable behavior and real local boundaries. XCTest remains the runner: rewriting working tests into another framework would not increase confidence. Apple supports XCTest and Swift Testing side by side, so new parameterized suites can adopt Swift Testing when it provides a concrete benefit. No external testing library is required for the current suite.

## What runs

| Plan | Scope | Boundary |
| --- | --- | --- |
| Unit | BeerRuleTests + DiagnosticsTests | Filtering, sorting, parsing, origin rules, display-only ABV; no database or network calls |
| Integration | PersistenceIntegrationTests + NetworkTests | Real SQLite and simulator Keychain; real URLSession/HTTP parsing with in-process URLProtocol responses |
| All (default) | Both, excluding PerformanceTests | Pull-request gate and local full regression run |

The three correctness plans use randomized order, coverage, English/US locale, and test timeouts. Targets allow parallel execution. The separate Performance plan disables coverage and parallel execution. Unit rules currently still use the iOS app test host; they do not require service credentials. Extracting a hostless Swift package is a future speed improvement only if measured startup cost warrants it.

Each network test owns its HTTP script and URLSession. Unscripted requests fail locally. Database files and Keychain keys use unique temporary namespaces. AppModel tests disable the real connectivity monitor; the test host suppresses app startup, foreground work and background registration. These tests never need a live account or production API key. Real OS integration is intentional for persistence compatibility; it is not presented as a pure unit test.

## Farley's eight properties, applied

| Property | Rule in this repository |
| --- | --- |
| Understandable | Name the user-visible rule or failure being prevented; use concrete fixture names. |
| Maintainable | Assert results, persisted state and externally visible requests, rather than private helper invocation sequences. |
| Repeatable | No live backend, connectivity callbacks, personal Keychain namespace, or date-dependent expected output. |
| Atomic | A fresh database/credential namespace and per-session HTTP handler; clean up every test. |
| Necessary | Each new test must name a plausible regression it catches. No tests for trivial accessors or decorative SwiftUI structure. |
| Granular | One behavioral outcome; several assertions are appropriate when they jointly establish that outcome. Split unrelated assertions. |
| Fast | Small fixtures, bounded asynchronous waits, separate unit/integration plans. OS integration remains intentional. |
| First | New behavior/fixes start with a failing test; existing-code characterization is explicitly not retroactively called TDD. |

Do not invent a numerical “Farley score.” Review evidence. Coverage shows unexecuted paths; it does not establish correct assertions.

Audit corrections: HTTP tests previously shared one static handler; AppModel tests started NWPathMonitor; the missing-chunk test actually failed on a missing session first. Those are corrected. The old native database round-trip and Keychain save/load tests are now named honestly; a separate test writes the legacy Expo binary account/service/marker format directly for each of the three supported services.

New integration cases protect foreign-member/store operation replay and partial refresh preservation. Do not replace SQLite or Keychain with mocks in their compatibility tests. Precise login callback timing, injected Keychain write failures, the complete RN schema-v8 upgrade, enrichment rate/polling contracts, and device Live Activities remain additional work, not claims made by this suite.

## Local execution

Open `BeerSelectorNative.xcodeproj`, choose the shared `BeerSelectorNative` scheme, select a test plan and an isolated simulator, and use Product → Test (Command-U).

From the repository root:

```sh
export BEERSELECTOR_TEST_DESTINATION='platform=iOS Simulator,name=BeerSelector UI Review'
native-ios/Scripts/run-tests.sh
BEERSELECTOR_TEST_PLAN=Unit native-ios/Scripts/run-tests.sh
BEERSELECTOR_TEST_PLAN=Integration native-ios/Scripts/run-tests.sh
```

Use a simulator available on your Mac; no developer-specific UDID is embedded in the scripts. The shell wrapper uses ad hoc simulator signing because real Keychain tests fail with unsigned test hosts. To check order/process isolation, run All with `-test-iterations 2 -test-repetition-relaunch-enabled YES`. Do not enable retry-until-pass: a flaky failure is a failure.

The generated project and shared plans are checked in. If you add/remove source files, run `xcodegen generate --spec native-ios/project.yml` and include its project changes. CI does not install XcodeGen, Node, CocoaPods or production dependencies.

## Xcode Cloud

Repository preparation is implemented; an actual Cloud workflow/run has not been created or certified.

1. Commit and push the native project, shared scheme, test plans, tests, and `native-ios/ci_scripts/ci_post_clone.sh` to the connected repository.
2. Open the native project in Xcode and use Product → Xcode Cloud → Create Workflow, selecting the existing BeerSelector product/team and repository when prompted.
3. Select the shared `BeerSelectorNative` scheme. Use a Test action with the `All` plan, Debug configuration, and an available iPhone simulator. Start with the same Xcode version as local validation (26.3); pin the workflow version rather than silently tracking a moving latest version.
4. Trigger on pull requests and changes to the migration branch. Include changes under `native-ios/` in any path filter. Require the test action to succeed before merging.
5. The post-clone hook creates an empty, ignored `ServiceConfiguration.plist` only when absent, satisfying the resource reference without production credentials. Do not add API keys to this test workflow. This setup is for testing, not a configured production archive/distribution workflow.
6. Confirm Cloud discovers the hook and plan, reports the expected test count, and retains `.xcresult` and coverage results. Enable a separate periodic iPad/minimum-supported-runtime run when that runtime is offered; do not claim iOS 17.6 runtime certification from a newer simulator.

The test plan supplies `BEERSELECTOR_TEST_HOST=1`. No UUID, local filesystem path, or personal account state is required by Cloud. A fresh checkout build must pass before calling the repository Cloud-ready; the first successful actual Cloud run is a separate acceptance criterion.

## Mutation testing

Mutation testing deliberately breaks production code, then checks whether a test fails. A surviving mutant is an investigation lead; it is not a demand for an arbitrary coverage percentage.

[Muter](https://github.com/muter-mutation-testing/muter) is a Swift-specific option with Xcode project support and targeted-file execution. `native-ios/muter.conf.yml` is prepared for the local wrapper. Muter is not installed or validated in this environment. The source currently has many semicolon-compressed statements, which Muter's documentation identifies as problematic for transformation; narrow its scope and distinguish invalid mutants from survivors before adopting it as a gate. Run broad mutation analysis separately from the fast PR gate.

The repository also has four explicit regression probes, executable without installing a mutation framework:

```sh
python3 native-ios/Scripts/mutation-smoke.py \
  --destination 'platform=iOS Simulator,name=BeerSelector UI Review'
```

The probe runner copies native-ios to a temporary directory, excludes the production plist, supplies an empty one, requires a passing baseline, then changes one rule at a time: unknown ABV ordering, member replay protection, store replay protection, and missing-session rejection. It restores each change in the temporary copy and leaves the working checkout untouched. Logs, result bundles and JSON report stay under its printed artifact directory. Only an actual test failure counts as killed; compile/launch errors and timeouts are separate failures. These four probes are a focused check, not a whole-project mutation score.

Initial mutation evidence found a survivor in unknown-ABV sorting: the original test used only one input order. The test now checks all six permutations in both directions, using expected sorted IDs rather than mirroring the sorting implementation. See the checkpoint for final measured results.

For Muter, first validate its generated/configured test command locally and target only relevant Core files using `--files-to-mutate`. Do not turn on a full Cloud mutation gate until toolchain compatibility, runtime cost, and survivor triage have been measured.

## Sources

- [Dave Farley: TDD — The Properties of Good Tests](https://www.linkedin.com/pulse/tdd-properties-good-tests-dave-farley-iexge/)
- [Apple: XCTest](https://developer.apple.com/documentation/xctest/)
- [Apple: Swift Testing](https://developer.apple.com/xcode/swift-testing/)
- [Apple: Configure your first Xcode Cloud workflow](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow)
- [Apple: Custom build scripts](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts)
- [XcodeGen: Test plans and scheme configuration](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md)

## Measured verification — 2026-09-10

- Unit plan independently passes 11 tests (~0.01s); Integration independently passes 23 (~2.2s), excluding build/test-host startup.
- 34 tests pass on Xcode 26.3 / iOS simulator 26.3.1. All 34 passed twice with parallel workers and process relaunch (68 successful executions); xcresult `/private/tmp/BeerSelectorNative-parallel-repeat.xcresult`.
- A separate clean temporary copy with no production configuration passed the baseline, then all four explicit regression mutations were killed by their intended tests. The ABV mutant initially survived and was killed after strengthening input-order coverage. Final report: `beerselector-mutations-brgi9fu0/report.json` under the macOS temporary directory.
- Approximate executable-line coverage: Database 90%, Credentials 99%, API 84%, Models 85%, Enrichment 91%, AppModel 50%, LiveActivityController 19%. Compressed multi-statement lines can inflate these figures; they are not branch coverage or correctness scores.
- Cloud post-clone hook was exercised with an absent configuration and an existing sentinel file: it creates an empty plist and preserves existing content. Actual Xcode Cloud execution remains pending.

Historical profiling status at that checkpoint (superseded below): the scheme had a Profile action and can use Instruments; test plans collect coverage, and enrichment has basic counters. There are no structured app operation signposts or a validated performance baseline yet. This test work does not claim to have added them.

## Instrumentation/profiling wiring audit — 2026-09-10

Inspection only; no profiling implementation or device recording performed.

- Profile action selects Release and the app executable. Effective settings are `-O`, whole-module compilation, and `dwarf-with-dsym`. Local Instruments templates include Time Profiler, SwiftUI, Swift Concurrency, Allocations, Network and Animation Hitches.
- **Issue:** an actual unsigned Release build through the shared scheme included `-profile-generate` and `-profile-coverage-mapping`. Coverage is enabled on its Test action/plans. Explicitly disable coverage for profiling builds and verify the emitted compiler arguments; do not equate an optimized configuration with an uninstrumented performance baseline. Evidence: `/private/tmp/BeerSelectorNative-profile-audit.log` (build passed), derived data `/private/tmp/BeerSelectorNative-profile-audit`. No actual Instruments launch was audited.
- Enrichment metrics exist only in memory. No UI/export consumer or health/reset caller was found. `successes` increments on HTTP success before payload validation, so invalid responses can count as success; cancellation counts as a failure. These counters are not end-to-end operation outcomes or latency metrics.
- No OSSignposter/os_signpost, structured Logger/OSLog, URLSessionTaskMetrics delegate, MetricKit subscriber or XCTest performance measurements were found in native Swift source. URLSession's delegate only implements redirect protection.
- AppModel performs synchronous parsing/SQLite work on MainActor; SQLite busy timeout is 5000ms. This is a candidate for UI stalls under contention, not a measured hitch. No trace or performance baseline has yet been captured.
- Next implementation: clean profiling build configuration, named refresh/parse/persistence intervals with cancellation-aware outcomes, and request timing collection. Use operation categories and counts; never log credentials, cookies, full request URLs/query parameters or bodies. Apple describes Instruments-visible intervals in [Recording Performance Data](https://developer.apple.com/documentation/os/recording-performance-data).

## Profiling fixes and measurements — 2026-09-11

The two intentionally red enrichment tests now pass. The full correctness plan passes **43/43** tests, including concurrent aggregate updates, balanced interval outcomes, cache-validator semantics, server/local rate-limit accounting, redirect origin protection, and a real locked-database refresh that preserves its snapshot/timestamp and succeeds after unlocking. Log: `/private/tmp/BeerSelectorNative-profiling-final.log`. Prior mutation results above remain historical; no new whole-project mutation score is claimed.

### Choosing the build

Use **BeerSelectorProfile** for Product → Profile. Its Run/Profile actions use Release, its Test action uses the release-derived Performance configuration with testability enabled, and its Performance plan disables coverage. The original BeerSelectorNative scheme remains the Debug correctness/coverage workflow. Do not use that coverage scheme to establish Release performance measurements.

An actual unsigned iOS device Release build through BeerSelectorProfile passed: compiler commands contain `-O`, `-whole-module-optimization`, and `-g`, contain neither `-profile-generate` nor `-profile-coverage-mapping`, and generate the app dSYM. Evidence: `/private/tmp/BeerSelectorNative-profile-clean.log`. The optimized Performance test build also has no coverage flags. The final Debug correctness build still emits both coverage flags.

Run the opt-in performance plan on an isolated simulator:

```sh
BEERSELECTOR_TEST_SCHEME=BeerSelectorProfile \
BEERSELECTOR_TEST_PLAN=Performance \
BEERSELECTOR_TEST_PARALLEL=NO \
BEERSELECTOR_TEST_BUILD_DIR=/private/tmp/BeerSelectorNative-performance \
native-ios/Scripts/run-tests.sh
```

Set `BEERSELECTOR_TEST_DESTINATION` as described above. Performance tests measure clock, CPU, and memory for parsing, transaction replacement, and reading back 1,000 synthetic beers with substantial descriptions. They also exercise two real SQLite connections with one holding a write lock. Both tests passed before and after the timeout change. These measurements have no committed timing threshold and are excluded from the fast Cloud gate.

| Experiment | Before | After |
| --- | --- | --- |
| Contended writer elapsed wait | 5.162 s | 0.00069 s |
| 1,000-beer parse/write/read average | 0.017 s | 0.017 s |

Logs: `/private/tmp/BeerSelectorNative-performance-before.log` and `/private/tmp/BeerSelectorNative-performance-after.log`. Single simulator runs are exploratory observations, not device budgets or proven production hitch counts. Clock variation was about 13–16%; memory measurements were noisier. SQLite now has zero busy timeout, so it never intentionally sleeps waiting for a writer. This can surface a busy error sooner; transactions preserve the old cache and a subsequent refresh can retry. Synchronous execution and account-epoch guards are retained. Parsing/persistence can still consume a frame budget; moving work off MainActor requires a separate serialization/account-safety design and device evidence.

### What diagnostics mean

`Diagnostics.swift` keeps one locked aggregate per fixed operation (refresh, parsing, transaction, login, queue, network), with count, success/failure/cancellation counts, cumulative and maximum monotonic duration. Each interval begins/ends once, including thrown errors and early cancellation. Structured logs and signpost metadata contain only fixed operation/outcome labels and duration. Network intervals encompass HTTP validation and retries; enrichment successes additionally require endpoint payload validation. A completed refresh can succeed through fallback while an individual network/enrichment request fails.

Enrichment `requests` counts admitted attempts; each completed attempt records exactly one validated success, failure, or cancellation. An accepted 304 is a success/cache hit only when a validator was supplied. `rateLimited` counts both server 429 responses and locally refused calls; a local refusal adds no request/failure. Valid sync responses reporting zero synced beers count as validated responses and do not trigger follow-up fetching. Fallbacks retain their separate count.

The existing redirect delegate now collects URLSession task duration and redirect count while retaining its origin checks. Injected fixture sessions may not deliver real task metrics; fixture success is not proof of production transport timing delivery. A retained MetricKit subscriber registers at normal app launch and aggregates report counts and cumulative CPU seconds; raw metric/diagnostic payloads are discarded. No telemetry uploads or unbounded event history were added.

Debug Settings → Performance Diagnostics displays a snapshot and offers Share Diagnostics. Reports contain no credentials, URLs/query values, cookies, request/response bodies, or member identifiers/names. Aggregates reset when the process exits; this is a local session tool, not a historical monitoring backend.

Implementation follows Apple's [OSSignposter interval API](https://developer.apple.com/documentation/os/ossignposter), [URLSession task metrics callback](https://developer.apple.com/documentation/foundation/urlsessiontaskdelegate/urlsession(_:task:didfinishcollecting:)), and [MetricKit subscriber manager](https://developer.apple.com/documentation/metrickit/mxmetricmanager), using APIs available at the iOS 17.6 deployment target.

### Remaining device validation

No Instruments recording or phone installation was performed in this fix session. Record Time Profiler/Points of Interest and SwiftUI hitches with BeerSelectorProfile on a physical device during refresh, login, and queue use. Confirm balanced intervals and real URLSession metrics. Verify MetricKit report delivery on device; simulator compilation cannot establish daily report delivery. No live queue/reward mutations are authorized by these automated tests. Xcode Cloud workflow execution, full RN upgrade compatibility, and the existing device release gates remain pending.
