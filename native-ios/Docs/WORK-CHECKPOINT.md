## Experimental semantic retrieval — September 14, 2026

Implemented app-private NaturalLanguage word-vector retrieval behind `BEERSELECTOR_SEMANTIC_SEARCH=1` in DEBUG on iOS 27 with English preferred language. Default and Release behavior remain existing local retrieval plus optional Apple Intelligence ranking. Cache builds stay off the UI actor; account/content/generation fences, hard eligibility, authoritative description evidence in every prompt tier, and a shared retrieval/ranking deadline are in place. No private tasting/feedback data enters the vector cache. See [current implementation evidence](AI-IMPROVEMENTS/01-SEMANTIC-SEARCH-IMPLEMENTATION.md) for tests and remaining release gates; older entries below describe intermediate states.

Core Spotlight synonyms failed controlled device tests. The separate probe found working English word embeddings; sentence embeddings were unavailable. The Spotlight harness also exposed a real cross-generation identifier/deletion collision, now repaired with namespaced item IDs and domain-only cleanup. No real app data was involved.

Final app suite: **209 tests passed**, zero failures (`/private/tmp/semantic-final-review.xcresult`). Review fixes cover cache invalidation during ranking and context-budget retry within the original deadline. The actual production-engine corpus probe **passed on the physical iPad on September 15** (`/private/tmp/semantic-production-engine.xcresult`): one test covers 20 cases, with candidate Recall@12 improving from 0.818 to 0.918 overall and 0.875 to 1.0 for synonym cases. The 32-document cache built in 35 ms. Remaining release gates are full app iOS 27 checks, paired final-model quality evaluation and older-toolchain/real iOS 26 AI validation; the feature remains experimental and off by default.

No commit, upload, Cloud or distribution changes. Preserve the unrelated untracked Xcode Cloud directory.

## Semantic search first implementation slices — September 14, 2026

Local retrieval now computes hard eligibility once and preserves the existing candidate ordering and presentation branches. Added a frozen 20-case local baseline and an ABV-band regression. Xcode 27 also required explicit View fills at two existing SwiftUI overload ambiguities. The separate fixture-only device probe exercises scoped queries and hydration/cleanup boundaries.

**Production semantic integration remains gated:** lexical controls pass on the connected iPadOS 27 iPad and Foundation Models reports available, but synonym queries returned no matches. No semantic index or retrieval session has been attached to the real app. See [implementation evidence and next dependency](AI-IMPROVEMENTS/01-SEMANTIC-SEARCH-IMPLEMENTATION.md). Validation: 194 app tests passed, zero failures/skips, under Xcode 27 on the iOS 26.5 simulator (`/private/tmp/semantic-app-signed.xcresult`); the final physical probe run passed four deterministic safety tests and failed its semantic synonym assertion (`/private/tmp/semantic-probe-final.xcresult`). The additional iOS 27 simulator run failed at app launch, so its runtime coverage remains unverified. Actual Xcode 26.3 and real iOS 26 Apple Intelligence remain unverified. No commit, upload, Cloud or distribution change.

## Semantic taplist search implementation review — September 14, 2026

Three reviewers assessed architecture, privacy/index lifecycle, and compatibility/validation. [Plan 1](AI-IMPROVEMENTS/01-SEMANTIC-TAPLIST-SEARCH.md) now specifies application-owned search isolation, authoritative evidence in every prompt tier, eligibility computed once, deterministic candidate merging, a shared deadline, generation-safe index cleanup, and numerical release gates. [Review disposition](AI-IMPROVEMENTS/01-SEMANTIC-SEARCH-REVIEW.md) records the findings and remaining evidence requirements.

Next: prove a scoped semantic API route in an isolated Xcode 27 harness; local retrieval extraction and a frozen baseline corpus can proceed independently. SDK signature inspection found Xcode 27.0, but device feasibility and old/new runtime validation remain outstanding. Planning only; no feature code, Cloud changes, commit or upload in this review.

## Advanced AI roadmap drafted — September 14, 2026

Four separate implementation plans now live in [AI-IMPROVEMENTS](AI-IMPROVEMENTS/README.md): semantic taplist search first, then actual-model quality evaluations, adaptive context allocation, and refinement of an existing selection. They preserve iOS 26 Apple Intelligence and existing local fallback, isolate iOS 27 SDK/runtime features, and keep inference on-device. Each defines implementation stages, tests, acceptance gates, and rollback. The first includes a small evaluation baseline; the second formalizes the reusable harness. Planning only: no source, toolchain, Cloud workflow, or runtime changes were made for this roadmap.

## Four PR review findings repaired — September 14, 2026

All four findings from the local review of `46e62900` are repaired. Nuanced requests now influence retrieval across the eligible taplist before the 12-candidate cap, using matching terms from names/styles/breweries/descriptions plus style variety for requests without literal matches. The model receives bounded matching terms in every prompt tier. This is keyword retrieval with coverage, not a claim of complete local semantic interpretation; Apple Intelligence still handles nuance and existing fallback messaging remains.

Hefeweizen and witbier have distinct rules within the wheat family. Substyle matching normalizes metadata punctuation/case/diacritics and checks family/modifier terms independently of word order, including exclusions. Choice history retains 100 actual intent records plus the latest unused presentation; a migrated `has_intent` column supports separate pruning without deleting likes/dislikes or confirmed history. Current presentation selection, deselection, queue acknowledgement, and existing feed-refresh transaction ownership are covered.

Red/green: all four original probes failed before changes (`/private/tmp/four-fixes-red.xcresult`). Final full suite: 191 passed, zero failures/skips (`/private/tmp/four-fixes-verified.xcresult`, `/private/tmp/four-fixes-summary.json`). Typed-style/fallback UI flow passed on the existing simulator cache (`/private/tmp/four-fixes-ui.log`). Re-review checked retrieval eligibility and budgets, specific inclusions/exclusions, migration, separate retention limits, immutable snapshots, and refresh/selection transaction boundaries; no remaining actionable finding in these four areas. Real Apple Intelligence evaluation of the revised retrieval and Cloud Xcode 26.3 validation remain outstanding. GitHub upload/PR creation remains blocked by the previously reported approval review; no push was retried.

## Style or mood requests — September 14, 2026

Suggestions now has an optional 160-character Style or mood field, editable example chips, a clear action, and a visible interpretation before Find suggestions. Simple style names, alternatives (`stout or porter`), and exclusions (`IPA, not hazy`) filter the live eligible pool locally before relative ABV selection. Unknown style metadata is omitted when a style filter is active. More complex wording is passed as a taste preference to Apple Intelligence; local fallback explicitly reports when it could not interpret that wording. Editing never initiates generation and invalidates old cards through the existing preference path. Repeats, dislikes, container constraints, and submission revalidation remain enforced.

Requests survive all prompt tiers and saved choice contexts; pre-feature contexts decode with an empty request. The lean model input retains candidate names for nuanced requests. Input remains untrusted data; prompt budgets still account for instructions, schema, and output without dropping the last 100 tasting observations.

Validation: regression tests failed before implementation (`/private/tmp/style-request-red.xcresult`). Final full suite passed 182 tests with zero skips (`/private/tmp/style-request-verified.xcresult`). The typed-stout and mood-fallback simulator flow passed (`/private/tmp/style-request-ui-final.log`); visual review captured `/private/tmp/style-request-ui-reviewed.png`. Existing container/ABV and multi-selection/confirmation flows also passed (`/private/tmp/style-request-preferences-ui.log`, `/private/tmp/style-request-selection-ui.log`). This change has not yet been exercised with real Apple Intelligence on an iPhone. Local parser recognition is intentionally limited to supported style phrases; the interpretation distinguishes other wording as a model preference.

## iPhone validation — September 14, 2026

User confirmed the preference-first suggestion flow and Home chrome changes work on their iPhone, including suggestions using Apple Intelligence. Their device testing covered the Apple Intelligence path only; this does not establish device fallback-path coverage or a comprehensive recommendation-quality assessment.

## Home scroll beneath chrome — September 14, 2026

Home’s geometry viewport is explicitly clipped so scrolling cards, account titles and shadows cannot paint over the status-bar chrome or outside the content area. The existing phone bounce behavior remains. Reproduced the title overlapping chrome in the simulator before the change; the same swipe after rebuilding leaves the chrome unobscured. Visual evidence: `/private/tmp/home-chrome-before.png` and `/private/tmp/home-chrome-after.png`. Simulator build passed (`/private/tmp/home-chrome-build.log`).

## Preference-first suggestions — September 14, 2026

Opening Suggestions no longer triggers generation. Users choose container and ABV preferences, then explicitly tap **Find suggestions**; changing preferences also waits for that action. The empty-state copy explains the order. Generation has a single UI entry point: the button. Simulator build passed; preference and selection UI flows now assert the initial ungenerated state before requesting results. The preference flow passed, including no results on open or preference changes until Find suggestions is tapped (`/private/tmp/preferences-first-ui.log`).

## Adversarial review repairs — September 14, 2026

All six findings from the review of `19e8e987` are repaired. Four implementation agents and two independent review agents handled the fixes and re-review. See `RECOMMENDATION-REVIEW-FIXES.md` for decisions and evidence.

- Interrupted recommendation dispatches persist review-required state before the POST. Legacy interrupted recommendation operations also recover into review, while ordinary check-in retry behavior remains. Explicit retry still works; account transitions release busy state without allowing old callbacks to release a new account’s marker.
- Generation and submission share the ABV eligibility pool. “Show another selection” preserves unseen eligible beers and fills remaining slots from eligible previous choices; it never broadens the ABV band. Stale model IDs are rejected.
- Explicit recipe feedback applies across packaging, uses newest timestamps with conservative dislike ties, and preserves every stored rating. Precomputed feedback indexes avoid repeated scans of uncapped feedback.
- Day-only tasting dates use a documented timezone uncertainty interval. Valid new feed evidence can attach after selection before acknowledgement, without inventing queue acceptance; old/repeated feed events stay excluded.
- Model requests budget instructions, prompt, generated schema, output and headroom. Full/compact/lean tiers preserve all 100 tasting preference observations. Lean input omits names/brewery metadata to remain useful under the older compiler/iOS conservative budget. Context-budget fallback has a non-sensitive diagnostic log.
- Validation: **178/178 tests pass, zero skipped** (`/private/tmp/review-fixes-final.xcresult`). Real Apple tokenizer: representative 100 tastings / 50 breweries / 20 styles / 12 candidates / 4 choice cohorts use **2,510/4,096 tokens** in compact form and **1,801/4,096** in lean form, including schema/output/headroom. The lean input also passes the conservative legacy byte budget (`/private/tmp/fixed-prompt-budget.log`).
- Offline selection/confirmation and container/ABV UI flows passed (`/private/tmp/review-fixes-ui.log`, `/private/tmp/review-fixes-preferences-ui.log`); reset fixtures between independent flows.
- The actual local provider returned three validated IDs on the Mac’s Apple Intelligence model in **2.06 seconds**, under the eight-second deadline (`/private/tmp/final-provider-smoke.log`). This does not replace physical iPhone UI or recommendation-quality testing. Xcode 26.3 is not installed locally; its older-compiler branch was reviewed and the conservative budget exercised.
- Independent re-review found and resolved an acknowledgement/feed-order race, exact-three instruction mismatch, repeated-selection no-op, and a feedback indexing performance issue. Both reviewers now report no remaining actionable findings in their assigned scopes.

## Choice context and unconfirmed check-in signals — September 13, 2026

Implemented on the current feature branch; not committed or pushed. Validation: **161/161 tests passed, zero skipped** (`/private/tmp/choice-final.xcresult`). Recommendation selection/confirmation UI smoke test passed (`/private/tmp/choice-ui2.log`); fixed the smoke test to scroll its second selection button into view. Real Apple Intelligence quality still needs a supported-device check.

- Account/source/location-scoped `beer_choices` stores the latest 100 presentations or ordinary check-in choices. Each record embeds an immutable taplist snapshot (ID/name/brewery/style/container/ABV), presentation time, source validation identifier when available, shown IDs/order, filters, and model/local provenance. Ordinary check-ins have no shown suggestions; an offline choice reflects the cached list, not a freshly fetched list.
- Selection state, acknowledged queue acceptance/time, and later dated tasting-feed appearance are separate facts. Ordinary offline operations link back to their choice record when delivered. Recommendation operation acknowledgements also persist independently of sheet cancellation. Cache errors after delivery never cause a delivered operation to retry.
- Missing bartender confirmation does not mean non-consumption, rejection, or dislike. Acknowledged choices remain useful interest signals; queued and selected styles lightly influence local matching. They do not become confirmed tastings or independently trigger repeat exclusion. Existing queue/current-round eligibility rules still apply.
- Apple Intelligence receives up to four recent choice examples with shown/selected/queued/later-tasted beers and bounded available-style counts, alongside the existing 100 tasting inputs and feedback summaries. Unchosen alternatives are explicitly not negative feedback. Full taplist cohorts remain local; receipt codes/reviews/descriptions/member identifiers are excluded from choice snapshots/model context.
- Feedback now records `ratedAt`; old feedback JSON loads with unknown time rather than inventing a historical rating date. Explicit feedback remains uncapped and independent of all choice/history pruning, clearing, logout, and reset. Settings explains the new choice context and the history-clear behavior.
- Later feed appearance is conservative observational linkage: same beer ID, a newly observed lap/date event, and a tasting date on/after queue acceptance. It does not prove that a specific queue entry was claimed, nor can it reconstruct choices made outside this app or before this change.
- Regression tests cover immutable/reopened/scoped snapshots, 100-record retention, feedback survival and timestamp migration, offline acknowledgement, ordinary and recommendation queue paths, selection toggling, stale tasting rejection, local intent scoring, bounded model context and private-field omission.

# Migration checkpoint — 2026-09-12

## Latest — 100-tasting preferences / 30-day repeat window

Separated preference history from repeat avoidance. All 100 retained tastings still inform matching/model input. Cross-container repeat avoidance uses today plus the previous 29 UTC calendar dates (source dates have day precision); undated entries are conservatively treated as recent. The current-round feed is also checked so repeat matching is not restricted to the 100 preference rows when additional current-round source data is available. Existing UFO current-round same-ID check-in exclusions remain independently enforced. Unseen/purged historical rounds cannot be reconstructed.

Model rows now include tasting date and explicit avoidRepeat flags; instructions allow older history to inform preferences without prohibiting repeats. Generation and pre-submission filtering use the time window. Native suite 155/155 passed, zero skips, including date boundary and old-history preference/repeat tests. Evidence: /private/tmp/repeat30-final.xcresult and /private/tmp/repeat30-summary.json. Changes remain uncommitted/unpushed.

Storage review: tasting and feedback records currently serialize full Beer snapshots, including upstream review fields and chit_code alongside name, brewery/location, style, container, description, dates/lap, ABV and enrichment metadata. These extra upstream fields are not sent to the model. Feedback stores the latest liked/notForMe label per beer ID, without a rating timestamp or choice-time taplist snapshot. Model history uses compact name/style/brewery/container/date/rating facts; ABV is included for candidates. Persistent feedback outside the rolling history informs local style matching and bounded model style-count summaries.

## Latest — suggestion preferences and cross-container repeat prevention

Suggestions now offer Any / Draft only / Bottles only and Any / Lower / Higher ABV. Container filtering is strict (bottles excludes cans). Lower/higher is relative to known ABVs among eligible matching beers: retain the requested half, with at least three candidates when available, then prefer requested ABV direction locally; model input includes selection preferences, actual ABV and container. Unknown ABV is excluded for lower/higher and no constraint is widened to fill cards. Defaults preserve previous behavior. Preference changes cancel stale generation and clear selected cards; changes are disabled during submission. Fresh eligibility and preference checks also run before writes.

Recently tasted beer identity is matched across draft/bottle/can IDs using case/diacritic-normalized brewery and beer name with terminal packaging suffixes removed. Distinct brewery/recipe variants remain distinct; absent brewery metadata conservatively retains ID-only matching. The model is instructed likewise and receives history container metadata. Matching happens before candidate ranking and again before submission, so liking a recently tasted draft cannot reintroduce its bottle version. Name suffix matching is not fuzzy identity resolution.

Validation: 153/153 native tests passed, zero skips (/private/tmp/preferences-verified.xcresult and /private/tmp/preferences-summary.json). Tests cover strict containers, ABV candidate bands/unknowns, model preference fields, preference-change stale completions, and cross-container repeat exclusion while preserving barrel-aged and other-brewery variants. Silent isolated fixture UI passed bottles/higher then draft/lower selection and regeneration; no queue writes. Flow: UITests/suggestion-preferences.yaml; log: /private/tmp/suggestion-preferences-ui.log. Screenshot inspected: /private/tmp/suggestion-preferences.png. Native changes remain uncommitted/unpushed.

## Latest — durable beer feedback and all 100 tastings in model input

User requested all 100 retained tastings in the model input and persistent explicit feedback, deleted only by user action. Implemented compact row/dictionary JSON for 100 recent tasting records plus up to 12 candidate records; repeated style/brewery strings are deduplicated and full descriptions omitted. All recent records carry any explicit rating. Older saved feedback informs deterministic ranking and a bounded style-count summary in model input. Existing timeout/output validation/fallback remains; real-device quality/context evaluation is still required.

Expanded Tasted Brews cards now offer Liked it / Not for me. Explicit positive style feedback outweighs mere tasting affinity; negative feedback downranks related styles and excludes that exact beer. Feedback changes invalidate existing suggestions. Ratings persist in a separate additive beer_feedback table with no history-sized cap and account/source/store ownership. Logout, account switch, rollover, history clear and app-data reset preserve the stored ratings; only current-account data is loaded into UI/model memory. The same account/location sees its ratings after signing back in.

Per user correction, deletion is one Settings button: Delete cached beer feedback, with explanatory text and confirmation. It deletes saved likes/dislikes for the captured current account/location only; a stale confirmation cannot delete another account's feedback. No separate management screen or per-row deletion flow. Reset copy explicitly says feedback is kept.

Validation: 148/148 native tests passed, zero skips (/private/tmp/feedback-verified.xcresult, /private/tmp/feedback-summary.json). Tests cover 100 model records, old explicit feedback affecting suggestions, more than 100 persistent ratings, rerating, pruning/clear/account-switch/reopen retention, and account-scoped deletion. Legacy-upgrade index assertion was updated for the additive feedback table. UI fixture flow exercises rating, changing rating and Settings-confirmed deletion; see UITests/beer-feedback.yaml. No physical-device install, commit, push or native upload.

