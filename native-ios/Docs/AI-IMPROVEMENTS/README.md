**Advanced on-device suggestions: implementation roadmap**

Drafted September 14, 2026. These documents define the roadmap; see [Plan 1 implementation evidence](01-SEMANTIC-SEARCH-IMPLEMENTATION.md) for the word-vector implementation, its September 21 release-enablement decision, and outstanding evaluation work. Plans 2–4 remain unshipped. Baseline is native commit `bf65d3c6` (191 passing tests). The four plans are separate work items, ordered as requested:

1. [Semantic taplist search](01-SEMANTIC-TAPLIST-SEARCH.md)
2. [AI quality evaluations](02-AI-QUALITY-EVALUATIONS.md)
3. [Adaptive model context](03-ADAPTIVE-MODEL-CONTEXT.md)
4. [Refine an existing selection](04-SELECTION-REFINEMENT.md)

Plan 1 has completed a team planning review; see its [review disposition](01-SEMANTIC-SEARCH-REVIEW.md). The local baseline and experimental app-private retrieval pipeline are implemented; word-vector retrieval is now enabled in Debug and Release on iOS 26+ with English preferred language, within user-opt-in Suggestions. Plans 2–4 remain drafts. Include a small fixed evaluation corpus in that feature so it can be assessed against the current retrieval baseline; Plan 2 expands this into the reusable evaluation system. Plans 3 and 4 use that system before release. Each feature should have its own reviewable implementation PR after the current recommendation branch is integrated. Do not bundle all four into one release requirement.

**Compatibility contract**

| Environment | Required behavior |
| --- | --- |
| iOS 27 with a supported, available on-device model and required capabilities | Enable individually validated advanced features. |
| iOS 26 with Apple Intelligence available | Enable English word-vector retrieval for nuanced requests, preserving on-device ranking, 100-tasting input, local fallback, and all user controls. |
| Model unavailable, unsupported language/hardware, or interrupted generation | Use eligible local matching and accurate messaging about any request that was not fully interpreted. |
| Existing supported OS versions below iOS 26 | Preserve local matching and existing app functionality. Do not raise the current iOS 17.6 deployment target for these features. |

Runtime OS checks are necessary but not sufficient: use feature-specific capability and model-availability checks. New OS version alone must not imply that every model feature is usable. Avoid a single `advancedAI` switch that enables unrelated capabilities together.

Build compatibility is separate. Verify APIs and availability against the installed Xcode 27 SDK in each feature's initial spike. Hide new SDK-only declarations behind a dedicated build condition, enabled only by the new-SDK build configuration, and runtime availability guards. Keep unavailable types out of shared interfaces. `canImport(FoundationModels)` alone cannot distinguish its iOS 26 and iOS 27 APIs. Do not guess a Swift compiler-version threshold. Preserve the existing Xcode 26.3 CI lane until an actual new-SDK build and iOS 26 runtime test pass; introduce an Xcode 27 validation lane separately. Changing Cloud configuration or distribution is a separate implementation action, not part of this planning change.

**Shared invariants**

- On-device inference and storage throughout this roadmap. No Private Cloud Compute or third-party model routing is proposed.
- SQLite and the fresh server snapshots remain authoritative. Search indexes, model transcripts, and cached prompts are disposable derivatives.
- Preserve the latest 100 confirmed tasting observations across round rollover. Preserve 100 actual choice contexts plus the latest unused presentation. Explicit beer feedback remains uncapped and is deleted only through the explicit feedback deletion action.
- Keep account/source/location isolation, 30-day recipe-repeat checks, current-round eligibility restrictions, dislikes, queue/pending-operation exclusions, and container/relative-ABV rules in application code.
- Generation or refinement begins only after an explicit action. No model/tool can add a beer to the queue. Fresh validation, explicit selection and confirmation, per-beer receipts, and ambiguous-write recovery remain mandatory.
- Discard stale retrieval, index, model, and UI results using the account epoch and source/request revisions. Clearing data invalidates derived state too.
- Preserve all 100 observations while sizing prompts; reserve instructions, tools/schema, output, and safety headroom. Measure quality and latency rather than assuming a newer model or larger prompt is better.
- Collect evaluation diagnostics as counts, timings, capability identifiers, and failure categories. Do not export user requests, histories, feedback, or identifiers as telemetry.

**Current integration points**

`Core/Recommendations.swift` owns shared eligibility, style parsing, lexical retrieval and model-input encoding. `Core/RecommendationController.swift` owns generation/submission and snapshot fences. `Core/OnDeviceRecommendationProvider.swift` owns model availability and execution. `Core/RecommendationPromptBudget.swift` owns context sizing. `Core/BeerChoiceContext.swift` and `Core/RecentTastings.swift` own durable history. `UI/RecommendationsScreen.swift` owns preferences, selection and confirmation.

**Release gates**

Every implementation follows red/green/refactor for changed behavior, retains deterministic tests, runs relevant simulator UI flows, and has a documented iOS 26 fallback path. AI quality work also needs actual-model runs; simulator fixtures cannot establish semantic quality. Record SDK, OS, device/model capability, corpus revision, prompt revision and build commit for each comparison. Start rollout behind independent local feature flags, with a working off switch and no destructive database rollback requirement.

Apple's published APIs motivate this roadmap; the architecture, limits and acceptance criteria here are proposed app decisions. SDK spikes must resolve availability and integration details before coding against assumptions. Sources and feature-specific verification questions are included in each plan.
