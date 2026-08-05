# CI recovery plan (v3)

Written 2026-08-05 after PR #8 merged as `817694ad`; revised twice the same day
under a reviewer gauntlet on PR #9.

## Why CI was silent for the life of a branch

Three bugs hid it, in sequence. The `Test Summary` job printed all-green and
never ran `exit 1`. `maestro-ios-critical` was missing from that summary's
`needs`. And `maestro --version` prints an analytics banner that the version-pin
check captured instead of a version, so every Maestro job exited 1 at install
before a simulator was involved. PR #8 fixed all three — and the E2E suite then
ran for the first time and returned 21/21 failed.

v1's diagnosis survived both review rounds. Almost none of v1's *arguments* did,
and several of v1's and v2's proposed fixes would have made things worse. Those
are recorded below rather than quietly corrected.

## Ordering

Read this first. v1 buried it a hundred lines down.

1. **5.1 (jest in CI)** — `npm run test:ci` on `ubuntu-latest`. Independent of
   everything else, best value per hour. Start here.
2. **6.1 (decide the duplicate-workflow question)** — moved to the front. Its own
   text says it halves the work in 2 and 3; sequencing it last meant doing 2 and
   3 twice and consolidating afterwards.
3. **0 (the false-green check)** — no longer gating 2.1, see below.
4. **2 (evidence)** → **3 (the launch)** → **4 (flows)**.
5. **2.5 (what CI may talk to)** — a policy decision with no code dependency on
   Phase 2. Start it early and in parallel; it only has to *land* before 3.

**One hard gate: 2.5 blocks 3.** Fixing the launch is what starts pointing a
working suite at a third party's production API.

**Retracted from v2: "0 blocks 2.1" was a phantom.** 2.1 touches `e2e-tests.yml`,
which has **zero** dorny steps — all three are in `maestro-e2e.yml`. Fixing the
XML there cannot switch on a check that file never publishes.

**Two ordering constraints inside Phase 3** (see 3.x): 3.4 must land before 3.1,
and 3.3 must land in the same commit as 3.1 per job. Otherwise a cached
`Debug-iphonesimulator/BeerSelector.app` — the one with no JS in it — sits beside
the fresh Release build and `head -n 1` picks by directory order, reproducing
today's exact symptom against a fix that worked.

**And one mutual exclusion, which no sequencing can express:** 0.1 must not be
applied to the Android dorny step while 2.5 moves Android's `continue-on-error`.
Together they make the known-red Android suite fail every run permanently —
reversing the deliberate design decision 2.3 tells you not to break.

**Convention for every box below:** record the outcome inline on the `[x]`,
including when it refutes what this plan says. That habit is most of why
`review-remediation-round-8.md` is trustworthy.

## What we know

| Claim | Confidence | Basis |
|---|---|---|
| The installed `.app` contains no JS bundle | **Certain** | CI log 30943454950 line 82441: `SKIP_BUNDLING enabled; skipping.` |
| 21 registered flows, all failed | **Certain** | `.maestro/config.yaml`; CI log |
| **19** of 21 failed on their first element command | **Certain** | mapped per-flow; corrected from 20 |
| The other two got past it on dev-launcher chrome | **High** | `expo-dev-launcher` is `debugOnly: true` and renders `Text("Home")`/`Text("Settings")` |
| dorny creates no check run today | **Certain** | token is read-only; `checks.create` 403s |
| The `ios/build` cache key is effectively constant | **High** | brace expansion in `hashFiles`; and `restore-keys` falls back regardless |
| CI will hit the real production API once the launch works | **Certain** | `ENV_BASE_URLS` — all three environments are the same live host |
| `e2e-tests.yml` has never produced JUnit XML | **Certain** | `FileNotFoundException`; no `mkdir` |
| `maestro-e2e.yml` **has** produced XML | **Certain** | artifact from run 30943454973 contains `maestro-results.xml`, `tests="21" failures="21"` |
| Jest never runs in CI | **Certain** | `.github/` has exactly two workflows |
| **Nothing anywhere** runs the 2272 tests | **Certain** | `.husky/pre-commit` is `lint-staged` — eslint + prettier only |
| No lint or typecheck runs in CI either | **Certain** | same grep |
| `main` has no branch protection | **Certain** | `branches/main/protection` → 404; `rulesets` → `[]` |
| The Release build path has ever worked here | **Unknown** | it has never once executed — see 3.1 |
| The flows' selectors are correct | **Unknown** | not knowable until the app renders |

