## Implemented follow-up: choice context (September 13, 2026)

The earlier choice-context proposal is now implemented. Retain 100 local choice records, separately from 100 confirmed tastings and uncapped explicit feedback. Each record contains an immutable taplist cohort and distinct selection, successful queue acknowledgement, and later tasting-feed appearance evidence. Ordinary/offline check-ins participate, not just recommendation selections. Source dates remain day precision, so linkage is observational rather than proof of a bartender claim.

Both ranking paths use intent; the model receives four compact recent examples and available-style counts. Missing bartender confirmation is expressly not a negative signal: a consumed beer may never be confirmed. Choice intent does not itself establish a tasting or invoke the 30-day repeat rule. Never treat unchosen alternatives as dislikes. Explicit ratings remain the strongest preference signal.

Clearing recommendation history, logout, or app reset removes choice context and rolling tastings but preserves explicit feedback. Only the dedicated feedback deletion action removes saved ratings. Rating timestamps are added compatibly; historical ratings without a timestamp remain undated.

# On-device taplist recommendations

Status: implemented locally September 13, 2026; physical-device evaluation pending.
Branch: feature/on-device-recommendations, based on main at 922cd030.
Scope: native history, recommendation provider, selection UI, and confirmed queue submission implemented. No backend changes or distribution. The original design below is retained; implementation decisions and verification follow here.

## Implementation and evaluation status — September 13

Enable Settings → Suggestions · Beta → Show taplist suggestions, then use Home → Find something to try. The setting defaults off. Recommendations use confirmed tasted-feed entries, never queue additions as tasting evidence. The UI states the actual available history count.

Implementation decisions refining the original plan:

- SQLite keeps 20 recent events plus at most 200 baseline keys for reconciliation. Valid source dates order events; first-observed batch order breaks same-day ties without being changed by duplicate refreshes. Events first seen together have deterministic ordering, not an invented time of drinking. Fixture evidence shows roh_lap identifies a round; round plus beer ID identifies an event. Missing lap falls back conservatively to date plus beer ID. Missing rounds cannot be reconstructed.
- Ownership includes source host, member ID, and store ID because globally unique member identity is unproven. Explicit logout/account or store change clears retained history. Clearing recommendation history preserves the baseline to prevent immediate reseeding from the same feed.
- Rules shortlist eligible current-taplist beers using style and brewery affinity with diversity. IPA/India Pale Ale naming variants match. Alcohol strength never affects ranking. Current-round tastings, recent history, queued beers, and owned saved operations are excluded.
- Foundation Models receives bounded beer facts only and returns candidate IDs only. All displayed reasons are constructed from verified app metadata. This deliberately removes model-authored factual explanations from the original proposal. One request has an eight-second deadline; unavailable models, unsupported languages, invalid IDs, cancellation, and errors use deterministic suggestions. Stale completions cannot publish after account or source changes.
- A fresh taplist, tasted list, and queue validation is required for generation and again before a confirmed submission. Nothing is preselected. Selected beers submit sequentially through persisted operations; individual receipts survive refresh and cannot be resubmitted from the same results. Ambiguous recommendation writes are marked for review instead of automatically replayed. Documented empty successful queue responses remain accepted; arbitrary nonempty response text does not count as success.
- iOS 17.6 deployment target is retained; Foundation Models is gated at iOS 26. Local toolchain is Xcode 26.6, not the Xcode 26.3 pinned in Cloud. Release linkage to FoundationModels is weak. No iOS 27-specific API is required or claimed tested.

Test-first regressions cover persistence/rollover, deduplication and same-day ordering, eligibility and output validation, an uncooperative model timing out, stale-account completion, partial batch success, ambiguous responses, vanished candidates, and receipts surviving refresh. Red runs were observed before corresponding fixes.

Verification and remaining device checks are recorded in WORK-CHECKPOINT.md. Simulator UI exercises use isolated preview fixtures; no real account, model inference, or queue write is involved. Before enabling for external testers, evaluate usefulness, latency, refusals, cancellation, and battery/thermal behavior on Apple Intelligence hardware, plus iOS 27 and an older supported OS fallback. VoiceOver remains deferred at the user's request; Reduce Motion and complete device accessibility coverage are not claimed.

## Next iteration: choice context (proposal, not yet implemented)

