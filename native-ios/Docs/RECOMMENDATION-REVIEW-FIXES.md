**Review repairs for `46e62900` — September 14, 2026**

The four follow-up PR review findings are resolved:

1. Request-aware retrieval scores matching metadata terms across the eligible pool before the 12-candidate cap, and reserves style variety for nuanced moods without literal matches. It leaves all hard filters intact. Bounded matched terms accompany candidates in full, compact, and lean prompts; the provider-input regression proves the relevant stout actually reaches inference.
2. Hefeweizen and witbier remain specific styles; only a wheat-family request includes both. Positive and negative cases are covered.
3. Normalized family/modifier matching accepts both “Imperial Stout” and “Stout - Imperial,” and equivalent double-IPA/dry-stout labels. Exclusions use the same matching rules.
4. An additive `has_intent` migration backfills existing contexts. Independent quotas retain 100 actual selections/check-ins and the latest unused presentation. Empty searches no longer evict actual choices. Selection/deselection, acknowledgement, account scope, immutable facts, and the 100-to-101 boundary are tested. Refresh keeps ownership of its existing database transaction; direct selection updates establish their own.

All four original review probes failed before implementation. The final suite passed **191 tests, zero failures or skips**. The existing-cache simulator style/fallback flow also passed. Evidence: `/private/tmp/four-fixes-verified.xcresult`, `/private/tmp/four-fixes-summary.json`, `/private/tmp/four-fixes-ui.log`. Re-review found no remaining actionable issue in these four repaired areas. Keyword retrieval does not guarantee semantic understanding of arbitrary prose; real-device AI quality and the Cloud toolchain remain separate validation tasks.

**Review repairs for `19e8e987` — September 14, 2026**

All six original findings are resolved. Four implementation agents worked on independent concerns; two separate agents re-reviewed state/recovery and ranking/model behavior. The root integrated and tested the result. No remaining actionable findings were reported in those review scopes.

1. **Ambiguous dispatch recovery.** Recommendations enter durable review-required state before dispatch, so process death, logout and reauthentication cannot make an already-dispatched write automatically sendable. Startup migration preserves this protection for older `retrying` recommendation rows. Ordinary check-ins retain their existing retry policy. Explicit user retry remains available. Removal is disabled while processing.

2. **Model context budget.** Requests reserve space for instructions, the generated schema, output and overhead. A measured full request can move to compact and then lean input. Each form retains all 100 tasting preference observations; compact omits historical beer names, and lean additionally omits brewery metadata and candidate names. Recipe/repeat eligibility is enforced locally before inference. Oversized exceptional data falls back to local matching with a non-sensitive diagnostic. Older compiler builds do not reference unavailable tokenizer APIs; they use a conservative UTF-8 byte budget and a useful lean input.

3. **Busy state ownership.** Account transitions clear busy markers. Old check-in, deletion and reward callbacks are epoch-guarded and cannot release markers belonging to a new account. Regression coverage includes real same-account reauthentication while dispatch is pending.

4. **Shared ABV eligibility.** The requested band is computed before presentation-only exclusions. Generation and submission use the same policy. When only one or two unseen eligible beers remain, another selection preserves them and fills the remaining slots from previously displayed eligible beers. Returning the previous three model IDs fails validation when new choices are available.

5. **Tasting date and event ordering.** The upstream feed has calendar dates without venue timezones. Matching treats a date as the possible UTC+14 through UTC−12 venue-day interval, and still requires an actually observed new feed event after captured intent. This is compatible timing, not proof that a particular queue entry was claimed. Evidence is retained even if the feed arrives before queue acknowledgement; this never creates queue acceptance. Old or repeated feed events remain rejected. Optional selection timestamps decode older cached records safely.

6. **Recipe-level feedback.** Package-specific stored ratings resolve by recipe identity when matching. Distinct breweries and recipe variants remain separate; missing identity uses the upstream ID. Newest explicit timestamps win, with conservative dislike precedence for ties/undated conflicts. No feedback records are deleted by this resolution. A precomputed ID/recipe index keeps the uncapped feedback store from creating repeated expensive scans.

**Verification.** The complete native test suite passed **178 tests with zero failures or skips**. Added coverage addresses dispatch recovery, explicit retry, busy ownership, date boundaries/DST, delayed acknowledgements, feed ordering, repeated selection, stale model IDs, feedback conflicts, Unicode and context budgets.

The committed encoder’s representative synthetic workload—100 tastings, 50 breweries, 20 styles, 12 candidates and four choice cohorts—was measured with Apple’s actual tokenizer. Full input requires 6,969 tokens including reserves; compact uses **2,510** and lean uses **1,801**, both within 4,096. Lean also meets the conservative older-compiler budget. The actual provider, not a fake, returned three valid candidate IDs from the Mac’s on-device model in **2.06 seconds**, within the application deadline. A native optimized benchmark of 500 beers and 1,000 ratings reduced the reviewed repeated feedback scan from 2.338 seconds to 0.0077 seconds with identical exclusions.

Offline selection/confirmation and container/ABV UI flows passed. They require independent initial fixture state; an initial combined invocation left the second flow scrolled away from its controls, and that flow passed after resetting its fixture. Logs: `/private/tmp/review-fixes-ui.log` and `/private/tmp/review-fixes-preferences-ui.log`.

Evidence remains at `/private/tmp/review-fixes-final.xcresult`, `/private/tmp/review-fixes-summary.json`, `/private/tmp/fixed-prompt-budget.log`, and `/private/tmp/final-provider-smoke.log`. The original review is `/Users/pete/claude/reviews/19e8e987-review.md`.

Physical iPhone presentation and recommendation quality still need hands-on verification. The local machine has Xcode 26.6 rather than the Cloud-pinned 26.3: older-compiler compatibility guards were inspected and the conservative budgeting path tested, but an actual 26.3 build was not run. Server idempotency was not assumed or tested with live writes. The changes do not deploy or push anything.