## The diagnosis — settled, and not by the argument v1 made

Every E2E build is `-configuration Debug` (`e2e-tests.yml:115`,
`maestro-e2e.yml:177`, `:354`, `:548`), and no Metro/packager step exists in
either workflow.

The proof is in the build log we already had. `project.pbxproj:334` — the "Bundle
React Native code and images" phase — contains
`if [[ "$CONFIGURATION" = *Debug* ]]; then export SKIP_BUNDLING=1; fi`, and run
30943454950 line 82441 prints `SKIP_BUNDLING enabled; skipping.` The `.app`
installed on the simulator provably has no JS in it. `AppDelegate.swift`'s
`bundleURL()` then returns a `localhost:8081` URL under `#if DEBUG`, with no
fallback.

**Correction to v1's mechanism:** it is not react-native-xcode.sh's
"Debug + simulator" rule. The Expo template sets `SKIP_BUNDLING=1` and the script
exits before reaching that rule. Same outcome, different line.

**Correction to v1's predicted symptom, and this one has teeth.**
`expo-dev-client` / `expo-dev-launcher` are installed and linked
(`expo-module.config.json` → `"debugOnly": true`, so Debug builds only). The app
does **not** show a red screen — it shows the dev-launcher UI, whose SwiftUI
chrome contains literal `Text("Home")`, `Text("Updates")` and `Text("Settings")`
(`DevLauncherViews.swift:20,26,32`, `SettingsTabView.swift:87`).

**This resolves the one anomaly that looked like a refutation.** Reviewers
correctly flagged that `14-api-error-handling.yaml` failed on its *fourth*
element command, having apparently passed `tapOn: "Home"`, `tapOn: "Settings"`
and `assertVisible: "Settings"` — which would prove JS rendered. It does not: it
tapped through the **dev launcher**, whose tabs carry exactly those labels. It
failed at the first string only the real app has.

**Retracted, immediately after asserting it:** v2 explained flow 15's
`assertVisible: "Settings"` failing while flow 14's passed as "different launcher
tab state". That does not discriminate. A SwiftUI `TabView` renders every tab
label simultaneously, so "Settings" is on screen as soon as the launcher mounts
at all; and flows 15 and 19 both use `clearState: true` and got opposite results
on the same string. The mechanism that fits all three is **timing**: flow 19's
first command is `extendedWaitUntil … timeout: 30000` and passed, flow 14
asserted after three prior interactions and passed, flow 15 asserted immediately
after `launchApp` and failed. The launcher takes longer to mount than
`assertVisible`'s default wait. One mechanism, three observations — against v2's
one mechanism, two observations, and a per-flow state story it did not have.
This is the same over-fitted shape v2 retracted from v1, committed while
retracting it.

**Consequence that outlives the fix, and it is worse than v2 said.** Two flows,
not one, got past their first command against launcher chrome. The second is
`19-migration-lock.yaml`, whose first command is a 30-second wait for "Settings"
and whose comment states its purpose: *"The app must get past
splash/initialisation."* **That gate passed against the dev launcher, on a build
containing no application JS at all.** The flow designed to prove the app
initialises is the flow that most convincingly proved it had, while it had not.

Any flow that turns green after Phase 3 must be checked against *what* it
matched. Assertions on bare "Home" or "Settings" are not trustworthy signals
today.

**Retracted from v1:** "Four things fit this and little else does." Three of those
four did not discriminate — a fresh install routing to Settings, or a hang in
`_layout.tsx` init, produce the same total/indiscriminate/full-timeout shape. The
fourth (the dev-menu step) was evidence about how flows were authored, not about
runtime. The diagnosis is right; that argument for it was not.

## Phase 0 — a false green gated on a repo setting, not on code

