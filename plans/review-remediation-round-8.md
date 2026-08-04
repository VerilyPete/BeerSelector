# Round 8 remediation — the seven unreviewed commits

Six reviewers (four Claude agents + Codex, plus a follow-up design pass) audited
`42793c85..093f6122`. Those seven commits had shipped to PR #8 with **zero**
review, while the fifty-five before them had five rounds. The review found more
in the seven than the five rounds found in the fifty-five.

This plan works the findings to exhaustion, TDD-first, re-reviewing after each
wave until the team returns only nits a senior engineer would defer.

## Ordering principle

Wave 1 first because it is the only finding that can make a *shipped security
fix do nothing*. Everything else is wrong behaviour; that one is absent
behaviour behind five green tests.

Claims are corrected in the same wave as the code they describe, not batched at
the end. Batching them is how they drift in the first place.

---

## Wave 1 — nothing proves a migration is ever invoked

`CURRENT_SCHEMA_VERSION` and `runMigrations` have **zero** test references.
Reverting the constant to 7, or deleting the `if (fromVersion < 8)` block, passes
all 93 suites with output identical to baseline. Either would mean the
`auth_cookies` purge never runs on any device.

- [ ] 1.1 RED: test that `setupTables` invokes `runMigrations` when the stored
      version is below current, and does not when equal
- [ ] 1.2 RED: test that every registered migration version has a dispatch arm —
      i.e. a v8 database dispatches through the v8 arm
- [ ] 1.3 Confirm both mutants (constant → 7; gate deleted) now fail

## Wave 2 — code defects

- [ ] 2.1 **304 arm of `fetchAndUpdateAllBeers`** (`:861-887`) has no guard and
      stamps `all_beers_last_check` for a store it never checked. Found by three
      reviewers independently. The guard must cover the stamp, which currently
      sits outside the `all-beers-etag-invalidate` lock.
- [ ] 2.2 **304 arm untested on both plan writers** — hoisting the guard below
      the `not-modified` branch survives in `writeAllBeers` and
      `writeAllBeersOnLogin`. No test sets `notModified: true`.
- [ ] 2.3 **`prepareAllBeers:1573`** throws a plain `Error`, so an empty taplist
      reads "No valid beers found in API response" in a user alert on the
      sequential/manual path. Same defect `be4f6258` fixed two functions away.
- [ ] 2.4 **A failed `getPreference` is indistinguishable from a store switch.**
      `getPreference` swallows errors → `null` → `''` → guard reads "changed" and
      discards a correct taplist while reporting `success: true`.
- [ ] 2.5 **Cleared configuration treated as "allow"** — the mutant
      `current === '' || current === fetchedFor` survives, and `''` is the live
      state during every login (`LoginWebView:329/459`).

## Wave 3 — close the race

Codex's design, independently verified: lock **only** the final gate-open write
burst in each branch (`LoginWebView:364-378` member, `:462-479` visitor). Do NOT
wrap the whole sequence — `LOCK_TIMEOUT_MS` is 15s and `saveSessionData` is
uncontrolled Keychain I/O; a forced release does not drain the queue, so an
overrun would block every database consumer. Do NOT make `setPreference` itself
take the lock — ~8 sites call it from inside a held lock and would stall 30s.

- [ ] 3.1 RED: a test using the **real** `DatabaseLockManager` (not the
      passthrough mock) proving a login's gate-open write blocks while a taplist
      writer holds the lock
- [ ] 3.2 Wrap both gate-open bursts
- [ ] 3.3 Record the invariant: only a write of a new, non-empty store URL needs
      this lock (`DeveloperSection:187` writes `''` and is exempt)

## Wave 4 — test quality

- [x] 4.1 **Five tests silently made vacuous** by my incomplete fixture fix
      (`dataUpdateService.test.ts:695/710/765/780/797`) — they now take the
      abandon path and assert only that a fetch happened.
      Fixed: `taplistUrlIsStable` hoisted to `describe('dataUpdateService')`
      scope and parameterised by URL, so each test keeps the URL shape it
      exists to exercise. All five now also assert `dataUpdated` and the
      insert. A sixth (`should delegate fetch to fetchBeersFromAPI`) was found
      taking the same path and fixed with it. Re-instrumenting
      `abandonedAfterStoreSwitch` across the whole suite now shows only the
      store-switch tests and the cross-store de-dup test reaching it, all
      deliberately.
- [x] 4.2 `refreshCoordination.test.ts:181-240` — fixed 50-tick loop; one extra
      upstream `await` makes it a permanent green without ever going red.
      Fixed by moving the OBSERVATION, not by raising the count: the fetch
      count is captured while the first fetch is still in flight and asserted
      after the release, so "refused to join" and "arrived too late to try" are
      no longer the same number. **Both siblings had the same shape** and are
      fixed the same way: `does not let a different store join an in-flight
      fetch` (broken keying + 40 extra microtasks survived) and `clears the
      ETag only after the refresh it is overtaking has written` (deleted
      `settleInFlightRefresh` + 60 extra microtasks survived). The remaining
      two de-dup tests use no tick budget and were confirmed fail-closed by
      mutation.
- [x] 4.3 Partial cookie reintroduction (a single cookie under a benign key)
      survives the inverted `auth_cookies` test.
      Fixed: fixture cookies are now unmistakable sentinels, and the assertion
      is a substring search for every cookie value across every preference
      value written, under any key. The comment no longer claims more than the
      test delivers.
- [x] 4.4 `migrateToV8.test.ts:28` mocks `withTransactionAsync` as a passthrough,
      so removing the transaction is undetectable.
      Fixed: the mock tracks transaction depth and every write records the
      depth it ran at, including `recordMigration`. Kills both "transaction
      removed" and "version recorded outside the transaction".

## Wave 5 — false and overclaiming statements

Every one of these is mine.

- [x] 5.1 **"no `getPreference('auth_cookies')` call site has ever existed"** —
      FALSE. `authService.autoLogin` read it (`6dabf2b9` → `e727cf0c`), and a
      settings debug panel read it via `getAllPreferences` until `dc7a02f9`.
      Asserted in 4 places including a commit message. Verified against the
      current tree only, then stated as a claim about all history.
      Both history claims independently verified against the blobs before
      rewriting: `autoLogin` read it as its ONLY input, and `app/settings.tsx`
      rendered the value on screen. Corrected in `migrateToV8`'s docstring,
      which now also records that the inference "no `getPreference` call site
      therefore no reader" was unsound in itself — `getAllPreferences` is a
      second read path, and is the one the settings panel used. `a3254636`'s
      message cannot be rewritten, so the docstring names it as the correction
      of record.
- [x] 5.2 "MUST be called under the write lock" implies the lock makes
      check-and-write atomic. It does not — the mutator takes no lock.
      **ALREADY FIXED by Wave 3 (`7c585f2a`) — no change made.** The docstring
      now says the lock alone does not make check-then-write atomic and that
      soundness comes from `LoginWebView`'s gate-open bursts joining the same
      lock. Verified: both bursts do (`LoginWebView.tsx:395`, `:502`), and the
      three unlocked writes are all `''` (`:330`, `:492`,
      `DeveloperSection.tsx:196`), which the guard reads as "changed".
