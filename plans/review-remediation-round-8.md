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
      `grep -c '^appId:' .maestro/*.yaml` now returns 1 everywhere; that grep
      is the standing check, and it is in README.md.

      **They are RED and deliberately NOT registered.** Registering 12
      known-red flows buys a permanently red pipeline, which gets ignored just
      as reliably as a false green. The non-registration is loud rather than
      silent: every file states its own status in its header.

      Found on the way, and fixed: all 12 tapped `"All Beers Tab"` /
      `"Beerfinder Tab"` / `"Tasted Brews Tab"`. **None of those exist.** The
      real titles are `"All Beer"`, `"Beerfinder"`, `"Tasted Brews"`
      (`app/(tabs)/_layout.tsx`, and 52 uses across the registered flows). 16
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