`dorny/test-reporter@v1` runs with `fail-on-error: false` at
`maestro-e2e.yml:244`, `:621`, `:798` — **three steps, not the six v2 claimed.**
`e2e-tests.yml` has none. In the pinned v1, `createReport()` computes
`isFailed = this.failOnError && results.some(...)` and passes the resulting
conclusion to `checks.create`, so with the flag false the published check is
unconditionally `success` — green, over a report whose own title reads
"0 passed, 21 failed".

**Why no such check exists today, settled after two reviewers contradicted each
other.** One argued `use-actions-summary: true` makes the action write a job
summary and create no check. That is a real input on the action's `main` branch
but **is not an input in v1 at all** — `action.yml` at the pinned tag lists
thirteen inputs and that is not among them. The actual reason:
`default_workflow_permissions` is **`read`** and no workflow declares a
`permissions:` block, so `checks.create` 403s and the throw becomes
`core.setFailed`. No check is created — not green, not red.

**Which makes this worse, not weaker.** The false green is gated on a **repo
setting**, not on code: anyone flipping Settings → Actions → Workflow permissions
to "read and write" enables it with no diff and no review. And v2's "Phase 2.1
switches it on" was wrong twice over — wrong file, wrong trigger.

**Severity, stated honestly:** `main` has no branch protection and no rulesets, so
nothing is a required check. A misleading green could not have merged anything.
This is a trust problem, not a merge problem. v2 numbered it 0 as though it were
the latter.

- [ ] 0.1 Set `fail-on-error: true` on the **iOS** dorny steps (`:244`, `:621`).
      **Do NOT apply it to the Android step (`:798`)** — see the mutual exclusion
      in Ordering. Do not "or delete them": that job summary is currently the only
      per-flow reporting surface in the repo.
- [ ] 0.2 Add `permissions: { contents: read, checks: write }` to the jobs
      carrying a dorny step, or 0.1 is theatre — the API call cannot succeed.
- [ ] 0.3 Verify by **opening the Checks tab on a real red run** and confirming a
      check named "Maestro E2E Tests (iOS)" is red. Do not verify by querying
      `check-runs` by commit SHA: on `pull_request` events the check attaches to
      the PR head, and an API query against the wrong SHA returns nothing, which
      reads identically to "no check exists".
- **Exit:** a deliberately red run produces a dorny check whose conclusion is
  `failure`. (v2's exit — "no check reports success while its report contains
  failures" — was **vacuously true** before and after the fix, because no check
  existed either way.)

## Phase 1 — see what is actually on screen

No longer load-bearing for the diagnosis — that is settled. Still needed, because
of the launcher: we need to know what each flow is matching.

v1's Phase 1 would have produced no evidence at all. Every fault below was found
by review, and each would have cost a full macOS cycle.

- [ ] 1.1 `takeScreenshot` writes `<name>.png` to the **working directory**, and
      nothing uploads the repo root — the failure uploads point at `~/.maestro/`.
      Write to an explicit path, `mkdir -p` it, and add a matching upload.
- [ ] 1.2 Take **three** shots — t=0, +5s, +15s. A single post-`launchApp` shot
      cannot distinguish "no JS", "splash still up" and "first render pending".
      A *changing* screen refutes; a *static* one confirms.
- [ ] 1.3 Instrument more than one flow. On-screen content demonstrably varied
      between flows in the same run; one sample will not show it.
- [ ] 1.4 Replace `log stream` with `xcrun simctl spawn <udid> log show --last 10m`
      — **but note the fix does not fully solve its own stated problem.** `info`
      and `debug` are memory-only on Apple platforms and are not persisted to the
      log store, so `--level debug` filters a set that never contained them. To
      actually capture them: `log config --mode "level:debug"` **before** launch,
      or `log collect` into an archive. RN's bundle-loader failure surfaces at
      default level via NSLog, so the widened predicate matters more than the
      level flag.
      `log stream` blocks until the job times out, and at default level it omits
      `info`/`debug` — where RN's console output and Metro connection errors
      live. **A filtered-out log reads as "no Metro failure found", which would
      refute a hypothesis that is true.** Add `--level debug`, and widen the
      predicate beyond `processImagePath` so `SpringBoard`/`installd` failures
      are caught.
- [ ] 1.5 Decide in advance that a missing artifact is a finding, not a
      non-result. If `launchApp` itself fails, the flow aborts and no screenshot
      is taken.