- [x] 5.3 "rejected downstream as a VALIDATION_ERROR" (`dataUpdateService:733`,
      `beerApi:242`, and a test comment).

      **The diagnosis this item originally carried — "true of one of two
      paths" — was itself stale, and acting on it would have made the comments
      worse. Do not follow it. It is struck out here rather than deleted
      because the mistake is the instructive part.** It was accurate when
      written. Wave 2 (`7013cd27`) then gave `prepareAllBeers` a typed
      `SourceFailureError`, which made the claim true of BOTH paths — so
      "soften it, it overclaims" would have deleted a true statement about
      working code. This is the second time this round a Wave 5 instruction has
      been outrun by an earlier wave's fix (see 5.2, which needed no change at
      all). Verify the claim against the tree before rewriting it; the plan is
      older than the code.

      Fixed by naming the two paths and saying why "both" is load-bearing —
      delegating the empty case downstream is only correct while EVERY
      downstream classifies it, so the sentence is a dependency, not a
      description. Corrected at `beerApi.ts`, `dataUpdateService.ts` and
      `fetchTaplistFromProxyOrDirect.test.ts`, each now pointing at
      `errorClassificationParity.test.ts` as the thing that enforces the parity
      they rely on.

      **A fourth site, which this item did not list and which is the worst of
      them**: `errorClassificationParity.test.ts`'s own file docstring, plus an
      inline comment on its second test, still described the defect in the
      PRESENT tense — a test file explaining that the behaviour proven correct
      immediately below is broken. Written in the same commit that fixed it.
      Both moved to past tense, with the tests named as what now holds it.

      LESSON, and it generalises past this branch: **a test file's own prose can
      go stale against the tests beneath it, and nothing in the suite catches
      that.** A wrong assertion goes red. A docstring that contradicts its own
      assertions stays green forever, and it is read as the authority on what
      the tests mean — so it misleads with more weight than an ordinary comment,
      not less. When a fix lands, the prose in the test file that proves it is
      part of the change, not commentary on it.
- [x] 5.4 "the credential is gone" — `DELETE` unlinks; no `secure_delete`, no
      `VACUUM`, WAL on. The bytes survive against the stated threat model.
      Premise verified: no `secure_delete` or `VACUUM` anywhere, WAL enabled at
      `connection.ts:25`. `migrateToV8`'s docstring now states what the DELETE
      does guarantee (no query returns it) and what it does not (the bytes are
      not overwritten; the pre-delete page image can persist in `beers.db-wal`
      until checkpoint), and says the honest word is "unlinked", not "gone".
      The remedy is named and deliberately not taken — it is a behaviour change.
- [x] 5.5 `LoginWebView:331` "Nothing reads these four" — now three. Fixed the
      docstring at `:28` and missed this one 300 lines down.
      Corrected to three, and reduced to a pointer at the docstring rather than
      a second copy of the argument — the restatement is why the two could
      disagree. Re-verified all three keys have no reader before saying so.
**5.6–5.10 were blocked on Wave 6; Wave 6 has landed and they are now done.**
The warning below was worth heeding: re-verifying against the tree first found
that two were already fixed and one had a false diagnosis in this very file.

Every claim below was checked by running the mutation against Maestro 2.4.0
locally, not by reading. The verified CLI behaviours are now stated once in
`.maestro/README.md` § "How Maestro validates this suite"; the flow and
workflow comments point there.

- [x] 5.6 "every flow using `wait` failed to parse" — the claim is false, but
      **this plan's stated reason for it was also false**, and executing it
      literally would have written a second wrong explanation over the first.
      Probed it: nested `runFlow: commands:` *is* validated, with or without
      `when:` — an invalid command there is rejected exactly as at top level.
      The real cause is that `beer-list-loading.yaml` is 12 concatenated YAML
      documents; Maestro reads only the first `header --- commands` pair and
      silently ignores the rest, so that file's `wait` was never parsed at all.
      Proven by a file whose later documents held an invalid command *and* a
      guaranteed-failing assertion: it ran `launchApp` and reported success.
      Corrected in all five sites — four now state the real (suite-aborting)
      consequence, and the fifth records why it was the exception.
      **This is the second time a Wave 5 item's diagnosis was itself wrong**
      (see 261cf1f6). Re-verify before executing is not a formality here.
- [x] 5.7 Already fixed by Wave 6's revert (`3204becf`) — the "adopting a
      working configuration" phrasing no longer exists in the tree. No edit
      made; confirmed absent rather than assumed.
- [x] 5.8 Already fixed by the same commit — no `placeholder` or `yourcompany`
      string survives anywhere in `.maestro`, `.github`, or `README.md`, and
      the cited `README.md:376` is past the end of the file. Nothing to do.
- [x] 5.9 Split by what could actually be checked. The load-bearing half is
      **true and now verified**: a directory holding one valid and one invalid
      flow ran zero tests — validation is whole-directory and precedes
      execution. The other half is gone: "both platforms" was never observed
      (Android is known-red and never got this far) and "twelve seconds" was
      never measured. The platform claim is retained explicitly as an
      inference, since it is a reasonable one, rather than deleted or left
      masquerading as an observation.
- [x] 5.10 The pin comment's "makes local a truthful predictor of CI" is
      conditionally false — nothing pins or checks the local CLI. Restated with
      the condition and the command that tests it (`maestro --version` must
      print 2.4.0). Removed from all six duplicated sites in the process.
- [x] 5.11 ~90 lines of duplicated comment prose — and the duplication *caused*
      5.6 by copy-paste. Collapse to one canonical statement. **NOW COMPLETE.**
      The `.maestro`/workflow half: the pin rationale appeared **6×** and the
      pin-assertion argument **5×**, byte-identical. The pin rationale is now
      in `.maestro/README.md` with all six sites pointing at it; the assertion
      argument keeps one canonical copy in `maestro-e2e.yml`, marked as such,
      with four pointers. The `wait` prose (5×) collapsed to the README too.
      This confirmed 5.11's causal claim rather than assuming it: the false
      "every flow" sentence was present in all five copies, so a single
      copy-paste propagated one wrong sentence to five files.
      The earlier source-file half: the
      duplicated block in source was the `auth_cookies` rationale, restated in
      `migrateToV8.ts`, `LoginWebView.tsx` and `LoginWebView.test.tsx` — ~39
      lines carrying the same three assertions, and all three carried 5.1's
      false sentence. `migrateToV8`'s docstring is now the canonical statement
      and the other two are pointers that say so. Checked and deliberately NOT
      collapsed: the lock invariant appears in both `taplistConfigurationHeld`
      and `DeveloperSection.tsx:187`, but those are two site-specific arguments
      that cross-reference each other rather than one text pasted twice — which
      is the pattern this item wants, not the one it condemns.

## Wave 6 — tooling and CI

- [x] 6.1 `verify-migration.sh` reports PASS when staging silently failed or the
      app was reinstalled. `q()` discards sqlite3's exit status; no `set -e`.
      Must assert staging landed, and require the planted marker to survive.
      Done in `2788fbd0`; the false PASS was reproduced before being fixed.
- [x] 6.2 **WON'T DO — closed by user direction, twice.** Was implemented in
      `2788fbd0` (all 39 `appId:` headers parameterised to `${APP_ID}`) and
      fully unwound 12 minutes later in `3204becf`: Android is not a focus.
      Re-confirmed by the user on 2026-08-02 after the question was re-raised.
      Current tree hardcodes `org.verily.FSbeerselector` in all 39 headers and
      carries no `-e APP_ID=` anywhere, so bare `maestro test .maestro/X.yaml`
      works — which the local validation loop depends on.
      **Note for whoever reads this next:** the item was re-raised against a
      working tree that had already been reverted, i.e. the question was asked
      about a state that no longer existed. `git log -1` against the specific
      file before re-opening a Wave 6 item.
      If Android is ever revived, `.maestro/config.yaml` records both real
      bundle IDs and states plainly that nothing currently reads them.
- [x] 6.3 `maestro-e2e.yml` is green regardless — its summary job decides PASS by
      testing whether an artifact directory exists, and never exits non-zero.
      Done in `2788fbd0`, which also found a second decorative summary job that
      this item had not flagged.