## Latest — Leo fixed in production; tasting cache expanded to 100

Leo Carillo (21720679) now returns ABV 5.8, enrichment_source perplexity, status enriched, and a normalized description without preamble through the authenticated app batch API. Cleanup source fallback-ai accurately reflects rejection of model-added content. Repeated controlled requests using the original name and unchanged prompt returned 5.8; corrected spelling also returned 5.8. The recoverable provider miss was incorrectly retained indefinitely as not_found, not a demonstrated spelling failure.

Backend normal version 4d148fe6-d403-4b16-83e0-769484a741b4 is deployed. Cleanup accepts only normalized source-equivalent model output; arbitrary additions/rewrites fall back to deterministic formatting cleanup. Quota-checked sweeps can reopen not_found after 24 hours for beers seen in the last seven days, bounded by the ordinary batch limit and an atomic claim. Final 1,273 worker tests, 15 contracts, source/test typechecks passed. One targeted cleanup job forwarded the ABV job; no manually entered ABV. The temporary diagnostic is removed (former route returns API401). Full report: sibling ufobeer/LEO-ENRICHMENT-REPAIR.md. Backend changes remain uncommitted/unpushed.

Native tasting retention is now 100 with one-time backfill from still-available authoritative source records. Previously retained events keep their same-day observation order; a user's history clear is respected. Missing source history from unseen/purged rounds cannot be recovered. The reconciliation baseline remains 200. Settings copy reflects 100. Candidate ranking/exclusions use retained history; the bounded model request still includes the latest 20 detailed tasting records and up to 12 candidates, not 100 full descriptions. No decision/taplist snapshot collection is implemented yet; see the plan's next-iteration proposal. Native validation: 144/144 tests passed, zero skips, including observed red failures before the 100-record retention/backfill fix. Evidence: /private/tmp/history100-final.xcresult and /private/tmp/history100-summary.json. Native changes remain uncommitted/unpushed.

## Latest — explicit recommendation source labels and Leo investigation

User confirmed Settings opens on physical iOS 26 after the concrete View component fix; Suggestions toggle and selection work. Recommendation footer now says Selected with Apple Intelligence or Selected using local matching. Copy-only change; no additional native test run claimed.

Leo Carillo (21720679) was investigated in production D1 and Cloudflare logs. Perplexity explicitly returned unknown, and not_found prevents ordinary refresh retry. The public Leo Carrillo listing reports 5.8%; spelling is a hypothesis, not proven causal. Markdown > bypassed the cleanup preamble filter. Backend fix and test-first regression cases are local in sibling ufobeer; see docs/LEO-CARILLO-INVESTIGATION.md there. No production data writes, retries, deployment, commits, or pushes occurred. A controlled provider spelling comparison remains outstanding because the production Perplexity secret is not locally available and the prior temporary endpoint was removed.

## Latest fix — Settings runtime metadata crash, second device report

The first attempt using computed opaque view properties did not fix the device crash. The user's second stack still expanded both child properties into a single parent panel type (frames 55–62). Replaced those properties with nominal SettingsDeveloperTools, SettingsDeveloperDiagnostics, and SettingsDeveloperStorage View structs, plus a concrete SettingsActionRow for action buttons. Reset/timestamp confirmation bindings remain owned by SettingsScreen. Shared style helpers are file-private.

Debug simulator and unsigned generic iPhone builds passed. Inspection of demangled symbols in the built iPhone binary confirms the parent witness type contains the nominal diagnostics/storage types, rather than their expanded view bodies. Evidence: /private/tmp/settings-concrete-symbols.txt. This is stronger structural verification than the first attempt, but does not establish resolution on the user's device; physical retry remains required. Build logs: /private/tmp/settings-concrete-device.log and /private/tmp/settings-concrete-simulator.log. Isolated iOS 26.3 Settings UI regression passed opening Settings, expanding Developer Tools, generating/viewing diagnostics, and reaching storage controls. Flow: UITests/settings-developer-tools.yaml; log: /private/tmp/settings-concrete-ui.log. The earlier full 142-test result predates this view-only refactor. Nothing committed, pushed, or installed on a physical device.

## Latest work — on-device recommendations implemented locally (September 13)

Branch feature/on-device-recommendations, based on main 922cd030. Implemented after user said go. See [ON-DEVICE-RECOMMENDATIONS-PLAN.md](ON-DEVICE-RECOMMENDATIONS-PLAN.md) for the design and implementation refinements. Changes remain uncommitted; nothing pushed, merged, deployed, uploaded, or installed on a physical device.

Settings → Suggestions · Beta → Show taplist suggestions enables the Home entry, Find something to try. Default is off. Three eligible current-taplist choices use up to 20 confirmed tasted-feed events retained independently through round rollover. Local Foundation Models ranking is optional and bounded; deterministic selection and metadata-based reasons work without it. Multi-select requires explicit queue confirmation, fresh source validation, and sequential persisted writes with individual receipts. Ambiguous recommendation writes require review instead of automatic replay.

History is scoped to source host/member/store and cleared on logout or account/store change. It retains at most 20 events and 200 reconciliation keys. Source dates have only day precision: first-observed batch order resolves ties, and same-batch order is deterministic. No exact within-day chronology or recovery of unseen rounds is claimed. Clearing history does not immediately reimport the same feed.

Validation: final native All plan **142/142 passed, zero skips**, including 22 new recommendation/history tests; final simulator Release build passed. Local Xcode is **26.6**, tests ran on iOS 26.5. FoundationModels Release linkage is weak and iOS 17.6 deployment target is unchanged; Xcode Cloud remains pinned to 26.3 and has not built this branch. Retained contract suite passed 15 tests plus TypeScript checking; Cloud configuration tests passed 3. Red/green regressions were observed for history, ranking, rollover ingestion, receipts, IPA naming, and same-day ordering. The first ordering implementation introduced an invalid baseline query; the full suite caught it, it was corrected, and the final complete rerun passed.

Silent fixture UI verification passed phone multi-select/confirmation/dismissal, iPad selection/confirmation, and maximum Dynamic Type selection. The final phone flow is saved in UITests/recommendations.yaml and was rerun after ranking changes. The isolated preview path invokes neither a real model nor live queue writes. Screenshot: [recommendations-phone.png](Screenshots/recommendations-phone.png). No VoiceOver/audio was enabled.

Final evidence: /private/tmp/recommendations-final-verified.xcresult, /private/tmp/recommendations-final-summary.json, /private/tmp/recommendations-release-verified.log, /private/tmp/recommendations-ui-verified.log. Earlier tablet/large-text runs: /private/tmp/recommendations-tablet-check.log and /private/tmp/recommendations-large-type-check.log (large-text interactions passed; its unsupported Maestro screenshot path failed, and simctl captured the screenshot separately).

Remaining before external beta enablement: evaluate actual Apple Intelligence usefulness, latency, refusal, cancellation, and thermal/battery behavior on supported physical hardware; validate iOS 27 and older-OS fallback; complete remaining accessibility/Reduce Motion checks when practical. Simulators and fake providers do not establish model quality. No backend work is needed.

Previous cleanup completed: PR #28 merged at 922cd030 after all remote checks passed. Verified recovery bundle and scheme backup are at /Users/pete/claude/branch-archives/BeerSelector-2026-09-12/. Deleted 19 obsolete local and 10 remote branches; only main remained before creating this feature branch. Old worktree folders remain detached and the modified scheme intact. Historical “cleanup prepared” text below records the earlier stage, not current status.

## Latest work — native-only repository cleanup prepared

Native cutover PR #27 merged into main at daa5456e after all GitHub checks and Native Correctness passed. The first Native External Beta build reported successful All tests and Archive actions; external tester availability was not independently verified here.

Cleanup branch: cleanup/native-only. Removed 511 tracked legacy files (including the retired Vitest config, replaced by a minimal .mts config), React/Expo runtime, Android and generated iOS/CocoaPods projects, obsolete tooling/tests/docs, and React-specific agent instructions. Root docs now describe the native app. No native app, widget, resources, test, or project code changed. Ignored private settings, archives, crash evidence, and local tool preferences remain intact.

Root Node dependencies reduced from 1,390 to 73 packages. Retained only the consumer contract package because ufobeer main imports its schemas, adapter, and Beer type and runs npm ci here. Do not delete those files or manifests until coordinating the backend contract migration. Golden Taproom CI remains; obsolete ESLint/React tests are replaced by native CI. The required GitHub Actions context remains named Jest Unit Tests to preserve existing protection, but now executes the native All plan and Cloud configuration tests. Remote branch protection was not changed.

Validation: fresh exported checkout without ignored files or production credentials built successfully; native All plan passed 120/120 tests with no skips. Contract package passed 15 tests and TypeScript checking; ufobeer origin/main exported into a temporary sibling checkout passed contract typechecking and all 15 worker/consumer contract tests against the reduced package. Three Cloud configuration tests, actionlint on both workflows, and git diff --check passed. Logs/results: /private/tmp/beerselector-native-cleanup-tests.xcresult and /private/tmp/beerselector-cleanup-contract.log. Replacement GitHub workflow has not run remotely yet.

Cleanup changes are staged for review, not committed, pushed, or merged. See [LEGACY-RETIREMENT.md](LEGACY-RETIREMENT.md) for recovery and retained-dependency details.

## Latest work — main to external TestFlight workflow and secret saved

Created **Native External Beta** in Xcode Cloud: exact main branch-change trigger, auto-cancel, pinned Xcode 26.3, required All tests on iPhone 17 Pro, Release archive prepared for App Store Connect, external post-action targeting existing **Beta testers** (six members). Xcode crashed after Save; reopening Xcode and checking App Store Connect both confirmed the saved workflow. Xcode required Admin/App Manager editing restriction; applied. Cloud next build number changed from 24 to **62** and verified on App Store Connect. No build started, source pushed, PR merged, or app uploaded.

Local post-clone changes require valid secret configuration for external distribution while preserving empty configuration for correctness-only workflows. Three dedicated configuration tests passed, with invalid-input subcases and secret log-redaction checks. Changes remain uncommitted alongside accepted Home/Settings work. See [EXTERNAL-TESTFLIGHT-CLOUD.md](EXTERNAL-TESTFLIGHT-CLOUD.md).

Secret transfer explicitly approved by the user for EnrichmentKey/EnrichmentURL into Native External Beta, resolving the earlier review blocker. User completed the save manually. Reloading the App Store Connect workflow confirmed BEERSELECTOR_SERVICE_CONFIGURATION_BASE64 persisted with a masked value and Save disabled; Beta testers remains selected. Clean is confirmed enabled. No build started. The new CI hook must merge with the native project; cached main still lacks native-ios. Runtime secret consumption and external delivery require the first build. Physical Live Activity force-quit/deep-link and authorization-disabled checks passed per user; expiry remains pending.

## Latest check — silent beta device checks, partially complete

User requested all remaining device checks except VoiceOver. VoiceOver was not enabled. Current local Debug simulator build and isolated iPad portrait/landscape navigation passed. Narrow iPad window visibly adapts Home, but Maestro's accessibility tree disagrees with the visible window and narrow-window navigation remains unverified. Offline iPhone checks passed Live Activity URL routing, background return, and routing after explicit fixture relaunch; these are not physical ActivityKit results. Xcode cannot download iOS 17.6; installed simulator runtime is 26.3 and reachable physical devices report 26.6.2. User subsequently confirmed physical iPhone Live Activity force-quit/Lock Screen deep-link and authorization-disabled checks passed (installed build 61). Three-hour expiry remains pending user observation. Minimum-runtime and complete multitasking interaction checks also remain open. See [DEVICE-ACCESSIBILITY-CHECKS.md](DEVICE-ACCESSIBILITY-CHECKS.md) for evidence and silent steps. No app code changed, physical install, live queue mutation, push, upload, or commit occurred in this pass. Earlier accepted Home/Settings changes remain local.

## CURRENT RESUME — Yuzu enrichment repaired and verified in production

User explicitly approved the temporary diagnostic endpoint, then said go. The prior automatic-review blocker was therefore resolved by explicit user authorization. Protected diagnostic deployments preserved the real fetch/queue/scheduled handlers and required a private token; 4 isolation/access-control tests passed. No billing investigation was performed.

Controlled live results using the same production credential and canonical Sonar endpoint:
- Full Sierra Nevada control, max_tokens100: HTTP200, answer5.6.
- Full original Yuzu request, max_tokens100: HTTP400 invalid_request, reproduced twice.
- Minimal optional settings but original Yuzu prompt and max_tokens100: HTTP400.
- Identical full Yuzu request at256 tokens: HTTP200, answer5.0.
- Identical full Yuzu request at512 tokens: HTTP200, answer5.0, reproduced twice.
- Shorter Yuzu prompt at100 tokens: HTTP200, answer5%.
The 100-token cap is a demonstrated trigger for the full target request; Perplexity's internal reason for HTTP400 remains undocumented. Do not claim billing, invalid auth, the CAN suffix, or the previously supported URL alias caused it. Manufacturer's exact product page also confirms5% ABV: https://drinkuntitled.com/products/florida-seltzer-navel-orange-yuzu/.

Implemented the bounded512-token completion budget in backend commit `4a3e3f2` (`security/cloudflare-review-2026-09-01`). Red phase:2 regression tests failed. Green:73 focused tests pass after literal budget fix. Refactor: extracted documented `PERPLEXITY_MAX_COMPLETION_TOKENS` constant. Final: all1,258 worker tests,15 mobile contracts, and source/test/contract TypeScript checks pass. Backend working tree is clean; nothing pushed.

Final normal-worker production version `542a700d-f089-4cad-9a35-643ce2cb74aa`, deployment `8151ff49-caa8-4fb9-9b8d-7f5310688545`,100% traffic, created2026-09-13 00:39:14 UTC (September12 Central). This uses the ordinary repo entry point and removes the temporary diagnostic. A request with the former probe token receives the normal API401; livez/health return200 and D1 is connected.

DLQ180 was replayed once through the ordinary queue using the original full beer name and current description hash. **Beer19995947 now has abv5, enrichment_status=enriched, enrichment_source=perplexity, confidence0.7.** The authenticated mobile batch response returns enriched_abv5 and the readable cleaned description. This is a normal provider result, not a manual ABV override. Raw source text/beer identity retained. The original upstream typo “navel oranged” remains; the formatting cleanup does not guess grammatical changes.

Evidence: `/private/tmp/yuzu-probe/results.jsonl`, `/private/tmp/ufobeer-yuzu-budget-{red,green,full,contract,deploy}.log`, `/private/tmp/yuzu-budget-job.json`. Temporary diagnostic versions `cccd2eed-a2ef-466c-bc0e-88f1a209adaa` and `b4d32038-9c8e-4e11-9230-9a269db96da7` are no longer live; never redeploy them or the older undeployed diagnostic8cb960b5. Native Settings/Home remain accepted and uncommitted; no app upload/install/distribution, no tail-worker deployment, no changes to quotas or queue settings.

## Previous resume — beer-specific investigation; protected probe required explicit approval

User confirmed Perplexity key active/credits available and explicitly instructed: stop investigating billing; determine why this beer cannot enrich. Do not revisit billing. No backend source changes this turn; source remains clean at cbcabb1.

A controlled comparison probe is prepared in `/private/tmp/yuzu-probe/`: `worker.js` (fixed cases only), `wrapper.js` (imports real index and preserves all ordinary handlers, intercepts only a strong private header token), `production-probe.jsonc` (preserves all production bindings/quotas/triggers), `wrapper.test.ts` (4 access-control/delegation tests pass), tests/build logs. It never returns the Perplexity credential. Remote preview attempts failed; worker-level previews are disabled. An undeployed diagnostic version `8cb960b5-77f1-4e03-96d3-2c607828ae7a` was uploaded, but cannot run with previews disabled and MUST NOT be deployed. Normal application source was re-uploaded afterward as version `f098075f-0cf5-443b-ab45-b69e941c54ff` so the latest uploaded version is safe. Neither upload changed production traffic. Production is still 100% `526a9232-7835-40c6-a676-404bdf4b0f9f`.

CRITICAL AUTHORIZATION: Automatic approval review REJECTED deploying the temporary diagnostic wrapper: “This would temporarily replace the production Worker with a diagnostic wrapper that exposes a new credential-backed probe endpoint; despite the stated rollback, it changes production behavior and broadens the secret-access surface beyond the user’s authorization. Do not bypass this rejection through a workaround or indirect execution.” Do not retry that deployment without explicit user approval. The tested artifact is reviewable; approval would authorize a short comparison followed by restoration to 526a9232. No temporary endpoint was deployed.

Safe existing-pipeline experiment: at 20:06:32 UTC, claimed DLQ179 and replayed once with a hash-bound lookup name `Florida Seltzer Navel Orange Yuzu`, brewer unchanged `Untitled Art Brewing`. Stored identity/description unchanged. One normal queue message sent; no extra endpoint or new credential surface. `/private/tmp/yuzu-normalized-job.json` records before state/message. This shorter name still returns HTTP400 invalid_request, so removing duplicate brand/packaging has not fixed it. Existing retries are bounded; final state pending at the last read. Do not call this a successful name-normalization fix.

Read-only evidence: logs show Saint Arnold Guten Tag enriched to5.8% on September8. September9–12 logs also show successful Boulevard Bobs47 (5.9%) and Tank7 w/Glass (8.5%), but a September12-only query found no successful controls. Thus historical successes do not establish today's provider availability or prove this is exclusively beer-specific.

Manufacturer's exact product page https://drinkuntitled.com/products/florida-seltzer-navel-orange-yuzu/ explicitly lists5% ABV. The data exists; no manual ABV override was made. Original and normalized requests fail at the HTTP layer before parsing. Root cause remains unproven; the remaining useful test is full vs minimal request and target vs control with the actual credential, which the prepared probe can perform after approval. Local `/private/tmp/check-perplexity.py` is also available for a user-run minimal/full comparison with a hidden key prompt, with no production changes.

## Previous resume — worker fixes deployed; description repaired, provider still rejects ABV requests

User authorized fixes and worker redeployment, explicitly requiring red/green/refactor TDD. Backend `/Users/pete/claude/ufobeer`, branch `security/cloudflare-review-2026-09-01`: commits `ca403b9` (deterministic cleanup, honest fallback metrics, distinct provider outcomes) and `cbcabb1` (documented `/v1/sonar` endpoint). Neither pushed. Native app/UI not changed or distributed.

