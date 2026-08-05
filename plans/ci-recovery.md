# CI recovery plan (v2)

Written 2026-08-05 after PR #8 merged as `817694ad`; revised the same day after a
four-reviewer gauntlet on PR #9. v1's diagnosis survived; almost none of v1's
supporting arguments did, and two of its proposed fixes would have made things
worse. Details are recorded rather than quietly corrected.

## Ordering

Read this first. v1 buried it a hundred lines down.

1. **5.1 (jest in CI)** — independent of everything, best value per hour. Start here.
2. **0 (the green check)** — blocking. Must land *before* 2.1.
3. **2 (evidence)** → **2.5 (what CI may talk to)** → **3 (the launch)** → **4 (flows)**.
4. **6 (stop paying twice)** — any time; halves the work in 2 and 3.

**Two hard gates.** 0 blocks 2.1: fixing the XML without it manufactures a green
check over red results. 2.5 blocks 3: fixing the launch is what starts pointing a
working test suite at a third party's production API.

**Convention for every box below:** record the outcome inline on the `[x]`,
including when it refutes what this plan says. That habit is most of why
`review-remediation-round-8.md` is trustworthy.

## What we know

| Claim | Confidence | Basis |
|---|---|---|
| The installed `.app` contains no JS bundle | **Certain** | CI log 30943454950 line 82441: `SKIP_BUNDLING enabled; skipping.` |
| 21 registered flows, all failed | **Certain** | `.maestro/config.yaml`; CI log |
| 20 of 21 failed on their first element command | **Certain** | mapped per-flow, this session |
| The 21st is explained by dev-launcher chrome | **High** | `expo-dev-launcher` is `debugOnly: true` and renders `Text("Home")`/`Text("Settings")` |
| CI will hit the real production API once the launch works | **Certain** | `ENV_BASE_URLS` — all three environments are the same live host |
| `e2e-tests.yml` has never produced JUnit XML | **Certain** | `FileNotFoundException`; no `mkdir` |
| `maestro-e2e.yml` **has** produced XML | **Certain** | writes bare filenames to the workspace, which exists |
| Jest never runs in CI | **Certain** | `.github/` contains exactly two workflows; `.husky/` is a local hook |
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
failed at the first string only the real app has. The same mechanism explains why
flow 15's `assertVisible: "Settings"` failed while flow 14's passed — different
launcher tab state.

**Consequence that outlives the fix:** some flows can pass assertions against
launcher chrome while the app is entirely absent. Any flow that turns green after
Phase 3 needs to be checked against *what* it matched. Assertions on bare "Home"
or "Settings" are not trustworthy signals today.

**Retracted from v1:** "Four things fit this and little else does." Three of those
four did not discriminate — a fresh install routing to Settings, or a hang in
`_layout.tsx` init, produce the same total/indiscriminate/full-timeout shape. The
fourth (the dev-menu step) was evidence about how flows were authored, not about
runtime. The diagnosis is right; that argument for it was not.

## Phase 0 — BLOCKING: the green check nobody has noticed

`dorny/test-reporter@v1` runs with `fail-on-error: false` at
`maestro-e2e.yml:242-250`, `:619-632`, `:796-804`. Per the action's source, that
makes `isFailed` unconditionally false and publishes its check run with
conclusion **`success`** regardless of the XML's contents — a check named
"Maestro E2E Tests (iOS)" reading green while its own title says
"0 passed, 21 failed".

**Currently latent, and that is the danger.** No such check exists today: the
workflow that ran the flows (`e2e-tests.yml`) never writes XML, and when
`files.length === 0` the action creates no check at all. **Phase 2.1 is what
switches it on.** Fixing the XML without fixing this manufactures exactly the
defect PR #8 spent twelve rounds removing, on a more prominent surface than the
step summary.

- [ ] 0.1 Set `fail-on-error: true` on all six `dorny/test-reporter` steps, or
      delete them. The `Run tests` step already fails the job, so this is not
      double-gating — it makes the check honest.
- [ ] 0.2 Verify empirically after 2.1 lands: a red suite must produce a red
      check. Do not take the source reading on trust.
- **Exit:** no check run on any commit reports success while its own report
  contains failures.

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
- [ ] 1.4 Replace `log stream` with `xcrun simctl spawn <udid> log show --last 10m`.
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
      `~/.maestro/` (`e2e-tests.yml:152`, `:306`; `maestro-e2e.yml:240`, `:617`,
      `:794`) can never resolve — the run warned "No files were found" even
      though `~/.maestro/bin/maestro` demonstrably existed. Use `$HOME`.
      v1 said "nothing has ever checked it produced anything"; the truth is the
      path could not resolve.
- [ ] 2.3 Assert on content, not presence. Presence arms already exist
      (`e2e-tests.yml:466`, `maestro-e2e.yml:895`, `:948`) — they print
      `INCONCLUSIVE` and never set `overall_fail`. Make the **iOS** ones fatal
      (Android's non-blocking status is a deliberate design decision — do not
      break it), and assert `tests="N"` equals the `config.yaml` flow count
      **and** `failures="0"`. "At least one `<testsuite>`" cannot tell 21 from 1,
      which is the mechanism that hid the unregistered flows in 4.5.
