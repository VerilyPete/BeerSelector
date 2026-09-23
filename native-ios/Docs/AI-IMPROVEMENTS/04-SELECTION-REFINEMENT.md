**Plan 4 — Refine an existing selection**

Status: draft; fourth implementation feature. Uses Plan 2 evaluation gates and the retrieval/context boundaries from Plans 1 and 3. Follow the [shared compatibility contract](README.md).

**Outcome**

After receiving suggestions, a user can keep a beer and ask for different remaining options: “Less bitter,” “More adventurous,” or “Keep this one; replace the others.” Pinning a suggestion is separate from liking it or selecting it for queue submission. Nothing is added to the queue until the existing explicit selection and confirmation flow succeeds.

Apple's dynamic profiles support changing session instructions, tools and configuration while retaining a continuing session. We will assess that API for the iOS 27 implementation, while keeping refinement state owned by the application. [Apple: Dynamic profiles in Foundation Models](https://developer.apple.com/videos/play/wwdc2026/241/)

**Interaction design**

Add a small Keep action on each unsubmitted card and a Refine area below the preferences. Tapping a refinement chip or editing text updates draft preferences only; the explicit Update suggestions action begins inference. Show which cards are kept and how many will be replaced. “Keep” must not create a persistent positive rating or a queue selection.

If all three slots are kept, disable replacement generation and explain that a card must be released first. If fewer than three eligible beers exist, allow a smaller result set. Keep the ordinary draft/bottle and ABV controls available. If a changed hard preference conflicts with a kept beer, show the conflict and require the user to release it or change the preference; do not silently relax the filter.

A kept beer that becomes unavailable, queued, recently tasted or disliked cannot remain an actionable recommendation. Mark it unavailable and let the user remove it. Preserve actual prior submission receipts, but do not make a submitted beer eligible for a new submission. Changing replacements clears queue selections for replaced cards; an unchanged kept card may retain an explicit selection, subject to fresh validation and confirmation.

**State and generation contract**

Introduce application-owned `RefinementState`: account epoch, source revision, base request/preferences, bounded current refinement text, kept IDs, previous candidate IDs, generation token and published-result provenance. Avoid an unbounded transcript as the source of truth. Cancel or reset state on account/store change, history/feedback clearing, session dismissal and incompatible source changes.

Compute the desired replacement count from available slots. Extend the rank contract and response validation to accept an explicit count from one through three instead of always requiring three. Never ask the model to return kept IDs. Hydrate and revalidate kept beers separately, exclude them from retrieval, validate exactly the required number of distinct replacement IDs, then merge without duplicates. If fewer eligible replacements exist, adjust the expected count before inference and explain the smaller result.

Treat soft preferences such as “less bitter” as request refinements. Without authoritative bitterness metadata, do not manufacture IBU values or claim an exact bitterness reduction. Use available descriptions and styles as evidence and disclose when the request cannot be interpreted. Model-authored conversational text must not replace our validated beer facts or submission receipts.

**Two compatible AI implementations**

On iOS 27, evaluate dynamic profiles for the stages “find candidates” and “refine remaining slots,” exposing only read-only retrieval and bounded context. The application selects the active profile; a model cannot switch into a write-capable mode. Verify transcript/context replacement semantics, cancellation and model availability in the SDK spike. Discard or rebuild a session when its source/account revision changes, even if profile switching could technically preserve it.

On iOS 26, reconstruct a bounded structured prompt from the same `RefinementState` for each explicit update. Include the kept beers, current request and replacement count without requiring dynamic profiles. Use the existing on-device provider and local fallback. Product semantics and eligibility must be identical across these paths; the newer session API is an implementation optimization, not a reason to omit refinement from iOS 26.

Set a bounded conversation policy from the start: retain the current structured preferences and at most the last two relevant refinement exchanges, then rebuild from application state. Plan 3 counts all retained context. Keep the same cancellable generation target rather than letting successive profile/tool calls extend it indefinitely.

**Choice history and submission**

A published refinement creates a new immutable presentation using the current live taplist; an optional parent-presentation ID can express lineage if needed. It initially remains an unused presentation. Do not convert pinned cards, generated replacements or rejected alternatives into likes/dislikes or confirmed tastings. Actual queue selections and acknowledgements use the correct new presentation ID. The independent choice-retention quotas remain unchanged. Existing operation persistence, account checks and ambiguous-delivery review rules own all writes.

**Implementation sequence**

1. Add the pure refinement state machine and parameterized replacement-count validation, with failing tests for duplicate/kept/stale IDs.
2. Implement the UI and the iOS 26 fresh-prompt path first. Prove explicit-action behavior and unchanged queue confirmation.
3. Add the iOS 27 profile adapter behind capability checks; test behavior equivalence with the legacy path.
4. Integrate bounded transcript/context management and presentation lineage if required.
5. Evaluate request satisfaction over multiple turns, device latency and fallback behavior before enabling the feature.

**Acceptance**

Test keeping zero/one/two/three beers; changing filters; only one eligible replacement; expired availability; feedback/account changes mid-refinement; late model completion; model unavailable after a successful first turn; repeated IDs; invalid counts; and a partial prior queue submission. Kept IDs must remain stable when still eligible, and no refinement action may invoke the queue endpoint.

Simulator UI tests verify Keep versus Select, editable chips, Update suggestions, unavailable pins, unchanged receipts and final confirmation. Actual-model evaluation compares multi-turn request satisfaction and latency on iOS 26 and iOS 27 using the same scenarios. A disabled profile adapter must fall back to fresh-prompt refinement; disabling refinement entirely must leave ordinary suggestions usable and durable feedback untouched.