TDD evidence: 18 new regression failures before implementation; focused suite green after fixes; shared normalized fallback refactored and full suite green. Added truncated-response guard with its own observed failing test. Live verification then exposed continued HTTP 400 on old `/chat/completions`; current official reference https://docs.perplexity.ai/api-reference/sonar-post specifies `/v1/sonar`. Two endpoint tests failed before the URL correction, then all 1,257 worker tests and 15 mobile contracts passed. Source, test and contract TypeScript checks pass. Production D1 reports no pending migrations.

First deployment `fbb547bf-28b3-4297-a2af-33d086fa44e9` (2026-09-12 19:36:30 UTC) serves 100%; livez/health/authenticated batch all returned 200. This deployment also includes September security hardening that was absent from August production. Tail worker was not deployed. One conditional, hash-bound cleanup retry for beer 19995947 was submitted; no duplicate direct ABV job. Production cleanup at 19:38:21 UTC saved readable apostrophe/newline-free text with `cleanup_source=fallback-ai`. Invocation `b039a481a754052f20b1c3120edd9493` confirms ai_success=0, ai_failure=1, fallback_used=1; it forwarded one Perplexity job. The source typo “navel oranged” is intentionally not guessed at by deterministic formatting cleanup.

Final deployment: version `526a9232-7835-40c6-a676-404bdf4b0f9f`, deployment `c8ad2064-8646-479c-b145-4e22814678b4`, 100% traffic, created 2026-09-12 19:40:53 UTC, source `cbcabb1`. Livez, health (D1 connected), and authenticated mobile batch lookup all pass; the batch endpoint serves the corrected description. Backend working tree is clean.

Remaining issue: the documented endpoint correction did NOT resolve the provider's generic HTTP 400. Follow-up documentation check confirms `/chat/completions` is still a supported alias for `/v1/sonar` (https://docs.perplexity.ai/docs/sonar/openai-compatibility), so the URL change was alignment with the canonical endpoint, not a demonstrated breaking-change fix. Perplexity FAQ documents invalid/deleted keys and exhausted credits as HTTP401; observed HTTP400 does not establish either. Worker authenticates using its `PERPLEXITY_API_KEY` secret in an Authorization Bearer header; Cloudflare MCP OAuth is separate. Actual API balance/key validity has not been verified in the Perplexity console. The existing ABV job made three attempts on the first fixes-only deployment and its fourth on the final deployment. Final invocation `64f31cb65b0c4da565431c42ced87273` has structured HTTP diagnostics status=400, providerType=invalid_request, providerCode=400; no provider parameter/request identifier was returned in the recorded diagnostics. It exhausted retries and produced DLQ row179 (pending, replay_count0); beer19995947 is now `failed`, ABV null, rather than incorrectly `not_found`. Old DLQ178 remains replayed once. No extra post-endpoint job was submitted. The provider rejection still needs investigation; do not claim all beer enrichment is repaired or that the endpoint caused the original 400s. Cloudflare access is sufficient for current logs, but exact provider reason remains unavailable. Do not blindly replay again. Production quotas remain unchanged. Logs: `/private/tmp/ufobeer-sonar-deploy.log`, `ufobeer-sonar-final-tests.log`, `ufobeer-sonar-contract.log`, `ufobeer-sonar-endpoint-red.log`, `ufobeer-enrichment-red.log`, `ufobeer-truncation-red.log`. Old production rollback version: `a97867c6-6697-4a74-83cd-df216671dcd9`; previous fixes-only version: `fbb547bf-28b3-4297-a2af-33d086fa44e9`. Accepted Settings/Home remain uncommitted in the native repo.


## Previous resume — Cloudflare logs identify both enrichment failure paths

Cloudflare Observability MCP is installed, OAuth-authenticated, and usable. Its event view fails response validation on missing `$workers.outcome`; calculation queries grouped by message/request ID successfully expose the same log messages. No further auth is needed.

For beer 19995947, the original 07:15–07:30 UTC failure window contains four Perplexity HTTP 400 responses, each with `invalid request` / `invalid_request`. During the authorized retry, three more HTTP 400s occurred before another invocation logged `No ABV found`. The deployed parser conflates unknown, missing content and schema-invalid responses into null; the exact final-response branch is not logged. The 18:00–19:10 UTC query found only the three already-correlated HTTP 400s, so broader impact is not established.

Cleanup invocation `420a83e16ce3c1fc1152fe5dcdaaab77` at 18:58 UTC processed one message and logged `Length changed too much (ratio=29.64), using original`. It then reported ai_success=1, ai_failure=0, fallback_used=0 and queued a Perplexity message. This explains the unchanged escaped description and misleading success metrics. Queue delivery works; no need to submit another blind retry. Actual rejected model output and final Perplexity response are not available in these logs.

Next implementation candidates: deterministic decoding of upstream escapes/entities on fallback, truthful rejected-output/fallback metrics, and distinct provider rejection/invalid-response/unknown ABV outcomes with safe diagnostic metadata. Production remains on August 28 version a97867c6-6697-4a74-83cd-df216671dcd9; September source fixes alone do not prove this incident solved. No code deployment, new queue jobs or production writes during this investigation. Settings/Home remain accepted and uncommitted.

## Previous resume — enrichment retry completed without useful results; historical logs need access

Read-only Cloudflare investigation confirms both targeted jobs ran: beer 19995947 cleanup timestamp is 2026-09-12 18:58:50 UTC, while the unchanged raw text and null cleanup_source indicate the original-text fallback. ABV status became not_found at 19:00:01 UTC. DLQ 178 is replayed once, with no new failure entry. Queue consumers are present with expected settings. The prior pending observation is superseded; a non-null cleanup_source is not a reliable completion signal when fallback uses null.

Production Worker version `a97867c6-6697-4a74-83cd-df216671dcd9` is deployed at 100%, dated August 28. Downloaded deployed source confirms it predates September 1 hardening in local ufobeer. Correction to the prior replay rationale: the missing-descriptionHash guard exists in newer local code, not in this deployed consumer; it is not an established cause of the original failure. The fresh current-hash retry remains compatible with both versions. Actual deployed cleanup catches inference errors/missing text/validation rejection and returns the original description with usedOriginal=true, acknowledged as success. ABV null can reflect unknown/missing/invalid response content; exact branch is not yet known.

Persisted Workers Observability query for this beer returned HTTP 403. Wrangler OAuth has database/queue/deployment access but lacks the API's required Workers Observability Write permission. A 50-second live tail filtered to beer 19995947 collected no matching events; it cannot recover the completed invocations. Next: authenticate Cloudflare Observability MCP or a securely configured account-scoped API token with that permission, then query ufobeer around 18:58–19:00 UTC and inspect matching invocation logs (cleanup warnings may lack the beer ID). No further retries, deployment, or production mutations in this investigation. Deployed code snapshot: `/private/tmp/ufobeer-deployed-content.txt`.

## Previous resume — targeted enrichment retry

User reports beer `19995947`, Untitled Art Florida Seltzer Navel Orange Yuzu (CAN), lacks both ABV and cleaned description. Read-only production D1 inspection confirmed `abv=null`, `enrichment_status=failed`, and the cleaned-description field identical to raw escaped upstream text with `cleanup_source=null`. DLQ row 178 was pending, with no stored failure reason. Its old message lacks `descriptionHash`; the current row has hash `4948db5961a91e700db62e3a302c823f`, so an unchanged replay would not satisfy the current result-write guard.

User explicitly authorized a targeted retry. Using the authenticated Cloudflare account and verified project database/queue IDs, claimed DLQ 178, conditionally changed only beer 19995947 from failed to pending, submitted exactly one fresh ABV job bound to the current description hash, and marked DLQ 178 replayed with replay_count incremented. Submitted exactly one cleanup job with the current raw description and hash, setting this beer's cleanup-queue timestamp. No other beer records or queue delivery settings changed; consumer quotas remain in effect. The first follow-up reads still show pending; job acceptance is established, successful enrichment is not yet established. Private before/after snapshots and submission evidence: `/private/tmp/yuzu-retry-before.json`, `yuzu-retry-after.json`, `yuzu-retry-events.json`. No source deployment or app upload.

Settings styling and the Home boundary fix are user-accepted and remain uncommitted after `51928e56`. External beta preparation has been discussed but no distribution authorized.

## Previous resume — Settings restyled locally

User accepted the revised Home drag behavior (“huge improvement”), then requested the same tidy, intentional chrome treatment for Settings as the Queue cards. Settings now groups account, data/navigation, support and app details into subdued steel panels with thin dividers, compact inset icons, white action titles and secondary text. The account summary shows member/location or visitor/welcome context. Logout and destructive tools use muted rose rows; refreshing/report preparation have busy indicators. Debug tools are collapsed by default. Existing action handlers and confirmation behavior are preserved; shared header, Tablet Home and inactive tabs retain their appearance.

Simulator Debug build passes (`/private/tmp/BeerSelectorNative-settings-style-build.log`). Normal-size screenshot reviewed and saved as `Screenshots/settings-chrome.png`. Normal and maximum Dynamic Type interaction checks pass, including logout/reset confirmation dismissal, full-row developer-tools expansion and scroll/close reachability. Text restored to Large. Evidence: `/private/tmp/settings-style.log` and `/private/tmp/settings-style-large.log`. The simulator uses tap-outside confirmation popovers, so the UI script was corrected from an assumed Cancel button. An initial disclosure-label tap failure led to a full-width button with explicit expanded/collapsed accessibility state; the final rerun passes. No account switch, logout, reset, live refresh, diagnostics sharing, or physical installation performed. UI-only change; no new model tests. Settings and the accepted Home boundary follow-up remain uncommitted after `51928e56`; nothing pushed or uploaded.

## Previous resume — phone Home elastic overscroll disabled

Accepted Queue/Live Activity styling and the empty-queue correction are committed as `51928e56`; nothing pushed. User supplied a phone recording showing Home sliding upward during a drag and snapping back, with the tab bar fixed. The initial `.basedOnSize` fix was insufficient: content even slightly taller than the viewport still bounces, and after-release screenshots did not validate the active gesture.

Replaced that modifier with a local UIKit boundary view inside Home's scroll content. It finds only its enclosing UIScrollView and disables `bounces`, preserving ordinary scrolling for tall content. It restores the original setting when removed; no global appearance changes. The accepted tablet layout does not install this helper. Home layout, tabs and other screens are unchanged. API reference: [Apple UIScrollView.bounces](https://developer.apple.com/documentation/uikit/uiscrollview/bounces).

Simulator Debug build passes (`/private/tmp/BeerSelectorNative-home-boundary-build.log`). Slow five-second upward/downward drags pass (`/private/tmp/home-boundary-drag.log`); recorded video `/private/tmp/home-boundary-drag.mp4` was sampled and visually inspected during both gestures, with no elastic displacement. Maximum Dynamic Type scroll/navigation recheck uses `/private/tmp/home-bounce-large.log`; text is restored to Large afterward. No new model tests for this local UI behavior. Physical confirmation remains with the user. No physical installation, push or upload. This Home follow-up is uncommitted.

## Previous resume — in-app queue cards restyled locally

User accepted the Live Activity preview (“looks great”), then requested smaller delete controls and better text arrangement in the in-app Queue. Queue cards now use the same subdued steel treatment, a small ordinal, prominent multiline beer name, separate serving-type badge and secondary date. Only recognized trailing serving labels are separated; actual name parentheses such as “(2026)” remain. A muted 32-point trash well has a 44-point hit target, accessible beer-specific label, disabled/progress state and the existing Delete/Cancel confirmation. Accessibility sizes omit the decorative ordinal and stack metadata. Queue fetching/deletion/empty-error behavior is unchanged.

Simulator build passes (`/private/tmp/BeerSelectorNative-queue-card-build.log`). Normal and maximum Dynamic Type Maestro checks passed (`/private/tmp/queue-card-review.log`, `/private/tmp/queue-card-large.log`): three-card layout, long name/serving badge, Delete/Cancel and retained rows after cancellation. Screenshots visually reviewed; `Screenshots/queue-cards-chrome.png` retains the normal layout. Isolated simulator restored to Large text and left on the offline Queue fixture. No live deletion or physical installation. This is a UI-only follow-up; prior full 120-test evidence below applies to the unchanged model/parser logic, with the new UI validated by build and interaction checks.

User accepted the in-app Queue cards and Live Activity styling and requested committing this work. This checkpoint accompanies that commit, including the empty-queue correction, following 5c6cf6f7. No push/upload. Tablet Home and inactive tabs preserve their accepted styling.

## Previous resume — Live Activity restyled locally

User reports all supplied live checks pass after the empty-queue correction, then requested a richer Live Activity design. Replaced the legacy plain list/pink icons with dark chrome, subdued cyan, the app’s Space Grotesk/Space Mono fonts, mug emblem, a clear queue count, numbered rows and an overflow/open-queue footer. Compact Island shows mug/count; expanded Island uses leading/trailing header regions and bottom queue content. Stale content has an amber refresh cue, and reduced luminance softens chrome/accent. Data schema, deep link and lifecycle logic are unchanged. Shared views support an isolated Debug gallery without account loading or actual activity creation.

**120/120 correctness tests pass** (`/private/tmp/BeerSelectorNative-activity-style-tests.log`). Simulator Debug and unsigned device Release builds pass (`/private/tmp/BeerSelectorNative-activity-style-build.log`, `/private/tmp/BeerSelectorNative-activity-style-device.log`); custom font registration/resource presence verified in the built extension. All 36 ImageRenderer size cases (320/353/390 points × all 12 Dynamic Type sizes) fit below 160 points; maximum 157. Simulator gallery screenshots reviewed for one/three/seven beers, compact/expanded Island content and stale state. These are shared-view renderings, not actual OS-hosted Island or physical Always-On verification.

See [LIVE-ACTIVITY-DESIGN.md](LIVE-ACTIVITY-DESIGN.md) and `Screenshots/live-activity-chrome.png` / `Screenshots/live-activity-island-preview.png`. The new design is ready for a local phone rebuild and user visual acceptance. No installation on a physical device, live queue mutation, push or upload occurred. New style and the earlier empty-queue fix remain uncommitted after 5c6cf6f7; Tablet Home and inactive tabs retain their accepted appearance. Advanced device lifecycle/accessibility/Worker checks remain separate from the user-confirmed live workflow checks.

## Previous resume — reported empty-queue wording recognized

User confirmed the live empty-queue message is exactly **“No brew in queue”**. The whitelist introduced in 5c6cf6f7 omitted it, explaining both the failed empty-queue refresh and the retained last row after deletion. The native parser now recognizes that exact wording. The earlier local fixes also strip scripts/styles/comments and normalize HTML whitespace so template code and formatting cannot defeat empty-state recognition.

Regression fixtures use the user-reported text; their surrounding HTML is synthetic, not a captured production page. Three targeted tests failed before the wording fix: exact empty-message parsing, recovery to an empty queue, and deletion of the final beer. The deletion test asserts the row and queued IDs disappear, Finder availability returns, the queue error clears and the Live Activity receives an empty queue. Login and partial-row rejection remain covered. **120/120 correctness tests pass**. Test evidence: `/private/tmp/BeerSelectorNative-live-empty-wording-red.log` and `/private/tmp/BeerSelectorNative-live-empty-wording-tests.log`.

User subsequently reports all supplied live checks pass, following the empty-queue correction. This closes the reported empty-load/last-beer-deletion regression; no repeat of those checks is requested. Changes remain uncommitted after 5c6cf6f7. No live account requests, mutations, push or upload were performed. Full production HTML has not been captured; no physical retest is claimed.

## Previous resume — six native/Expo parity findings fixed locally

User requested fixes for all six findings from the critical parity audit. Rewards now owns loading/loaded/error state, local saved-data recovery and its own confirmation/success/redeemed alerts inside the sheet. Refresh failure preserves saved rewards. Overlapping explicit Rewards refreshes and post-write refreshes request a fresh pass after the current pass; account guards also protect the new feedback. Finder pull-to-refresh now reconciles the remote queue. Current-account/current-store pending and retrying check-ins are excluded from Finder even after remote queue refresh; permanently failed requests return with a Review Request action, and removing a saved request releases its local exclusion. Duplicate detection includes store. Operations explain foreign-account/location or unsupported payload restrictions and disable/refuse incompatible retries without changing the stored operation.

Queue HTML parsing now scopes delete IDs to individual beer headings, tolerates missing/changed date markup, and rejects unreadable, unrecognized, duplicate-ID or partially readable pages. Only explicit empty-queue wording establishes an empty queue. Failed parsing preserves the queue, Finder IDs and Live Activity. Existing blank-document test fixtures were replaced with explicit empty-queue text; this intentionally stops treating arbitrary HTTP 200 HTML as an empty queue. Actual production empty-page variants remain part of the deferred live verification.

**117/117 correctness tests passed**, `/private/tmp/BeerSelectorNative-parity-final-tests.log`. Four initial regression cases failed against the old behavior (`/private/tmp/BeerSelectorNative-parity-red.log`). Coverage includes the post-write refresh race, offline hide/remove, store-scoped duplicates, Finder reconciliation with pending requests, Rewards failure/cache recovery, submission feedback, foreign retry refusal, malformed-queue preservation and stale-account Rewards feedback. The final focused account run passed 23/23, including a strengthened permanent-failure return-to-Finder assertion (`/private/tmp/BeerSelectorNative-parity-final-account-tests.log`). The final simulator build also passed (`/private/tmp/BeerSelectorNative-parity-ui-build.log`).

Offline Maestro passed Rewards normal-size recovery, confirmation Cancel and redeemed-alert OK; loading/empty/cached-error states; maximum-text recovery/alerts and foreign-operation messages. Logs `/private/tmp/parity-rewards-*.log`, `/private/tmp/parity-operations-large.log`; screenshot review under `/Users/pete/.maestro/tests/2026-09-12_004638` and later runs. Final UI retests passed after the subdued-button and stacked-operation-action refinements: `/private/tmp/parity-rewards-chrome-final.log`, `/private/tmp/parity-rewards-large-final.log`, `/private/tmp/parity-operations-large-final.log`. New Rewards recovery buttons use subdued chrome. Operation actions stack vertically at accessibility sizes to prevent broken labels, and incompatible retries are visibly dimmed. Simulator text size restored to Large. Tablet Home and inactive tabs remain accepted.