- [x] 6.4 `|| true` still masks `bootstatus`; the selected UDID is exported and
      never used (install falls back to `booted`, reintroducing the ambiguity).
      Done in `2788fbd0` — all five `SIMULATOR_UDID` sites, not just the one
      named here.
- [x] 6.5 Maestro pin unasserted; `maestro-ios-critical` has no install guard.
      Done in `2788fbd0`. The pin's *comment* was separately false (5.10).

---

## Wave 7 — found while verifying Wave 5, not yet fixed

Both surfaced from 5.6. Neither is a comment defect, so neither was fixed as
part of a comment-correction wave; both are recorded where a reader will hit
them and are tracked here.

- [x] 7.1 **`beer-list-loading.yaml` was 12 flows in one file and only the first
      ran.** Split into `20-loading-*.yaml` … `31-loading-*.yaml`; the original
      is deleted. Each new file is exactly two YAML documents (asserted
      programmatically), and all 12 parse — verified by running them as a
      directory, which is decisive because a parse fault aborts the whole
      directory, so any flow executing proves every flow parsed.
      `grep -c '^appId:' .maestro/*.yaml` now returns 1 for every FLOW file (and
      0 for `config.yaml`, which has no header — an earlier version of this
      line said "1 everywhere", which is wrong); that grep
      is the standing check, and it is in README.md.

      **They are RED and deliberately NOT registered.** Registering 12
      known-red flows buys a permanently red pipeline, which gets ignored just
      as reliably as a false green. The non-registration is loud rather than
      silent: every file states its own status in its header.

      Found on the way, and fixed: all 12 tapped `"All Beers Tab"` /
      `"Beerfinder Tab"` / `"Tasted Brews Tab"`. **None of those exist.** The
      real titles are `"All Beer"`, `"Beerfinder"`, `"Tasted Brews"`
      (the citation of `app/(tabs)/_layout.tsx` was FALSE — see 9.8 — and so was
      "52 uses across the registered flows": registered flows carry 75; 52 is
      the count inside the twelve NEW files, which the same entry calls
      unregistered nine lines above). 16
      selectors corrected here, 3 more in the `beer-list-*` files. Verified
      against source and existing usage, not against a green run.

      **What is NOT established, stated plainly because the first version of
      this entry got it wrong.** These flows fail locally at the first `tapOn`,
      and the first draft of their status blocks blamed `clearState: true`.
      That was an overclaim. Probing the simulator showed the installed app is
      itself unconfigured and sits on Settings even with `clearState: false`,
      so the local failure does not demonstrate the diagnosis. What IS
      established, machine-independently, is that `clearState: true` wipes
      preferences and `11-settings-first-launch.yaml` asserts the app then
      locks to Settings until API URLs are configured — so the precondition gap
      is real, proven by that flow rather than by this run. Whether these 12
      pass once the app is configured is **unknown and untested**.
      Next step is to give them the onboarding sequence `11-*` performs, while
      keeping `clearState: true`. Flipping to `clearState: false` would likely
      make them green and VACUOUS — the skeleton they assert on is what shows
      before cached data arrives. That route is a deleted test wearing a tick.
- [~] 7.2 **Unregistered flow files.** `beer-list-loading` is resolved by 7.1.
      Six remain, all confirmed single-document, all still unregistered:
      - `beer-list-filter`, `beer-list-scroll`, `beer-list-search` — dead tab
        selectors corrected (3 total). Still red locally, but for the
        environment reason in 7.1, so their true status is **unknown**. They do
        not wipe state, so they are the most likely of this set to pass once
        the app under test is configured. Assess these first.
      - `LOGIN_WEBVIEW_ERROR_HANDLING` (544 lines), `SETTINGS_AUTO_LOGIN` (805
        lines), `MP-7-STEP-2-OPERATION-QUEUE-TESTS` (166 lines) — **not run,
        so nothing is claimed about them.** The last one does
        `runFlow: file: ./06-login-flow-member.yaml`, i.e. it needs a real
        member login; the other two are large enough to deserve reading before
        running.

      Deciding register-vs-delete honestly needs a configured app on the
      simulator, which this pass did not have. That is the blocker to name, not
      a reason to guess. Two of these were adopted in an earlier round for
      exactly this reason; leaving a test file that runs nowhere is the same
      failure mode as a test that cannot fail.
- [ ] 7.3 **The local validation loop cannot currently reach any tab.** The app
      installed on the simulator has no API URLs configured, so every flow that
      taps a tab fails there regardless of its own correctness — which is why
      this pass could confirm parse-correctness but not behaviour. Establishing
      a configured-app fixture (or a documented setup flow to run first) is a
      precondition for 7.1 and 7.2, and for any claim that a local pass
      predicts CI.

---

## Exit condition

Re-review by the same six after each wave-group. Done when they return only nits
a senior engineer would defer. Not when a round comes back empty — round 5 of the
previous effort found more than round 4, and the loop before this one was stopped
on judgement, not convergence.

---

# Round 9 — findings from the independent review

Five reviewers with no authorship in round 8 (except Codex, which wrote two
commits and was told to treat them with equal suspicion). Findings below are
recorded as reported; the ones marked VERIFIED HERE were re-checked in the main
session rather than taken on trust.

## Launch-blocking / high

- [x] 9.1 **The "moved inside the lock" fix has no test behind it.** Mutant:
      keep `withDatabaseLock('all-beers-etag-invalidate', ...)` but empty its
      body and run guard + `verifyNotModified()` + the `all_beers_last_check`
      stamp after the hold returns. **29 tests pass.** The fix `7c585f2a`
      documents could be reverted and ship green.
      Cause: `dataUpdateService.etagInvalidation.test.ts:332` asserts the lock
      NAME appears in the call list and that `beerRepository.count` has a later
      `invocationCallOrder` than `withDatabaseLock`. An empty hold followed by
      the work satisfies both. The assertion verifies ordering relative to the
      lock's *invocation*, never *containment within the hold* — it is weaker
      than its own name.
      Fix: the `DatabaseLockManager` stub in
      `storeSwitchDuringRefresh.test.ts:88-92` is a passthrough; make it record
      a marker before and after `task()` so containment is observable. The
      passthrough does not make that file inert — all four guard sites die
      independently — but lock *holding* is uncovered everywhere.
      Reached independently by three reviewers from three directions.

      **EVIDENTIARY STATUS: HARDENED, and the defect is wider than first
      reported — three sites, not one.** Originally recorded as unhardened
      because all three readings came from the contested tree during the
      collision, and a survival reading is exactly what that window fabricates.
      That caveat is now discharged: the mutant shape was re-run in an ISOLATED
      tree that no other agent could write to, against the FULL suite (95
      suites / 2241 tests), at three separate sites. All three are
      baseline-identical — nothing fails:

      | site | hoisted out of the empty hold |
      |---|---|
      | `dataUpdateService.ts:923-940` (304 arm) | guard, count, stamp |
      | `dataUpdateService.ts:1026-1044` (`all-beers-write`) | guard, ETag clear, insert, ETag commit |
      | `LoginWebView.tsx:405` / `:512` (both gate-open bursts) | all three `setPreference` calls |

      Confirmed a second time on a hash-fenced tree by the original finder,
      full suite against the live mutant with a clean baseline captured
      immediately after for comparison:

      ```
      MUTANT   : 2 failed, 93 passed, 95 suites | 89 failed, 1 skipped, 2151 passed, 2241 total
      BASELINE : 2 failed, 93 passed, 95 suites | 89 failed, 1 skipped, 2151 passed, 2241 total
      ```

      Byte-identical output. Both failing suites are the pre-existing
      `mockServer` pair (sandbox blocks `listen()`), unrelated to this code.
      Two reviewers, two trees, one fenced and one isolated — this is settled.

      The LoginWebView case is the sharpest: **all 72 LoginWebView tests pass**,
      including the two new ones written for this very fix.

      **The specific claim this refutes** is in `7c585f2a`'s message — that the
      new tests "assert via `getQueueLength()` that the gate-open write is
      genuinely queued rather than merely not-yet-run". They do not. They
      establish that the ACQUISITION is queued. The write is never observed
      relative to the hold: with the writes hoisted outside an empty hold,
      `getQueueLength()` still reaches 1 because `acquire` enqueues, the store
      URL is still absent at that moment because the `await` has not resolved,
      and it still appears after release. Every assertion passes.
      Acquire-release-then-write reintroduces the whole race and the suite is
      blind to it.

      **Cheap distinguishing observation, offered by the reviewer and not
      implemented:** inside the `setPreference` spy, record
      `databaseLockManager.getCurrentOperation()` at call time and assert it is
      `'login-config-commit'` / `'all-beers-write'` /
      `'all-beers-etag-invalidate'`. Under correct code that is the operation
      name; under the mutant it is `null`. Applies at all three sites.

      Relationship to 9.14: they compound rather than overlap. 9.14 says the
      guard's window is still open on the gate-close path even when the fix is
      correct; 9.1 says the suite would not notice if the fix stopped being
      correct at all.

      The mechanism is separately credible on its own terms and does not depend
      on the contaminated run: the assertion at `:332` demonstrably tests
      ordering-relative-to-invocation rather than containment, which is
      checkable by reading it. A mutant that removes the lock call ENTIRELY
      does die on that test — which is exactly what makes the gap easy to miss,
      and is why the test reads as stronger than it is.
