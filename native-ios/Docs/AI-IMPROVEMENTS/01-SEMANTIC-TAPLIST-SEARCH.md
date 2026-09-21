**Plan 1 — Semantic taplist search**

Status updated September 21, 2026: word-vector retrieval is enabled in Debug and Release on iOS 26+ with English preferred language, without a developer environment flag. Suggestions remains user-opt-in. See [implementation evidence](01-SEMANTIC-SEARCH-IMPLEMENTATION.md) for the rollout decision, fallback behavior, and outstanding quality evaluation. The original planning sections below are historical.

**Implemented route amendment — September 14, 2026**

The Core Spotlight route below is retained as the original design and rejected feasibility experiment, not the implementation specification. Physical-device lexical controls passed but synonyms failed across query configurations. The chosen experiment uses Apple NaturalLanguage English word embeddings, averaging normalized word vectors for bounded public beer facts and the request. This API predates iOS 26; the current rollout minimum is iOS 26. Static word vectors do not interpret negation or complex preferences reliably; the existing ranker and app-enforced filters retain authority.

`SemanticTaplistIndex` owns a memory-only, app-private cache keyed by account epoch, account and normalized public taplist facts. Each completed cache records model revision/dimension. Invalidation cancels builds and changes a generation token; late builds/searches cannot publish. Nothing is written to Spotlight or disk, so the Spotlight manifest, disk cleanup and OS reindex requirements below do not apply to this route. Private history/feedback are never vectorized. Authoritative description evidence is supplied independently to ranking after eligibility intersection.

One query vector scans at most 1,000 eligible cached documents and returns at most 24 IDs; no retrieval model session/tool is used. Take up to six semantic IDs, fill with established local ordering to 12, preserve the existing few-unseen branches, and keep a two-second retrieval cap inside the shared eight-second ranking deadline. Every prompt tier retains bounded evidence and 100 tastings. Context overflow retries original local candidates once within remaining time; other failures retain local fallback. Unsupported language/model, unavailable cache or unrepresentable text uses existing retrieval. Exact style requests bypass semantic retrieval. The current style parser is preserved; broader mixed-style parsing described below remains a release-quality evaluation item.

Enable Suggestions in Settings. Semantic retrieval is available for nuanced requests on iOS 26+ with English preferred language in distribution and development builds. No Cloud workflow or distribution setting is changed.

**Outcome and user behavior**

A request such as “roasty but not sweet” can retrieve relevant beers whose descriptions use different wording. Keep the Style or mood field, interpretation, explicit Find suggestions action, selection and confirmation. Recognized style-only requests keep the existing local retrieval fast path. Mixed requests such as “IPA but tropical” apply the recognized IPA constraint first, then semantic retrieval for the remaining nuance. Unrecognized wording never silently becomes a hard exclusion.

On supported iOS 27 devices, semantic retrieval precedes ranking. iOS 26 retains lexical/style-diversity retrieval and Apple Intelligence ranking; older supported systems retain local matching. An unavailable index on iOS 27 falls back to existing retrieval while still allowing AI ranking. Empty semantic results do not establish that the eligible pool is empty. Never relax eligibility to satisfy a request.

Track retrieval provenance (`local`, `semantic`, `mixed`) separately from ranking provenance (`appleIntelligence`, `local`). The existing “Selected with Apple Intelligence” status describes ranking only. Keep detailed retrieval failure categories in diagnostics; retain the existing notice when local selection cannot fully interpret a nuanced request.