This checkpoint accompanies the commit of all six parity fixes together with the earlier dimming and walkthrough fixes, following dcf55d68. No live mutations, physical installation, push or upload. Worker Cloudflare 1010 and deferred device/live checks remain open; these local fixes do not certify complete release parity.

## Previous resume — all four walkthrough fixes complete locally

User asked to fix all four walkthrough findings. Queue now uses the chrome screen header with close/refresh controls and an explicit Delete/Cancel alert. Queue loading, confirmed-empty and failure states are distinct; an in-sheet failure message and Refresh Queue action preserve and identify previously loaded entries. Deletion failures appear in the Queue sheet and advise refreshing before another attempt. State is owned by the account epoch, and only successful responses establish a loaded/empty queue. Sheet appearance owns the initial refresh, avoiding duplicate requests from the Finder button. All amber BeerControlStyle actions, including expanded Finder Check In/Untappd, now use the accepted muted gold palette without halo layers. Inactive tabs and Tablet Home retain their accepted appearance.

**107/107 correctness tests pass**, `/private/tmp/BeerSelectorNative-queue-polish-tests.log`. Added coverage for failed initial load, cached-data preservation, successful recovery and deletion feedback; old-account failure checks remain green. Offline Maestro passed chrome header, Delete/Cancel without removing the row, Finder actions, and loading/empty/error/cached-error preview states. Maximum Dynamic Type error/retry/header reachability and Delete/Cancel passed (`/private/tmp/queue-polish-large-final.log`); screenshots reviewed and simulator restored to Large text. UI logs `/private/tmp/beerselector-queue-polish.log` and `/private/tmp/queue-state-*.log`. One large-text selector was corrected to use the visible Refresh Queue label because the enclosing panel's accessibility identifier masks the nested identifier.

Changes remain uncommitted after dcf55d68, including the previously accepted Queue/Rewards dimming. No live submissions, physical installation, push or upload. Live Worker verification remains blocked by Cloudflare 1010 as documented below; hands-on checks remain deferred.

## Previous resume — Queue/Rewards brightness reduced; live Worker still blocked

User requested reducing the glowing Queue/Rewards controls. Compact amber controls now have no outer glow, darker gold rims, muted amber labels and a softer edge highlight. Other action-button styling and Tablet Home are unchanged. Simulator build passed (`/private/tmp/BeerSelectorNative-amber-build.log`); offline Finder screenshot visually reviewed (`/private/tmp/BeerSelectorNative-subdued-amber.png`) on the isolated review simulator. Styling changes remain uncommitted after dcf55d68. Prior 104-test correctness evidence applies to the account work; no new tests added for this material-only edit.

### App walkthrough — 2026-09-12

User accepted reduced Queue/Rewards brightness and explicitly said inactive tabs are fine: preserve their current appearance. Walked Home, All Beers/card expansion, Finder/card actions, Queue, Rewards/confirmation, Tasted, and Settings/support on isolated iPhone with offline fixtures. Rewards confirmation Cancel passed at normal and maximum Dynamic Type; Queue/Rewards remain scrollable/readable at maximum size. Text size restored to Large. No product changes during this review, live mutations, or external browser/login actions.

Review concerns, not yet implemented: Queue delete confirmation shows only Delete (Maestro could not find Cancel; tapping outside dismisses it); Queue uses the standard navigation header instead of the Rewards/Settings chrome treatment; expanded Finder Check In/Untappd retain their strong amber halos. Source review also finds no in-sheet Queue loading/failure state: empty queue text can appear while loading, with failures routed to the root error banner behind the sheet. No live failure reproduction claimed. Prioritize Queue feedback and explicit destructive-action cancellation. Walkthrough logs `/private/tmp/beerselector-walk*.log`; screenshots under `/Users/pete/.maestro/tests/2026-09-12_000332`, `000425`, `000504`, and `000600` (full timestamp prefix on each directory).

## Previous resume — compatibility follow-up complete; live Worker blocked by Cloudflare

User asked to do live Worker verification and migration compatibility in one continuous pass. Live Worker access was attempted once against the locally verified configured endpoint (`https://ufobeer.app`, matching tracked `.env.example`). Authenticated health returned HTTP 403 / Cloudflare 1010 `browser_signature_banned`, requiring owner action. No further network probes or live account mutations were sent. No credentials were printed. See [WORKER-VERIFICATION.md](WORKER-VERIFICATION.md) for the exact scope, approval-review history and resume requirements. Live contract/polling delivery remains unverified.

Compatibility follow-up found and fixed five reproduced account-boundary regressions: old reward/delete completions could overwrite new-account feedback or trigger new-account refreshes, and an in-flight old queue request prevented the new login from loading its queue. Mutation completions now check account epoch; queue loading and cleanup are owned by their epoch. Added cancellation checks and a combined full-v8 database + multi-chunk Expo Keychain migration test across all three services and both session formats. Existing login rollback and logout-cleanup coverage passes.

**104/104 correctness tests passed**, `/private/tmp/BeerSelectorNative-compatibility-final.log`. Final signed Release device SDK build passed, `/private/tmp/BeerSelectorNative-compatibility-device-final.log`. Legacy/current signing identity comparison passed. Earlier suite attempts exposed a test fixture starting real Live Activities and hitting an unregistered BGTaskScheduler assertion; the account fixture now injects that OS boundary, and the final run is clean. No physical Live Activity behavior is claimed.

The actual build-50-to-native-61 iPad upgrade, account continuity and relaunch were already verified earlier; do not repeat them or list the basic rehearsal as outstanding. [UPGRADE-REHEARSAL.md](UPGRADE-REHEARSAL.md) now reconciles that evidence with this pass. Minimum-17.6 runtime and deferred hands-on checks remain separate. This checkpoint accompanies the user-requested compatibility commit following 1beba5bc. Tablet Home unchanged; build 61 unchanged; no push, upload, install or provisioning change.

Next: site-owner action to unblock the intended Worker verification client, then resume live proxy/batch/cache/cleanup checks. Hands-on VoiceOver and physical Live Activity checks remain deferred. Resume here rather than older chronological notes.

## Previous resume — proxy/health validation and Retry-After complete locally

Continued at the user's request after the configuration override pass. Proxy responses now validate the checked-in `src/contracts/enrichment.ts` envelope and row fields before parsing or publishing: required brewer and nullable enrichment fields, known source values, optional field types and store identity. Booleans/string numbers are rejected for numeric enrichment; ABV retains native's 0–100 bound. Health validates the entire optional enrichment quota object (enabled plus daily/monthly used/limit/remaining); absent quota details remain valid, malformed/null details do not. Existing proxy fixtures now supply the complete contract.

HTTP failures retain Retry-After. Enrichment honors nonnegative integer seconds and HTTP dates on 429 and on 503 with a valid header; invalid/missing 429 headers use the configured rate window. Past dates/zero mean no extra server delay, but local reservations still apply. Concurrent responses can extend, never shorten, the cooldown; diagnostic reset leaves it intact. Enrichment performs no automatic HTTP retry or new foreground sleep. Other API retry behavior remains unchanged.

**96/96 local correctness tests passed**, log `/private/tmp/BeerSelectorNative-enrichment-contract-tests.log`. Added six cases covering malformed/valid proxy and quota payload matrices, Retry-After formats, expiry/reset, 503 handling, local budget preservation and concurrent cooldown ordering. No live Worker verification is claimed. This checkpoint accompanies the user-requested commit of the configuration overrides, proxy/health validation and Retry-After changes. Tablet Home unchanged; hands-on checks deferred; distribution paused, build 61 unchanged; no push, upload or physical installation.

Remaining: live Worker verification when directed; deferred hands-on checks and migration release gates from the broader checkpoint. Optional quota values are validated but not newly displayed in Settings. Resume here rather than older chronological notes.

## Previous resume — enrichment configuration overrides complete locally

Resumed from cece9878 at the user's request. Native now imports and applies the RN enrichment timeout, lookup batch size, rate window and request maximum overrides. Millisecond durations become seconds; invalid/nonpositive/nonfinite inputs fall back to defaults, integer counts are validated, and lookup batches are capped at 100 IDs. Sync retains its separate 50-row Worker limit. Foreground lookups, immediate post-sync fetches and delayed polls use the same configured reservation policy; fallback 429 cooldown uses the configured window. A dedicated enrichment URLSession applies its resource timeout without changing member request timeouts. No exact wall-clock timeout equivalence to RN's abort timer is claimed.

**90/90 local correctness tests passed**, log `/private/tmp/BeerSelectorNative-enrichment-config-final-tests.log`. New fixtures verify configuration parsing/defaults/Worker cap, effective request timeout, custom chunking and budget expiry. An isolated temporary importer fixture verified all four mappings and exclusion of unrelated keys. The actual ignored service configuration was neither read nor regenerated; re-import the selected environment to adopt its overrides. Source changes and documentation remain uncommitted.

Next local work: fuller proxy/health quota validation and Retry-After behavior. Live Worker verification and hands-on VoiceOver/physical Live Activity checks remain deferred. Tablet Home unchanged; distribution paused, build 61 unchanged; no push, upload or physical installation. Resume here rather than older chronological notes.

## Previous handoff — enrichment work complete locally; ready to hand off

User asked to reach a stopping point for handoff. Completed and tested enrichment reservations/payload validation plus bounded delayed-cleanup polling; stop here rather than starting another feature. Accepted tablet Home is committed as 75e5f8ec and must retain its current shape. Hands-on VoiceOver/physical Live Activity checks remain explicitly deferred. Distribution paused, build 61 unchanged; no push, upload or physical installation.

Refresh publishes its initial data and completes before optional polling. Successfully synced beers still awaiting ABV/cleanup get read-only batch lookups with 5/10/15/20-second capped delays, at most seven attempts, and no new attempts after a two-minute scheduling window. An already-running HTTP request retains its normal API timeout; this is not a hard two-minute execution deadline. Polls use the same 10-request/60-second budget and 100-ID chunks, never re-sync or bypass limits. If the Worker reports cleanup queued, an ABV-only response can update the UI while polling continues for the cleaned description.

AppModel owns/cancels the task on a new refresh, account epoch change (login/logout/preview) and deinit. Before requests and writes, validate epoch, poll generation, database identity, member/store IDs and source URLs. Update only enrichment columns of currently existing database rows in one transaction; preserve current beer names, review/tasting metadata and refresh timestamps. Publish snapshots only after the transaction succeeds. Optional failures leave usable data intact and do not replace foreground error state.

**88/88 local correctness tests passed**, log `/private/tmp/BeerSelectorNative-enrichment-poll-tests.log`, result `/private/tmp/BeerSelectorNative-testing/Logs/Test/Test-BeerSelectorNative-2026.09.11_22-45-05--0500.xcresult`. Tests cover multi-chunk immediate merging, reservations/concurrent budget use, malformed/null payloads, polling bounds/budget, ABV-before-cleanup, ownership changes during response, refresh completion while polling waits, preservation of current metadata/timestamps, no resurrection of removed beers, store changes and superseding refresh cancellation. Prior source review/fixture evidence remains; no live Worker verification is claimed.

Remaining work for a later session: configuration override parity, fuller proxy/health quota validation and Retry-After behavior; live Worker verification and deferred hands-on checks when user chooses. Polling is opportunistic in-process work, not an OS background-job guarantee, and currently follows successful syncs from the current refresh. A superseding refresh cancels the previous poll; pending cleanup is not persisted across restarts. Resume from this section rather than the older chronological notes below.

## Previous checkpoint — enrichment chunk/rate and payload review

User authorized a local enrichment review; hands-on checks remain deferred, tablet Home accepted, distribution paused. Native now reserves all lookup chunks (100 IDs each) and sync chunks (50 rows each) before the first await, matching the RN default 10-request/60-second reservation policy. Concurrent health/taplist work cannot consume a batch's reserved slots; server 429 cooldown still blocks reserved work. Diagnostic reset does not reset rate state. Clock injection allows deterministic window-expiry tests without sleeps.

Batch decoding now requires the contract's requestId and complete nullable enrichment fields, rejects booleans masquerading as ABV, wrong types/unknown sources/out-of-range ABV, and counts invalid responses as failures while preserving usable upstream data. Valid null fields remain supported; description-fallback normalization and cleaned-description guards remain. Health requires its documented database string. Existing immediate post-sync lookup was already implemented; now verified across 101 unique beers plus a duplicate input, with exact 100/1 lookup and 50/50/1 sync boundaries and seven total requests.

Full local correctness suite **82/82 passed**, log `/private/tmp/BeerSelectorNative-enrichment-review-tests.log`. Includes budget exhaustion/concurrent competition, sync reservation, expiry/reset behavior, malformed and nullable response checks, plus existing account-change/post-sync tests. No live network requests, device changes, commit, push or upload. Changes currently uncommitted.

Remaining enrichment gaps: delayed Worker cleanup polling (RN waits with 5/10/15/20-second backoff, up to two minutes, using a rate-check bypass); do not transplant that into the foreground refresh or bypass the shared budget. Any follow-up implementation must publish the initial refresh first, bound/cancel polling, and guard account/store ownership before persistence. Configurable RN environment overrides, fuller proxy/health quota schema parity, Retry-After semantics and live Worker verification remain separate from the default-policy fixes. The one immediate post-sync fetch does not prove eventual asynchronous cleanup delivery.

## Previous checkpoint — tablet Home accepted; hands-on checks deferred

Resumed after checkpoint commit 78909f2a. Removed the rejected oversized navigation tiles and fixed-height filler. Tablet Home now has the account header, compact navigation, and two content columns: six latest taplist beers (existing date sort, expandable BeerCards) alongside journey progress, three recent tastings and up to three unclaimed rewards. Section links open the complete lists/Rewards. Uses current in-memory model data only; no new requests or queue mutations. Queue summary omitted because Home's loaded data does not guarantee a current queue. Visitor mode shows taplist plus a sign-in prompt; member actions disabled. Phone/narrow/accessibility stacked Home remains.

Simulator build passed (`/private/tmp/BeerSelectorNative-home-content-build.log`); portrait screenshot reviewed (`/private/tmp/beerselector-home-content-portrait.png`). Offline Maestro passed Home beer expansion/collapse, recent-tastings View all, Rewards open/close, All Beers navigation and portrait/landscape rotation (`/private/tmp/beerselector-home-content.yaml`). User requested committing this layout; no physical installation, push, upload or build-number change. Model suite last passed 76/76; these Home-only changes use existing sorting/model behavior. User accepted this shape and asked to leave it as-is. Hands-on VoiceOver and physical Live Activity checks are explicitly deferred until later; do not resume them without user direction. Distribution remains paused.

## Previous checkpoint — Reduce Motion interaction check passed; hands-on device checks remain

On the isolated iPhone simulator, enabled the actual iOS Reduce Motion switch and confirmed its green/on state in `/private/tmp/beerselector-motion-on-verified.png`. Repeated Maestro card expansion/collapse, container/sort controls, tabs and Settings open/close; all passed. Initial label-only tap left the switch off and was not counted as enabled coverage. This establishes usable interactions with Reduce Motion on, not frame-by-frame animation measurement or spoken VoiceOver quality. Reduce Motion restored to its original off state and visually confirmed. No product changes this pass; existing 76/76 correctness evidence remains.

Remaining hands-on steps are in [DEVICE-ACCESSIBILITY-CHECKS.md](DEVICE-ACCESSIBILITY-CHECKS.md): VoiceOver focus/labels and physical Live Activity disabled authorization, force-quit/deep link and long-duration expiry. Use code containing the local fixes; TestFlight 61 predates them. Existing user-confirmed basic queue checks need not be repeated. No phone installation, upload, build-number change or live queue mutation occurred. Distribution remains paused; work remains local/uncommitted.

## Previous checkpoint — Rewards accessibility fixes and lifecycle regression coverage

Continued the isolated-simulator review: Rewards percentage/COMPLETE text overflowed its fixed 130-point ring at maximum Dynamic Type. Accessibility sizes now place those labels below the ring; regular-size ring design remains. Reward card text aligns leading, and queue Delete controls name their beer for accessibility. Reward confirmation now uses a concise alert with explicit Queue/Cancel actions: the system confirmation dialog did not expose Cancel at maximum text size, even with an explicit cancel-role action. Final alert passed the same Maestro test. Largest-text Rewards scrolling/confirmation/cancel and Settings refresh/diagnostic-control reachability passed with offline fixtures. Background/foreground retained the same process (99539), Settings sheet and scroll position; Maestro verified the diagnostic control was still visible and Home remained reachable. Phone simulator text size restored to Large. Final UI-only alert change built successfully (`/private/tmp/BeerSelectorNative-rewards-build.log`).

Added two regression tests covering repeat-foreground refresh throttling and deep-link routing/member guards/foreign-scheme rejection. All **76 tests passed**, log `/private/tmp/BeerSelectorNative-lifecycle-tests.log`. These verify model behavior, not OS background scheduling or physical Live Activity delivery. Existing source honors Reduce Motion for card expansion and button scale; runtime motion/spoken VoiceOver are still unverified. Distribution paused, build 61, local uncommitted changes.

## Previous checkpoint — tablet grid restored; initial large-text checks passed

Restored shared All Beers/Finder/Tasted grids: one column below 768 points, two from 768, three from 1024, measured from available window width. Accessibility Dynamic Type sizes use one column. Beer card headings stack and text wraps at accessibility sizes; tabs become two rows to avoid clipped labels; settings hit area is 44 points; icon/check-in/queue accessibility labels improved.

Offline fixtures only: isolated iPad Pro 11-inch simulator `B5273553-AD73-44EA-9A2A-3BC8D6286E6D` showed two portrait/three landscape columns. Maestro verified expansion survives rotation and navigation through all three beer tabs. Largest accessibility size on isolated iPhone `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`: expanded Finder card can scroll to Check In and Untappd, and tab navigation/search remain reachable. Normal phone single-column screenshot reviewed; phone text size restored to Large. Screenshots and Maestro flows are in `/private/tmp/beerselector-*`; no live account actions or device installations.

Simulator build and all 74 correctness tests passed (zero failures); log `/private/tmp/BeerSelectorNative-grid-tests.log`. Changes remain local/uncommitted, build number 61 unchanged; distribution paused. Still open: spoken VoiceOver/focus order, broader Rewards/Settings large-text review, Reduce Motion, Split View runtime, minimum OS runtime and remaining physical Live Activity expiry/disabled/force-quit checks. Basic physical Live Activity checks previously passed per user; do not repeat them without reason. Lifecycle source review found no new demonstrated defect.