- [x] 9.2 **Migration re-run guards for versions 3-7 are untested, and a
      regression is launch-blocking.** Mutant: delete `if (fromVersion < 7)` at
      `src/database/schema.ts:263` while keeping the call. `migrationDispatch`
      stays green (5/5).
      Consequence: a device at v7 — everyone upgrading from the current
      release — passes the outer gate (`7 < 8`), re-runs migration 7,
      `migrateToV7.ts:97` calls `recordMigration(database, 7)`, and `version`
      is `INTEGER PRIMARY KEY`. Second insert → UNIQUE constraint failure →
      migration throws → `setupTables` rethrows.

      **REPRODUCED END TO END, and the severity claim was corrected downward on
      availability by the reviewer who made it.** Run against a real SQLite
      engine (`node:sqlite`, Node 26) driving the actual
      `setupTables` → `runMigrations` → `migrateToVersion7` path, with a real
      `DatabaseLockManager` and only a ~20-line async-surface adapter shimmed.
      A control run on unmutated code was taken FIRST to prove the harness
      faithful: version 8 reached, `auth_cookies` purged, nothing thrown.

      **"The app fails to launch" was an inference and is WRONG.**
      `app/_layout.tsx:225-245` catches, sleeps 1s, calls `resetDatabaseState()`
      and retries once — but that clears in-process state only and never touches
      the database, so the retry meets identical on-disk state and fails
      identically. `catch (retryError)` then calls `setInitialRoute('(tabs)')`
      regardless, and the app proceeds. It is also functionally fine:
      repositories get the database from `connection.ts`, not `setupDatabase`,
      so the ERROR state gates nothing, and v8 is a data purge rather than a
      schema change, so a v7 schema serves the app correctly.

      **What 9.2 actually is: silent, permanent inertness of the v8 security
      fix, landing precisely on the devices holding the leaked credential.**
      `schema_version` stays pinned at 7 forever; every later launch re-enters
      the same arm, throws the same violation, and never reaches the v8 arm.
      The plaintext `PHPSESSID` jar that migration exists to remove **survives
      on every device that ever completed a member login** — verified in the
      reproduction (`auth_cookies` STILL PRESENT, errcode 1555 =
      `SQLITE_CONSTRAINT_PRIMARYKEY`). Only user-visible symptom is ~1s of extra
      cold-start latency from the retry sleep; the failure surfaces as
      `console.error` and nothing else.

      **This is the same defect class as the original Wave 1 finding — a
      shipped security fix that silently does nothing — reached by a different
      route.** It would pass a smoke test, because the app looks and behaves
      normally.

      Scope boundary the reviewer flagged rather than let ride: the RN render
      path itself was not reproduced (`_layout.tsx` cannot run outside RN).
      Both `setupTables` calls that determine which branch it takes WERE
      reproduced; the `setInitialRoute` step remains source-level.
      Gap: `migrationDispatch.test.ts:91` is the only "does not run" assertion
      and only covers version == 8, where the outer gate short-circuits before
      `runMigrations` is called. `:65` sets stored version 7 but asserts only
      that v8 ran, never that v7 did not.
      NOT a defect: removing `if (fromVersion < 8)` at `:269` also survives, but
      that is an equivalent mutant — v8 is the last arm and the outer gate
      guarantees it. No test can or should kill it.
      **EVIDENTIARY STATUS: HARDENED.** Unlike 9.1, this does not depend on the
      contested tree. Confirmed twice, by two reviewers, via different mutants
      (v7 arm; v3 and v6 arms), and the second was run in an isolated tree no
      one else could write to — see 9.16. Act on this one.

      Note on 9.6 vs the "cleared configuration" check that came back sound:
      these are complementary, not contradictory. `taplistConfigurationHeld` is
      genuinely fixed — mutating it to `current === '' || current === fetchedFor`
      now dies on `storeSwitchDuringRefresh.test.ts:267`. 9.6 is a different
      hole: a missing `!fetchedFor` guard in `prepareAllBeers`, which never
      reaches that helper's cleared-vs-switched logic because it passes
      `storeId: null` by design. The helper is fixed; the caller can still feed
      it `''`.
- [x] 9.3 **VERIFIED HERE. Most of this branch's error-classification work
      reaches nobody on the automatic paths.** `app/_layout.tsx:115` wraps
      `fetchAndUpdateAllBeers()` in try/catch and discards the returned
      `DataUpdateResult` — but the function *returns* `{success:false, error}`
      for every failure mode this branch hardened and does not throw, so the
      catch never fires. `checkAndRefreshOnAppOpen` builds an
      `errors: ErrorResponse[]` and **nothing anywhere reads `.errors`**
      (confirmed by grep across `app/ hooks/ components/`); the three tab
      screens read only `result.updated`. The remaining record is
      `console.error`, which in a release build with no debugger is nobody.
      This directly contradicts `emptyTableNotModifiedFailure`'s docstring
      (`dataUpdateService.ts:513`), which says the concrete gain of choosing
      VALIDATION_ERROR over SERVER_ERROR is "exactly one thing" — that the
      authored wording can reach a person. On app-open and tab-focus it
      structurally cannot. Only manual refresh surfaces it.
      Pre-existing (both call sites predate the branch), but it is why a real
      chunk of this round has no observable effect.

- [x] 9.14 **The justification for leaving the gate-close writes unlocked is
      FALSE.** `dataUpdateService.ts:439-441` claims racing to `''` unlocked
      "only ever causes a safe, cheap abandon, never a bad commit". That holds
      only if the `''` write lands BEFORE the guard read. `setPreference` takes
      no lock, so it can equally land AFTER the guard read and BEFORE the
      commit — the exact window the whole fix exists to close.
      Sequence: writer takes the lock, reads config = A, guard passes; the
      login's unlocked `setPreference('all_beers_api_url','')` lands; the writer
      clears the ETag, inserts A's rows, commits A's validator and stamps
      `all_beers_last_check`; the login then takes the lock and writes B.
      End state: **store A's rows, store A's ETag, store B's configuration, and
      the freshness window advanced** — precisely the bad commit the docstring
      says cannot happen.
      **Hardened evidence:** proved in an isolated tree, not the contested one.
      With the preference flipped to `''` during `insertManyUnsafe` (after the
      guard read, inside the hold), `sequentialRefreshAllData` still inserts the
      rows, still writes `all_beers_etag`, and still stamps.
      This is load-bearing: it is the stated reason `LoginWebView.tsx:337`,
      `:502` and `DeveloperSection.tsx:196` are left outside the lock. Real
      window is narrower than the probe implies — during the exclusive
      transaction the login's write hits SQLITE_BUSY and retries — but the gap
      between guard read and pre-clear, and between insert and ETag commit, are
      both real and unprotected.