- [ ] 2.4 Verify Maestro 2.4.0's exit code on a flow failure before trusting any
      green. Today the missing directory is the only thing making
      `e2e-tests.yml`'s iOS step red; after 2.1 the exit code comes purely from
      Maestro, and nobody here has observed it.
- [ ] 2.5 Move Android's `continue-on-error` from the **job** to the single
      "Run Maestro tests on Android" **step** (`e2e-tests.yml:171`,
      `maestro-e2e.yml:647`). At job level it also blankets `npm ci`,
      `setup-java`, `expo prebuild`, `gradlew assembleDebug` and the Maestro
      version-pin assertion — so a broken lockfile or a regressed installer is
      reported as the known Android limitation.
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
      directory order. Restrict to `Release-iphonesimulator`, assert exactly one
      match.
- [ ] 3.4 Fix or drop the `ios/build` cache (`maestro-e2e.yml:163-169`, `:534-540`).
      Its key hashes only `ios/**/*.{h,m,swift}` — no JS, no lockfile, no
      `app.json` — and it is restored *after* `prebuild --clean`, so it survives
      it. A restored Release `.app` carries an embedded bundle from a previous
      commit: **the app renders, the tests pass, and CI has verified code that is
      not in the PR.** That is a green false positive, which is worse than the
      red one it replaces.
- [ ] 3.5 Add `CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO` to
      `e2e-tests.yml:112-119`, which lacks what `maestro-e2e.yml:181-182` has.
- [ ] 3.6 Remove the "Dismiss Expo dev menu" steps once Release makes them dead.
- [ ] 3.7 Watch for the next failure mode, which looks identical from outside:
      `_layout.tsx` returns `null` while `!loaded || !initialRoute`, so a stalled
      `useFonts` or init chain leaves a blank screen and full-timeout failures
      exactly as today. A blank screen after Phase 3 is **not** evidence Phase 3
      failed — confirm JS evaluated before re-diagnosing.
- **Exit:** per-flow record of pass/fail with the failing command, from a
  Release build verified to contain this commit's bundle.

## Phase 4 — the flows

- [ ] 4.1 Triage each failure: wrong selector, wrong app state, matched launcher
      chrome, or real defect.
- [ ] 4.2 Settle app-state expectations per flow. v1 said "the flows have never
      had to answer this" — too broad. Flows 07, 11 and 15 *do* expect the
      first-launch Settings redirect and assert it; flow 10 (`clearState: false`,
      `tapOn: "Home"`) assumes a configured app. **The inconsistency is the
      finding**, not the absence.
- [ ] 4.3 Re-examine 7.3 and 9.21 against real evidence; close or reopen.
- [ ] 4.4 Verify multi-hop tab navigation (9.8) in both directions, on a
      simulator. (v1 stated this without a verb.)
- [ ] 4.5 Inventory the **19 unregistered flows** — 40 `.yaml` files on disk, 21
      in `config.yaml`. The whole `20-31-loading-*` series and the
      `beer-list-*` files run nowhere. Adopt or delete; do not leave them.
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
- [ ] 5.5 `--coverage` gates nothing — there is no `coverageThreshold`. Add a
      floor or drop the flag.
- [ ] 5.6 Making a check required is **branch protection**, not a file edit.
      Name who does it. First establish what is required *today* — nothing in the
      repo records it, and if nothing is required then every finding here is
      advisory for merge purposes.
- [ ] 5.7 Rename one of the two `Test Summary` jobs. Both workflows define that
      exact context name, so a required-check rule matching it is ambiguous.
- [ ] 5.8 Delete or wire up `jest.config.updated.js`, unused beside the real config.
- **Exit:** a required jest check that cannot go green by shrinking.

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
- [ ] 6.3 `actions/cache@v3` → `@v4`.
- [ ] 6.4 `maestro-ios-critical` runs four `maestro test` calls in one `bash -e`
      block, so a first failure skips the other three and the job reports P0 on
      one flow. Use the `|| group_failed=1` pattern the parallel job already has.
      It also passes no `--output`, so it produces no XML.
- [ ] 6.5 "Check performance thresholds" (`e2e-tests.yml:405`) is a bare `echo`;
      `.flashlight/performance-tests.yaml` declares no thresholds and
      `config.yaml`'s `performance:` block is read by nothing. Currently masked
      because the job is always skipped — **Phase 3 makes it a permanently green
      job named for a check it does not perform.**
- **Exit:** one iOS E2E job per push, with a cache that cannot serve a stale bundle.

## Standing caution

Three separate bugs hid this state for the life of the branch, and v1 of this
plan would have added a fourth by fixing the XML without fixing the check that
reports on it.

Judge every item here by whether it makes CI **report accurately**, not by
whether it makes CI green. A green check that nothing verifies is what this repo
has spent twelve review rounds learning to distrust — and Phase 0 exists because
one was about to be created in the name of fixing exactly that.
