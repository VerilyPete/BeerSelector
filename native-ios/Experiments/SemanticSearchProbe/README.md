**Isolated semantic-search feasibility probe**

Separate fixture-only application with its own bundle identifier. It reads no real app credentials, taplist, history or feedback. The app target shares the actual `Models.swift` and `SemanticTaplistIndex.swift` sources to test the production word-vector engine. The Core Spotlight harness is a rejected alternative kept for reproducible diagnosis; no Spotlight integration is attached to BeerSelectorNative.

From the repository root:

```sh
xcodegen generate --spec native-ios/Experiments/SemanticSearchProbe/project.yml
open native-ios/Experiments/SemanticSearchProbe/SemanticSearchProbe.xcodeproj
```

Select the probe scheme and an unlocked iOS/iPadOS 27 device. Provisioning uses the existing development team. No audio or VoiceOver is used. Generate/run only the desired test class: the full suite includes deliberately failing capability diagnostics on the tested OS.

- `WordEmbeddingCorpusTests`: actual word-vector engine over the frozen 20-case synthetic corpus, compared with recorded local candidate ordering. This measures candidate recall, not final model selection quality.
- `ScopedSearchProbeTests/testWordEmbeddingCandidateDiscrimination`: positive/negative word-vector contrasts.
- `ScopedSearchProbeTests/testFoundationModelSynonymControl`: structured on-device model semantic control.
- `ScopedSearchProbeTests/testConcurrentProbeGenerationsStayIsolated`: overlapping real Spotlight generations cannot replace or delete each other's items.
- Boundary/lifecycle tests cover foreign/ineligible/retired hydration, deduplication, poisoned indexed attributes and outstanding-write cleanup.
- Spotlight query-matrix and semantic-scope diagnostics currently fail synonym assertions despite working lexical controls. The sentence embedding diagnostic fails because that model is unavailable. These failures must not be relabeled passes or hidden as skips.

Example targeted option for `xcodebuild test`:

```sh
-only-testing:SemanticSearchProbeTests/WordEmbeddingCorpusTests
```

Spotlight index names alone did not isolate records in the real overlap test. All fixture identifiers are now prefixed by a unique namespace, queries validate that prefix before authoritative hydration, and cleanup deletes only owned domains after draining submitted writes. A killed probe can leave public synthetic fixtures; uninstalling this separate app removes its app-owned data. It has no production recovery manifest or model-tool integration. The implemented memory-only vector route requires neither.

See [implementation evidence](../../Docs/AI-IMPROVEMENTS/01-SEMANTIC-SEARCH-IMPLEMENTATION.md) for artifacts and release gates.