- [x] 9.15 **The stamp the 304 fix moved inside the lock is still outside it,
      one arm away.** `7013cd27` states the principle: "Left outside, it
      reintroduces the same window one statement later."
      `fetchAndUpdateAllBeers`'s SUCCESS path stamps `all_beers_last_update` and
      `all_beers_last_check` at `:1047-1048`, AFTER the `withDatabaseLock` hold
      at `:1026-1044` returns. The login's gate-open burst now takes the same
      lock, so it runs the instant that hold releases — before those two
      statements. `writeAllBeers:1718-1719` and the 304 arm both get this right;
      only this arm does not.
      Hardened: probed in the isolated tree with a lock mock that flips the
      store when the task returns. Result: store B configured, store A's rows
      committed, both timestamps written.
      Harm is the one the 304 arm's own comment describes — the new store's
      refresh suppressed for up to twelve hours — bounded in practice by the
      login's `manualRefreshAllData` clearing those timestamps, unless that
      refresh then fails.
- [x] 9.16 **INDEPENDENT CONFIRMATION OF 9.2, from an isolated tree.**
      Replacing `if (fromVersion < 3)` and `if (fromVersion < 6)` with
      `if (false)` in `schema.ts` leaves **all 30 database suites / 680 tests
      green**. Reached separately from `tests`' v7 mutant, by a different
      reviewer, in a tree no one else could write to — so unlike 9.1, this one
      is not waiting on a re-run.
      `migrationDispatch.test.ts` proves dispatch for v7 and v8 only; its
      framing ("these tests exist to make the *wiring* fail loudly") reads
      broader than what it covers, because the `storedVersionIs(6)` fixture can
      only ever exercise the v7 and v8 arms. Four of the six arms remain in
      exactly the state the commit was written to fix.
- [x] 9.17 **The login can now fail for a reason it could not before, and that
      is not recorded anywhere.** `withDatabaseLock` rejects after a 30s
      acquisition timeout with `DatabaseContentionError`, and
      `DatabaseLockManager._forceRelease` (`:427-457`) refuses to grant the lock
      to anyone until an abandoned holder returns — which may be never. In that
      state every member login rejects at `LoginWebView.tsx:405` into the catch
      at `:427`, alerts "Could not finish signing you in", and calls
      `onLoginCancel()` — with `all_beers_api_url` **already cleared at `:337`**,
      so the user's previous configuration is destroyed and they are routed to
      Settings. Visitor path is identical via `:512`.
      `7c585f2a` reasons carefully about the lock stalling OTHER consumers but
      never mentions it can now fail the login itself. Recoverable by restart,
      so low severity — but it is a new failure mode introduced by the fix and
      undocumented.
- [x] 9.18 **Two comments contradict each other on whether the race
      self-corrects; unresolved.** `:1030` (and `storeSwitchDuringRefresh.test.ts:8-11`,
      and `7c585f2a`'s message) says no later conditional request corrects the
      cross-store rows, because the row count is non-zero so
      `shouldTrustNotModified` believes the 304. But `:598-602`, about the same
      proxy, says a cross-store ETag "simply misses and costs a full 200 rather
      than serving wrong rows".
      If `:600` is right, store B's next refresh sends A's ETag, misses, gets a
      200, and the rows self-correct — no 304 ever arrives, so
      `shouldTrustNotModified` is never asked, and `:1030`'s escalation is
      wrong. Residual harm would be the stale timestamp, not a permanent 304
      loop.
      **SETTLED against the `ufobeer` proxy source. `:1030` is the false one.**
      The proxy keys its validator per-store on all three paths that can emit a
      304 — `ufobeer/src/handlers/beers.ts:447` (live),
      `:298-299` (cache hit), `:101` (stale fallback) — all
      `buildCombinedEtag(content_hash, enrichment_hash)` where `content_hash`
      hashes the raw Flying Saucer payload for the REQUESTED `sid`.
      `utils/conditional.ts` emits 304 only on an exact match, so store A's
      ETag against `?sid=B` misses and returns a 200. The direct path cannot
      304 at all — only the proxy sends `If-None-Match`
      (`src/api/fetchOutcome.ts:115`).
      Therefore `shouldTrustNotModified` is **never reached**, and these are
      false as written: `dataUpdateService.ts:1030`,
      `storeSwitchDuringRefresh.test.ts:8-11`, and `7c585f2a`'s commit message.
      `:598-602` is correct.
      **This is a false claim inside round 8's own remediation work** — a
      commit written to fix false claims, overstating its own severity.
      Consequence worth carrying: what actually persists after the race is the
      **stamp, not the validator**. The rows self-correct on the next refresh;
      `all_beers_last_check` written under the new store's configuration
      suppresses that refresh for up to twelve hours. That makes **9.15 the
      durable half of the pair, not the lesser one** — the fix stays justified,
      on corrected grounds.
- [x] 9.19 **Stale line citations, four of five wrong.** The in-code pointer at
      `LoginWebView.tsx:399` says "Gate-close writes (`:329` above,
      `DeveloperSection.tsx:187`)" — the write is at `:337` (`:329` is a comment
      line), and `DeveloperSection.tsx:187` is the second line of a comment,
      the write being at `:196`. `28dda004`'s own verification paragraph is
      worse: bursts cited at `:395`/`:502` are actually at `:405`/`:512`
      (`:502` is cited as both a burst and a `''` write), and the `''` writes
      cited at `:330`/`:492` are at `:337`/`:502` (`:330` is a bare `//`,
      `:492` is `try {`).
      **The substance is correct** — both bursts are locked and all three
      unlocked writes are `''`, verified independently. This is a citation
      defect, not a false behavioural claim. It matters because `:399` is the
      durable pointer a future writer is told to follow, and this round has
      already been bitten twice by following a stale pointer.

