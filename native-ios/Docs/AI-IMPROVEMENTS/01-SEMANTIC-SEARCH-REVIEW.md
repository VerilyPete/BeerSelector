**Semantic taplist search — team review, September 14, 2026**

Scope: implementation readiness of [Plan 1](01-SEMANTIC-TAPLIST-SEARCH.md), checked against the current controller, eligibility/ranking rules, prompt encoders and installed SDK. Three independent reviewers covered architecture, privacy/lifecycle, and validation/compatibility. This is a planning review, not evidence that semantic search works on a device.

| Finding | Disposition in revised plan |
| --- | --- |
| Semantic IDs would lose description evidence before ranking | Bounded authoritative evidence survives all three prompt encodings with context accounting. |
| Search-session topology unspecified | Separate read-only retrieval and tool-free ranking; gated spike selects direct semantic adapter or app-owned retrieval tool. |
| Stock search tool scope/eligibility isolation unproven | App-owned boundary is default; filtering/hydration must precede either model's candidate input. General stock tool excluded absent a separate proof. |
| Reduced-pool shortlisting could recalculate ABV bands | Compute eligibility once over complete taplist; extract ordering over already-eligible candidates with equivalence tests. |
| Candidate merge and previous-presentation behavior vague | Six semantic slots, local fill, stable deduplication and explicit fill-to-three policy. |
| Eight seconds applied only to ranking | One monotonic pipeline deadline, two-second retrieval allowance, bounded invocations/results and prepared local fallback. |
| Async retrieval introduced a pre-ranking stale-state gap | Complete immutable token; fences at hydration, tool return, ranking entry and publication. |
| Delayed index writes/deletes could resurrect or erase generations | Unique non-reused namespaces, serialized ownership, recoverable retirement manifest and deletion after pending writes drain. |
| Index readiness conflated with submission or refresh validation | Explicit states; committed-content digest distinct from validation UUID; SDK readiness proof required. |
| Deletion and feature-disable semantics underspecified | Event matrix separates disposable index cleanup from explicit durable feedback deletion. |
| Quality gates qualitative | Frozen corpus, five paired runs per case, quantified recall/precision/success/latency gates and separate cold-index tests. |
| Compatibility could be asserted from availability guards alone | Actual old/new SDK build matrix and iOS 26/new-device runtime evidence required before release. |

**Evidence and limits**

SDK inspection found Xcode 27.0 (`27A266a`). The installed `_CoreSpotlight_FoundationModels.swiftinterface` exposes `CoreSpotlightSource.fetchAttributes`, `maximumResultCount` and `searchableIndexDelegate`, but no index/domain/predicate scope property. Configuration exposes a response-size limit; the application still needs its own invocation limit. This inspection does not prove that no alternative scoped route exists. It justifies the gated harness and app-owned boundary.

The SDK interface lives under `iPhoneOS.sdk/System/Library/Frameworks/_CoreSpotlight_FoundationModels.framework/Modules/_CoreSpotlight_FoundationModels.swiftmodule/arm64e-apple-ios.swiftinterface`. Apple’s [LLM search using Core Spotlight session](https://developer.apple.com/videos/play/wwdc2026/246/) supplies API context; enforcement and quality must be demonstrated in our harness.

No app code, Cloud configuration or distribution state changed. New runtime, performance, semantic-quality and compatibility tests have not been run for this plan. Start with the SDK feasibility/safety harness; the local extraction and frozen baseline can proceed independently. Production integration depends on the safe semantic route being proved, and enabling the flag depends on all release gates.

**Second review**

All three reviewers found the revised plan ready to begin gated implementation. Architecture requested preserving the existing zero-unseen branch (full local shortlist) separately from one/two-unseen fill-to-three; validation requested an explicit semantic-success denominator and rejection of empty-result successes. Both clarifications are incorporated. Privacy/lifecycle had no remaining finding. Executable SDK proof and release evidence remain required, not presumed complete.