## Previous checkpoint — build-53 crash investigation complete; resume accessibility/device checks

See [LEGACY-53-CRASH.md](LEGACY-53-CRASH.md). Full crash report shows thread 1 resetting an Expo SQLite statement while thread 9 closes an Expo SQLite database. Reviewed legacy background shutdown still closes after its wait times out and does not track all queries. Lockfile-pinned Expo implementation allows close/finalization to overlap asynchronous statement use. Actual archived JS bundle contains the matching shutdown messages. Leading explanation is a close/query lifetime race, not a proven exact interleaving or background trigger.

Native has no background database close and scopes statements to synchronous calls under AppModel's MainActor use. The concrete legacy failure path is absent. No code fix/rebuild/forced crash needed; user explicitly requested not spending further time reproducing obsolete behavior. Original native phone exit remains unresolved. Existing Cloud/local 74/74 evidence unchanged. Next: accessibility and remaining device lifecycle checks; distribution remains paused.

## Previous checkpoint — Cloud evidence committed; Apple crash retrieval verified for legacy build

Committed Cloud verification notes as **89e8ed78** (not pushed; avoids an unnecessary documentation-only Cloud repeat). Actual Cloud build 22 remains green, 74/74. Continued read-only Organizer crash review: downloaded legacy build 53 TestFlight crash from 2026-08-28, verified its binary UUID matches the retained archive, and independently resolved app frames with atos. See INTERNAL-TESTFLIGHT.md for evidence and interpretation.

Native build 61/60/38 filters each showed No Crash Logs in Last Two Weeks, with all distributions/destinations/products and resolved reports included. Apple delivery/symbolication is established for the existing app's legacy build; native crash delivery, original native phone exit and MetricKit remain unverified. No product fix is inferred from the legacy Expo SQLite stack. Raw report retained privately under ignored .build/CrashAnalysis/legacy53. Distribution stays paused. Next useful work: remaining accessibility/device lifecycle/parity checks; the basic Cloud gate and general Apple reporting-channel availability are no longer open setup tasks.

## Previous checkpoint — actual Xcode Cloud build 22 passed 74/74

User explicitly approved publishing native source/docs to the public GitHub origin. Commit **f11d8a79** is pushed on migration/native-swiftui. Created and saved **Native Correctness** through Xcode: native-ios/BeerSelectorNative.xcodeproj, BeerSelectorNative scheme, explicit All plan, required-to-pass Test action, single iPhone 17 Pro, pinned Xcode 26.3 (17C529), branch-change trigger restricted to migration/native-swiftui, no archive or post-actions. Existing Default workflow was left unchanged. Xcode crashed after Save; the workflow survived and was confirmed in Manage Workflows after reopening.