- [x] 9.20 **The pre-clear trade-off is justified by the premise 9.18 just
      refuted.** `dataUpdateService.ts:1023-1025` states the cost of moving the
      ETag pre-clear before the rows land — contention at that instant aborts
      the whole write, so "the user keeps stale rows and is told the app was
      busy, where previously they would have got fresh rows and a bad ETag
      record" — and then justifies paying it: *"That is the trade, and it is
      worth it — the bad ETag record is permanent and silent, the stale rows
      are neither."*
      **"Permanent" is the refuted premise.** Per 9.18, a cross-store ETag
      misses at the proxy and returns a 200, so the bad ETag record
      self-corrects on the very next request. It is silent, but it is not
      permanent.
      Both halves of the comparison therefore self-correct, which is not what
      the sentence asserts, and the conclusion "it is worth it" no longer
      follows from the reason given. **The trade may still be correct** — an
      abort that tells the user something beats a silent wrong record even if
      short-lived, and the durable harm identified in 9.18 is the twelve-hour
      stamp rather than the validator. But it has to be re-derived rather than
      inherited, because the stated justification is false.
      Same shape as 9.14: not a decorative comment, but the load-bearing
      argument for a design decision, resting on something untrue. Flagged by
      the reviewer who noticed the shared premise, and confirmed here by
      reading the comment against 9.18's finding; the re-derivation itself is
      not done.

      **SCOPE GUARD — fix `:1024-1025` and `:1030` ONLY.** A sweep of
      `src/services/` and `src/api/` for permanence and self-correction language
      (`permanent`, `forever`, `durable`, `self-heal`, `corrects`, plus every
      `shouldTrustNotModified` / `verifyNotModified` site) found no third
      instance, but did find two lookalikes within a few lines of the refuted
      pair, using near-identical wording, that are **CORRECT and must not be
      "fixed"**:

      | site | wording | why it is sound |
      |---|---|---|
      | `:899` | "the next refresh 304s again, forever" | same store, valid ETag, empty table — the validator genuinely matches server state, so the server legitimately keeps returning 304 until upstream changes |
      | `:1017` | "every later request then 304s forever" | same store; the stranded validator matches the server, so conditional requests correctly 304 while local rows are wrong |

      **The discriminator:** 9.18 refutes permanence only where the validator is
      sent to a store it was not minted for — the proxy misses, returns 200, and
      it self-corrects. It says nothing about a validator that genuinely DOES
      match the server it is next sent to, where 304-forever is correct
      behaviour rather than a bug. `:899` and `:1017` are the same-store case,
      and the reasoning they support depends on 304-persistence being real.
      `:155` ("last-writer-wins … self-healing") and `:656` ("a consistent pair
      that … self-heals") are also sound, and `:656` actively asserts the
      self-healing that 9.18 supports rather than undermines.
      This defect is confined to two comments; it is not a pattern spreading
      through the file.

- [x] 9.21 **35 `tapOn: "All Beer"` remain in REGISTERED flows, and by the
      anchored-regex result none of them can ever have worked.** The point-5 fix
      corrected 12 selectors — but those were in unregistered, known-red flows,
      so they were inert. These 36 (35 registered, 1 in `SETTINGS_AUTO_LOGIN`)
      are in the suite that is supposed to be the working one:

      | flow | n | | flow | n |
      |---|---|---|---|---|
      | `05-navigation-and-tabs` | 7 | | `07-login-flow-visitor` | 2 |
      | `14-api-error-handling` | 4 | | `19-migration-lock` | 2 |
      | `09-refresh-functionality` | 3 | | `live-activity-logout` | 2 |
      | `11-settings-first-launch` | 3 | | `01`,`02`,`03`,`04`,`08`,`12`,`16` | 1 ea |
      | `13-network-timeout-recovery` | 3 | | 2 × `live-activity-*` | 1 ea |

      `"All Beer"` matches only `beerlist.tsx:26`'s `ScanlineTitle` — which is
      on the DESTINATION screen — so the tap that is supposed to get there has
      no target. The `assertVisible: "All Beer"` uses are correct and must be
      left alone; only `tapOn` is wrong. Fix is `"All Beers"`, the exact
      `NavigationCard` title.

      Two consequences worth recording even if nobody acts now:

      1. **Pre-existing, not introduced here — but it means the registered
         suite's green/red history cannot be read as evidence about these
         flows.** Same category as the `beer-list-loading.yaml` documents that
         never ran, which is what opened 7.1.
      2. **It changes 7.3.** "No configured simulator" is a real blocker but no
         longer the only one: on a configured simulator every one of these 35
         still fails at the selector, before app state matters. Whoever picks up
         7.3 must fix the selectors first, or they will do the setup work and
         then misread a selector failure as an app problem.

      NOT actioned here deliberately. Correcting 35 selectors across 17
      registered flows changes what the running suite does, cannot be verified
      green without 7.3, and is a wider scope than the review that found it.
      It is the user's call, not a reviewer's.

## Medium

- [x] 9.4 **The Android summary prints "✅ PASSED" for the job documented three
      lines above as failing every time.** `maestro-e2e.yml:892-900`,
      `e2e-tests.yml:464-470` decide pass/fail by grepping for `<failure`. A
      launch failure — which is what the known-red Android job produces — is
      reported by JUnit as `<error>`, not `<failure>`. Reproduced against two
      constructed artifact dirs: XML where every testcase `<error>`ed, and an
      artifact with logs but no XML at all. Both print green. Non-gating, so it
      cannot turn the pipeline green, but it contradicts its own prose.
      Fix: `grep -rlq '<failure\|<error'`, including the per-group loop at
      `maestro-e2e.yml:865-874`, which feeds the table a human reads to find
      which group failed and can contradict the ❌ headline above it.
      Confirmed not over-eager: `<failure` does not false-match `failures="0"`.
- [x] 9.5 **Developer prose reaches a user-facing alert verbatim.**
      `dataUpdateService.ts:733-739` throws VALIDATION_ERROR with
      `` `${label} unavailable (${source.reason.code}): ${source.reason.detail}` ``
      → `All beers unavailable (not-configured): all_beers_api_url is not set`.
      VALIDATION_ERROR and INFO are the only types whose renderer returns
      `error.message` untouched (`notificationUtils.ts:274`), so a snake_case
      preference name goes straight into the alert. The comment claims parity
      with `fetchAndUpdateAllBeers`; the TYPE matches, the COPY does not —
      `:882` says "All beers API URL not set. Please log in to configure API
      URLs."
      Related: `errorClassificationParity.test.ts:27-28` deliberately asserts
      type rather than message. Right for UNKNOWN_ERROR; wrong for
      VALIDATION_ERROR, where the message IS what the user reads. The suite
      forbids UNKNOWN_ERROR but does not hold the copy together.
- [x] 9.6 **A cleared configuration IS treated as "allow", in exactly one
      path.** `fetchAndUpdateAllBeers:872` guards `if (!apiUrl)`, so
      `taplistConfigurationHeld('')` is unreachable there. `prepareAllBeers`
      (`:1611-1612`) has no such guard and passes `storeId: null` deliberately;
      the guard at `writeAllBeers:1696` is an equality test, so `'' === ''`
      passes. Sequence: `getPreference` fails → `fetchedFor = ''` →
      `fetchBeersFromAPI` re-reads the preference itself and fetches real rows →
      a logout clears the preference → guard passes → **the previous store's
      rows are committed for a logged-out app.**
      Root cause is the `''` sentinel collapsing three distinct states — read
      failed, never configured, deliberately cleared — into one value the guard
      compares for equality. The hole is a missing `!fetchedFor` guard in
      `prepareAllBeers`, not the lock scoping. `DeveloperSection.tsx`'s unlocked
      `''` write is correct as documented.
      Two worse variants confirmed closed: `fetchBeersFromAPI:297` returns
      `unavailable` for a genuinely absent URL, and a 304 cannot co-occur with
      `fetchedFor === ''`.
- [x] 9.7 **`readTaplistConfiguration`'s documented limitation has a trigger the
      comment does not name.** The comment (`:405-424`) frames the swallow as a
      write-time problem. It also bites at fetch time (`:1611`, `:870`) and is
      worse there: `fetchedFor = ''` → `storeId = null` → the enrichment proxy
      is skipped → a full non-enriched ETag-less download runs → is abandoned at
      the write guard → and is reported **`success: true`**. The comment is
      accurate; the blast radius is one function larger than stated.
- [x] 9.8 **Tab selectors: the citation was wrong, and the multi-hop case is
      unverified.** `app/(tabs)/_layout.tsx`'s `options.title` values are dead
      config — the custom `TerminalTabBar` renders `HOME`/`BEERS`/`FINDER`/
      `TASTED` and never reads them. The strings tapped by flows live on the
      Home tab's `NavigationCard`s and per-screen `ScanlineTitle` headers, so a
      tap FROM Home has a real target (Maestro matches regex, so `"All Beer"`
      matches `"All Beers"`). A SECOND tab tap after leaving Home may not:
      React Navigation detaches inactive screens by default. **Unverified in
      both directions** — no configured simulator (see 7.3).
      Corrected in `.maestro/README.md` point 5 and in all 12 split flows;
      `24-loading-tab-switching` and `31-loading-all-tabs` carry an extra
      warning as the two multi-hop cases.
      **Scope is mostly pre-existing:** ten REGISTERED flows depend on this,
      `05-navigation-and-tabs.yaml` alone tapping 14 times. If the assumption is
      false it is false for flows presumed to pass today. Fix, if needed, is to
      route via Home between hops or match `testID="nav-*"` — not to change the
      string.

## Low

- [x] 9.9 `verify-migration.sh inspect` exits 0 over a completely unreadable
      database (`:124-131`). `report()`'s explicit `return 0` — correct for the
      `PROBE_KEY=''` reason its comment gives — also masks every `q` failure
      inside it, and `inspect`'s whole body is `report`. `q` writes
      `SQLITE ERROR` to stderr so a human sees it, but a wrapping script sees
      success plus three blank fields. `downgrade` and `assert` unaffected.
      Flagged because the rest of this script now takes the opposite position.
- [x] 9.10 `maestro-ios-critical` is in neither the summary's `needs` nor its
      body (`maestro-e2e.yml:799`). It has no `continue-on-error` so it fails
      the workflow on its own — not silent — but the summary can print all-✅
      while the critical-path job is red.
- [x] 9.11 `getCurrentSchemaVersion` (`schemaVersion.ts:19-25`) catches
      everything and returns `0`, commented "Table doesn't exist yet". A read
      failing for corruption or SQLITE_BUSY also returns 0, which replays all
      six migrations against an already-migrated database. Outside the diff, but
      9.2 is what makes this path worth a second look.

## Corrections to round 8's own account

- [x] 9.12 `bdf139cd` claims a sixth test — "should delegate fetch to
      fetchBeersFromAPI which handles timeouts" (`dataUpdateService.test.ts:749`)
      — was "fixed with them". It no longer reaches the abandon path and does
      assert `dataUpdated === true`, but it does NOT assert the insert and stays
      green under the deleted-insert mutant. Fixed in the sense the commit
      means, not in the sense the sentence reads.
- [x] 9.13 `src/api/__tests__/authService.test.ts` (+43) is **entirely Prettier
      reformatting** — no assertion changed, no test added. It was listed as a
      review target on the strength of its diffstat alone; it contributes
      nothing to test effectiveness this round.

## Confirmed sound (recorded so it is not re-litigated)

Verified independently, not by re-reading claims: `verify-migration.sh` holds
under nine constructed failure scenarios including the reported false-PASS
(reinstall) and a silently no-opped write; both `test-summary` jobs now exit
non-zero, and fail closed on an empty result string; the `LoginWebView` lock
genuinely shares one mutex with `dataUpdateService`'s guard (`operationName` is
a logging label; there is one `lockHeld` boolean for the singleton, so the fix
is not theatre); `migrateToV8`'s transaction depth mock is real — both the
removed wrapper and the dangerous `recordMigration`-outside-transaction
reordering die; all four store-switch guard sites die independently; the
`refreshCoordination` timing fixes hold under 60 injected microtasks AND produce
no false red on correct code; the 12 split flows carry the deleted file's
content faithfully with nothing dropped; `3204becf` left Wave 6's work
byte-identical (`git diff 2788fbd0..3204becf -- scripts/verify-migration.sh` is
empty).