User requested retaining the latest 100 confirmed tastings; implemented locally, superseding the original 20-record retention proposal below. Existing model input remains bounded to 20 recent detailed records; deterministic candidate selection uses all retained history.

Capture an account/store-scoped immutable taplist snapshot when presenting a recommendation decision, including timestamp, successful validation identity, available beer IDs and bounded metadata, displayed suggestions and ordering, filters, and model versus local-matching provenance. Reference one deduplicated snapshot from each decision, rather than copying the entire taplist per beer.

Record separate events for selection, confirmed queue acceptance, and later authoritative tasted-feed confirmation. Link only when evidence permits; queue additions are not proof of tasting. Add optional explicit positive/negative feedback. Unchosen beers are unknown, not negative ratings; distinguish available beers from suggestions the user actually saw.

For inference, derive bounded summaries of style/brewery choices relative to available alternatives, emphasizing recent decisions; keep a few representative choice examples. Full historical taplists should not consume the model's context. Start with factual reasons and an optional familiar/adventurous preference. Never infer liking from mere queue acceptance. Clear decision history and snapshots with account/logout/history-reset policies. Proposed retention: bounded recent decisions with referenced snapshots pruned together; settle limits before implementation.

Tests should cover choice-time snapshot immutability across refresh/store changes, no cross-account reuse, partial queue success, duplicate events, missing tasting confirmation, explicit feedback, snapshot deduplication/pruning, and bounded model input. Evaluate usefulness on physical Apple Intelligence hardware before broad beta enablement.

## Implemented feedback refinement

The model now receives all 100 recent tasting records through a compact indexed representation, superseding the 20-record prompt limit mentioned earlier. Persistent explicit feedback is separate from the rolling cache and has no automatic pruning. Tasted cards provide Liked it / Not for me; Settings provides a single confirmed Delete cached beer feedback action for the current account/location. Logout/history clear/reset retain ratings, overriding the earlier proposed clear-together policy. Decision snapshots are still a future proposal and should likewise keep explicit user feedback independent of snapshot retention.

## Product outcome

A member can ask for three recommendations drawn from the current location's taplist, informed by their last 20 confirmed tastings even after their UFO round rolls from 200 to zero.

Proposed copy:

> Based on your last 20 tastings, here are three beers you might enjoy.
> Want to check any of them in?

Show three familiar beer cards with a short reason per beer, selectable individually. Nothing is preselected. The action reads “Add 2 to queue” for two selections and names the selected beers in the confirmation. Reuse existing beer details and queue behavior.

Use the actual history count when fewer than 20 are available. With no history, offer taplist discovery without claiming personalization. With fewer than three eligible beers, show only those available. Explain that recommendations use recent tastings, not ratings or established favorites.

The app's check-in action currently calls addToQueue.php. Queue submission is not evidence of drinking or a confirmed tasting. Recommendation history must follow the authoritative tasted-beer feed, not button taps, queue acceptance, queue removal, or retry completion.

## Original integration points (before implementation)

- Core/Models.swift: Beer carries ID, style, brewery, description, ABV, tasted_date, and roh_lap. Current sorting parses tasted_date as MM/dd/yyyy, which provides no within-day ordering.
- Core/Database.swift: current-round tastings are replaced wholesale. There is no independent recent-tasting history.
- Core/AppModel.swift: performRefresh validates and replaces tastings in a transaction; preserve history at that boundary. Existing session epochs and request identity checks guard against stale account completions.
- AppModel already excludes current-round tasted IDs, queued IDs, and pending operations from Beerfinder candidates.
- checkIn/processOperations provide persistence, deduplication, retry handling, and account checks. Extend or wrap this path rather than creating a second queue client.
- UI/RootView.swift and the existing queue/beer-card styles provide the Home entry point and visual language.
- Settings provides a place for a clearly described “Clear recommendation history” action.

## 1. Preserve confirmed tasting history across rollover

Add an additive SQLite migration with a separate recent-tasting table. Keep the legacy schema-v8 upgrade path intact; do not repurpose or stop refreshing tasted_brew_current_round.

Each history record needs an account key, beer ID, tasting-event identity, source tasting date, first-observed ordering, and a snapshot of useful beer metadata. Store no cookies, session tokens, names, or email addresses in recommendation records. Account identity must be stable across sessions; investigate member-ID scope before deciding whether an issuer namespace is needed. Location is recommendation context, not automatically a separate preference profile.

