**Semantic taplist search — implementation evidence, September 14, 2026**

Status updated September 21, 2026: at the user's request, word-vector retrieval is enabled by default in Debug and Release on iOS 26 and later with English preferred language. No scheme environment variable is needed. Suggestions itself remains disabled until the user enables it in Settings. Missing embeddings, unavailable indexes and model failures retain the existing local fallback. This rollout decision does not establish broader recommendation quality; the evaluation work below remains outstanding.

**Implementation**

- `LocalTaplistRetriever` preserves prior ordering and zero/one/two-unseen branches. Eligibility is calculated once across the complete authoritative taplist, including relative ABV bands and combined recent/confirmed repeat history.
- `WordVectorEngine` runs Apple NaturalLanguage English word embeddings on an actor. Bounded public name/style/brewery/description text is averaged into normalized vectors; query similarity scans only eligible IDs. At most 1,000 documents and 24 returned IDs. Missing assets, unrepresentable text and invalid vectors fall back locally. This API predates iOS 26; the iOS 26 minimum aligns retrieval rollout with the existing Apple Intelligence ranking path.
- `SemanticTaplistIndex` is memory-only and keyed by account/epoch and normalized public taplist facts, with model revision/dimension checks. Complete builds publish atomically; invalidation cancels outstanding builds and fences late search/build results. No personal history/feedback, Spotlight writes or persistent cache.
- The controller retrieves after fresh source validation and only for explicit nuanced requests. It reserves up to six semantic candidates, fills with established local ordering to 12, and hydrates description evidence from authoritative eligible beers. It rechecks state before ranking/publication, including account, full snapshot, preferences, choice contexts and retrieval validity.
- Every prompt tier preserves up to 320 Unicode scalars of description evidence per semantic candidate and the existing 100-tasting input. Semantic context overflow retries local candidates through AI once with remaining time. Retrieval and ranking share one eight-second deadline; retrieval is capped at two seconds. Other model failure uses the original local fallback order.
- UI provenance distinguishes semantic/mixed retrieval from ordinary Apple Intelligence ranking. Exact style requests retain the existing path. Selection and submission validation remain app-owned.
- Two pre-existing SwiftUI overload ambiguities under Xcode 27 were resolved with explicit rectangle fills, preserving existing chrome colors/opacity.

**Why the route changed**

Xcode 27.0 (`27A266a`), physical M1 iPad Pro on iPadOS 27.0 (`24A437`). The separate fixture-only probe uses a different bundle identifier and no real app data.

Core Spotlight lexical controls succeeded, but synonym queries failed across scoped/unscoped, semantic enabled/disabled/default, ranked/unranked and explicit English configurations. An initial run logged Spotlight embedding timeout `-8007`; later failures did not establish a unique platform root cause. Foundation Models reported available and a structured semantic control passed. Sentence embeddings were unavailable. English word embeddings were available, revision 1, dimension 300, and passed positive/negative semantic contrasts.

A real overlapping-generation test also disproved the assumption that separate Spotlight index names isolate identical identifiers/deletions. Prefixing every identifier with its generation namespace and deleting only owned domains repaired this harness bug. The real overlap regression now passes. The app implementation uses no Spotlight index.

**Recorded validation**

- `/private/tmp/semantic-local-baseline-4.xcresult`: pre-extraction frozen candidate ordering, 20 synthetic cases.
- `/private/tmp/semantic-local-red.xcresult`: ABV recomputation regression failed before repair.
- `/private/tmp/semantic-app-signed.xcresult`: first slice, 194 tests passed under Xcode 27 / iOS 26.5 simulator.
- `/private/tmp/semantic-generation-isolation-red.xcresult`: physical cross-generation replacement/deletion assertions failed before namespace repair.
- `/private/tmp/semantic-alternative-controls.xcresult`: physical structured Foundation Models control and word-vector contrast tests passed.
- `/private/tmp/semantic-word-corpus-verified.xcresult`: three physical tests passed: prototype corpus, real overlap isolation, authoritative hydration. Synthetic candidate Recall@12: aggregate 0.818 → 0.918; eight synonym cases 0.875 → 1.0. Prototype cache for 32 beers built in approximately 31 ms. These are candidate retrieval observations, not final recommendation precision or broad production benchmarks.
- `/private/tmp/semantic-candidates-red.xcresult`: missing semantic candidate/evidence assertions failed before integration.
- `/private/tmp/semantic-experimental-full2.xcresult`: integrated app, 205 tests passed on iOS 26.5 simulator, including eligibility, evidence in every prompt tier, source changes during retrieval, retrieval timeout, shared deadline and cache build races.

