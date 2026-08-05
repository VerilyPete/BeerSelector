# CI recovery plan

Written 2026-08-05, immediately after PR #8 merged as `817694ad`.

PR #8 fixed two bugs that were hiding CI's real state: a Test Summary that
printed green over failing jobs, and a `maestro --version` check that captured an
analytics banner instead of a version and exited 1 on every job. With both fixed,
the E2E suite ran for the first time in the branch's history and returned
**21/21 flows failed**.

Nothing in that failure touches PR #8's code. Every flow dies on its *first*
assertion, 20–59s in, before reaching any network, ETag, lock or migration path.
This plan is about the suite, not the change.

## What we know, and how well

| Claim | Confidence | Basis |
|---|---|---|
| 21/21 flows fail on their first assertion | **Certain** | CI log, run 30943454950 |
| No JUnit XML has ever been produced | **Certain** | `FileNotFoundException: test-results/maestro-ios.xml`; no `mkdir -p` in either workflow |
| Jest never runs in CI | **Certain** | `.github/workflows/` contains only the two e2e workflows |
| The app renders nothing because it is a Debug build with no Metro | **High, not verified** | see below |
| The flows' selectors are correct once the app renders | **Unknown** | cannot be known until the app renders |

## The leading hypothesis

Every E2E build is `-configuration Debug` (`e2e-tests.yml:115`,
`maestro-e2e.yml:177`, `:354`, `:548`) and **no Metro bundler is started anywhere
in either workflow** — `grep -niE "metro|bundler|expo start|8081"` returns
nothing but the unrelated mock server.

A Debug React Native build does not embed its JS bundle; Xcode's "Bundle React
Native code and images" phase is a Release-only step, and at runtime a Debug
build fetches from Metro on :8081. With no Metro, the app launches to a red
screen or a blank one, no JS ever evaluates, and every `assertVisible` times out
regardless of what it names.

Four things fit this and little else does:

1. The failure is **total and uniform** — 21/21, no partial passes.
2. It is **indiscriminate**: flows asserting `all-beers-container`,
   `welcome-section`, `"Settings"`, and `"Welcome to Beer Selector"` all fail
   identically. A selector problem would not take out the settings flows too.
3. Each flow burns its full timeout (20–59s) rather than failing fast — the shape
   of waiting for an element that never arrives, not of tapping a wrong label.
4. The flows carry a "Dismiss Expo dev menu if present / `visible: Reload`" step,
   which only makes sense against a dev build that expects Metro.

The repo already has the counter-example: the performance job builds
`-configuration Release` (`e2e-tests.yml:376`). The E2E jobs did not follow it.

**This is a hypothesis with strong circumstantial support, not a verified
diagnosis.** Nobody has watched the app launch on a CI simulator. Phase 1 is
designed to confirm or kill it cheaply before any other work is done.

## Phase 1 — prove the diagnosis before fixing anything

Do not skip to Phase 2. If the cause is something else, every hour spent on
selectors is wasted, and this project has already been bitten twice by acting on
a confident-sounding account that turned out wrong.

- [ ] 1.1 Add a screenshot immediately after `launchApp` in one flow, and upload
      it as an artifact. One picture settles it: red screen / blank / a real UI.
- [ ] 1.2 Capture the simulator's app log for the same run (`xcrun simctl spawn
      <udid> log stream --predicate 'processImagePath contains "BeerSelector"'`).
      A Metro connection failure names itself there.
- [ ] 1.3 Record the verdict here before proceeding, including if it refutes the
      hypothesis above.

## Phase 2 — make CI able to produce evidence

Independent of the diagnosis; do these regardless, because they are why the
failure went unseen for so long.

- [ ] 2.1 `mkdir -p test-results` before every `maestro test --output ...`, in
      both workflows. Without it Maestro throws after every run and no XML is
      ever written — which is why the summary's XML-inspecting arms have never
      had anything to inspect, and why `if-no-files-found: warn` has been warning
      into the void.
- [ ] 2.2 Upload Maestro's own recordings and `~/.maestro/tests` on failure, and
      confirm the artifact is non-empty. The upload step exists; nothing has ever
      checked that it produced anything.
- [ ] 2.3 Assert in the workflow that the JUnit XML exists and contains at least
      one `<testsuite>`. A missing report should fail loudly, not silently.

## Phase 3 — fix the launch (assuming Phase 1 confirms)

- [ ] 3.1 Switch the E2E iOS builds to `-configuration Release`, matching the
      performance job. Preferred over starting Metro: no background process to
      race, no port to collide, and it exercises the artefact users actually run.
- [ ] 3.2 If Release is impractical, start Metro (`npx expo start --dev-client`)
      with a readiness gate on :8081 before Maestro runs — **not** a bare `sleep`.
- [ ] 3.3 Re-run and record how many of the 21 now pass. Expect partial success,
      not green: the launch fix cannot fix a wrong selector.
- [ ] 3.4 Remove the "Dismiss Expo dev menu" steps if Release makes them dead.

## Phase 4 — the flows themselves

Only meaningful once the app renders. Finding 9.21 corrected 48 selectors that
"could never have worked"; that correction has still never been executed.

- [ ] 4.1 Triage the remaining failures into: wrong selector, wrong app state, or
      real defect. The third category is the one that matters and the least
      likely.
- [ ] 4.2 Settle the app-state question the flows have never had to answer: a
      fresh CI install has no API URLs and no session, so `_layout.tsx` routes to
      Settings. Flows that `tapOn: "All Beers"` assume a configured Home tab.
      Either seed configuration in a setup flow or make each flow honest about
      the state it needs.
- [ ] 4.3 Re-examine 7.3 and 9.21 with real evidence and close or reopen them.
- [ ] 4.4 Multi-hop tab navigation (9.8) is still unverified in both directions.

## Phase 5 — run the tests that actually exist

- [ ] 5.1 Add a jest job: `npm run test:ci` on `ubuntu-latest`, on PR and push.
      2272 tests currently pass on developer machines and are verified by no
      automated system. Every "all green" claim in this repo's review history,
      including every one made during PR #8, describes a suite nothing in CI runs.
- [ ] 5.2 Make it a required check. Cheap (minutes, Linux) and it is the only
      gate that would have caught the stale `none://` test on the day it broke.
- [ ] 5.3 Consider `tsc --noEmit` as a non-blocking report. It cannot gate
      anything yet: there are 141 pre-existing errors, 5 of them in
      `dataUpdateService.ts`.

## Sequencing

5.1 is independent of everything else and delivers the most value per hour — do
it first or in parallel. Then 1, 2, 3, 4 in order.

Phase 4 is open-ended and should not block the rest. A repo whose unit tests run
in CI and whose E2E suite is honestly red is in a better position than one where
both are invisible, which is where this started.

## Standing caution

Two bugs hid this state for the entire life of the branch, and a third — the
summary reporting success over failure — hid it before that. Every fix here
should be judged by whether it makes CI able to *report* accurately, not by
whether it makes CI green. A green check that nothing verifies is what this
repo has just spent twelve review rounds learning to distrust.