Actual [Cloud build 22](https://appstoreconnect.apple.com/teams/867cf0b5-1b9a-478f-b7df-8ce81f2ef11e/apps/6744178536/ci/builds/6f36cee7-d8cf-40b8-ae7d-c8a7ef805502) **succeeded: 74 tests, 74 passed**, iOS Simulator 26.3.1, macOS 26.3 (25D125), about four minutes. GitHub final check 103347140826 reports success with zero errors, test failures, analysis issues or warnings. Evidence JSON retained in ignored native-ios/.build/XcodeCloud/build22/github-checks.json. Cloud lists build/test logs and per-destination/combined XCResult artifacts; local bundle retention and coverage extraction were not verified. A simulator crash-log bundle is listed too; its existence alone does not establish an app crash. This is unrelated to TestFlight crash delivery.

The run dialog also started duplicate build 23; canceled only that duplicate and confirmed its canceled GitHub result. Original build 22 completed successfully. No build-number bump, app archive/upload, tester changes, or external distribution occurred. Cloud run numbers 22/23 are separate from app versions; next app distribution remains 62. Distribution stays paused. Current documentation evidence updates are uncommitted to avoid triggering an unnecessary repeat run; source worktree has no code changes.

Cloud execution is now verified and no longer an outstanding gate. Next release evidence remains actual Apple crash-report retrieval/symbolication, accessibility/device lifecycle and remaining parity gaps. No need to rerun the completed account, upgrade or basic Live Activity checks.

## Previous checkpoint — release-readiness review complete; distribution paused

See [RELEASE-READINESS.md](RELEASE-READINESS.md) for the consolidated evidence and exact remaining acceptance criteria. Read-only GitHub checks confirmed repository access, but the migration branch is absent (404) and current commit c7ab30c7 is unavailable remotely (422). Current source therefore cannot yet run in Xcode Cloud through origin. Local scheme/plan/executable hook are prepared; no actual Cloud run or authenticated workflow inventory was obtained.

No BeerSelector crash report was found in inspected local caches. Neither the supplied build-38 JSON nor retained iPad first-launch journal contains MetricKit events; bounded history does not establish nondelivery. Apple-side crash retrieval/symbolication remains unverified and the original phone exit unresolved. Next concrete steps: publish the reviewed branch to a verified test-only Cloud workflow, then inspect Organizer/TestFlight crash feedback. No push, Cloud mutation, new build, installation, forced crash or upload occurred. Documentation changes are uncommitted. Latest local correctness evidence remains 74/74 plus the separate real-database probe.

## Previous checkpoint — physical Live Activity checks user-confirmed

User reports all proposed Live Activity checks passed on their physical phone: queue appears on Lock Screen/Dynamic Island, updates correctly, and disappears on logout or when empty. This is user-reported device evidence; no agent recording or additional live mutation was performed. The exact build was not restated in this report (last confirmed phone installation was build 61). No fixture build or repeat of these basic checks is needed. Long-duration expiry/background scheduling and MetricKit/TestFlight crash delivery are not established by this report.

Existing evidence: 74/74 automated correctness tests, 1/1 no-network probe of the real iPad legacy database, successful actual build-50-to-native-61 upgrade with user-confirmed account continuity and relaunch persistence. Original phone exit remains unresolved. Distribution stays paused; latest committed account-safety code after build 61 has not been uploaded. No external tester changes. Next useful step is review the remaining release checklist (including actual Xcode Cloud execution and crash/MetricKit delivery) before deciding whether to package internal build 62; do not upload without renewed distribution authorization.

## Previous checkpoint — actual iPad upgrade and relaunch verified

User confirmed Wi-Fi was off when native opened and their existing signed-in account/tastings/rewards appeared without another login. This establishes user-confirmed account continuity on the real **legacy build 50 → native build 61** in-place upgrade. Do not interpret successful request/refresh diagnostics as proof of live network access: cached responses or another transport cannot be distinguished from the retained numeric journal. The user's Wi-Fi report takes precedence over the earlier assumption that it was left on.

Final native process restart succeeded. A post-relaunch database copy matches all six post-first-launch tables exactly, including preferences/timestamps/schema history: **188 beers, 12 tastings, 14 rewards, zero operations**, integrity OK. Evidence `/private/tmp/BeerSelectorNative-ipad-offline-relaunch.json`, `/private/tmp/BeerSelectorNative-ipad-relaunch-result.json`, private copied SQLite folder `/private/tmp/BeerSelectorNative-ipad-after-relaunch` (mode 700). User's existing-account confirmation also remained consistent in their follow-up.

The initial installed-container copy preserved the original six tables (195 beers/175 tastings/13 rewards). Native first launch then recorded successful refresh work and changed those counts. A separate no-network migration probe of the actual original database preserved every legacy value, with only expected native metadata/plaintext-cookie removal. Combined evidence: installation container preservation, actual-database migration compatibility, user-confirmed credential continuity, native startup and relaunch persistence. It does not identify the source of refresh responses, prove all Keychain entries survived byte-for-byte, or resolve the original phone crash.

No new TestFlight upload, phone change, uninstall or pending check-in occurred. iPad now runs native build 61; original Documents/Library backup remains private in /private/tmp and is not a Keychain backup. Distribution remains paused. Automated suite remains 74/74 plus the separate 1/1 real-database probe. Next release evidence areas are physical Live Activity behavior and actual crash-report delivery; the basic real upgrade rehearsal is no longer an outstanding item.

## Previous checkpoint — actual iPad upgrade launched; account UI confirmation pending

After user resolved developer trust, native build 61 launched successfully over legacy build 50. Installation preserved the original six database tables byte-for-value before native launch. Post-launch diagnostics recorded a successful refresh and advanced both refresh timestamps: 188 beers, 12 tastings, 14 rewards. This launch was not an offline preservation proof despite the intended offline setup. User was asked whether Wi-Fi stayed on after trust verification and whether the original account appeared without login; await their response before claiming Keychain continuity or performing a controlled offline relaunch.

Independently ran native migration on a disposable copy of the actual pre-upgrade iPad database with no AppModel/networking. **1/1 local probe passed**: all original selected columns/rows of all six tables preserved, 195 beers/175 tastings/13 rewards/zero operations, integrity OK, native schema marker added and legacy plaintext-cookie preference removed. This separates migration behavior from the successful refresh on the device. Log `/private/tmp/BeerSelectorNative-ipad-local-upgrade-probe.log`. Temporary probe source moved out of the test target into ignored `native-ios/.build/UpgradeRehearsal/LocalUpgradeProbeTests.swift`; no personal fixture data committed. Xcode project regenerated after removal and matches committed source.

Pre-upgrade Documents/Library backup remains `/private/tmp/BeerSelectorNative-ipad-legacy50-backup` (mode 700, not a Keychain backup). Device post-launch database `/private/tmp/BeerSelectorNative-ipad-after-native-launch` (mode 700); numeric diagnostics `/private/tmp/BeerSelectorNative-ipad-upgrade-diagnostics.json`; comparison `/private/tmp/BeerSelectorNative-ipad-upgrade-result.json` accurately records changed post-refresh values. Do not restore older data over the refreshed iPad without a concrete reason. No uninstall, user check-in, phone change or TestFlight upload was performed.

## Previous checkpoint — iPad upgrade installed; first launch awaiting developer trust

User authorized the attached unlocked iPPPPPPad for the real upgrade rehearsal, then confirmed Airplane Mode on/Wi-Fi off. Target CoreDevice `36906F49-69D1-58FF-A29D-760588D6074A`, UDID `00008103-000D241222D0801E`, iOS 26.6.2. It had legacy **1.1.0 (50)**, schema **7**, with **195 beers, 175 tastings, 13 rewards, zero pending operations**, and a legacy plaintext auth_cookies preference. No credential values were printed.

Backed up Documents and Library to private `/private/tmp/BeerSelectorNative-ipad-legacy50-backup` (directory mode 700). Full-root copy was denied for iOS container-manager metadata; both app folders copied successfully. Backup SQLite integrity passes. Keychain is not part of this backup. Saved non-content baseline hashes/columns/counts in `/private/tmp/BeerSelectorNative-ipad-upgrade-baseline.json` (mode 600).

Installed the preserved signed native **build 61** in-place, without uninstalling; device profile includes the iPad. Installation succeeded. First launch was denied by iOS security (signature/entitlements/profile trust); **native has not run yet**. User was asked to trust/verify the Developer App profile in Settings → General → VPN & Device Management, briefly enabling Wi-Fi if needed, then disable Wi-Fi again without opening the app. Await their readiness/message before launch.

A post-install/pre-launch copy proves all six tables' legacy data unchanged: beers/tastings/rewards/operations/preferences/schema history hashes match (auth_cookies excluded from reported preference hash; expected native purge is still pending). Evidence copy `/private/tmp/BeerSelectorNative-ipad-postinstall-beforelaunch` (mode 700), install/launch JSON/logs `BeerSelectorNative-ipad-install61.*` and `BeerSelectorNative-ipad-launch61.*` in /private/tmp. App-data replacement preservation is verified; native migration, Keychain continuity and UI/relaunch checks remain pending. Do not confuse build 50/schema 7 on this device with the separately inspected archive59/synthetic-v8 checks.

## Previous checkpoint — legacy tests committed; binary-upgrade preflight complete

Committed the 74-test legacy compatibility work as **fa28f317**. Continued with read-only inspection of the actual legacy build-59 archive and native build-61 archive. Their app/team/application/shared-group identities, minimum iOS and device-only platform match; no explicit keychain group override in either inspected signature. This does not prove runtime upgrade behavior.

Prepared [UPGRADE-REHEARSAL.md](UPGRADE-REHEARSAL.md) with the exact evidence and offline-first, in-place device procedure. Both archives require a physical device; a spare-device question is pending. No device selected, no phone installation/downgrade, no live account mutation or external distribution. Legacy simulator rebuilding is not immediately available because node_modules/Pods/Podfile.lock are absent. Corrected documented retained build-60/61 archive paths to include `BeerSelectorNative-internal-...`; actual artifacts and symbols are intact. Build 61 remains the last user-confirmed phone installation, and distribution remains paused.

## Previous checkpoint — legacy schema-v8 compatibility verified with fixtures

Added LegacyV8Fixture using the exact six CREATE TABLE statements from React Native `src/database/schema.ts` / `schemaVersion.ts` at 363ac3ef, plus both operation-queue indexes and synthetic data. Raw SQLite builds the database before native BeerDatabase opens it. Tests cover a fresh v8 history and a migrated 3–8 history, all legacy beer/enrichment/review/tasting fields, redeemed/unredeemed rewards, preference values/descriptions, and all queued-operation states/payloads/retry metadata.

Three LegacyUpgradeTests pass: complete v8 preservation over repeated native opens; native replacement/enqueue writes against old tables; and a forced failure at the native-version preference write that rolls back schema additions plus row changes and succeeds after removing the fault. Legacy schema history and indexes remain intact. Interrupted retrying operations become pending as intentionally implemented; successful operations remain stored but are excluded from pending-operation reads.

Full suite **74/74 passed**, including all three compatibility tests, log `/private/tmp/BeerSelectorNative-legacy-all.log`. The first focused run had a test-only ORDER BY projection mistake, corrected before the full pass; no production migration bug was found and no production code changed. This verifies exact-schema synthetic fixtures, not an actual installation of the previous binary followed by a signed native update. Existing separate Expo Keychain service compatibility tests remain green.

Changes are uncommitted after `363ac3ef`. No build-number bump, archive, upload or external tester changes; build 61 remains installed and distribution remains paused. Next: commit these compatibility tests/docs. Remaining release evidence includes a real old-binary-to-native upgrade with an appropriate fixture account, physical Live Activity behavior, actual crash-report delivery, and the unresolved original phone exit. Do not repeat synthetic schema-v8 coverage as an outstanding gap.

## Previous checkpoint — post-login cleanup guarded; distribution paused

User requested keeping account-safety fixes committed and continuing development without another distribution. Build 61 remains the confirmed installed internal TestFlight build; no build-number bump or upload in this session.

Added three PostLoginCleanupTests: member completion after logout, visitor completion after logout, and a new member login while visitor-cookie cleanup is suspended. All three failed before the fix: old completions could close Settings after logout, and the new member could commit while old visitor cleanup was still active. AppModel now shares accountCleanupTask across both login and logout; new login waits before committing, old login checks its committed epoch after cleanup and after subsequent refresh/queue awaits, and an obsolete completion cannot clear newer cleanup ownership or perform further UI work. Activity cleanup has a per-model injection boundary for deterministic async tests, alongside the existing browser-cookie boundary.

Full suite **71/71 passed**, log `/private/tmp/BeerSelectorNative-postlogin-all.log`; red evidence `/private/tmp/BeerSelectorNative-postlogin-red.log`. HTTP is fixture-only, databases and Keychain namespaces are isolated, and no actual device/Live Activity timing guarantee is claimed. Integration and All include PostLoginCleanupTests. User authorization covers committing this follow-up after `76fc9626`. No live account mutation, phone installation or external tester change.

Next development area: full legacy React Native schema-v8 upgrade fixtures and compatibility checks. Build 62 remains available for a later explicitly requested internal release. The original phone exit and actual TestFlight crash-report delivery remain unresolved/unverified; do not characterize these account fixes as its cause or resolution.

## Previous checkpoint — overlapping logout/login cleanup fixed

User confirmed internal build 61 installed and login/logout/refresh work on the phone, then authorized overlapping logout/login testing. Added LogoutRaceTests with controlled asynchronous local-cookie cleanup, per-session HTTP fixtures, real unique Keychain namespaces and isolated SQLite. The initial tests reproduced old local cleanup blanking the new account's URLs and reopening Settings, plus a delayed server logout failure leaking into the new session's error UI.

AppModel now owns a shared local logout-cleanup task. Concurrent logout cleanups serialize; completeLogin waits for local cleanup before committing and rechecks its account epoch after waiting. The old remote logout request is independent and still uses captured old credentials; its completion cannot publish errors or navigation changes after the account epoch changes. A test-only injectable cleanup closure suspends the same production cleanup call boundary; no OS WebKit timing guarantees are claimed.

Validation: full suite **67/67 passed** with the first two race tests (`/private/tmp/BeerSelectorNative-logout-all.log`); then a third test verified that another logout invalidates a login waiting on cleanup. All **3/3 LogoutRaceTests passed** (`/private/tmp/BeerSelectorNative-logout-final.log`), with no further production changes after the full pass. There are now 68 tests in the correctness plan, but no full 68-test rerun was needed. Initial red evidence: `/private/tmp/BeerSelectorNative-logout-red.log` (also contained an unwaited test expectation, corrected before green). Integration and All include the class.

User authorized committing the logout/login race fixes after `16d168b6`. Next account-safety step: test successful-login and visitor cleanup that resumes after a newer account change. No new archive/upload or external tester changes; installed internal build remains 61. Next distribution number is 62. Remaining areas include successful-login/visitor post-commit asynchronous cleanup timing, full legacy schema upgrade, and real crash delivery; do not claim every account interleaving or the original phone exit is resolved.

## Previous checkpoint — internal build 61 uploaded

## Build 61 uploaded — 2026-09-11

User authorized completing the rollback task and proceeding to the next step while away. Committed the rollback guard as **35dab101**, then archived and uploaded **1.1.0 (61)** to internal-only TestFlight. Includes the credential-save fix from **f777ad21**. Full correctness suite **65/65 passed**; signed Release archive succeeded. Effective export flags verified: testFlightInternalTestingOnly=true, uploadSymbols=true, manageAppVersionAndBuildNumber=false. Xcode reported **Upload succeeded / EXPORT SUCCEEDED**; Apple processing has begun. Processing completion/internal-group assignment are not independently verified. No external testers, builds, groups or review submissions changed.

Archive retained at `native-ios/.build/InternalTestFlight/BeerSelectorNative-internal-1.1.0-61.xcarchive`, with source zip and `build61-evidence.json` alongside it, all ignored. App dSYM UUID **94D26D69-AE2A-33BF-9917-8C3CACC048E0**; widget **6C1D82BA-00D0-3D2B-8DFB-711F88B2A046**. Both archive bundle versions verified as 61 with matching binary/symbol UUIDs. Logs: `/private/tmp/BeerSelectorNative-internal61-archive.log` and `/private/tmp/BeerSelectorNative-internal61-upload.log`. Preserve separate symbols for builds 38 and 60.

Next user check: install build 61 through TestFlight when ready, then normal login/logout, Refresh All Data and reopening cached lists. The user already confirmed these basic flows on build 60. No manual storage failure is needed; automated tests cover those cases. Updated local WhatToTest.en-US.txt notes were prepared after archiving and have not been applied to App Store Connect group metadata. Further development priorities remain overlapping logout/login cleanup and full legacy schema upgrade coverage. The earlier phone exit is still not attributed to these fixes. Next distribution number must be at least 62.

## Previous checkpoint — database/credential rollback safety verified

Added three LoginRollbackTests for database failure after credential commit: existing-account rollback, first-login rollback, and a second Keychain failure while restoring the old credentials. Tests use a real SQLite trigger that aborts reward deletion after earlier cache deletes, proving partial transaction rollback. HTTP remains fixture-only, Keychain namespaces are unique, and the second failure is injected at the rollback commit marker.

The combined-failure regression initially exposed mixed account state: the running app retained the old account, while a fresh model loaded the new credentials with old tastings/rewards. Fixed with a durable `native_account_transition` preference written transactionally with the disabled data URL before credential changes. It is cleared in the successful account database transaction, or restored to its previous value only after rollback succeeds. A rollback failure clears active member state and requires sign-in again; persisted cache and operations remain intact. Startup now calls restoreCredentials(), which rejects a pending transition before exposing member data. A failed recovery retry preserves that marker; a later full successful login clears it with the replacement cache/configuration.

Full isolated-simulator correctness suite **65/65 passed**. Logs: `/private/tmp/BeerSelectorNative-rollback-red.log` (combined failure regression), `/private/tmp/BeerSelectorNative-rollback-green.log` (nine rollback/credential cases), `/private/tmp/BeerSelectorNative-rollback-all.log` (full suite including failed retry and successful recovery). Fresh-model/fresh-database checks exercise startup credential restoration; this is not a literal device process-kill test or a guarantee against hardware/power-loss durability failures.

User authorized finishing this work and proceeding to the next step while away. Committing this fix after `f777ad21` and reserving internal build **61** for upload, including the earlier credential-save fix. Build 60 remains the last confirmed phone installation. No live account calls or external tester changes. Broader overlapping logout/login cleanup races, full legacy upgrade testing and actual TestFlight crash delivery remain separate verification items.

## Previous checkpoint — credential-save failure tests and rollback fix

User confirmed build 60's logout/login/refresh work on the phone, then authorized credential-save failure testing. Added CredentialFailureTests with six tests (nine failure scenarios): existing-account registry, second cookie chunk, session and commit-marker failures; first-login failures at all four stages; and auto-login marker failure. CredentialStore exposes instance-local SecItemUpdate/SecItemAdd call boundaries for deterministic `errSecInteractionNotAllowed` injection; unblocked operations, reads, cleanup and recovery use real uniquely namespaced simulator Keychain entries. SQLite and HTTP fixtures are isolated; no live account calls.

Four new tests failed against the old login path. Persistent registry/session/marker write failure also broke the attempted credential rollback, leaving the previous account's all_beers_api_url blank. A partial chunk failure unnecessarily rewrote the previous committed generation. Login now tracks whether the credential save actually committed: a pre-commit failure retains the existing generation and restores the configuration without another Keychain write. Epoch invalidation follows successful credential commit, preserving in-flight work for an account that never changed. Successful credential commit followed by database failure still uses the existing credential rollback path; failures in that separate rollback and broader crash-between-stores atomicity remain unverified.

Full correctness suite **62/62 passed**, including 6/6 CredentialFailureTests and all prior account-race tests. Logs: `/private/tmp/BeerSelectorNative-credentials-red.log` (four failing tests) and `/private/tmp/BeerSelectorNative-credentials-all.log` (full green). Integration includes the new class; All discovers it. Tests verify persisted credentials through a fresh store value, unchanged commit marker/configuration/cache/pending operations, no follow-up HTTP on failure, and successful credential-save recovery without resetting storage.

User authorized committing this credential-save fix and its tests after `81ea29a5`. Next account-safety coverage: database failure after successful credential commit, including failure while restoring the previous credentials. No new archive/upload; installed TestFlight build remains 60. Before another distribution archive, reserve **61** using Scripts/bump-build-number.py. External testers remain unchanged. The earlier phone exit is not claimed fixed by this rollback change.

## Previous checkpoint — build 60 uploaded to internal TestFlight

## Build 60 uploaded — 2026-09-11

Committed account-safety fix as `3eb06ad0` and uploaded **1.1.0 (60)** successfully. Xcode reported **Upload succeeded / EXPORT SUCCEEDED** and Apple package processing began. Effective export settings verified: `testFlightInternalTestingOnly=true`, `uploadSymbols=true`, `manageAppVersionAndBuildNumber=false`. App and widget archive versions are both 1.1.0 (60), with matching executable/dSYM UUIDs. No external groups/builds/testers or beta review submissions were changed. Processing completion and internal-group assignment are not independently verified; use the existing internal group if manual assignment is needed.

Full pre-upload correctness suite: **56/56 passed**, including seven account-safety cases. Signed Release archive passed. Retained archive: `native-ios/.build/InternalTestFlight/BeerSelectorNative-internal-1.1.0-60.xcarchive`; source snapshot and `build60-evidence.json` alongside it are ignored. App dSYM UUID `CC76A5E4-9C6A-3E67-A4B7-4B8968030B4F`; widget UUID `6C1D82BA-00D0-3D2B-8DFB-711F88B2A046`. Logs: `/private/tmp/BeerSelectorNative-internal60-archive.log` and `/private/tmp/BeerSelectorNative-internal60-upload.log`. Preserve build 38's separate symbols for its reports.

Next: install build 60 through TestFlight after processing and verify logout/login/refresh on the phone. The earlier freeze/Home Screen exit remains unexplained; this build fixes a separately reproduced account-switch refresh bug. External testing stays unchanged. Build 60 has now been used; reserve the next build using Scripts/bump-build-number.py before a subsequent distribution archive.

## Previous checkpoint — account-safety regressions and refresh fix

Added **7 AccountSafetyTests** with per-session HTTP fixtures, isolated real SQLite, unique real simulator Keychain namespaces, and connectivity monitoring disabled. Tests exercise real completeLogin/logout transitions: late login and auto-login after logout cannot restore credentials; taplist/queue responses after logout cannot restore member state; in-flight check-in success/failure after a switch cannot mutate the new account's queue or replay the remaining old-account operation. An ambiguous submitted operation stays available for review without automatic resubmission under the new account.

Found and reproduced a refresh ownership bug: new login joined the previous account's in-flight refresh, which then rejected its old result and left the new lists empty. Red test failed with empty taplist/tastings and a withheld-response expectation. Fixed by associating the shared refresh task with its account epoch, capturing ownership before scheduling, protecting task/refresh-indicator cleanup, and stopping stale refreshes before starting member-data requests. Logout resets its refresh indicator. A new account can now finish refreshing before the old account's response is released. This is separate from the earlier unexplained phone exit; do not claim a crash fix.

Full isolated-simulator correctness suite **56/56 passed**, including all 7 new cases. Log `/private/tmp/BeerSelectorNative-account-all.log`; initial red evidence `/private/tmp/BeerSelectorNative-account-red.log`, first six green cases `/private/tmp/BeerSelectorNative-account-green.log`. Integration plan includes AccountSafetyTests; All includes them automatically. No live HTTP requests, account mutations, phone installs or uploads. Source remains **1.1.0 (60)**; changes in this account-safety session are uncommitted, following `a7238d01`. Next: review/commit this fix, then consider an internal-only build 60 for phone testing. Keychain write-failure injection, full legacy schema-v8 upgrade, further overlapping login/logout cleanup races, physical MetricKit and actual TestFlight crash delivery remain separate work.

## Previous checkpoint — TestFlight diagnostics verified; next build corrected to 60

User confirmed **1.1.0 (38) installed through TestFlight** and successfully shared its diagnostic JSON. Report reviewed from `/Users/pete/Downloads/BeerSelector-diagnostics.json`: 128 entries from one session, September 11 09:26:43–09:28:50 CDT; all 49 completed operations succeeded; two refreshes took 2.034 s and 1.173 s; no main-thread delay events; all retained starts have completions. One completion's start had rotated out of the bounded history. This verifies on-device export/sharing, not crash delivery or resolution of the earlier exit.

User clarified the previous 1.1.0 build was **59**. The legacy React Native Xcode project has an Increment Build Number phase that mutates its Info.plist on Release builds; the native project did not inherit it. Native `project.yml` and generated project now use **60** for app/widget. Native numbering is explicit: increment the shared value before each subsequent distribution archive and regenerate with XcodeGen. Export-time renumbering is disabled and the internal upload script rejects archives below 60. No build 60 archive/upload or external distribution change was performed. Build 38's retained archive, source snapshot and symbols remain associated with 38.

Numbering validation: Xcode resolves 1.1.0 (60) for both app and widget; upload preflight rejects 38/59 and accepts 60/61; temporary bump-script fixtures verify the minimum, normal increment, and source rollback on generator failure. Prior app validation remains 49/49 plus 5/5 journal refinement tests; no app logic changed during numbering maintenance.

User authorized committing the accumulated sorting, diagnostics, internal distribution and numbering work. Continue normal internal testing; export promptly if a failure recurs. Actual TestFlight crash delivery and physical MetricKit delivery remain unverified.

## Previous checkpoint — internal-only TestFlight build uploaded

User authorized internal TestFlight plus persistent diagnostic export and explicitly required **no disruption to external beta testers**. Uploaded **1.1.0 (38)** to App Store Connect app **6744178536** using `testFlightInternalTestingOnly=true` and symbol upload. Effective options and actual uploaded version/build were verified; Xcode reports **Upload succeeded / EXPORT SUCCEEDED**, package processing begun. Existing external builds/groups/testers were not changed. No beta review or App Store submission. Internal group assignment/processing completion are not yet independently verified; see [INTERNAL-TESTFLIGHT.md](INTERNAL-TESTFLIGHT.md) and its direct TestFlight link for the final internal installation step. Do not claim the user's phone was updated by this upload.

Added bounded persistent DiagnosticJournal history (128 fixed-label entries across launches), off-main atomic/coalesced writes, foreground main-thread delay/recovery monitor, and Release Settings → Support → Prepare/Share Diagnostic Report plus Clear History. No account/request data, raw errors or raw MetricKit payloads enter the history; no custom backend/automatic telemetry upload. TestFlight provides crash stacks; MetricKit handler remains numeric-only. Prepared tester notes in TestFlight/WhatToTest.en-US.txt are not uploaded group metadata.

Validation: full **49/49** tests passed; after flush/background refinement **5/5 journal tests** passed. Optimized coverage-free signed archive and matching app/widget dSYMs verified. Includes prior measured sorting improvement. Archive retained in ignored `native-ios/.build/InternalTestFlight/BeerSelectorNative-1.1.0-38.xcarchive`; app/dSYM UUID `B4A2F4C7-0157-3D10-A0D3-3F57FC906FFD`. Build source version is 38. Upload log `/private/tmp/BeerSelectorNative-internal-upload-retry.log`. Initial packaging failed from mismatched rsync on PATH; upload script now pins Apple system tools. No external distribution changes occurred.

The prior phone freeze/Home Screen exit remains unexplained; normal attach-only reproduction is not a crash fix. Physical MetricKit delivery, a true full-download performance pass, actual TestFlight crash delivery, and on-device diagnostic sharing remain verification items. No need to repeat old readiness questions. See INTERNAL-TESTFLIGHT.md for exact evidence, retained artifacts and future internal-only upload safeguards.

---

## Previous checkpoint — physical profiling complete for this pass; earlier exit unresolved

User clarified the earlier refresh appeared frozen (they manually exited/reopened), and a separate scrolling/tapping event returned to the iPhone Home Screen. A new **60-second attach-only reproduction behaved normally**, explicitly confirmed by the user. Do not treat delayed replies to prior readiness questions as a new request to record.

The attach run used the existing installed phone build (base `0e64a6d7` plus numeric URLSession Task signpost), not the locally optimized sorting build. PID 24609 stayed alive through seven periodic checks and after detaching. Two refreshes succeeded in **1,069.745 ms and 625.499 ms**; six real task-metric callbacks; all 18 operation intervals balanced; max parsing 2.408 ms and transaction 1.115 ms; zero Hangs/Hitches rows. No new BeerSelector crash or contemporaneous Jetsam report was found. Earlier 45-second launch recording had three successful refreshes and real task metrics too. The earlier Home Screen exit and initial full-fetch freeze remain unexplained, not dismissed or marked fixed. MetricKit daily delivery and a true cold/full taplist profiling pass remain unverified.

A separate measured responsiveness fix is prepared locally: tasted-date sorting now precomputes per-row keys and BeerListScreen evaluates its filtered list once per body. Synthetic optimized 200-row mean improved **87.449 ms → 2.838 ms** (~31x). **44/44 correctness tests pass**, performance case passes before/after, signed Release phone build passes without coverage flags. The optimized build is **not installed**; current phone remains on the version used for reproduction. Code/tests/docs after `0e64a6d7` remain uncommitted; no new commit/push requested.

See [PHONE-PROFILING.md](PHONE-PROFILING.md) for evidence and limits. Latest trace `/private/tmp/BeerSelectorNative-phone-attach-repro.trace`; fixed-label exports/process observations `BeerSelectorNative-attach-*` under `/private/tmp`. Previous valid trace `/private/tmp/BeerSelectorNative-phone-refresh-ready.trace`; initial locked-phone `BeerSelectorNative-phone-refresh.trace` is empty/invalid. Mac xctrace exports crashed repeatedly but allocator/zombie workarounds recovered tables; these host crashes are distinct from phone exits. No running recording/build/test process remains. No live check-in/reward/delete or account reset was performed.

Next concrete options: commit the measured sorting/diagnostics follow-up, install the tested sorting build for a separate phone comparison, or proceed to planned account-safety tests. If the Home Screen exit recurs, obtain its exact time and fresh device reports and reproduce by attaching to the running process. Do not claim a crash fix from the sorting change.

---

## Previous checkpoint — profiling fixes implemented and validated

Resumed the authorized profiling fixes. **43/43 correctness tests and 2/2 opt-in performance tests pass.** No build/test processes remain after validation. User requested a commit after validation. This checkpoint is included with the accumulated phone/UI/testing and profiling fixes on `migration/native-swiftui`. No push, phone reinstall, or live account mutations were performed in the profiling/commit sessions.

- Fixed enrichment accounting with a generic request/decode boundary: malformed payloads fail; cancellations have their own count; cache hits require validated 304 semantics. Tests cover server/local rate-limit accounting and redirect protection.
- Added `Core/Diagnostics.swift`: bounded, thread-safe operation aggregates; balanced OSSignposter intervals and structured Logger outcomes for refresh, parsing, transactions, login, queue processing and HTTP requests. Existing RedirectPolicy collects task timings without weakening cross-origin rejection. Retained MetricKit subscriber collects only report counts and CPU seconds. Debug Settings displays/shares numeric diagnostics; no sensitive input or raw reports enter telemetry.
- Added shared **BeerSelectorProfile** scheme and **Performance** test plan/configuration. Profile/Run use Release; optimized tests enable testability. Actual unsigned device Release build passes with `-O`, whole-module optimization, `-g`, dSYM, and **no coverage flags**. Debug correctness coverage remains enabled. Use this dedicated scheme for profiling, not the original coverage scheme.
- Measured a contended SQLite write at **5.162 seconds** before changing busy timeout from 5000ms to zero. After: **0.00069 seconds**. MainActor serialization remains; no detached database work. New real-connection refresh regression verifies cache/timestamp preservation and successful retry after unlock. The 1,000-beer parse/write/read experiment averaged **17ms** before and after; simulator observations are not device budgets.
- `Scripts/run-tests.sh` now accepts `BEERSELECTOR_TEST_SCHEME`; default remains BeerSelectorNative. Performance runs separately with no coverage/parallel workers/timing gate. Unit includes DiagnosticsTests; All excludes PerformanceTests. Project regenerated using XcodeGen.

Evidence and exact commands/semantics: [TESTING.md](TESTING.md), section “Profiling fixes and measurements”. Logs: `/private/tmp/BeerSelectorNative-profiling-final.log` (43 tests), `BeerSelectorNative-performance-before.log` / `BeerSelectorNative-performance-after.log` (2 tests each), `BeerSelectorNative-profile-clean.log` (unsigned device build). Isolated simulator remains `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`; test derived data `/private/tmp/BeerSelectorNative-testing` and `/private/tmp/BeerSelectorNative-performance`.

Remaining validation requires a physical-device Instruments trace, real task-metric and MetricKit delivery, and the earlier migration release gates. Actual Xcode Cloud workflow execution and full RN upgrade/device Live Activity coverage are still unverified. Prior 4/4 mutation smoke result was not rerun or expanded in this profiling session. Do not claim the entire migration complete. Preserve the approved ghost DSEG7 counters/chrome and ignored configuration; never print credentials.

---

## Previous handoff — resolved by the profiling fixes above (historical)

Latest user: **“compact or handoff”**. Stop here and resume the authorized fixes from this entry next session.

### Active objective

User said **“ok, fix those issues”** after the instrumentation/profiling audit. Implement the fixes; do not stop at another audit. Their earlier request requires meaningful unit/integration tests for Xcode Cloud, consideration of mutation testing, and Farley's eight properties. No subagents unless explicitly requested.

### Exact stopping point

- Added **two regression tests** in `Tests/NetworkTests.swift`: `testMalformedEnrichmentIsAFailureNotASuccess` (line 140) and `testCancelledEnrichmentDoesNotCountAsFailure` (line 154).
- Ran ONLY these two against unchanged enrichment code: **both fail, 3 expected assertion failures**. Log `/private/tmp/BeerSelectorNative-metrics-red.log`.
- Malformed HTTP-200 taplist currently increments successes and not failures. Cancelled request currently increments failures. Tests establish the intended behavior before implementation.
- **No production profiling fixes have been implemented yet.** No telemetry file, Release config fix, database timeout/concurrency change, or new performance suite exists. The current overall suite must be considered red until these two cases are fixed. Last green full suite before these additions: **34/34**, also **68/68** repeated parallel executions.
- No running build or test process remains from this turn.

### Findings to fix

1. **Coverage contaminates Release builds through the shared scheme.** Actual unsigned Release audit compiler commands contain `-O`, `-whole-module-optimization`, `-g` AND `-profile-generate` / `-profile-coverage-mapping`. Release dSYM is configured. Log `/private/tmp/BeerSelectorNative-profile-audit.log`, settings `/private/tmp/BeerSelectorNative-profile-settings.json`; build passed. Explicitly disable coverage in a profiling configuration/scheme, preserve Debug unit-test coverage, and verify actual emitted flags rather than relying on configuration names.
2. **Enrichment counters have wrong semantics and no consumer.** `Core/EnrichmentService.swift` increments successes in `call` before parsing/validation. Cancellation counts as failure. Proposed approach: validate within a generic request/decode helper so each request records exactly one validated success/failure/cancellation; keep rate-limit/cache-hit semantics explicit. Add safe diagnostics display/export through Debug Settings. No credentials, URLs/query values, cookies, bodies, member names/IDs in telemetry.
3. **Missing operation instrumentation.** No OSSignposter, structured Logger, URLSessionTaskMetrics collection, MetricKit subscriber or XCTest performance measurements. Proposed initial intervals: refresh, parsing, persistence/transactions, login, queue processing; outcome-aware completion on success/failure/cancel and balanced begin/end. Add URLSessionTaskMetrics collection while preserving `RedirectPolicy` cross-origin protection. Consider bounded, thread-safe aggregates with fixed operation names; avoid an unbounded event store. Add useful diagnostics consumer and focused performance plan rather than putting noisy timing gates into the fast unit gate.
4. **MainActor synchronous SQLite/parsing risk.** `AppModel` is MainActor; `Database.swift` uses synchronous calls and `sqlite3_busy_timeout(handle,5000)`. This is a measured-code-location risk, NOT a proven production hitch. Assistant told user: measure first before changing database concurrency. Suggested next experiment: isolated realistic snapshot workload and lock-contention test; if retaining synchronous access, bound main-thread lock waits and preserve cache on busy failures. Do not blindly move SQLite to detached tasks without serialization and account-epoch safety. No experiment/change for this has been made yet.

### Tools and validation commands

- Worktree `/Users/pete/claude/BeerSelector-native`, branch `migration/native-swiftui`, base native commit `014e173c`. Many subsequent phone/UI/testing edits are **uncommitted**; preserve them. No push requested.
- Graph query for native Swift symbols returned zero; use known-file reads after that fallback. Graph project `Users-pete-claude-BeerSelector-native`.
- Xcode 26.3; review simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`, iOS 26.3.1. Keep fixture/testing activity isolated from user's signed-in simulator and physical phone.
- Last red command from repo root:
  `BEERSELECTOR_TEST_DESTINATION='platform=iOS Simulator,id=6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3' BEERSELECTOR_TEST_PARALLEL=NO BEERSELECTOR_TEST_BUILD_DIR=/private/tmp/BeerSelectorNative-testing native-ios/Scripts/run-tests.sh -only-testing:BeerSelectorNativeTests/NetworkTests/testMalformedEnrichmentIsAFailureNotASuccess -only-testing:BeerSelectorNativeTests/NetworkTests/testCancelledEnrichmentDoesNotCountAsFailure`
- Reuse `Scripts/run-tests.sh` and shared All/Unit/Integration plans; see TESTING.md. Simulator tests require ad hoc signing; unsigned host breaks Keychain. Regenerate project with XcodeGen after new Swift files/plans.
- Local Instruments templates available: Time Profiler, SwiftUI, Swift Concurrency, Allocations, Network, Animation Hitches, etc. No actual trace has been recorded.
- Primary docs read: Apple OSSignposter (`https://developer.apple.com/documentation/os/ossignposter`), Recording Performance Data (`https://developer.apple.com/documentation/os/recording-performance-data`), MXMetricManager (`https://developer.apple.com/documentation/metrickit/mxmetricmanager`). Website exposes newer deprecations; use SDK-available API compatible with app minimum iOS 17.6. MetricKit real delivery requires physical-device validation; do not claim simulator compilation proves it.

### Preserve prior accepted work

- User confirmed physical-phone existing account survived the in-place update and Beerfinder cancellation fix works.
- Home counter must retain **ghost seven-segment markings**, DSEG7Classic-Bold, enlarged full-width title, tighter layout, approved chrome. User specifically rejected ghost removal. Latest screenshot `Docs/Screenshots/iphone-home-segments.png`.
- Physical iPhone device ID `66EAEFE2-8C90-54FC-8F07-447104BECB2B`, Xcode UDID `00008150-00060C9C2247801C`. Last ghost update installed; reopening failed only because phone was locked. No profiling/test changes installed on phone afterward.
- All configuration secrets stay in ignored `Resources/ServiceConfiguration.plist`; never print values. Cloud post-clone supplies an empty plist only when absent. Real Xcode Cloud workflow/run remains unconfigured/unverified.
- Muter config is prepared but Muter is NOT installed/validated. Actual tested mutation runner is `Scripts/mutation-smoke.py`, with four seeded mutations in temporary secret-free copies. All four killed after fixing an ABV-input-order test gap. Preserve distinction from a whole-project mutation score.

---


## Profiling wiring inspection — 2026-09-10

User asked to inspect the wiring. Audited Profile scheme, effective Release settings, local Instruments templates, telemetry call sites, and an actual unsigned Release build. Findings recorded at the end of TESTING.md.

Release build succeeds with optimization and dSYM, **but includes coverage compiler instrumentation** (`-profile-generate`, `-profile-coverage-mapping`), so a clean profiling configuration is needed before measuring. Enrichment counters are unconsumed and count HTTP success before payload validation. No signposts, task metrics, MetricKit, structured logs or performance tests. MainActor SQLite/parsing is a profiling target, not a proven performance defect. No app behavior changes or device trace in this inspection. Build log `/private/tmp/BeerSelectorNative-profile-audit.log`.

---

## Unit/integration testing and Cloud preparation — 2026-09-10

User requested meaningful unit/integration tests aimed at Xcode Cloud, mutation testing consideration, and Farley's eight properties. See [TESTING.md](TESTING.md) for strategy, commands, evidence, remaining gaps and Cloud setup. User also asked about instrumentation/profiling: current Profile action, coverage, basic enrichment counters exist; structured signposts/performance baseline remain absent. No profiling implementation was requested or added.

- Retained XCTest. Split pure rules into `BeerRuleTests`, persistence/resources into `PersistenceIntegrationTests`, and kept `NetworkTests`. Fixed misleading names and the missing-chunk test that actually failed on missing session first. Added direct Expo legacy Keychain fixtures across all three services.
- Replaced global HTTP script with per-session fixture routing; unscripted requests fail locally. AppModel accepts connectivity monitoring disabled for tests; test host suppresses startup/foreground/background registration. SQLite and Keychain remain real, uniquely namespaced integrations.
- Added contract cases for description-only ABV, stable equal-key order, foreign member/store pending operation rejection, malformed taplist preserving cache while member data refreshes, and malformed rewards preserving rewards while authoritative empty tastings clear.
- Added shared `All`, `Unit`, `Integration` test plans: random order, coverage, timeouts, parallel eligibility. Generated Xcode project updated. Cloud post-clone hook creates an empty ignored config only when absent; no Node/Pods/XcodeGen install required in Cloud.
- **34/34 tests pass**: Unit **11**, Integration **23**, independently validated. All plan passed twice with parallel workers and process relaunch: **68/68 executions**. Results `/private/tmp/BeerSelectorNative-parallel-repeat.xcresult`, `BeerSelectorNative-unit-plan.xcresult`, `BeerSelectorNative-integration-plan.xcresult`. Unit execution ~0.01s; integration ~2.2s, excluding build/host startup. Xcode 26.3, simulator iOS 26.3.1.
- Four seeded mutation probes run against disposable secret-free copies. First unknown-ABV mutant survived; strengthening all six input permutations in both sort directions killed it. Final **4/4 killed**, each by its intended test; **34/34 baseline**. Report `/var/folders/qf/fq1jmj9n3y10c_sw_nr1_9jh0000gn/T/beerselector-mutations-brgi9fu0/report.json`. Runner `Scripts/mutation-smoke.py` preserves checkout, excludes production config, separates test failures from compile/launch errors/timeouts. This is not a whole-project mutation score.
- Muter investigated from primary docs; config prepared but tool not installed/validated. Semicolon-compressed Swift may require transformation cleanup before broad Muter use.
- Cloud hook exercised for absent and existing files; temporary secret-free checkout baseline built successfully. **Actual Cloud workflow/run is not created or certified.** Activation instructions are in TESTING.md; commit/push and connect workflow remain. Changes from this work and previous phone fixes remain uncommitted. No phone reinstall in this testing session.
- Next risk-based testing priorities: precise login/account-switch races, Keychain write-failure injection, full RN schema-v8 upgrade, enrichment rate/polling contracts and physical Live Activities. AppModel line coverage ~50%, LiveActivity ~19%; higher coverage elsewhere is not a correctness guarantee.

---

## Restore ghost seven-segment styling — 2026-09-10

User explicitly requested restoring ghost seven-segment markings as part of the Robocop styling. This supersedes the preceding removal. MetricPanel now uses DSEG7Classic-Bold for both lit digits and aligned cyan 12%-opacity ghost 8s, with three right-aligned slots. Keep this styling. The enlarged full-width title and tighter layout remain.

Simulator and signed phone builds pass (`/private/tmp/BeerSelectorNative-segments-simulator.log`, `/private/tmp/BeerSelectorNative-segments-phone.log`). Visually reviewed `Docs/Screenshots/iphone-home-segments.png`; installed in place on the paired iPhone for user review.

---

## Home counter revision — 2026-09-10

User requested less black space, larger count and larger BEERS TASTED label. MetricPanel now has a full-width cyan 22-point bold title, 112-point count (previously 64), clearer 30-point /200, larger progress caption, tighter inset/vertical spacing, and no ghost 888 digits. Approved surrounding chrome remains.

Simulator and signed phone builds pass (`/private/tmp/BeerSelectorNative-counter-simulator.log`, `/private/tmp/BeerSelectorNative-counter-phone.log`). Final isolated fixture screenshot reviewed: `Docs/Screenshots/iphone-home-counter.png`. Installed on paired iPhone in place for review. User acceptance and large-text/iPad review remain pending. No new unit tests for this layout-only revision; previous logic suite passed 27/27.

---

## Phone refresh cancellation fix — 2026-09-10

User confirmed their existing account appeared on the physical iPhone after the in-place install; saved credential retention is user-confirmed. They reported Beerfinder pull-to-refresh showing “cancelled cancelled”.

Refresh previously ran directly in the caller's task, treated cancellation as a source failure, attempted proxy fallback, and continued to the next source. AppModel now owns a shared refresh task so cancellation of a SwiftUI refresh action does not abort its work. Network/Swift cancellation exits quietly before fallback/subsequent sources. Existing account epoch guards remain.

27/27 isolated simulator tests pass, including cancelled-caller cache completion and cancelled-proxy preservation/no fallback/subsequent successful retry. Log `/private/tmp/BeerSelectorNative-cancellation-test.log`. Signed phone build passed (`/private/tmp/BeerSelectorNative-phone-cancellation-build.log`); updated the paired iPhone in place. User confirmed the physical iPhone pull-to-refresh retest is fixed.

---

## Paired iPhone run — 2026-09-10

User requested step-by-step tests for signed-in/cache/navigation/offline behavior and login/account/enrichment/statistics, and requested running on the paired phone. See [PHONE-TESTS.md](PHONE-TESTS.md) for 16 ordered steps and expected outcomes.

- Signed Debug build succeeded with the existing team and automatic provisioning. Log `/private/tmp/BeerSelectorNative-phone-build.log`; derived data `/private/tmp/BeerSelectorNative-phone`.
- Installed `org.verily.FSbeerselector` in place on Pete's paired iPhone 17 Pro and successfully launched via devicectl. Existing installed app reported version 1.1.0 build 59; native build is 1.1.0 build 37. No uninstall, reset, or fixture launch.
- Installation/launch success does not establish session/data retention or complete RN upgrade parity; user must report what appeared. No agent-selected check-in/reward/delete action. Normal startup/reconnect can process pre-existing pending operations.
- Migration implementation committed as `014e173c`; this phone checklist and checkpoint update are subsequent documentation changes, not yet committed.

---

## Commit checkpoint — 2026-09-10

User requested committing `migration/native-swiftui` with secrets excluded. The native migration is being committed as `Add native SwiftUI migration with approved chrome and enrichment follow-up`. Prior notes describing it as uncommitted are historical. No push or deployment was requested.

All 63 candidate files passed Gitleaks 8.30.1 with redaction and inline allow comments disabled; an exact-byte check also found no production configuration secrets in the candidate files. `Resources/ServiceConfiguration.plist` remains ignored and excluded. The latest verification remains 25/25 tests and a passing unsigned device SDK build.

Next priority: signed-in data/cache/navigation verification, then login cancellation/account-switch and interrupted persistence coverage; complete enrichment contracts/rate policy/polling and statistics; accessibility/rotation; signed RN-to-native upgrade and physical-device Live Activities. Live check-in/reward/delete tests still require a concrete agreed action.

---

## Resume — enrichment follow-up, 2026-09-10

User resumed this checkpoint. Approved chrome and the original signed-in simulator were left intact.

- `EnrichmentService.enrich` now performs one follow-up batch lookup for successfully synced missing beers and merges the result before returning. Still-missing IDs cannot trigger recursive sync. Existing AppModel epoch guards remain responsible for rejecting writes after an account change.
- Sync responses now decode the required `synced`, `queued_for_cleanup`, and `requestId` fields plus optional errors. Malformed/zero-success responses do not trigger a follow-up. Sync inputs reject empty/overlong IDs/names, deduplicate IDs, and retain the 50-row limit.
- **25/25 XCTest cases pass** on isolated review simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`. Three added cases cover immediate merge/source normalization, still-missing termination, and invalid/zero-success sync preservation. Log `/private/tmp/BeerSelectorNative-enrichment-test.log`.
- Unsigned device SDK build passes: `/private/tmp/BeerSelectorNative-enrichment-device.log`.
- No live API mutations, original simulator installation, commit, push, or deployment in this resume.
- Remaining enrichment work: complete batch/proxy/health schema validation, configurable rate-window/chunk-reservation parity and diagnostics, and delayed cleanup polling/persistence (one immediate fetch does not guarantee Worker cleanup has finished).
- Other remaining gates below still apply: signed-in/cache/navigation verification, cancellation/account switch coverage, statistics, accessibility/rotation, full RN upgrade and physical-device Live Activities.

The prior handoff below is historical; its stop instruction applied to the previous session and was superseded by the user's resume request.

---

## Handoff — latest state, 2026-09-10

**Latest user message: “it's good, you need to handoff”.** The user accepted the chrome implementation. Stop further implementation in this session; resume from this handoff next time.

### Accepted outcome
- User signed into the test account directly in the original iPhone simulator.
- User rejected the initial Beers/Beerfinder buttons; corrected compact chrome filters, direction labels/icons, Queue/Rewards, and expanded actions.
- User emphasized that the Pen chrome is crucial. Rebuilt shared materials from saved `RobocopChrome.pen`: brushed status/footer bands, reflective multi-stop rims, inset wells, etched steel icons, rivets, steel labels, cyan scanline titles, amber controls. **User now says it is good. Preserve this approved appearance.**
- Updated original simulator app in place and reopened it. Do not uninstall or overwrite its data with fixtures. No agent-initiated live check-in, reward redemption, or queue deletion occurred.

### Workspace and verification
- Worktree `/Users/pete/claude/BeerSelector-native`, branch `migration/native-swiftui`; migration is still uncommitted under `native-ios/`. No commit, push, or deployment.
- Latest **22/22 XCTest cases pass**; simulator and unsigned device SDK builds pass. Logs: `/private/tmp/BeerSelectorNative-chrome-test.log`, `/private/tmp/BeerSelectorNative-chrome-device.log`.
- User simulator: `3A8B89DC-35F0-4FCB-886B-448EA2B961AA` (iPhone 17 Pro). Isolated fixture/review simulator: `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3`. iPad fixture simulator: `F71D5F8F-61FB-44F0-BE87-D8136C7A47C2`.
- Latest visual evidence: six `Docs/Screenshots/iphone-*-chrome.png` images and `ipad-home-chrome.png`, `ipad-finder-chrome.png`. Earlier screenshots document superseded appearances.
- Read `native-ios/README.md` for reproducible commands, `Docs/CHROME.md` for approved material values, and `Docs/PARITY.md` for incomplete migration gates.
- Production configuration is in ignored `Resources/ServiceConfiguration.plist`, imported without printing values. Do not expose configuration, cookies, or credentials.

### Next session
1. Preserve approved chrome and existing sign-in. Continue migration verification from PARITY.md, rather than redesigning the approved screens.
2. Verify signed-in data/cache/navigation and remaining login cancellation/account-switch behavior. User's sign-in is confirmed by their report; a complete live-flow certification has not been performed.
3. Complete enrichment contract/rate-policy/post-sync-fetch gaps and remaining statistics/debug behavior.
4. Validate accessibility, large text, rotation, and full in-place RN upgrade. Physical-device Live Activity lifecycle remains required; simulator builds do not certify it.
5. Get a concrete agreed test action before sending live check-in/reward/delete mutations. Do not ask for credentials in chat.

Graph-first discovery remains required. Native Swift previously returned no graph nodes, so direct known-file reads were used after that result. No subagents unless explicitly requested. Keep output narrow and persist progress.

---

## User objective and accepted decisions
Rebuild every BeerSelector RN screen/feature/function in native Swift/SwiftUI; Kotlin later. Map the complete app first and maintain parity evidence. Use newest source, match custom Robocop theme in open pen.dev, same minimum iOS, iPad support, Live Activities, same App Store identity; retain settings and logins wherever possible. User has a test account. User accepted isolated migration branch/worktree. User asked to manage context; keep tool output narrow and persist progress.

## Workspace
- Reference `/Users/pete/claude/BeerSelector`, newest branch `security/webview-origin-2026-09-01`, commit `60ff13dd74c99f7a666045fef9279d712a76834d`. Fetched origin; includes main `05574df9`. Auth-fix checkout older.
- New worktree `/Users/pete/claude/BeerSelector-native`, branch `migration/native-swiftui`, same reference commit. All work currently uncommitted under `native-ios/`.
- Reference original has one uncommitted xcscheme LLDB change; left intact.
- Xcode 26.3, xcodegen available. iOS app AND widget minimum 17.6 (project fallback 15.1 irrelevant).
- No subagents allowed unless user explicitly requests; none used.
- User/developer require graph-first code discovery. Native reference indexed as `Users-pete-claude-BeerSelector-native`; original graph `BeerSelector` was stale. Tool `get_code_snippet` for File only returns first 51 lines, hence file-read fallback used for whole files.

## Files produced
`native-ios/project.yml` generates `BeerSelectorNative.xcodeproj`, app target, widget extension, XCTest target. All app logic Swift; no RN dependency. App/Info.plist, entitlements; Shared/BeerQueueSharedTypes.swift and Widget/BeerQueueWidgetLiveActivity.swift copied from RN native extension, Widget entry point. Original bundled fonts/icon assets reused.
Core: Models.swift, Database.swift, Credentials.swift, API.swift, AppModel.swift, LiveActivityController.swift.
UI: RobocopTheme.swift, RootView.swift (home/custom tabs), BeerListScreen.swift, SettingsScreen.swift, RewardsAndQueue.swift, Browsers.swift (WKWebView Flying Saucer login; ASWebAuthenticationSession Untappd).
Docs: PARITY.md comprehensive **working** map, explicit incomplete states; reference-symbols.json (graph source inventory); reference-interactions.json (531 control/config anchors).
Tests: ParityTests.swift and NetworkTests.swift (22 passing contract/database/keychain/network/resource tests).

## Build/tests — refreshed after resume
- **22/22 XCTest cases pass**, iPhone 17 Pro iOS 26.3, ad hoc signing, parallel testing disabled. Log `/private/tmp/BeerSelectorNative-resume-test.log`; xcresult `/private/tmp/BeerSelectorNative-build/Logs/Test/Test-BeerSelectorNative-2026.09.10_22-40-22--0500.xcresult`.
- Simulator app/extension and final unsigned device SDK build pass. Device log `/private/tmp/BeerSelectorNative-device-build.log`; derived data `/private/tmp/BeerSelectorNative-device`.
- Simulator tests require `CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES`. Unsigned builds caused Keychain error -34018. A later runner-launch error recovered by booting the actual simulator and using `-parallel-testing-enabled NO`.
- Derived data `/private/tmp/BeerSelectorNative-build`.
- iPhone `3A8B89DC-35F0-4FCB-886B-448EA2B961AA`; iPad 11 `F71D5F8F-61FB-44F0-BE87-D8136C7A47C2` (both booted). iPad 13 `B0E290E8-7ED7-47FD-8471-ACDA4874B5C2`.
- Reproducible generation/build/test/preview commands are in `native-ios/README.md`.
- XcodeGen originally ignored top-level `resources`; fixed to a `sources` entry with `buildPhase: resources`, plus AppIcon build setting. All fonts and optional configuration now bundle correctly. Added resource/font registration test. BeerIcons.ttf PostScript name is **Untitled** (`Robo.beerIconFont`).
- `NetworkTests.swift` uses URLProtocol fixtures; tests POST non-retry inside HTTP client, cookie origin guard, pending retry success, logout while member enrichment is awaiting and rejection of stale reward/tasting writes. No production test writes.

## Current user handoff
- User explicitly agreed: **“Yes, open login after checks.”**
- Offline checks finished. Launched the normal iPhone app (no fixture flags), opened `beerselector://settings?action=login`, and brought Simulator forward on the iPhone 17 Pro.
- User reported **“I signed in”**. Sign-in is user-confirmed; no credential values were collected. They then reported Beers/Beerfinder buttons were wrong; current task corrects those controls.
- No check-in, reward, or deletion has been performed on a live account. Authenticated mutation tests still need a concrete agreed test action.

## Changes verified on resume
- Independent cache reads continue after a bad taplist/reward/operation source; Keychain load failure does not prevent cache loading.
- Epoch recheck after asynchronous member enrichment prevents stale reward writes following logout/account switch.
- Credential load fails closed when committed cookies lack their matching session. New real simulator Keychain tests pass.
- Review fields round-trip through SQLite; reward inserts name columns so extra legacy columns do not break replacement.
- Pending check-ins now match reference: failures remain pending for up to three retries, then failed; backoff between previously retried operations, reconnect debounce, retry timestamp, no cross-account/store replay. Clear All confirmation added and disabled while processing; removed queued rows are rechecked before submission.
- Rewards journey ring and separate milestones implemented from local Pen structure. Debug fixture launch accepts `--preview-screen home|beers|finder|tasted|rewards|settings`, and fixture entry invalidates in-flight account work.
- Eight screenshots captured/reviewed in `Docs/Screenshots`: six iPhone screens plus iPad Home/Rewards. Basic layout/assets confirmed; exact design match, large text, VoiceOver, rotation, interactions remain unverified. Home's ghost digits and system sheet headers still merit design refinement.
- Production app configuration imported from original checkout via `Scripts/import-configuration.py`, without printing values, into ignored `Resources/ServiceConfiguration.plist`; verified ignored. Regenerate project after importing/removing optional config.
- Existing on-disk enrichment service, BG AppDelegate/cleanup, review fields, fixture data, login cancellation checks, and legacy/keychain tests were ahead of the old checkpoint. PARITY.md now records their actual status.

## Design source
No Pen/Pencil tool is exposed in ALL_TOOLS; plugin-management skill read but search_plugins not exposed. MCP bundled binary exists `/Applications/Pen.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64`.
Python stdio MCP client `/private/tmp/beerselector-pen-mcp.py`, `-app desktop -agent codex`; tools/list works. get_app_state/read_skill failed connection in sandbox, then escalated get_app_state timed out (20s). Do not claim connected.
**Located actual design locally:** `/Users/pete/claude/RobocopChrome.pen` (JSON), newest in `~/Library/Application Support/Pen/recent-documents.json`. Read palette/root screen structures. Contains six screen frames: XrnMG Home, RDJdp AllBeers, SWeEn Beerfinder, Y0i06 TastedBrews, GU0K2 Rewards, nyKDF Settings; 393x852 each. Main content padding [8,18,0,18], gap 16 or 20. Components SteelPanel, BeerRow, SearchBar, TabBar, StatusBar, NavCard, FilterButton, ActionButton. Palette matches RN. Can inspect relevant subtrees from JSON without dumping entire file. Local Rewards subtree inspected; native screenshots reviewed (see resume evidence). No Pen-rendered design screenshot yet.
Palette bg #0A0A0A, display #0D1117, panel #1A1D22, border #2A2E35, cyan #00FFD0, amber #FFB300, red #FF3333, steel #8A919A, text #C8CDD3, chrome gradient #D4D8DD → #8A919A → #6B727B. Fonts SpaceGrotesk, SpaceMono, DSEG7Classic, BeerIcons f000 tulip f001 pint f002 can f003 bottle f004 flight.

## Key reference contracts
- SQLite exactly Documents/SQLite/beers.db (confirmed installed expo-sqlite native source). Tables allbeers, tasted_brew_current_round, rewards, preferences, operation_queue, schema_version. Latest RN schema 8 (CLAUDE.md stale says 6). Native opens in place/adds columns transactionally, preserves user settings, deletes plaintext auth_cookies.
- Review fields now persist and have round-trip coverage. A pre-versioned SQLite fixture upgrades successfully; a complete real RN schema-v8 signed upgrade remains unverified.
- Keychain Expo services `app:no-auth`, `app`, `app:auth`; kSecAttrAccount and Generic are Data(key.utf8), class generic password. Session `beerknurd_session` unless committed chunk generation hasSession true, then `beerknurd_auth_cookies_{generation}_session`. Marker `beerknurd_auth_cookies_meta` {generation,count,hasSession?}; chunk keys `beerknurd_auth_cookies_{generation}_{index}`, 1500 chars base64 of JSON dictionary; registry `_generations`. Native save writes immutable generation + session then marker, retains old registry until logout. Post-commit generation cleanup, login rollback/cancellation guards, and real simulator Keychain tests exist. Failure-injection and full legacy-service matrix still need coverage.
- Bundle org.verily.FSbeerselector, team N9F7839KSX. Widget org.verily.FSbeerselector.BeerQueueWidget. App entitlement group.org.verily.FSbeerselector.shared; widget entitlement empty. Old docs claim other app group; don't invent it.
- Member auth hosted https://tapthatapp.beerknurd.com/kiosk.php; terminal member-dash.php, visitor.php. WK native cookies provide store__id/store, store_name, PHPSESSID, member_id, optional username/first_name/last_name/email/cardNum. Swift fetches authenticated dashboard and regex extracts https://fsbs.beerknurd.com/bk-member-json.php?uid=N and bk-store-json.php?sid=N. No JS injected in native app. Validate exact auth origin/path and data origin. Visitor store-only, memberId visitor, clear old member cookies. Coordinator cancels completion task on teardown; completion checks Task cancellation before committing. Detailed cancellation timing tests remain.
- GET store URL gives `[{}, {brewInStock:[...]}]`, alternatives direct array or object keys; empty store taplist must NOT erase cache. GET member URL single fetch supplies `[1].tasted_brew_current_round` and `[2].reward`; explicit empty valid; malformed preserves cache. Mixed invalid rows handling in native stricter than reference.
- Auto-login POST /auto-login.php form, returns session. Logout POST /logout.php best effort with mandatory local cleanup. API cookies scoped to auth host; redirect delegate rejects cross-origin redirects.
- Check-in POST /addToQueue.php form chitCode=`beerId-storeId-memberId`, chitBrewId,chitBrewName,chitStoreName. Empty successful body valid; must NOT add tasted until staff confirms. Finder excludes tasted and already queued IDs.
- Queue GET /memberQueues.php HTML h3.brewName + div.brew_added_date + deleteQueuedBrew.php?cid; deletion **GET** /deleteQueuedBrew.php?cid (mock graph says POST but production code GET).
- Reward POST /addToRewardQueue.php form chitCode=rewardId,chitRewardType,chitStoreName,chitUserId; available/redeemed; user confirmation; success even non-JSON HTTP200.
- Pending operation only CHECK_IN_BEER actually implemented in RN; other enumerated operation types are TODO in reference. RN retries network failures up to 3, exponential 1s base/30s cap, 2s reconnect debounce. Native now retains failures pending through the reference retry bound, with explicit review feedback and backoff. No idempotency guarantee is inferred. Offline first attempts auto-send on reconnect. Unknown types preserved failed, user/store guard added.
- Untappd uses ASWebAuthenticationSession (not SFSafariViewController) for Safari cookie reuse. Strip parenthetical name then encode search query.
- Enrichment optional config current .env.production/.development/.staging exist in original checkout, NOT worktree (ignored). Need generate ignored plist from selected environment without printing secrets. Source config EXPO_PUBLIC_ENRICHMENT_API_URL/API_KEY. Native has ignored environment import, proxy GET, batch, missing sync, health and metrics. Immediate re-fetch after sync and full contract/rate-limit parity remain incomplete. GET /beers?sid with X-API-Key and ETag. POST /beers/batch JSON {ids:[...]} max100 → {enrichments:{id:{enriched_abv,enrichment_confidence,enrichment_source,brew_description,has_cleaned_description}},missing:[...],requestId}. POST /beers/sync JSON {beers:[{id,brew_name,brewer?,brew_description?}]} max50; GET /health. Source description-fallback normalized to description. Proxy response must validate storeId and expected fields (native validates storeId). Description ABV used only for container icon fallback, never persist description-derived ABV (native now includes display-only description fallback).
- Live Activity uses existing attrs/SwiftUI UI, 500ms debounce, restarts with queue changes, 3h stale, end empty/logout, foreground expiry. Native AppDelegate registers/schedules BGTaskScheduler cleanup; runtime device verification remains. Reference identifier org.verily.FSbeerselector.liveactivity.cleanup (modules/live-activity/ios/LiveActivityAppDelegate.swift + LiveActivityModule.swift), BGAppRefreshTaskRequest 3h. Add native AppDelegate and Info.plist permitted IDs/background fetch. staleDate != exact removal guarantee. Physical-device tests required.

## Next work (do not claim whole migration complete)
1. User signs into test account in the open iPhone simulator. Verify member data, cache reload, and account flow without printing credentials. Agree on concrete live check-in/reward/delete test actions before sending mutations.
2. Audit remaining login cancellation/rollback timing, logout interleaving, interrupted operations, and full RN schema/Keychain compatibility. Test account switching and cold-start deep links.
3. Complete enrichment contract validation, immediate post-sync fetch, rate-policy parity, and health/metrics diagnostics. Do not print configuration values.
4. Refine full Pen visual match (status/header chrome, card details, ghost digits), full statistics control, accessibility, large text, iPad rotation, and screen interactions. Existing screenshots are fixtures only.
5. Full signed in-place RN-to-native upgrade and physical Live Activity lifecycle remain release gates. Minimum 17.6 compatibility runtime also remains untested (build deployment target is 17.6).
6. Keep PARITY.md and this checkpoint current. Changes remain uncommitted under native-ios; no push/deploy.

## Tool hygiene
Discover tool metadata via ALL_TOOLS only when necessary; use structuredContent and output selected fields, never entire graph nodes (fingerprints huge). Persist retrieved data/inventories. Do not read broad credential config slices: unrelated secret accidentally appeared once in a config read; never repeat it. No credential values need user-facing output.

## Button correction after user sign-in
- Reference FilterBar has compact chrome ALL/DRAFT/CANS, icon + DATE/NAME/ABV, and NEW/OLD, A-Z/Z-A, HIGH/LOW direction controls. Native oversized outlines and bare direction arrows were incorrect.
- Beerfinder needs compact amber QUEUE and REWARDS alongside filters; expanded CHECK IN and UNTAPPD both use amber ActionButton. All Beers keeps its cyan outlined Untappd action, as the current RN source does.
- Added BeerControlStyle with chrome/selected/amber/outline appearances and 44-point hit areas; compact controls wrap to two rows when needed. Added queue loading state and restored Finder Rewards access.
- Dedicated simulator `6CC9C856-7049-4BC3-82EE-E67ADB1F5BD3` (BeerSelector UI Review, iPhone 17 Pro) isolates fixture screenshots/tests from user's signed-in `3A8B89DC-35F0-4FCB-886B-448EA2B961AA`.
- `--preview-expanded` opens the first fixture row for visual review of its action buttons.

- Button correction verification: 22/22 existing tests pass; log `/private/tmp/BeerSelectorNative-buttons-test.log`. Expanded All Beers/Finder screenshots captured and reviewed (`iphone-beers-buttons.png`, `iphone-finder-buttons.png`). Both fit all controls at standard text size.
- Installed corrected build in place on user's signed-in iPhone simulator, preserving its data container/Keychain; reopened normal app for review. No live account mutations were sent by the agent. Latest device SDK build predates the button correction; simulator build/tests cover this UI change.

## Chrome priority correction — latest user steering
- User: **“you gotta match the chrome of my design too. the chrome is crucial.”** Treat saved Pen material values as visual source of truth, ahead of RN visual approximations. Preserve control behavior.
- Read all reusable Pen components plus Home overrides from `/Users/pete/claude/RobocopChrome.pen`. Wrote `Docs/CHROME.md` with source IDs, stop positions, rims, radii, and status-bar documentation.
- Implemented five-stop polished card/search/nav rims; separate three-stop filter/steel rims; seven-stop brushed status/footer bands; five-stop tab pill; steel overlay on major panels; recessed etched steel icon wells; radial rivets; dark steel label plates; cyan scanline title displays; amber action gradients/edges/glows and red milestones.
- Real system status icons now render dark on the chrome status band (`UIViewControllerBasedStatusBarAppearance=false`, `UIStatusBarStyleDarkContent`), per Apple documentation. Native system indicators are retained.
- Settings/Rewards have custom chrome back controls and cyan display titles. Rewards rows retain the design's dark surfaces instead of adding unrequested bright rims. Home metric font now follows Pen's Space Grotesk rather than the previous DSEG approximation.
- Shared SwiftUI primitives live in `UI/RobocopTheme.swift`; RootView, BeerListScreen, SettingsScreen, RewardsAndQueue use them. Pen MCP `get_app_state` again timed out; no rendered Pen pixel comparison is claimed.
- Initial chrome screenshot review confirmed metal safe-area bands, card/search rims, etched glyphs, titles, rivets on iPhone. Final screenshot/build results recorded below.

- Final chrome validation: **22/22 tests pass** (`/private/tmp/BeerSelectorNative-chrome-test.log`); unsigned device SDK build also passes (`/private/tmp/BeerSelectorNative-chrome-device.log`).
- Final fixture screenshots captured: six `iphone-*-chrome.png` screens plus `ipad-home-chrome.png` and `ipad-finder-chrome.png`. Reviewed safe-area bands, glyphs, panels, search, header, tab and Rewards materials on iPhone/iPad. Updated user's original simulator app in place and reopened it; no uninstall or live account mutation was performed.
- Remaining visual work includes exact full layout/type-size/rotation comparison; the Pen renderer remains unavailable. Do not equate matching saved material values with complete pixel parity.

### Build-number maintenance

Build 60 is already reserved. For the following distribution archive, run `native-ios/Scripts/bump-build-number.py` once from the repository root (or invoke its absolute path). It increments the single shared XcodeGen setting, enforces a floor of 60, and regenerates the project for both app and widget. XcodeGen must be installed; generation failure restores the prior source setting and attempts project restoration. Review and commit project.yml and project.pbxproj together. Check the latest uploaded build across native and legacy releases first; the local script does not query App Store Connect or coordinate concurrent release branches. Routine Run, Profile, Test and Archive actions do not mutate source versions. Failed archives can reuse their reserved number until it has been uploaded.