Proposed retention: the latest 20 confirmed tasting events per retained account. Separately retain bounded current-round reconciliation metadata (up to the current-round source rows) so repeatedly ingesting a 200-row feed cannot reinsert pruned old tastings as new. Retaining only 20 beer IDs is insufficient for correct deduplication.

Before implementing event keys, inspect representative sanitized source fixtures to establish whether roh_lap plus beer ID and date identifies a tasting across rounds. Do not assume roh_lap is a globally unique event ID. A beer tasted again in a later round must be distinguishable from a duplicate refresh.

In one transaction after source validation and account checks:

1. Seed from existing stored tastings on upgrade/first use when ownership is known, before a refresh can replace them with an empty round.
2. Reconcile previously unseen authoritative tasting events and metadata updates.
3. Retain the newest 20 history events using source dates and deterministic tie handling.
4. Update bounded ingestion/round metadata and replace the current-round snapshot together.

A valid empty round clears the current-round snapshot, never the independent recent history. Invalid responses do not mutate either. Count decreases alone must not manufacture a new round; allow corrections, deletions, partial data, and missed refreshes. Define a conservative policy for authoritative corrections once source identity semantics are verified.

Unknown dates and same-day ties must not be presented as precise event order. Bootstrap only history we can establish; missing previous rounds cannot be reconstructed after the fact. If the app misses an entire round while unused, do not claim the retained 20 are necessarily the user's latest 20. Use “Based on your recent tasted beers” when completeness/order is uncertain.

History survives round rollover, normal refresh, app termination, and device restart. Account switches and visitor mode must never expose another member's profile. Proposed first-version privacy default: explicit logout/reset clears that account's recommendation history, matching existing local-account cleanup behavior; an in-session round rollover does not. Retaining history across explicit logout is a separate product decision, not an accidental side effect. Clear-history must also prevent automatic re-seeding of the same old snapshot; retain an ingestion baseline or equivalent reset marker.

No cloud synchronization or server recommendation endpoint. Use the app's protected local storage; verify file protection and backup behavior rather than implying “on-device” means excluded from normal device backups.

## 2. Build deterministic candidate selection first

Create a pure recommendation service independent of Foundation Models and UI.

- Require an authenticated member and a successfully refreshed taplist for the active location, including a validated 304 response.
- Exclude current-round tasted beers, confirmed queued beers, busy submissions, and all saved check-in operations that could still be retried.
- Initially avoid the last 20 history beers too, so a rollover does not immediately recommend something just tasted. Return fewer options if necessary instead of silently relaxing this.
- Score candidates against recent styles, breweries, and supported description features. Favor diversity among the three; never optimize for higher ABV or claim that tasting proves liking.
- Build a small bounded shortlist, initially around 12 candidates, with bounded plain-text descriptions. Missing ABV or enrichment must not remove otherwise valid candidates.
- Provide deterministic selections and fact-based explanations as the complete fallback.
- Keep recommendation eligibility separate from ordinary Beerfinder rules so this feature does not change existing lists.

Use a snapshot identity including account epoch, location, successful taplist validation, recent-history version, candidate/queue state, and model/prompt version. Cache results in memory for the unchanged snapshot; cancel/discard stale generation. Do not run the model on every Home render.

## 3. Add on-device Foundation Models

Implement a provider protocol with deterministic fakes for tests and an availability-gated Apple implementation.

The basic text/structured-output feature can use iOS 26 Foundation Models APIs while preserving the app's iOS 17.6 minimum. Verify compilation and weak availability guards with the current Xcode 26.3 toolchain. Do not raise deployment targets or change both CI systems to Xcode 27 unless an actual iOS 27-only API becomes necessary. Evaluate the feature on iOS 27 before describing it as validated there.

Supply the recent-tasting summary and candidate facts only; no account identifiers, credentials, or browsing outside this data. Treat descriptions as untrusted data, not instructions. Explicitly select the on-device model; no automatic cloud/provider fallback and no Perplexity requests for recommendations.

