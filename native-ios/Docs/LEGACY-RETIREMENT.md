# Legacy app retirement

The native cutover merged through PR #27 at daa5456e. That commit retains the complete Expo app and its documentation for historical inspection. Use git show daa5456e:<path> or an isolated worktree to inspect it; do not restore it over a current native workspace.

## Removed

React/Expo screens, components, hooks, services, mocks, old tests, Android project, generated Expo iOS/CocoaPods project, Expo Live Activity bridge, legacy assets, Maestro/Flashlight flows, Node debug scripts, Jest/ESLint/Husky configuration, obsolete plans and logs, and React-specific agent guidance.

Only tracked legacy files were removed. Ignored credentials, local build archives, crash evidence, and personal data were not deleted. Git history was not rewritten. The existing native-ios path and Xcode Cloud project configuration are unchanged.

## Retained intentionally

- All native app and widget code, bundled fonts/assets, native test plans, and schema-v8 upgrade fixtures.
- Native migration/parity/crash/device evidence, including historical references to old paths. Interpret those paths at the commit recorded in the document.
- The legacy dotenv importer for existing private configuration.
- A minimal Node package containing Zod, TypeScript, Vitest, and the consumer contract tests. ufobeer's contract-test/goldenTaproom.contract.test.ts and its CI import src/contracts/enrichment.ts, src/contracts/enrichmentAdapter.ts, and src/types/beer.ts from this repository. Removing these now would break backend validation.
- Generic developer launchers and local tool configuration.

## CI transition

GitHub's required Jest Unit Tests context now runs the native All plan plus Cloud configuration tests. The name temporarily preserves existing branch protection; no Jest or React runtime is installed. Rename the check and GitHub protection together after remote validation. The new native job covers every PR branch, unlike the migration-scoped Native Correctness Cloud workflow.

The Golden Taproom workflow continues backend/legacy-consumer compatibility testing. Swift NetworkTests validate the native client separately; these are not equivalent end-to-end contract suites.

Xcode 26.3 is selected explicitly from the [GitHub macOS 26 runner image](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md).

To eliminate Node entirely, first move or replace the consumer-contract fixtures and imports in ufobeer, update both repositories' contract workflows, and verify the backend contract suite. Then remove the root compatibility package in a coordinated follow-up.

No backend code, branch protection, remote workflow settings, or distribution configuration was changed by this cleanup.

## Local validation

A fresh exported checkout with test-only configuration passed all 120 native tests, with no skips. The retained package passed 15 tests and TypeScript checking. An exported ufobeer origin/main passed its contract typecheck and all 15 worker/consumer tests against the reduced package. Cloud configuration tests (3), actionlint, and whitespace checks passed. The replacement GitHub native workflow still needs its first remote run.