- **Exit:** we can say what was on screen at launch, per flow, from an artifact.

## Phase 2 — make CI able to produce evidence

- [ ] 2.1 `mkdir -p test-results` in **`e2e-tests.yml` only**, at `:138` and
      `:292`. v1 said "both workflows"; that is wrong. All three `maestro test`
      calls in `maestro-e2e.yml` (`:216`, `:589`, `:773`) write bare filenames to
      the workspace, which exists. Executed literally, v1 adds three no-op
      `mkdir`s and an empty directory, and the engineer concludes reporting is
      fixed. **Gated on Phase 0.**
      - If anyone later normalises those paths under `test-results/`, the
        artifact glob (`:609`), the dorny `path:` (`:247`, `:624`) and the
        summary's inspection paths (`:889`, `:919`) must move with them.
- [ ] 2.2 Fix the upload paths: `actions/upload-artifact` does **not** expand `~`.
      There are **nine** such paths, not the five v2 listed: `e2e-tests.yml:152`,
      `:306`; `maestro-e2e.yml:233`, `:240`, `:378`, `:610`, `:617`, `:787`,
      `:794`. Three of the four v2 missed sit in multi-path uploads where the XML
      half works, so an artifact appears and the missing directory is invisible —
      and `:378` is the **sole** path of `maestro-critical-results-ios`, which has
      therefore never contained anything. Use `$HOME`.
- [ ] 2.2b Set `if-no-files-found: error` on the **result** uploads (not the
      screenshot ones, which are legitimately optional). All 13 uploads currently
      use the default `warn`, which is the mechanism that made these silent; 2.2
      alone fixes today's paths and leaves the mechanism.
- [ ] 2.3 Add a **new** content assertion. v2 said "promote the existing presence
      arms to fatal" — wrong: `e2e-tests.yml:466` and `maestro-e2e.yml:949` are
      both **Android** arms, and `:895` is the parallel per-group arm whose gate
      already sets `overall_fail`. There is **no** content check anywhere for the
      sequential 21-flow iOS jobs; they are judged purely on `needs.*.result`.
      Following v2 literally means editing one parallel-group line, ticking the
      box, and leaving the 21-flow suite unasserted — the highest-probability
      false-done in this plan.
      - Target the sequential iOS jobs. Assert `tests` equals a **committed
        floor** (not a count derived from `config.yaml`, which re-baselines the
        moment someone deletes a flow — the same attack 5.4 blocks for jest),
        and `failures="0"` **and** `skipped="0"`.
      - Do **not** apply it to the parallel job: it writes one XML per flow
        (`:591`), so `tests="1"` there and a 21-check would go permanently red for
        a bogus reason. `maestro-ios-critical` writes no XML at all.
      - Fail closed on a missing or unparseable file. `grep -q 'failures="[1-9]'`
        passes on an empty file; `if [ -f "$xml" ]` passes when Maestro died
        before writing.
- [ ] 2.3a **Ordering constraint v2 missed:** 2.1 must land, produce one
      artifact, and that artifact must be **read** before 2.3 is authored. Nobody
      here has seen whether Maestro 2.4.0 emits an aggregate
      `<testsuites tests="21">` or 21 sibling `<testsuite tests="1">`, and the
      assertion's shape depends on the answer.
- [ ] 2.4 Verify Maestro 2.4.0's exit code **in CI, on a directory with a
      workspace config** — not locally on one flow, which answers a different
      question the repo's own `.maestro/README.md` point 4 already warns about.
      Observe three outcomes: some fail, all pass, and **zero flows selected**
      (a `config.yaml` typo), which plausibly exits 0 with `tests="0"` and is the
      case most likely to produce a false green.
- [ ] 2.5 Narrow Android's `continue-on-error`. At job level
      (`e2e-tests.yml:171`, `maestro-e2e.yml:647`) it blankets `npm ci`,
      `setup-java`, `expo prebuild`, `gradlew assembleDebug` and the Maestro
      version-pin assertion, so a broken lockfile is reported as the known
      Android limitation.
      **But "move it to the step" is not sufficient**, and v2 named a step that
      does not exist in `maestro-e2e.yml`. The equivalent there (`:748-778`) also
      does `adb install`, starts the mock server and pkills; `e2e-tests.yml`'s
      (`:268-292`) is `android-emulator-runner` whose `script:` includes the
      install. `continue-on-error` has no sub-step granularity. The correct shape
      is `maestro test … || true` **inside** the emulator script, leaving the
      surrounding commands fatal.
