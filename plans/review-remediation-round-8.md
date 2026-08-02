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
      `beerApi:242`, and a test comment) — true of one of two paths.
      **True of BOTH paths now** — Wave 2 (`7013cd27`) typed `prepareAllBeers`.
      So the fix is to say which paths and why "both" is load-bearing, not to
      soften the claim. Corrected at `beerApi.ts`, `dataUpdateService.ts` and
      `fetchTaplistFromProxyOrDirect.test.ts`, each pointing at
      `errorClassificationParity.test.ts` as the thing that enforces parity.
      **Found a fourth site the plan missed**: that parity suite's own
      file docstring, and an inline comment at its second test, still described
      the defect in the PRESENT tense as though unfixed. Both corrected.
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
- [ ] 5.6 "every flow using `wait` failed to parse" — `beer-list-loading.yaml`
      parses fine; nested `runFlow: commands:` without `when:` is not validated
      at that depth.
- [ ] 5.7 "adopting a working configuration" — that job was failing too.
- [ ] 5.8 Placeholder count wrong; `16-offline-mode.yaml:1` still carries it;
      `README.md:376` is a fourth site.
- [ ] 5.9 "twelve seconds / both platforms" — unverifiable, and sits oddly beside
      the claim that CI never got that far.
- [ ] 5.10 Pin comment claims local is a truthful predictor; nothing pins local.
- [~] 5.11 ~90 lines of duplicated comment prose — and the duplication *caused*
      5.6 by copy-paste. Collapse to one canonical statement.
      **Source-file half done; `.maestro`/workflow half left for Codex.** The
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

- [ ] 6.1 `verify-migration.sh` reports PASS when staging silently failed or the
      app was reinstalled. `q()` discards sqlite3's exit status; no `set -e`.
      Must assert staging landed, and require the planted marker to survive.
- [ ] 6.2 **38 flows hardcode the iOS bundle**; none use `${APP_ID}`. Every
      Android change in `f5c7d953` is inert.
- [ ] 6.3 `maestro-e2e.yml` is green regardless — its summary job decides PASS by
      testing whether an artifact directory exists, and never exits non-zero.
- [ ] 6.4 `|| true` still masks `bootstatus`; the selected UDID is exported and
      never used (install falls back to `booted`, reintroducing the ambiguity).
- [ ] 6.5 Maestro pin unasserted; `maestro-ios-critical` has no install guard.

---

## Exit condition

Re-review by the same six after each wave-group. Done when they return only nits
a senior engineer would defer. Not when a round comes back empty — round 5 of the
previous effort found more than round 4, and the loop before this one was stopped
on judgement, not convergence.