Request structured choices: candidate IDs, referenced history/fact IDs, and short reasons. Validate unique IDs, membership, count, reason length, and references. Structured decoding does not establish factual accuracy; constrain factual claims to supplied metadata, evaluate reasons, and use deterministic wording when validation fails. Names, ABV, availability, and card actions always come from app data.

Start with one bounded generation request, not a conversation or autonomous agent. No model-callable write tools. A timeout, cancellation, model download, disabled Apple Intelligence, unsupported device/language, refusal, or invalid result must produce the deterministic experience without blocking Home.

## 4. Present three choices and add selected beers safely

Add a compact “Find something to try” Home entry point. Start generation on explicit request, with loading/cancel states. Show up to three reasons and existing-style beer details, selection controls, and “Show another” without an automatic queue action.

At confirmation, refresh/revalidate the active account, location, taplist, tasted list, and queue. If validation cannot complete, keep the cards/selections but disable this batch submission with a clear retry action. Do not call cached options “live” when offline.

Submit selected beers sequentially through the existing persisted operation path. Recheck session epoch and eligibility before each item. Disable repeat submission, stop on account/location change, and retain per-beer outcomes. Do not automatically retry ambiguous successful writes or resubmit successes after partial failure.

Report “Added to queue,” “Saved for retry,” and “Failed” accurately per item. The existing single-beer checkIn method returns Void; introduce an explicit result or observable operation IDs before building batch completion UI. Do not interpret a returned call or a transient notice as successful server acceptance.

A beer disappearing from the taplist invalidates that selection. Refresh, logout, a different store, empty candidates, or newly queued/tasted beers must not leave actionable stale recommendations.

## 5. Red/green/refactor and evaluation

Implement in small test-first increments, with the database work first:

1. Add failing persistence tests, implement transactional history ingestion, then refactor event reconciliation.
2. Add failing eligibility/ranking tests, implement deterministic suggestions, then extract the provider boundary.
3. Add failing cancellation/output-validation tests with a fake model, implement Foundation Models availability and generation, then tune prompts using device evaluations.
4. Add failing batch-action/account-race tests, implement result-aware submission, then integrate the Home cards.
5. Run the full native suite, configuration tests, and both retained contract checks before a PR merge.

Required regression cases:

- Existing installation seeds history before its first observed 200-to-0 refresh.
- 198/199/200-to-0-to-new-round progression retains the correct bounded history across relaunch.
- Duplicate refreshes, metadata enrichment, same-day dates, invalid dates, out-of-order snapshots, repeated beer across rounds, and a full feed larger than the cache.
- Empty/invalid responses, ambiguous round changes, unknown prior history, transaction rollback, and history reset without immediate reimport.
- Same member changes stores; different member logs in; visitor mode; logout/reset; stale network/model completions.
- No candidates, fewer than three, all queued, pending failed operations, stale/offline data, unavailable model, refusal/timeout, duplicate or invented IDs, and injected instructions in descriptions.
- Multi-select partial success, retry persistence, repeated taps, availability changing during confirmation, and account switch between submissions.

Use controlled fixtures for model evaluations, including varied styles, sparse metadata, and poor descriptions. Hard requirements are valid eligible IDs, no invented beer facts, no cross-account data, and no unconfirmed queue writes. Assess usefulness, diversity, explanation honesty, latency, and thermal/battery impact on eligible physical hardware. Unit tests alone cannot certify generation quality.

Check iPhone/iPad layout, large text, Reduce Motion, selection clarity, and nonblocking Home behavior. VoiceOver testing remains deferred until the user can allow audio.

## Delivery

Suggested implementation commits: history persistence; deterministic recommendation service; Apple model provider; Home cards and batch confirmation; device evaluation and final adjustments.

Ship behind a local feature setting for beta evaluation first. No backend deployment is needed. Normal PR checks and the existing main-to-external-TestFlight workflow handle distribution once implementation is approved and merged.

Before coding the history key, resolve source event/round identity from fixtures. Before beta release, settle explicit-logout retention and validate both older-device fallback and iOS 27 behavior. These questions do not block the deterministic candidate service or test scaffolding.

References:
- https://developer.apple.com/documentation/FoundationModels/generating-content-and-performing-tasks-with-foundation-models
- https://developer.apple.com/documentation/FoundationModels/generating-swift-data-structures-with-guided-generation
- https://developer.apple.com/ios/whats-new/