**Suite figures, settled by two independent full runs that agree exactly:**
95 suites, **2241 tests total, 2151 passing, 89 failing, 1 skipped**. All 89
failures are the two pre-existing `mockServer` suites, which fail on EPERM
because the sandbox blocks `listen()` — unrelated to any code on this branch.
So the handoff's "2151" was right as a PASSING count; the total is 2241, and
both numbers should be quoted together to stop this recurring. A prediction
that the mockServer suites held 49 tests rather than 89 was the estimate that
missed; the measured runs agree with each other and with `bdf139cd`'s figure.

Mutant tally, corrected: **24 distinct mutants across 25 runs**, not the 18
first reported. 16 of the 24 were applied to `dataUpdateService.ts` — the file
that was contested during the collision — so the exposure is larger than the
first count implied.

The 22 KILLED readings are robust and are not held up pending re-run.
Contamination can manufacture a failure but cannot suppress one, and each
mutant died in the test specifically named for its site — site `:926` killed
only "does not stamp the check timestamp on the direct path"; the four
store-switch guard sites each killed a disjoint set. Random interference does
not produce that pattern.

The two PASSED readings are the ones that need re-running, and both are on the
contested file: the empty-lock survival (9.1) and the 60-injected-microtask
counter-check that establishes no false red on correct code. A "passed" reading
is the only kind this contamination can fabricate.

Also disclosed: one contamination event mid-sequence, where an already-reverted
`if (false && ...)` guard-disable was live again during a later run and produced
four spurious failures. Caught by diffing before interpreting rather than after.
Attributable either to an Edit tool re-applying from a stale buffer or to the
concurrent writer; the two are indistinguishable after the fact, which is itself
the argument for the hash-fenced protocol.

---

# Round 10 — review of the fixes

Findings 9.1, 9.2, 9.4, 9.6, 9.14, 9.15, 9.18 and 9.20 were fixed in
`5d9def70..a1c3b269`. The same reviewers were asked to check the fixes, which
were produced from their own findings.

## Codex — seams and deadlock: clean

Deadlock was the real risk in this batch: 9.14 makes three previously-unlocked
`setPreference` calls take `databaseLockManager`, and 9.15 extends an existing
hold across two more writes, against a **single global non-reentrant mutex**.

Traced all 20 `withDatabaseLock` sites for reentrancy; no path holds the lock
and then transitively re-acquires it. The load-bearing checks, each
re-verified here in the main session rather than accepted:

- `preferences.ts` and `taplistEtag.ts` contain **zero** lock references, so
  every wrapper 9.14 added wraps a genuinely lock-free leaf.
- `lockHeld` is a bare boolean with no holder identity — non-reentrant
  confirmed, so a nested acquisition would hang to the 15s force-release
  rather than pass through.
- LoginWebView's four acquisitions are sequential, not nested (4 sites: two
  gate-close added by 9.14, two gate-open pre-existing).
- The write functions called from inside a hold are all the `Unsafe`,
  caller-must-hold-lock variants by construction.

## Worth recording: 9.6's guard is a NO-OP at one of its sites

At `fetchAndUpdateAllBeers`, `if (!apiUrl)` returns early before the fetch
starts, so `fetchedFor` is always truthy by the time
`taplistConfigurationHeld` runs there. 9.6's empty-config rejection therefore
does nothing at that call site — it is belt-and-suspenders, not the guard that
protects it.

It does real work on the sequential path (`prepareAllBeers` / `writeAllBeers`),
which tolerates an empty configuration and passes `storeId: null` with no
`!apiUrl` guard of its own. That is exactly where the defect was found.

Recorded because a future reader could otherwise see the guard at the top of
`taplistConfigurationHeld` and reason that it protects the direct path. It does
not; the early return does. That is the shape of half the defects in round 9 —
a guarantee attributed to the wrong mechanism.

## CI (9.4) — sound

`\|` alternation is a GNU grep BRE extension and `ubuntu-latest` ships GNU
grep. `<error` cannot false-match `errors="0"` (needs `<` adjacent) and — a
case not previously checked — cannot match the closing tag `</error>` either.
No previously-gating branch became non-gating or vice versa.

---

# Round 11 — working round 9 to exhaustion

Every round-9 finding is now closed, and the checkboxes above are ticked to
match. Twelve unticked boxes remain in waves 1-3 and wave 7; those are round 8's
own plan and were NOT re-audited in this round — they are left as found rather
than ticked on the assumption that round 9 reviewing them implies they landed.

## What was fixed, and what each cost

