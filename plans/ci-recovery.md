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

- [x] 5.1 Add a jest job: `npm run test:ci` on `ubuntu-latest`, PR and push.
      2272 tests pass on developer machines and are verified by nothing.
      **Done** — `.github/workflows/tests.yml`, job name `Jest Unit Tests`.
      The 2272 figure is confirmed: 96 suites / 2272 passed / 0 failed / exit 0,
      measured on node v26 **and** on `.nvmrc`'s 20.19.1, and independently
      reproduced by two reviewers. Deliberately a **new** workflow file, not a
      job in either existing one, so 6.1's decision cannot delete unit coverage
      as a side effect.
- [x] 5.2 Observe it green on `ubuntu-latest` and record the number **before**
      requiring it. **Answered, and it did not pass first time — which is the
      entire reason this item exists.**
      - Run 1 (PR #10, `de19d388`): **RED**. `ran=2257 failed=4` against a floor
        of 2272. See 5.13 — three separate review rounds and three local
        measurements had all missed it, and only a clean checkout could.
      - Run 2 (`96a99d36`), after the fix: **GREEN**. 96 suites, **2272 passed**,
        `passed=2272 ran=2272 failed=0 skipped=0`. So the count *is* reproducible
        across macOS and Linux once the suite is portable, and MIN_PASSED=2272 is
        correct.
      - **Wall clock: 77s** of the 900s timeout — `timeout-minutes: 15` has ~11x
        margin, so the local extrapolation (~57s user CPU) was sound.
      - Both artifacts uploaded non-empty, with the per-attempt names.
      - Run 3 (`a572ee27`, `workflow_dispatch`): **GREEN**, same numbers, 69s.
        Its only purpose was to close a gap in the record: a GitHub Actions
        `major_outage` meant the merges of #11 and #9 dispatched no run at all —
        not queued, not cancelled — so `main` sat two commits ahead of anything
        CI had ever seen. Runs missed during an outage are not replayed when it
        ends; someone has to ask. Reasoning that neither commit touched test
        code was correct but is not evidence, and this item is specifically
        about preferring the measurement.
- [ ] 5.3 `jest-junit.config.js` is dead config — jest-junit reads
      `package.json#jest-junit` or `JEST_JUNIT_*`, not that file. `junit.xml` is
      written to the repo root. An upload pointed at `reports/junit/` produces
      nothing and warns into the void — the same defect 2.2 exists to fix.
      **Confirmed at source** in `node_modules/jest-junit/utils/getOptions.js`:
      options merge in the order defaults → inline reporter options →
      `package.json#jest-junit` → `JEST_JUNIT_*`. No `.config.js` file is ever
      read. This item's enumeration omitted **inline reporter options**, which
      is the channel a future reader is most likely to reach for; the conclusion
      is unaffected, since `jest.config.js:61` passes the reporter as a bare
      string. `reports/` does not exist on disk. `tests.yml` uploads from the
      repo root accordingly. **Still open:** the inert `jest-junit.config.js`
      file itself is on disk (as is `jest.config.updated.js`, per 5.8).
- [x] 5.4 Gate on `tests=` in `junit.xml` not dropping below a committed
      baseline. `testPathIgnorePatterns` (`jest.config.js:31-64`) already
      quarantines 8 files, and its own comment records that one quarantine was
      false and hid 14 real assertions. Without a floor, the cheapest way to
      green a required check is to add a line there.
      **Landed WITH 5.1 rather than after it — a deliberate departure from this
      plan's own sequencing.** Two reviewers independently named its absence the
      single most important gap, on the grounds that 5.1 alone certifies "jest
      exited 0", not "the suite ran", and that Phase 5's exit criterion is
      literally "a jest check that cannot go green by shrinking". Sequencing it
      after 5.2 was meant to avoid baking in an unobserved number; that risk is
      lower than it looked, because the count is deterministic and was measured
      three times. If ubuntu disagrees, the first run fails **loudly**, which is
      the information 5.2 wanted anyway.
      **New evidence that this list rots unaudited: four of its eight explicit
      entries point at files that no longer exist** (all four
      `__tests__/performance/*` paths).
- [x] 5.4a `tests=` counts **skipped and todo** cases, so `it.skip`/`xit` disables
      assertions while the floor holds. Also assert `<skipped>` does not rise, or
      gate on *passed* rather than *tests*. Fail closed on a missing or
      unparseable `junit.xml`.
      **Done — but NOT by gating on `passed`, which is what this item asked for
      and what an earlier revision of this line claimed had shipped.** The
      merged workflow computes `ran = tests - skipped` and gates the floor on
      `ran`, with **separate** assertions for failures and for skips. `passed`
      is computed and printed for diagnosis, and never asserted on.
      **Known naming wart, recorded rather than quietly left:** the env var is
      still called `MIN_PASSED` although it is now compared against `ran`. The
      value and the behaviour are both right, but the name says the thing the
      code stopped doing — the exact defect class this plan keeps catching. Fold
      the rename into the next commit that touches `tests.yml`; do not raise a
      PR solely for it.
      Why the change: failures are counted inside root `tests=`, so gating the
      floor on `passed` made an **intact** suite with N genuine failures report
      "the suite shrank" and invite someone to lower the floor when nothing had
      been removed. Gating on `ran` fixes that at the source — see the
      corresponding retraction below, which this line used to contradict.
      Note a second detail this item got wrong: the root `<testsuites>` element
      carries **no `skipped` attribute at all**; only the child `<testsuite>`
      elements do, so the check must sum the children. Written as "assert
      `<skipped>` does not rise" and read off the root, it would have asserted
      nothing.
      Verified against ten cases before commit, each observed to fail or pass as
      required: real 2272 suite passes; suite grown to 2300 passes; missing file
      fails closed; unparseable file fails closed; `tests="0"` fails; failures
      fail; errors fail; skipped fail; three simultaneous problems all report
      rather than short-circuiting; and a real end-to-end mutant — appending one
      path to `testPathIgnorePatterns` — where **jest exits 0 with 2210 tests**
      and the floor is what turns it red. Baseline re-measured under `.nvmrc`'s
      node 20.19.1 specifically, not just the machine default.
      **Three hardenings added in review round 3, two of them fixing defects I
      had just introduced:**
      - The gate must not key on `steps.jest.outcome == 'success'`. Adding
        `continue-on-error: true` to the test step — the ordinary "unblock the
        branch" move — makes jest's outcome `failure` but its conclusion
        `success`, which would **skip this gate entirely and let the job report
        green over failing tests**. All post-test steps now share one
        positive-match condition, and the script asserts `failures == 0` itself
        rather than being purely downstream of jest's exit code.
      - `overwrite: true` on the artifact uploads (added to fix a v4 duplicate-
        name 409 on "Re-run failed jobs") **deletes the failed attempt's report**
        — the one naming the flaky test, discarded exactly when someone is
        re-running to identify it. Names are now suffixed per attempt instead,
        so both survive.
      - `skipped` is fatal, not a warning. The floor is a constant with no
        ratchet, so every test added widens the gap between it and reality, and
        that gap is precisely how many tests can be `it.skip`'d out while the
        check stays green. Zero skipped today, so this cost nothing to adopt.
- [ ] 5.5 `--coverage` gates nothing — there is no `coverageThreshold`. Note
      `jest.config.js:5` sets `collectCoverage: true` **globally**, so adding a
      threshold also fails developers' local watch runs, and "drop the flag" does
      not help because the config key, not the CLI flag, enables it.
- [x] 5.9 Add lint and typecheck to CI too — **neither runs anywhere today**
      (`grep -rn "tsc\|eslint\|lint" .github/workflows/` → nothing). Restore v1's
      measured baseline while doing it: `tsc --noEmit` reports **141** errors, 5
      of them in `dataUpdateService.ts`. That number exists nowhere else in the
      repo, and v2 dropped it — which is how a measured fact becomes unknown
      again. Non-blocking, but gate on "no increase over 141".
      **Done** — `.github/workflows/static-analysis.yml`, jobs `ESLint` and
      `TypeScript`. Both names checked unique against every other job in the
      repo (5.7's three existing collisions are untouched and still there).
      **The 141 held exactly.** Re-measured before writing anything, and it is
      the same number v1 recorded — so the figure survived the round-trip
      through v2 dropping it, which is the entire point of this item.
      **This item understated the gap.** It says lint and typecheck do not run
      in CI. The sharper fact: there was **no typecheck script at all** —
      `package.json` had `lint` (invoked by nothing) and nothing resembling
      `tsc --noEmit`. Metro and Babel strip types without checking them, and
      jest runs through babel-jest, so a type error has always been able to
      reach `main` through *every* gate this repo has, now including the
      required `Jest Unit Tests`. A `typecheck` script is added for humans.
      - **Lint is green today and could be required immediately**: 364
        problems, **0 errors**, 364 warnings — eslint exits 0 on warnings.
        Which is the problem: without a threshold the job could never fail, so
        it is gated with `--max-warnings 364`, a ratchet rather than a target.
        Verified the flag survives `npm run lint --` and sets the exit code
        (`--max-warnings 10` → 1, `364` → 0) rather than assuming passthrough.
      - **Typecheck cannot gate on zero**, so it gates on no-increase over 141,
        exactly as this item specifies.
      **5.13's portability trap recurred, in a second location.** `tsconfig.json`
      includes `.expo/types/**/*.ts` and `expo-env.d.ts`; **both are gitignored
      and untracked**, generated by expo and absent on a clean checkout. A local
      run type-checks 243 files, a clean checkout 241. Had the floor been set
      from the developer machine — which is precisely how 5.13 got its first red
      run — the job would have failed on its first CI run for a reason having
      nothing to do with the code. Measured by moving both files aside locally
      and re-running: **errors stayed 141 in all three configurations** (both
      present, one absent, both absent), so only the file count moves.
      **The gate checks the type SURFACE as well as the error count.** An error
      ceiling alone is greenable by adding an `exclude` to `tsconfig.json` —
      stop checking the files that error and the count falls. That is the same
      hole `MIN_TESTS_RUN` closes for jest, and it needed closing here for the
      same reason, so `MIN_TS_FILES=241` sits beside `MAX_TYPE_ERRORS=141`.
      Both come from one `tsc --listFiles` invocation: two runs could disagree
      and there would be no way to know which was right.
      **Measured rather than assumed, and two would have caused false greens:**
      - `tsc` exits **2**, not 1, with `--noEmit` and diagnostics present. The
        gate therefore treats the exit code as a consistency check ("non-zero
        implies at least one parsed diagnostic", which catches a crash or OOM)
        rather than as the verdict.
      - A **config** error (`TS5xxx`, `TS18003`) arrives with no file prefix and
        would otherwise count as a single error — comfortably under 141, and
        green, while nothing was type-checked at all. Failed closed separately.
        Deliberately not a blanket `TS6xxx` exclusion: `TS6133` is a real
        diagnostic this repo has by the dozen.
      **The gate script was tested against nine cases before landing** — the two
      real logs, ceiling breach, floor breach, improvement, config error, a
      crashed run, a hypothetical clean repo, and a missing log. The crash case
      found a live bug: an unguarded improvement notice told the reader to lower
      the ceiling to 0 when tsc had produced no output, sitting right beside the
      errors saying the compile never happened. The job failed correctly either
      way — the *advice* was wrong, and acting on it would have hard-failed the
      next honest run. Notice now prints only when nothing else failed.
      **Observed in CI on the first run** (PR #14), recorded here before either
      check is required, per 5.2's rule about measuring rather than reasoning:
      `type_errors=141 ceiling=141 checked_files=241 floor=241 tsc_exit=2`, and
      `364 problems (0 errors, 364 warnings)`. Both green, first attempt.
      The predicted **241** is the number that matters: a local run reports 243,
      so a floor taken from a developer machine would have gone red immediately
      — the simulation is what prevented a repeat of 5.2's run 1.
      Note both ratchets sit at **zero headroom** by construction: one new
      warning or one new type error turns the relevant check red. That is the
      intent, and it is also the thing most likely to feel obstructive first.
      **Not yet required**, and per 5.6's ordering constraint it cannot be until
      GitHub has seen both contexts at least once. That is a follow-up decision,
      not an oversight.
- [x] 5.10 **NEW, found reviewing 5.1: `develop` does not exist, and the
      `branches:` filter on `pull_request:` produces silence rather than a red
      check.** Both existing workflows trigger on `branches: [main, develop]`
      (`e2e-tests.yml:4-7`, `maestro-e2e.yml:17`). There is no `develop` branch
      in this repo, local or on origin — that half is simply dead config. The
      live half is worse: on `pull_request`, `branches:` filters the **base**
      branch, and `git ls-remote --heads origin` shows four non-`main` branches
      today. A PR stacked on any of them changes source code and displays **no
      check at all** — not red, not pending, nothing. (Branch names deliberately
      not listed: checking during this review found local tracking refs were
      already stale against origin, which is the same decay this plan keeps
      catching in comments.)
      `tests.yml` drops the filter on `pull_request:` for this reason; the two
      E2E workflows still have it.
      - Note the ordering trap this creates with 5.6: making a check *required*
        while it can decline to run on a valid PR leaves that PR permanently
        pending and unmergeable. Fix the trigger before requiring the check.
      **Done** — PR #11, `f0fad18b`. Both E2E workflows now trigger on
      `push: branches: [main]` plus an unfiltered `pull_request:`. The paragraph
      above is preserved as written, so read "the two E2E workflows still have
      it" as the state at the time of the finding, not now.
      The ordering trap was honoured: this landed *before* 5.6 made a check
      required, which was the whole reason it jumped the queue.
- [x] 5.13 **NEW, and the single most valuable thing CI found: the test suite
      was not portable.** `allbeers.json` and `mybeers.json` are gitignored and
      untracked, and **nine test files reference them**. On a clean checkout
      they do not exist:
      - `dataRefresh.integration.test.ts` failed to **load**, taking 15 tests
        with it;
      - two tests in `dataUpdateService.integration.test.ts` failed with ENOENT.
      So the honest number on a clean checkout was **2257 with 2 failing**, and
      "2272 tests pass" was only ever true on a machine holding two untracked
      data files. Every local measurement in this plan — including the three
      used to set the floor — silently had them. **No amount of local
      verification or code review could have found this; only a clean checkout
      could**, which is exactly what 5.2 was written to force.
      Fixed by committing both under `src/services/__tests__/fixtures/` and
      pointing the two on-disk readers there, resolved from `__dirname` rather
      than `process.cwd()`. The other seven files only use
      `https://example.com/allbeers.json` as a mock URL string and never touch
      disk. Verified by reproducing CI's condition locally — with the untracked
      root copies moved away, the full suite is 96 suites / 2272 / exit 0.
      - Gotcha worth keeping: the `.gitignore` entries are **bare patterns**, so
        they match at any depth. The committed fixtures were silently ignored
        until re-included with `!` negations.
      - The fixtures are in `.prettierignore`: they are captured API responses,
        and keeping them byte-identical means a real change to the payload shape
        shows up as a diff instead of hiding behind reformatting.
      - Note this says nothing good about the *other* eight quarantined or
        fixture-dependent paths. It is the first time this suite has ever run
        anywhere but a developer's machine.
- [ ] 5.11 **NEW, then DOWNGRADED on review: nothing prevents a committed
      `.only`.** `.eslintrc.js` extends `expo`; `eslint-plugin-jest` is not
      installed, so there is no `no-focused-tests` rule, and `.husky/pre-commit`
      lints staged files only. Zero instances today.
      **Why this is now low priority rather than a gap:** `it.only`/
      `describe.only` marks the *other* tests in that file pending, jest-junit
      records those in the suite's `skipped` attribute, and 5.4's gate treats
      any `skipped > 0` as fatal. So a committed `.only` goes red today, and
      `.only` cannot skip tests in other files. A dedicated lint rule would be
      belt-and-braces, not the guard.
- [ ] 5.12 **NEW: `jest.setup.js` replaces `console.*` with `jest.fn()` for
      every suite**, so the `junit.xml` this job uploads carries none of the
      diagnostics a failing test printed. Worth knowing before anyone relies on
      that artifact to debug a CI-only failure. Pre-existing; not introduced by
      5.1.
- [x] 5.6 Making a check required is **branch protection**, not a file edit.
      Name who does it. First establish what is required *today* — nothing in the
      repo records it, and if nothing is required then every finding here is
      advisory for merge purposes.
      **This is the load-bearing assumption under 5.4's floor, and it is
      currently false.** The floor's guarantee is "no shrunken suite reaches a
      mergeable commit", and the proof of that runs: a shrink makes the step
      exit 1 → job red → merge blocked. The last arrow does not exist here.
      `main` has no branch protection and no rulesets, so a red `Jest Unit Tests`
      blocks nothing, and neither would 2272 failing tests. The gate is a
      trustworthy *signal* today and an *enforcement* mechanism only after this
      item is closed. Do not describe it as the latter until then.
      **Ordering constraint:** a status check cannot be marked required until
      GitHub has seen the context at least once, so this cannot be done first.
      The sequence is: land the workflow → let it run → *then* add the rule
      naming `Jest Unit Tests`. And per 5.10, fix the trigger before requiring
      it — a required check that declines to run on a valid PR leaves that PR
      permanently pending and unmergeable.
      **Done.** Classic branch protection on `main`, applied by the repo owner
      (`admin: true`; the answer to "name who does it" is that there is exactly
      one person who can). Settings, as read back from the API rather than as
      requested:
      `checks: [{app_id: 15368, context: "Jest Unit Tests"}]`, `strict: false`,
      `enforce_admins: true`, `required_pull_request_reviews: null`,
      `allow_force_pushes: false`, `allow_deletions: false`.
      - `app_id` was pinned by GitHub, not asked for, and it narrows 5.7: the
        required context is satisfiable only by a check run from the Actions
        app, so a same-named status from any other source cannot green it.
        5.7's collision problem is unchanged *within* Actions.
      - `enforce_admins: true` is deliberate and, on a one-maintainer repo, is
        the whole of the enforcement — with it false there would be no one the
        rule applied to. It also blocks direct pushes to `main` that have not
        passed. The escape hatch is disabling the rule, which is visible in the
        audit log; that is the intended cost.
      - `strict: false`: a PR merges on a green check against its own head, not
        against the latest `main`. Accepted risk, stated plainly — two PRs that
        are each green alone can still land a red `main` between them. The
        post-merge push run on `main` is what catches that, after the fact.
      - `required_pull_request_reviews: null` because a solo maintainer cannot
        approve their own PR; requiring one review would make `main` unmergeable
        rather than protected.
      **What this closes, precisely:** the missing last arrow above now exists,
      so 5.4's floor is an enforcement mechanism and may be described as one.
      **What it does not close:** the rule was verified by reading the API, and
      by the ordering constraint being satisfied (the context existed). It has
      not yet been observed *blocking* anything. First PR to carry a red
      `Jest Unit Tests` is the real proof.
- [ ] 5.7 **No two check contexts may share a name.** **Corrected: this
      inventory was short by one.** *Three* names collide across the two
      workflows, not two — `Test Summary` (`e2e-tests.yml:411`,
      `maestro-e2e.yml:807`), `Maestro E2E Tests (iOS)` (`:12`, `:30`) **and
      `Maestro E2E Tests (Android)`** (`e2e-tests.yml:155`,
      `maestro-e2e.yml:635`), which no version of this plan mentioned. Phase 0
      adds a third source for each of the two Maestro names via dorny's `name:`
      input. After Phase 3 lands in one workflow and not the other — and they
      have already drifted — one will be **green and one red under the same
      name**. That is a green-over-red neither review round found, and it is
      really an argument for doing 6.1.
      The new `Jest Unit Tests` job was checked against a full inventory of both
      workflows and collides with nothing.
- [ ] 5.8 Delete or wire up `jest.config.updated.js`, unused beside the real config.
- [x] 5.14 **NEW, found by the first green run's annotations: every `actions/*`
      pin in this repo was on a Node 20 runtime being force-run on Node 24.**
      The warning is emitted per run and is easy to read as cosmetic. Two things
      made it worth acting on rather than filing:
      - `actions/cache@v3` (5 uses, all in `maestro-e2e.yml`) is not merely
        deprecated. v3 targets the cache service GitHub retired; it is not a
        version behind, it is a version that cannot work. Nobody noticed because
        the workflow containing it has failed on every push since March, so its
        cache steps have no audience.
      - The pins were four to five majors stale, not one — `checkout@v4` against
        `v7`, `upload-artifact@v4` against `v7`, `download-artifact@v4` against
        `v8`. Left alone this compounds: whoever eventually fixes Phase 3/4 gets
        the version sweep as unavoidable extra scope, mixed into a diff where a
        real regression could hide in it.
      **Done**, first-party actions only, across all three workflow files:
      `checkout` v4→v7, `setup-node` v4→v7, `upload-artifact` v4→v7,
      `download-artifact` v4→v8, `cache` v3→v6, `setup-java` v4→v5.
      Breaking changes were read, not assumed, and two would have bitten:
      - `setup-node` **v5** auto-enables caching when `package.json` has a
        `packageManager` field, and **v6** narrows that to npm. Inert here:
        there is no `packageManager` field, and all eight call sites already
        pass `cache: 'npm'` explicitly. Had either been otherwise, caching
        behaviour would have changed silently on upgrade.
      - `download-artifact` **v8** changes digest-mismatch handling from a
        logged warning to a hard error by default. That is a *good* default and
        is left at it, but it means a corrupted download now fails the job
        instead of proceeding quietly — worth knowing before blaming the bump.
      - `upload-artifact` v7 keeps `if-no-files-found` and
        `include-hidden-files`, and `download-artifact` v8 keeps the inputs in
        use; verified against each action's `action.yml` at the pinned tag
        rather than from memory.
      **Deliberately NOT bumped:** the third-party actions —
      `expo/expo-github-action@v8` (v9 exists), `dorny/test-reporter@v1` (v3),
      `android-actions/setup-android@v3` (v4),
      `reactivecircus/android-emulator-runner@v2`. All four live only in the two
      permanently-red workflows, none appeared in the deprecation annotation,
      and their majors carry behavioural changes that cannot be verified while
      those workflows fail for unrelated reasons. Bumping them blind would add
      unverifiable churn to the exact diff Phase 3 needs to read cleanly.
      **Verification asymmetry, stated plainly:** the `tests.yml` bump is proven
      by the required check going green on this PR. The `e2e-tests.yml` and
      `maestro-e2e.yml` bumps are **not verified by anything** — those workflows
      were already red before the change and are red after it. They are a
      strictly-better-than-`cache@v3` guess, not a tested change, and Phase 3
      should treat them as untested config.
- **Exit:** a jest check that cannot go green by shrinking. Note the *required*
  half cannot be closed by the implementer — branch protection does not exist and
  is not a file edit; 5.6 gates this phase's exit. **5.6 is now closed**, so this
  phase's exit condition is met.

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
- [x] 6.3 `actions/cache@v3` → `@v4`. **6.2 and 6.3 are hygiene, not recovery.**
      Do them in one ten-minute commit this week or move them out of this plan —
      leaving them as unticked boxes in a recovery plan is how the plan stops
      being trusted.
      **Done, overshot, and the item was wrong about why it mattered** — 5.14 /
      PR #12 took `cache` to **v6**, not v4, as part of a first-party sweep.
      Filed here as hygiene; it was not. v3 targets the cache service GitHub
      retired, so those five steps could not have been caching anything. The
      correct severity was "broken", and it read as "tidy up" because the only
      workflow using it has been red since March.
      Ticked one commit late, which is precisely the decay this item warns
      about — the sweep landed in #12 without closing the box it satisfied.
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
- [x] v3: 5.7's inventory — **three** names collide, not two. `Maestro E2E Tests
      (Android)` is duplicated across both workflows and no version of this plan
      noticed.
- [x] v3: 5.4a's "assert `<skipped>` does not rise" — the root `<testsuites>`
      element has no `skipped` attribute, so read literally off the root this
      asserts nothing. Must sum the child `<testsuite>` elements.
- [x] v3: "2272 tests pass on developer machines" was stated without a
      measurement anywhere in the repo. It is true — but it was inherited, not
      verified, until 5.1 measured it three times.
- [x] v3/5.4a: "`tests=` counts skipped **and todo**" — todo is excluded from
      `tests=` entirely (jest tracks `numTodoTests` separately and jest-junit
      sums only failing+passing+pending). Gating on `passed` is still right, but
      for a different reason than the one recorded.
- [x] v3 implementation: gating the count check on `steps.jest.outcome ==
      'success'` — looked tidy, was a trapdoor. See 5.4.
- [x] v3 implementation: `overwrite: true` on the uploads — fixed a real 409 by
      destroying the evidence it existed to preserve. See 5.4.
- [x] v3 implementation: comparing the floor against `passed` — failures
      subtract from `passed`, so an **intact** suite with 5 genuine failures
      reported "the suite shrank" and invited someone to lower the floor when
      nothing had been removed. The shrink check now uses the count that
      *executed* and is suppressed entirely when tests failed. Worst part: this
      was visible in my own verification output and I read past it, because the
      case exited 1 as expected and I checked the exit code rather than the
      message.
- [x] v3 implementation: relying on jest-junit's root `errors`. With
      `reportTestSuiteErrors` at its default, a suite that fails to **load**
      contributes nothing to the report — no error count, no test count — so
      root `errors` is structurally always `"0"` and a blown-up suite reached
      the gate looking exactly like a deliberately deleted one. Now switched on
      via `JEST_JUNIT_REPORT_TEST_SUITE_ERRORS` on the test step.
- [x] v3 implementation: suppressing the shrink check when tests failed. The
      stated reason — "failures subtract from the executed count" — was false
      for the metric it guarded: root `tests=` **includes** failing tests, so an
      intact suite with N failures never trips the floor anyway. The guard did
      nothing except hide genuine shrinkage on red runs. Removed.
- [x] v3 implementation: reading failures from XML **attributes only**. A suite
      where every test passes but a late hook (`afterAll`) throws is recorded by
      jest-junit as a synthetic `<testcase><failure>` in the body, with
      `failures`/`errors` left at 0 at both suite and root level — verified
      against jest 29.7.0, root reads `tests="1" failures="0" errors="0"`. The
      gate saw nothing wrong. Harmless today because jest's own exit code
      catches it, which is **exactly the guarantee `continue-on-error` removes**
      — so the defence against that trapdoor had a hole in the same shape as the
      trapdoor. The gate now also counts `<failure>`/`<error>` elements in the
      body and takes the larger.
- [x] v3 review: a proposal to harden the gate by comparing `tests=` against the
      number of `<testcase>` elements. Declined, and the decline was then proven
      right by measurement: 2 passing + 1 `it.skip` + 2 `it.todo` yields
      `tests="3"` and **five** `<testcase>` elements, because jest-junit writes
      testcases for todo cases while excluding them from `tests=`. That check
      would have gone red on any repo using `it.todo`. Recorded here because the
      workflow comment now warns against re-proposing it.

Every one of these is mine. Three rounds of review have now produced twenty-five;
the diagnosis survived all three.

**The pattern worth naming, because it recurred three times:** every fix I made
in response to a review round introduced a defect the next round caught —
`overwrite: true` destroying the evidence it was added to preserve, the
`outcome == 'success'` gate that a one-line `continue-on-error` could disarm,
and a shrink check that cried "tests were removed" on every ordinary failure.
None was careless in isolation; each was a locally sensible response to a real
finding, with a second-order effect the finding did not mention. The lesson is
not "review more" but "re-derive the failure case after each fix" — which is
also how the last one was found, in my own verification output, by reading the
message instead of the exit code.

**One reviewer contradiction, settled rather than split.** Round 3 produced
directly opposed advice on the count-check's condition. One reviewer read the
GitHub runner source (`StepsRunner.cs`, `ExecutionContext.cs`) and proved a
step whose `if` evaluates false is completed as `Skipped` **and** populates
`steps.<id>.conclusion` — refuting the other reviewer's premise that it would
dereference to the empty string. But it then recommended gating the check on
`outcome == 'success'` so the check *skips* on failure, which is exactly the
`continue-on-error` trapdoor the other reviewer found. Both were partly right:
the ambiguity is settled (it is `'skipped'`), and the negative test would have
worked — but the positive, uniform condition is what closes the trapdoor. The
tie-breaker was which formulation is red in *both* scenarios, not which
reviewer had the better source.

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