Apple documents model-driven indexed-content search, repeated queries and delegate hydration. These establish an integration direction, not a guarantee of scope isolation or latency. [Apple: LLM search using Core Spotlight](https://developer.apple.com/videos/play/wwdc2026/246/)

**Architecture decisions**

Use a separate read-only retrieval phase followed by the existing tool-free ranking phase. Default to an app-owned scoped query adapter. If semantic queries require model orchestration, put that adapter behind an app-owned tool in a short-lived retrieval session. If a direct semantic API satisfies the same contract, omit the retrieval inference session. The feasibility slice selects and documents one working route before production integration; a lexical query must not be labeled semantic.

Do not attach the stock general Spotlight search tool unless a future reviewed proof establishes equivalent filtering before any content enters model context. Inspection of Xcode 27.0 (`27A266a`) found `CoreSpotlightSource` attributes, result limits and a hydration delegate, but no exposed index/domain/predicate scope control. Guidance text and filtering the final model answer are insufficient boundaries.

Introduce application-only interfaces; shared declarations must not reference new SDK types:

| Contract | Required contents and behavior |
| --- | --- |
| `TaplistRetriever` | Cancellable retrieval; local implementation remains available in every build. |
| `RetrievalRequest` | Immutable authoritative taplist snapshot; already-computed eligible IDs; bounded user request; source/store scope; index generation and content digest; request token; monotonic deadline. No personal history or feedback payload. |
| `RetrievalResult` | Ordered IDs, matching generation/content revision, source-backed evidence by ID, provenance and categorized failure. Never model-authored beer facts. |
| Request validity token | Controller generation, account epoch/identity, complete recommendation snapshot, preferences, captured choice-context revision and index generation. Reuse full snapshot equality or an equivalently complete revision vector. |

1. Validate fresh sources using the existing controller flow. Capture immutable recommendation state and choice contexts.
2. Compute eligibility **once from the complete authoritative taplist**, including relative ABV bands. Extract an already-eligible ranking helper from `RecommendationRules.shortlist`; never call the existing eligibility-computing helper on a reduced semantic pool.
3. Prepare the existing local ordering and eligible unseen pool. Query only a ready index matching the captured content digest.
4. At the application boundary, validate scope and token, intersect IDs with the captured eligible pool, deduplicate, then hydrate from the captured authoritative snapshot. Indexed descriptions are search hints, never authoritative prompt content. Reject wrong-scope, deleted, stale and index-only IDs.
5. Recheck validity before every hydration/tool return, before ranking invocation, and before publication. Any state change aborts the request; do not mix old retrieval relevance with newly read beer records. Preserve existing submission-time validation independently.
6. Merge candidates, supply bounded authoritative evidence to ranking, validate final IDs and publish through the existing controller fence.

All candidate facts entering **either** model session must pass that boundary. Existing personal observations still enter ranking as today; they do not enter the retrieval session/index. Beer descriptions are untrusted data, delimited from instructions. Search tools cannot mutate the queue, invoke arbitrary tools, or retrieve unrestricted OS/user content.

**Candidate merge and evidence**

Final pool remains at most 12. For nuanced requests with valid semantic results: take up to six unseen semantic IDs in adapter relevance order, then fill from the unchanged local order excluding duplicates, then fill any remaining slots from unused semantic IDs. Stable relevance ties use beer ID; multiple searches preserve first accepted occurrence in application-serialized query order. A short/empty semantic result automatically lends its slots to local retrieval. Preserve local ordering exactly when semantic retrieval is bypassed or fails.

Apply previous-presentation exclusion to both sources before merging. If one or two unseen eligible beers exist, append previously shown eligible beers in local order only until `min(3, eligibleCount)` is reached; do not fill the remaining 12 slots with old suggestions. If zero unseen eligible beers remain, use the unchanged full local fallback shortlist (up to 12). This preserves both existing presentation branches. Model failure selects the first three from the unchanged local fallback ordering, not an arbitrary semantic tool answer.

Every semantic-origin candidate receives an authoritative cleaned-description excerpt through full, compact and lean ranking encodings, keyed by ID. Initial bound: first 320 Unicode scalar values per candidate, at most 12 candidates; truncation is explicit and never a generated summary. Preserve name/style/brewery/ABV/container facts and existing literal request evidence. If this bounded excerpt loses relevant evidence, record the miss in the corpus; do not invent facts. Count evidence in all prompt tiers. Preserve all 100 tasting observations and durable feedback policy. If evidence cannot fit safely, use local retrieval/ranking rather than silently dropping semantic evidence.

**Time, search and context bounds**

Start one monotonic eight-second generation deadline immediately after source validation. Precompute the local fallback early within that budget. Semantic retrieval gets at most two seconds and never extends the global deadline; ranking uses only the remaining time. Index building is never awaited on this path. On absent/not-ready index or retrieval error, immediately proceed with local candidates and remaining ranking time. On global expiry, publish the prepared local selection with accurate provenance if the request is still current; never start a fresh eight-second timer. Cancellation/state invalidation publishes nothing.

Enforce at most two application-authorized searches, serialized, and at most 24 accepted unique retrieved IDs total. A third invocation returns a bounded limit response without querying. Bound raw result handling as well: stop/cancel after 96 examined hits total across searches; this may reduce recall, never weaken eligibility. Ignore late callbacks and prevent them from initiating ranking. Generalize the existing deadline helper beyond its ranking-only `[String]?` result.

For each retrieval inference session and ranking session, independently budget instructions, prompt, schema, tool declarations, tool output, reserved final output and safety headroom. Use the available token-count/context APIs behind availability guards, retaining conservative older-SDK behavior. Reduce bounded retrieval output or fall back before exceeding the budget; no silent truncation of required history. Plan 3 may optimize these initial fixed bounds later.

**Disposable index lifecycle**

Index public taplist identity, source/store, name, style, brewery and cleaned description, plus authoritative ABV/container metadata where supported. No account/member identifier, user request, tastes, feedback, choice contexts, receipts or credentials in searchable items. Scope ownership stays in private disposable application metadata. Confirm OS index exposure in the spike; do not promise OS-wide invisibility.

Use an opaque, unique namespace per generation; never reuse a retired namespace. A serialized owner maintains a disposable manifest of active/building generations and retired cleanup work. Content identity is a stable digest of sorted public indexed facts plus schema version and source/store. Fresh validation UUIDs remain separate: an unchanged refresh does not rebuild; an enrichment change does.

States: `unavailable`, `building`, `ready`, `retired`, `failed`. Build from committed snapshots, coalesce updates, and publish only the exact current generation after all batches and verified SDK readiness requirements succeed. A successful submission callback alone is not evidence of semantic readiness. Partial/obsolete generations cannot serve queries. Departed beers are absent from replacement generations; old generations are retired and deleted. A failed index never rolls back SQLite/server refresh.

Invalidate hydration immediately on retirement. Drain/fence submitted mutations before final deletion; retry cleanup after failure or relaunch so late writes cannot resurrect a retired namespace. Old deletion completions operate only on their unique namespace and cannot delete a replacement. On process restart, reconcile manifests with authoritative content, treat unverified generations as unavailable, and resume cleanup/builds. Apply the same rules for reindex requests and OS index resets.

| Event | Required action |
| --- | --- |
| Account/logout/source/store change | Cancel requests, revoke hydration, retire old generations and schedule deletion. |
| Taplist/enrichment content change | Cancel stale requests; build a new digest/generation; use local retrieval until ready. |
| History/feedback deletion or change; queue/pending-operation change | Invalidate personalized requests/results; public index can remain. Only the explicit feedback deletion action deletes feedback. |
| Disposable cache/index reset | Remove index/manifests through recoverable retirement cleanup; preserve durable feedback. |
| Feature disabled | Cancel retrieval, stop index scheduling, retire/delete disposable generations; immediately restore local retrieval. |

**Implementation slices, in order**

Each slice uses red/green/refactor for its behavioral changes. Do not proceed past a failed dependency by weakening the contract.

1. **SDK feasibility and safety proof.** In an isolated harness under Xcode 27, prove an actual semantic query route, enforceable scope and pre-model eligibility/hydration, readiness, cancellation, result ordering, deletion and supported-device behavior. Include unrelated indexed content and poisoned indexed descriptions. Record exact API signatures, build conditions and availability. If no safe semantic route exists, stop production integration and document the blocker; retain the existing feature. SDK signature inspection is complete, but this executable/device proof is not.
2. **Local seam and frozen baseline.** In `Recommendations.swift` extract eligibility-once/local ordering with output-equivalence tests; introduce retriever/request/result fakes and baseline corpus. This independent slice may proceed while the feasibility harness is evaluated.
3. **Generation lifecycle.** Add scoped index owner, disposable manifest/recovery and authoritative hydration at committed AppModel refresh/enrichment boundaries. Use an asynchronous fake capable of out-of-order and post-cancellation completions.
4. **Controller pipeline.** Integrate merge, shared deadline, pre-model fences and provenance in `RecommendationController.swift`; add evidence/context accounting in provider/input/budget encoders. Maintain submission checks and choice-context recording. Any stored provenance addition is optional/backward-decodable; old `usedModel` retains ranking meaning.
5. **Compatibility, device quality and rollout.** Add independent disabled-by-default semantic feature flag, exercise UI/local/AI paths, and record the release evidence below. No Cloud job or distribution changes are included in this plan.

**Deterministic acceptance matrix**

- Local seam: exact previous ordering/eligibility; known and unknown ABV; mixed style/mood; relevant hit outside former 12; duplicates/ties; semantic/local shortages; previous-presentation fill-to-three; unchanged no-match behavior.
- Model boundary spy: wrong scope, index-only/deleted ID, poisoned indexed description, disliked/recent-other-package/queued/wrong-container/out-of-band beer cannot appear as a candidate in either session. Authoritative evidence survives every prompt tier and remains within context bounds; malicious/oversized descriptions remain data.
- Suspended retrieval: mutate account, preferences, taplist/enrichment, history, feedback (including deletion), queue, pending check-in or choice context. Assert no subsequent tool content/ranking invocation/stale publication. Test feature disable, third search, raw-hit cap, timeout and cancellation with late batches.
- Lifecycle: logout then new login before old delete; A → B → A; old indexing completes after logout; overlapping builds finish backward; partial batch failure; completion before semantic readiness; unchanged refresh; enrichment-only change; OS index reset; process death around build/publication/deletion.
- Capability: unsupported locale/model unavailable; model available but index unavailable; empty search; no semantic SDK build flag. Confirm fallback still uses AI when available and reports actual ranking provenance.

**Measured release gates**

Freeze a versioned corpus before tuning: at least 20 curated public/synthetic taplist/request cases, including at least eight synonym/nuance cases and four exact-style cases, plus negation, named-beer comparison, sparse history and IPA-biased history. Each fixture includes preferences, previous-presentation IDs, deterministic eligible IDs, relevant IDs, unacceptable IDs and a relevance rationale. Fix these identically for paired runs; report unseen-relevant coverage separately from the zero-unseen presentation branch. Use synthetic personal observations; do not export production user data.

Run at least five paired baseline/semantic repetitions per case on the same supported device/OS/model, recording corpus/prompt/build revisions. Measure Recall@12 after the final merge (`relevant retrieved / relevant eligible`), precision of actual selected cards, hard violations, semantic success/fallback rate and source-validation-excluded latency. Average per case before aggregating. Mark zero-relevant fixtures separately and require correct no-match/fallback behavior. Report case-level results and variability; this is a minimum release gate, not a statistical-significance claim.

Required: zero hard violations in all tests/runs; exact-style candidate outputs unchanged; synonym-case mean Recall@12 improves by at least 10 percentage points over baseline; aggregate Recall@12 and mean final-selection precision do not decline. Warm capable nuanced cases with at least one relevant eligible unseen beer must achieve semantic retrieval success in at least 95% of runs. Success requires valid semantic IDs to contribute to the merged candidate pool without a local-only downgrade; an empty-result completion alone is not success. Treat readiness/cold-start/unavailable cases separately, testing correct immediate fallback rather than counting them as successful semantic search. Generation deadline must be enforced at eight seconds; observed warm-run p95 publication must be no greater than 8.25 seconds, with scheduler overshoot reported. If these limits are unattainable, keep the flag off and revise the plan with recorded evidence, not post-hoc passing thresholds.

Compatibility evidence must include actual Xcode 26.3 baseline build/tests, Xcode 27 build/tests with semantic flag both off and on, a new-SDK-built binary exercising Apple Intelligence on iOS 26, supported-device iOS 27 semantic runs, and older supported local-fallback UI behavior. Build flags and runtime guards are both required; do not raise the iOS 17.6 deployment target.

Implementation-ready means contracts and tests are specified and the next task is concrete. Release-ready additionally requires the SDK proof, deterministic tests, compatibility evidence and measured device gates above. None of those new execution results are claimed by this planning review.