| finding | outcome |
|---|---|
| 9.3 | claim scoped to the manual path; behaviour deliberately unchanged |
| 9.5 | three throw sites given authored copy via one `unavailableCopy` helper |
| 9.7 | fetch-time trigger named; the blast radius really is one function larger |
| 9.9 | `report()` propagates `q` failures; `inspect` can report red |
| 9.10 | `maestro-ios-critical` joins the summary's `needs` and body |
| 9.11 | only "no such table" means version zero; everything else propagates |
| 9.17 | the login failure the lock fix created is written where it happens |
| 9.19 | all 28 citations on the branch audited; one stale, and it was mine |
| 9.8, 9.21 | already resolved in the tree; verified, not assumed |
| 9.12, 9.13 | corrections to the account, recorded above; no code implied |

## Two things this round found that round 9 did not

**A test had been failing on the branch for as long as plan 02 Phase 3 has
existed.** `integration.mockServer.test.ts:621` still demanded the `none://`
synthesis Phase 3 deleted. It survived five review rounds because it was hidden
twice over: locally inside 88 `listen EPERM` failures from a sandbox blocking the
mock server's socket, and in CI because **CI runs no jest at all** —
`.github/workflows/` holds only the two e2e jobs. Worth stating plainly: every
"all green" claim in this plan's history describes a suite nothing in CI runs.

**9.5 and 9.7 are the same asymmetry from two ends.** `fetchAndUpdateAllBeers`
early-returns on `!apiUrl`; `prepareAllBeers` does not. 9.5 found it as diverging
user-facing copy, 9.7 as a wasted uncached download reported as success. Neither
reviewer connected them, and the shared cause is one missing guard.

## Method note

Every behavioural fix was mutation-checked against the full suite, and each claim
of "kills exactly N tests" in the commit messages is a measured number, not an
estimate. Round 10 retracted a mutation claim that had not been measured; this
round measured all of them, including the three in 9.5 and the one in 9.11.

The 9.9 and 9.10 fixes were exercised rather than reasoned about — the real `q`
and `report` text against a corrupt database file, and the real summary step
against a red critical job — because both are shell that CI never fails on.

## Exit condition, restated

Unchanged from round 8: done when the reviewers return only nits a senior
engineer would defer. Round 11 has had no independent review. Nothing here has
been reviewed by anyone but its author.

## Standing recommendation, not actioned

**Run jest in CI.** It is the single change that would have caught the stale
`none://` test on the day it broke, and it is the reason a review round could
report a green suite that no automated system had ever run.

**Five pre-existing tsc errors in `dataUpdateService.ts`** were confirmed
unchanged in count and kind across every commit this round (`validateBrewInStockResponse`
unused, two `string | null | undefined` assignments, two `BeerWithContainerType`
mismatches). Untouched deliberately — outside this branch's scope, but they mean
`tsc --noEmit` cannot gate anything until they are cleared.

---

# Round 12 — the full treatment, and what it found in round 11

Five reviewers in parallel — `pr-reviewer`, `review-failures`, `review-correctness`,
`review-tests`, and Codex — against `1ad3fc4f..HEAD`. Fixes committed as
`d5fb0a73`.

Round 11 claimed every round-9 finding was closed. It was, but round 11 itself
carried a code defect, four unguarded tests, four false comment claims and a
refuted headline number. This round is the answer to "nothing here has been read
by anyone but its author".

## The one code defect

**`getCurrentSchemaVersion` has two callers and 9.11 only reasoned about one.**
Found independently by Codex and `review-failures`. The second is in
`app/_layout.tsx`, *after* `dbInitialized = true`, where the outer catch neither
retries nor alerts. So 9.11 made a transient `SQLITE_BUSY` silently skip the
migration check, the `first_launch` routing to Settings, and the Live Activity
sync — a first-launch user lands in an empty tab UI with nothing on screen to
explain it. 9.11 fixed a silent failure at one site and created one at the other.

Fixed by extracting `runStartupMigrationCheck`, which cannot throw. It left the
component because it was untestable there — this repo cannot test components
under Jest, and the neighbouring `databaseLifecycle.test.tsx` copes by testing a
hand-copied *mirror* of the implementation, which by construction cannot catch a
change to the real code.

## Four surviving mutants in round 11's own tests

`review-tests` found all four; all four now die.

| survivor | why it survived |
|---|---|
| the authored copy | asserted only *relatively* — "Bananas." on both sides passed 418/418 |
| the my-beers copy | guarded only negatively; any wrong-but-tidy sentence passed |
| `unavailableCopy`'s `not-applicable` arm | zero coverage — and `developerProse` lists `not-applicable` specifically, so the regex was written to catch a string the suite could never produce |
| "detail kept for diagnosis" | deleting all three `logError` calls passed 418/418 |

The first is the sharpest: `migrationDispatch.test.ts` documents that exact trap
against itself — a literal `7` rather than `CURRENT_SCHEMA_VERSION - 1`, because
the relative form is vacuous against the mutation that matters. The reasoning was
one file away and was not applied.

## Four false claims in my own comments

- `recordMigration(database, 7)` and "the retry never touches the database" —
  both wrong. The replay enters at 2, throws at `recordMigration(database, 3)`
  inside a transaction that rolls back, and the retry *does* run; it just cannot
  help. The account had borrowed 9.2's mechanism and applied it to a different
  path.
- "VALIDATION_ERROR is the one classification whose renderer returns the message
  verbatim" — it is one of three. Read literally, that sentence licenses leaving
  an UNKNOWN_ERROR site interpolated, which is the exact defect the same commit
  was fixing.
- the parity suite claimed UNKNOWN_ERROR's renderer *discards* the message. It
  publishes it — as the same file states correctly twice elsewhere.
- "three throw sites given authored copy via one helper" — two call the helper.

## 9.19 refuted, and then my correction to it also corrected

Three reviewers independently found three more stale citations, all introduced
one commit before the audit, one of them 41 lines wrong the day it was written,
in the only file that commit edited.

Root cause, checked rather than assumed: the audit regex accepted a citation only
if it carried a `.ts` filename or sat immediately after a backtick, so the
`symbol:NNN` form was never in the set. A reviewer proposed the more damning
reading — that the audit saw them and mis-resolved them by eye — and offered an
arithmetic reconciliation to 28. Re-running the original script at that commit
shows it captured **27**, not 28, and did not capture those three. The totals
coincided across two different partitions.

So: the tooling explanation is correct, the harsher one is wrong, **and the
commit message's own "all 28 citations" was inflated by one before any of this.**
Recorded here because the commit is pushed and cannot be amended.

The conclusion is unflattering either way: a partial sweep was reported as
exhaustive. A better regex fixes half of that.

## Method

Every behavioural fix mutation-checked. The five round-11 mutation claims were
independently re-measured by two reviewers using different isolation strategies
— one a `git archive HEAD` scratch tree, one the live tree — and both got the
same five answers, so those numbers now have two sources rather than one.

**Process failure worth recording:** two reviewers were told to mutate the same
single checkout concurrently, and did, contaminating each other's runs. Both
stopped and reported rather than publishing the contaminated numbers, which is
the only reason it was recoverable. Give each mutation agent its own worktree.

## Still open

- **CI is red and was red before this branch.** The iOS jobs fail in the
  xcodebuild step, before any Maestro flow runs. Independent of these changes.
- **Jest still does not run in CI.** Unchanged and still the highest-value fix.
- **Five pre-existing `tsc` errors** in `dataUpdateService.ts`, unchanged.
- `runStartupMigrationCheck` calls only `migrateToVersion3`, preserved from the
  inline block rather than silently upgraded to the full chain. A device at v4-7
  reaching that branch gets one migration. That is a decision for whoever owns
  the migration story.