- [ ] 2.5a Fix the *report*, which is where the misclassification actually lives:
      both summaries decide the Android line from the **artifact**, not the job
      result, so a broken `npm ci` prints "known-red, non-blocking". Distinguish
      "died before Maestro ran" from "Maestro ran and failed as expected".
- [ ] 2.5b Update the two long comments (`e2e-tests.yml:453-463`,
      `maestro-e2e.yml:906-918`) asserting `needs.maestro-android.result` is
      unreliable *because of* job-level `continue-on-error`. Narrowing it makes
      them false and the XML-inspection workaround unnecessary.
- **Exit:** a red suite produces a red job, a red check, and an artifact
  containing per-flow detail.

## Phase 2.5 — BLOCKING: decide what CI is allowed to talk to

Two verified facts:

1. **The mock server is dead wiring.** `EXPO_PUBLIC_USE_MOCK_SERVER` appears
   nowhere in `src/`, `app/`, `components/`, `hooks/` or `app.config.js`. The
   three `.env.test` blocks are never loaded either — Expo reads `.env.${NODE_ENV}`
   and nothing sets `NODE_ENV=test`; `.env*` are gitignored so CI has no env file
   at all. The server starts on :3000, is contacted by nothing, and is killed.
   Its start step has no readiness gate and no exit check — the bare-`sleep`
   pattern Phase 3.2 warns against, already present.
2. **Every environment is the live host.** `config.ts:267-271` maps development,
   staging and production all to `https://tapthatapp.beerknurd.com`. There is no
   non-production URL in the codebase.

So the moment Phase 3 succeeds, flows that get far enough issue real requests to
Flying Saucer's production API from GitHub runners, on every push. Defanged today
only by luck: `clearState` installs have no session, and the member-login flow
has its assertions commented out.

Dead CI wiring that looks like a safety control is worse than none, because it
reads as one.

- [ ] 2.5a Decide the policy: mock server, recorded fixtures, a dedicated test
      account, or flows that never authenticate. Write it down.
- [ ] 2.5b Either wire `USE_MOCK_SERVER` into `config.ts` so it redirects the
      base URL, or delete the flag, the `.env.test` blocks and the server steps.
- [ ] 2.5c Add a real non-production `ENV_BASE_URLS` entry, or document why all
      three being identical is intended.
- **Exit:** 2.5a answered in writing. Phase 3 does not land before then.

## Phase 3 — fix the launch

- [ ] 3.1 Switch E2E iOS builds to `-configuration Release`. Confirmed viable:
      `CODE_SIGN_IDENTITY` is scoped `[sdk=iphoneos*]` so simulator builds need
      no identity; there is no `expo-updates` to configure; and
      `expo-dev-launcher` is `debugOnly`, so Release drops the launcher chrome
      that is currently confusing assertions.
      **Budget for first-time failure: this path has never executed in this CI.**
      The performance job that specifies Release has been `skipped` on every run
      since 2026-01-30 because it `needs: [maestro-tests-ios]`. v1 cited it as
      "the repo already has the counter-example", which reads as "we know Release
      works here". We do not. It is a config precedent with zero runtime evidence.
- [ ] 3.2 If Release proves impractical, start Metro with a **readiness gate on
      :8081** — not a bare `sleep`.
- [ ] 3.3 Filter the app lookup: every install step does
      `find ios/build -name "*.app" | head -n 1` (`e2e-tests.yml:124`, `:384`;
      `maestro-e2e.yml:188`, `:358`, `:558`) — unordered, unfiltered. With both
      `Debug-iphonesimulator` and `Release-iphonesimulator` present it picks by
      directory order. Pin the path — `ios/build/Build/Products/Release-iphonesimulator`
      with `-maxdepth 1` — and assert exactly one match. A bare
      `-path '*Release-iphonesimulator*'` still matches nested bundles under
      `Intermediates.noindex/` and `Index.noindex/` in a restored derivedData, the
      assertion then fails benignly, and the natural fix is to re-add
      `| head -n 1` — restoring the original defect under a filter that looks
      like it solved it.