Post-review focused validation: `/private/tmp/semantic-review-red2.xcresult` failed the three new regressions before repair; `/private/tmp/semantic-review-green.xcresult` passed all 25 integration tests after repair. An additional cache test covers invalidation during a suspended search. The actual production-engine device corpus run completed on September 15 after the iPad was unlocked: **one test covering 20 cases passed**, zero failures (`/private/tmp/semantic-production-engine.xcresult`; summary `/private/tmp/semantic-production-engine-summary.json`). It compiled the app’s `WordVectorEngine` source into the isolated probe. Candidate Recall@12 reproduced the prototype: aggregate 0.818 → 0.918, synonym cases 0.875 → 1.0; the 32-document cache built in 35 ms. This verifies the engine, not full app UI or final AI ranking quality. Architecture findings are repaired, and the final privacy review found no additional isolation/evidence issues. Simulator tests use serial execution and normal ad-hoc signing; unsigned runs lack Keychain entitlements. Capability diagnostic failures remain failures: the full probe suite is intentionally not an all-green suite on this device.

Final full verification: `/private/tmp/semantic-final-review.xcresult` — **209 tests passed, zero failures**, Xcode 27 / iOS 26.5 simulator, including all review fixes and late-search invalidation. `git diff --check` passes.

**Remaining evaluation work**

The frozen synthetic corpus has provisional labels and does not establish final model selection quality. Add independently labeled eligible/unacceptable IDs, negative requests, named beers, mixed style/nuance and varied hard-filter combinations. Run paired actual-model selection evaluations and latency measurements, including cold/warm behavior and repeated runs; do not ship merely because word-vector candidate recall improved. Static word averages are weak on negation and compositional meaning.

Only Xcode 27 is installed; Xcode 26.3 compilation remains unverified. The full iOS 26.5 simulator suite does not establish real iOS 26 Apple Intelligence quality. The iOS 27 simulator could not launch the app (`NSPOSIXErrorDomain` code 3); physical probe tests do not replace full app UI/runtime checks on iOS 27. The earlier instruction to keep Release disabled is superseded by the September 21 rollout decision above. These historical validation limitations are not claims about the current build. Plans 2–4 remain separate work.

**Release compatibility audit — September 21, 2026**

The app's production retrieval path uses `NLEmbedding.wordEmbedding(for:)`, vectors, revision and dimension, available since iOS 13 in the installed Xcode 27 SDK headers. It does not use the iOS 27 Core Spotlight or Foundation Models APIs explored by the separate probe target. The app retains its iOS 17.6 deployment target.

| Runtime | Suggestions behavior |
| --- | --- |
| Earlier than iOS 26 | Semantic retrieval defaults off; the provider's iOS 26 guard returns model-unavailable and the controller uses local matching. |
| iOS 26.0–26.3 | English semantic retrieval is enabled; available, locale-supported Foundation Models ranking uses the conservative byte-based prompt budget. Token-counting APIs are never invoked. |
| iOS 26.4+ and iOS 27 | Same retrieval and ranking path; token counting is used only inside its iOS 26.4 runtime guard and when the compiler supports those declarations. Older compiler builds retain the conservative budget. |
| Unsupported preferred language or missing word embeddings | Semantic retrieval is disabled or returns no result; existing local candidates remain available to ranking. |
| Apple Intelligence unavailable, unsupported model locale, provider error or timeout | The controller uses the established local fallback ordering and reports when additional style/mood wording could not be interpreted. |

No iOS-27-only production call is introduced by this rollout. Newer APIs must continue to receive their own runtime availability guards; an OS check does not replace `model.availability` and `supportsLocale()`. Provider errors are caught by the recommendation pipeline; context overflow retries compact input or local candidates within the existing deadline. The original Spotlight probe remains outside the application target.

Release-enablement validation: Xcode 27.0, actual `Release` configuration with testability enabled and serial execution. All 220 tests passed on iOS 27 (iPhone 18 Pro) and the same binary passed all 220 tests on iOS 26.3 (iPhone 17e). The default-index regression builds and retrieves without an enable override, and the system-provider smoke test returns eligible suggestions or local fallback. Existing tests cover unavailable providers, deadline expiry, context overflow, eligibility and stale-index rejection. FoundationModels remains weak-linked in the Release binary. Test cleanup now cancels its task directly instead of depending on a DEBUG-only preview method, allowing the complete suite to compile in Release. Bundles: `/private/tmp/semantic-release-27-verified.xcresult` and `/private/tmp/semantic-release-26-3.xcresult`. These simulator results establish compatibility and fallback behavior, not physical-device inference quality or latency.
