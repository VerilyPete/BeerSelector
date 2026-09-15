**Plan 3 — Adapt context to the available on-device model**

Status: draft; third implementation feature. Depends on Plan 2's quality/latency baseline and uses Plan 1's retrieval interface. Follow the [shared compatibility contract](README.md).

**Outcome**

Use available capacity to give the model better beer evidence or a broader candidate set while retaining the last 100 tasting observations. Devices with less capacity keep compact input and a useful fallback. Increasing input size is an experiment to evaluate, not automatically an improvement.

Apple recommends inspecting model context capacity and token counts rather than assuming one size for all hardware; these inspection APIs originated in iOS 26.4. iOS 27 also introduces a revised on-device model. Our provider already uses inspection when its compiler/runtime path supports it, so this feature extends the app's allocation policy rather than merely adding those existing calls. [Apple: Foundation Models updates](https://developer.apple.com/videos/play/wwdc2026/241/)

**Budget contract**

Introduce an immutable `ModelCapabilities` snapshot and a pure `RecommendationContextPlanner`, both independent of SDK-specific types. The model adapter supplies capability data and token-count operations. The planner returns a payload plus an accounting report: mandatory input, optional evidence, tool/schema cost, response reserve and headroom.

Mandatory content includes the current request and hard preferences, stable candidate IDs/basic facts, effective explicit ratings for each candidate, and one observation for each of the available last 100 tastings. Do not reduce the tasting count to make more room. Preserve clear distinctions among confirmed tasting, explicit feedback and weaker choice intent. Never silently truncate a request into a different meaning.

Optional additions compete for remaining capacity: matched description excerpts, brewery/name detail omitted by lean input, additional eligible candidates, bounded global feedback summaries and up to four useful choice examples. Prioritize evidence needed for the current request. Keep durable source records unchanged. Include system instructions, generated schema, search tools/tool results and any refinement context in the accounting; avoid counting only the JSON body.

**Candidate allocation and execution**

Benchmark the current 12-candidate path against bounded larger pools, initially 18 and 24. These are experiment settings; choose the smallest size that measurably improves relevant-candidate coverage and final quality without violating the latency target. The retriever must provide enough distinct eligible candidates for each tested size, and the final validator must use the exact IDs sent to that generation.

Build payload tiers from a shared evidence model, then count the actual proposed payload. Add detail in bounded steps rather than trying an unbounded collection of combinations. Cache only stable instruction/schema counts keyed by model/capability and prompt/schema revision. Requests, feedback, availability, tool output and conversation changes must invalidate their own counts. Avoid reusing counts across an OS/model update without validation.

Retain output reserves and measured headroom. On a context-limit error, permit at most one smaller fresh-session retry within the original remaining deadline; otherwise use local matching. Never restart the timer for a retry. Cancellation and stale-snapshot guards remain effective during token counting and serialization as well as generation.

**iOS 26 path**

Keep the existing conservative byte-budget fallback when token introspection cannot be compiled or is unavailable at runtime. iOS 26.4+ devices may benefit from verified introspection without needing iOS 27-only session APIs. The iOS 26.0–26.3 path retains its established compact/lean behavior and all 100 observations. New capability fields default conservatively; no assumed 8K or larger capacity based solely on the OS version.

**Implementation sequence**

1. Extract capabilities and pure accounting from the provider; preserve current outputs in equivalence tests.
2. Consolidate full/compact/lean source evidence so all tiers consistently preserve requests, ratings, metadata provenance and observation counts.
3. Implement bounded allocation and measured candidate-size experiments. Track stage timing and peak payload size with synthetic data.
4. Connect actual token counting and cache invalidation, then bounded downgrade/retry behavior.
5. Use Plan 2 to select defaults for each capability class and ship behind an independent switch.

**Red/green and acceptance**

Test exact budget boundaries, tool/schema overhead, 100 observations with long/Unicode metadata, fewer-than-100 histories, unknown ABVs, long user requests, feedback outside the rolling history, optional-evidence omission, model/context changes, and cancellation during counting. Verify the IDs validated are exactly the ones encoded, including pools larger than 12. Malformed or repeated output IDs must still fail validation.

Use actual iOS 26 and iOS 27 devices for capacity/quality/latency comparisons. Require all mandatory inputs to survive each tier and all surfaced results to pass hard eligibility. A larger candidate setting is accepted only when the evaluation report justifies its cost. Turning the feature off must restore the existing fixed-tier planner without deleting user data or changing queue behavior.