- [ ] 3.4 **Drop** the `ios/build` cache (`maestro-e2e.yml:163-169`, `:534-540`).
      Land this **before** 3.1.
      **Correction to v2's mechanism, from two reviewers independently.** v2
      claimed a restored Release `.app` would carry a stale embedded JS bundle so
      "CI verifies code not in the PR". That is very likely **false**:
      `project.pbxproj:323` marks the bundle phase `alwaysOutOfDate = 1`, so it
      re-runs on every build regardless of derivedData and rewrites a fresh
      bundle. Keeping the scariest claim in the plan when it is wrong invites
      someone to test it, find it false, and drop the whole item.
      The real exposures are narrower and still worth the fix:
      - The key `hashFiles('ios/**/*.{h,m,swift}')` uses brace expansion, which
        `@actions/glob` does not support — so it matches nothing and the key is
        the constant `macOS-ios-build-` on every commit and branch. Cache keys are
        immutable, so the first save wins forever, and today's broken Debug builds
        are plausibly already the permanent contents.
      - **`restore-keys:` is the half v2 never mentioned.** Fix the key and leave
        `${{ runner.os }}-ios-build-` in place and behaviour is unchanged — every
        miss still restores the newest stale entry. "Fixed the cache key" is
        tickable without changing anything.
      - Stale **native** objects for a PR that changes a native dep without
        touching the glob. Note `ios/**` would not cover
        `modules/live-activity/ios/*.swift` even if braces worked.
- [ ] 3.5 Add `CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO` to **both** sites
      lacking it: `e2e-tests.yml:112-119` and `maestro-e2e.yml:354` (the critical
      job). v2 named only the first, so its exit was satisfiable with one of two
      gaps closed. There are four Debug `xcodebuild` invocations in total
      (`e2e-tests.yml:115`; `maestro-e2e.yml:177`, `:354`, `:548`) and 3.1 must
      cover all four.
- [ ] 3.6 Remove the "Dismiss Expo dev menu" steps once Release makes them dead.
- [ ] 3.6a **Consequence of 3.1, filed here rather than in Phase 6 where it would
      be found the day after Release lands:** `performance-tests` is currently
      skipped on every run because it `needs: [maestro-tests-ios]`. The moment iOS
      passes, it runs — and its "Check performance thresholds" step
      (`e2e-tests.yml:405`) is a bare `echo`, with no thresholds declared in
      `.flashlight/performance-tests.yaml` and `config.yaml`'s `performance:`
      block read by nothing. Phase 3 creates a permanently green job named for a
      check it does not perform.
- [ ] 3.7 Watch for the next failure mode, which looks identical from outside:
      `_layout.tsx` returns `null` while `!loaded || !initialRoute`, so a stalled
      `useFonts` or init chain leaves a blank screen and full-timeout failures
      exactly as today. A blank screen after Phase 3 is **not** evidence Phase 3
      failed — confirm JS evaluated before re-diagnosing.
- **Exit:** per-flow record of pass/fail with the failing command, from a Release
  build verified to contain this commit's bundle **by a named mechanism** — e.g.
  grep the embedded `main.jsbundle` for a string introduced by this commit.
  Without naming the mechanism, "verified" is an assertion of faith.

## Phase 4 — the flows

- [ ] 4.1 Triage each failure: wrong selector, wrong app state, matched launcher
      chrome, or real defect.
- [ ] 4.2 Settle app-state expectations per flow. v1 said "the flows have never
      had to answer this" — too broad. Flows 07, 11 and 15 *do* expect the
      first-launch Settings redirect and assert it; flow 10 (`clearState: false`,
      `tapOn: "Home"`) assumes a configured app. **The inconsistency is the
      finding**, not the absence.
- [ ] 4.3 Re-examine 7.3 and 9.21 against real evidence; close or reopen.
      Restored from v1, which v2 dropped: **9.21 corrected 48 tap selectors that
      "could never have worked", and that correction has still never been
      executed** — which is the reason to do this at all.
