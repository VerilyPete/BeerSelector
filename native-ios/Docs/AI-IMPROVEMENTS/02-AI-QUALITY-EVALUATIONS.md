**Plan 2 — Measure actual recommendation quality**

Status: draft; second implementation feature. Builds on Plan 1's small comparison corpus. Follow the [shared compatibility contract](README.md).

**Outcome**

Before changing prompts, models, retrieval, or context limits, we can answer: did relevant beers reach the model, did the model choose good matches, did application validation reject bad output, and did users receive results promptly? The current deterministic tests remain essential, but do not establish actual-model recommendation quality.

Apple introduces Evaluations as a Swift framework for measuring AI-feature quality across repeated behavior. We will verify its supported execution environments and APIs in an SDK spike, then use it as evaluation infrastructure rather than an application runtime dependency. [Apple: Meet the Evaluations framework](https://developer.apple.com/videos/play/wwdc2026/298/)

**Corpus and expected results**

Create versioned synthetic or deliberately curated fixtures: live-taplist snapshots, up to 100 confirmed tastings, durable ratings, bounded choice cohorts, request/preferences, and expected eligible IDs. Do not harvest real member history automatically. Store allowed answer sets and ranked relevance judgments rather than requiring one arbitrary exact ordering where several beers are equally good.

Cover exact styles/substyles, synonyms, negation, named-beer comparisons, contradictory/empty requests, sparse metadata, absent ABVs, strong history affinity conflicting with today's mood, packaging repeats, multiple accounts/stores, rollover, cold start, durable feedback outside history, and unconfirmed queue intent. Include adversarial instruction-like descriptions/requests. Introduce a separate held-out corpus so prompt changes are not judged only on examples used to tune them.

Start with at least 50 scenarios and ten repeated actual-model runs per scenario for a release comparison; use a smaller deterministic smoke subset during development. These are initial proposed sizes, not claims of statistical sufficiency. Report uncertainty and expand runs when differences are small.

**Harness design and compatibility**

Extract a platform-neutral evaluation input/output format that records retrieval candidates, raw model IDs, validated choices, provider/fallback category and stage timings. Run the production retrieval, prompt builder and output validator, not a reimplementation. Inject fresh snapshots and read-only fake services so no evaluation can submit to Flying Saucer.

Use an Xcode 27 evaluation target or host tool once SDK support is verified. Keep new framework imports out of the shipping iOS 26 application path. For iOS 26, execute the existing provider on an actual compatible device and export synthetic-run results into the same result format; score them using the newer host tooling or a portable scorer. Replay-only scoring is useful but must be labeled separately from actual inference. Record toolchain, OS, hardware, model capabilities/context size, prompt/corpus revisions and commit. Compare like-for-like hardware when possible and disclose platform/device differences.

**Scoring and gates**

Measure retrieval coverage of the curated relevant set, request satisfaction, diversity where requested, and reasons supported by app facts. Score hard exclusions separately: surfaced results must never violate account, availability, feedback, repeat or explicit filter rules. Record invalid raw model output even when the application correctly rejects it; a safe fallback can still signal a quality regression.

Track completion rate, invalid-output rate, fallback reasons, p50/p95 generation latency and timeout frequency. Include cold/warm model and index conditions. Keep source-refresh network time separate from the inference budget. Maintain the current eight-second generation target initially; a slower feature must demonstrate enough benefit to justify an explicit product decision.

Use deterministic eligibility checks as the primary safety oracle and curated human judgments for relevance. An optional model-based judge is secondary evidence and must be calibrated against those judgments. Predeclare release thresholds after measuring the baseline; do not lower thresholds simply to pass a candidate. Require zero surfaced hard-rule violations, no exact-style regression, and a repeatable improvement on the feature's designated quality cases.

**Implementation sequence**

1. Version Plan 1 fixtures and define the result/scoring schema; write failing scorer tests using known good and bad outputs.
2. Add an injectable production-pipeline runner and prove that queue/network-write APIs are unreachable.
3. Integrate the verified Evaluations APIs in a separate target; preserve an iOS 26 capture lane.
4. Produce baseline reports for iOS 26 and iOS 27 capability paths, with repeated runs and held-out cases.
5. Add a small deterministic CI gate and a documented actual-device evaluation job. Store sanitized artifacts and flag regressions for review rather than treating flaky model output as a conventional unit-test retry.

**Acceptance and rollback**

The harness must detect seeded failures such as removing the only relevant stout before inference, inventing an ID, selecting a disliked package variant, ignoring an explicit style, and accepting a late result after account change. It must distinguish model errors from index failures, missing metadata and application validation. Reports must be reproducible from the recorded build and fixtures and contain no user account data.

Done means both supported AI paths have measured baselines, changes can be compared fairly, hard-rule violations fail the release gate, and Plans 3–4 can consume the same runner. Removing or disabling the evaluation target must not change shipping behavior.