- [ ] 4.4 Verify multi-hop tab navigation (9.8) in both directions, on a
      simulator. (v1 stated this without a verb.)
- [ ] 4.5 Inventory the **18** unregistered flows — 40 `.yaml` on disk **includes
      `config.yaml` itself**, so 39 flow files, 21 registered. v2 said 19.
      And "run nowhere" is false for three of them: `LOGIN_WEBVIEW_ERROR_HANDLING`,
      `SETTINGS_AUTO_LOGIN` and `MP-7-STEP-2-OPERATION-QUEUE-TESTS` are named
      directly by the parallel matrix and run on every PR. Deleting them per this
      item breaks the matrix. Adopt or delete deliberately.
- [ ] 4.5a Record that **the parallel matrix covers 15 of the 21 registered
      flows** — uncovered: `08-auto-login`, `19-migration-lock`, and all four
      `live-activity-*`. This matters for 6.1: deleting `e2e-tests.yml`'s iOS job
      is safe because `maestro-ios` still runs all 21, but concluding the
      *sequential* job is the redundant one silently drops PR coverage to 15 of
      21 with every check still green. **The matrix is not the suite.**
- [ ] 4.6 Note that `prebuild --clean` drops the widget target, so the four
      `live-activity-*` flows exercise an app with no widget extension.
- **Exit:** every registered flow is either passing or has a written cause and a
  tracked issue. Zero unexplained failures.

## Phase 5 — run the tests that exist

- [ ] 5.1 Add a jest job: `npm run test:ci` on `ubuntu-latest`, PR and push.
      2272 tests pass on developer machines and are verified by nothing.
- [ ] 5.2 Observe it green on `ubuntu-latest` and record the number **before**
      requiring it.
- [ ] 5.3 `jest-junit.config.js` is dead config — jest-junit reads
      `package.json#jest-junit` or `JEST_JUNIT_*`, not that file. `junit.xml` is
      written to the repo root. An upload pointed at `reports/junit/` produces
      nothing and warns into the void — the same defect 2.2 exists to fix.
- [ ] 5.4 Gate on `tests=` in `junit.xml` not dropping below a committed
      baseline. `testPathIgnorePatterns` (`jest.config.js:31-64`) already
      quarantines 8 files, and its own comment records that one quarantine was
      false and hid 14 real assertions. Without a floor, the cheapest way to
      green a required check is to add a line there.
- [ ] 5.4a `tests=` counts **skipped and todo** cases, so `it.skip`/`xit` disables
      assertions while the floor holds. Also assert `<skipped>` does not rise, or
      gate on *passed* rather than *tests*. Fail closed on a missing or
      unparseable `junit.xml`.
- [ ] 5.5 `--coverage` gates nothing — there is no `coverageThreshold`. Note
      `jest.config.js:5` sets `collectCoverage: true` **globally**, so adding a
      threshold also fails developers' local watch runs, and "drop the flag" does
      not help because the config key, not the CLI flag, enables it.
- [ ] 5.9 Add lint and typecheck to CI too — **neither runs anywhere today**
      (`grep -rn "tsc\|eslint\|lint" .github/workflows/` → nothing). Restore v1's
      measured baseline while doing it: `tsc --noEmit` reports **141** errors, 5
      of them in `dataUpdateService.ts`. That number exists nowhere else in the
      repo, and v2 dropped it — which is how a measured fact becomes unknown
      again. Non-blocking, but gate on "no increase over 141".
- [ ] 5.6 Making a check required is **branch protection**, not a file edit.
      Name who does it. First establish what is required *today* — nothing in the
      repo records it, and if nothing is required then every finding here is
      advisory for merge purposes.
- [ ] 5.7 **No two check contexts may share a name.** Two jobs are called
      `Test Summary`, and PR #9 right now carries **two** checks both named
      exactly `Maestro E2E Tests (iOS)` — one per workflow. Phase 0 adds a third
      with that name via dorny's `name:` input. After Phase 3 lands in one
      workflow and not the other — and they have already drifted — one will be
      **green and one red under the same name**. That is a green-over-red neither
      review round found, and it is really an argument for doing 6.1.
- [ ] 5.8 Delete or wire up `jest.config.updated.js`, unused beside the real config.
- **Exit:** a jest check that cannot go green by shrinking. Note the *required*
  half cannot be closed by the implementer — branch protection does not exist and
  is not a file edit; 5.6 gates this phase's exit.

## Phase 6 — stop paying twice

`maestro-e2e.yml`'s `maestro-ios` and `e2e-tests.yml`'s `maestro-tests-ios` run
on the same triggers, build the same Debug config, and execute the same
`.maestro/` directory on `macos-latest`. The full suite runs **four times per PR**.
They have already drifted — one passes `CODE_SIGNING_REQUIRED=NO` and sets up an
env, the other does neither. Every Phase 2 and 3 item is currently "do this 2-4
times and keep them in sync by hand".

- [ ] 6.1 Decide whether `e2e-tests.yml`'s iOS job should be deleted in favour of
      `maestro-e2e.yml`'s, which already has the critical and parallel matrices.
- [ ] 6.2 Cache CocoaPods — `prebuild --clean` regenerates from scratch in all
      five macOS jobs with no cache.
- [ ] 6.3 `actions/cache@v3` → `@v4`. **6.2 and 6.3 are hygiene, not recovery.**
      Do them in one ten-minute commit this week or move them out of this plan —
      leaving them as unticked boxes in a recovery plan is how the plan stops
      being trusted.
- [ ] 6.4 `maestro-ios-critical` runs four `maestro test` calls in one `bash -e`
      block, so a first failure skips the other three and the job reports P0 on
      one flow. Use the `|| group_failed=1` pattern the parallel job already has.
      It also passes no `--output`, so it produces no XML.
- [ ] 6.5 "Check performance thresholds" (`e2e-tests.yml:405`) is a bare `echo`;
      `.flashlight/performance-tests.yaml` declares no thresholds and
      `config.yaml`'s `performance:` block is read by nothing. Currently masked
      because the job is always skipped — **Phase 3 makes it a permanently green
      job named for a check it does not perform.**
- **Exit:** the duplication is resolved, **or** a written decision to keep both
  exists. (v2's exit asserted "one iOS E2E job per push" while 6.1 only says
  "decide whether" — so the phase could never be closed by doing what it asks.)

## Retracted, so it can be audited

Round-8 convention: retractions get boxes, not prose, so they can be tracked.

- [x] v1: "Four things fit this and little else does" — three did not discriminate.
- [x] v1: "mkdir -p in both workflows" — three of those edits are no-ops.
- [x] v1: "the repo already has the Release counter-example" — that job has been
      skipped on every run since January; zero runtime evidence.
- [x] v1: "nothing has ever checked the artifact" — the path cannot resolve.
- [x] v1: "the flows have never had to answer the app-state question" — three do.
- [x] v2: "0 blocks 2.1" — phantom gate; wrong file, wrong trigger.
- [x] v2: "all six dorny steps" — three.
- [x] v2: "20 of 21 failed on their first element command" — 19.
- [x] v2: "different launcher tab state" explains 14 vs 15 — it does not; timing does.
- [x] v2: "promote the existing presence arms to fatal" — they are Android arms.
- [x] v2: the stale-JS-bundle scenario — `alwaysOutOfDate = 1` refutes it.
- [x] v2: "19 unregistered flows" — 18, and three of them do run.
- [x] v2: Phase 0's exit condition — vacuously true before and after.

Every one of these is mine. Two rounds of review produced thirteen; the diagnosis
survived both.

## Standing caution

Three separate bugs hid this state for the life of the branch, and v1 of this
plan would have added a fourth by fixing the XML without fixing the check that
reports on it.

Judge every item here by whether it makes CI **report accurately**, not by
whether it makes CI green. A green check that nothing verifies is what this repo
has spent twelve review rounds learning to distrust.

The sharpest lesson from reviewing this plan: **v2 retracted an over-fitted
argument from v1 and committed a new one in the same paragraph.** The launcher
explanation was right; the "different tab state" mechanism attached to it was
invented to fit two data points and collapsed against a third. Confidence labels
do not protect against that — only a reviewer with the third data point does.
