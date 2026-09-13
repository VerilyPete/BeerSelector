# Testing

## Native app

Use Xcode 26.3 and an isolated simulator, never a personal device or live account for automated tests:

~~~sh
sh native-ios/ci_scripts/ci_post_clone.sh
BEERSELECTOR_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 17 Pro' sh native-ios/Scripts/run-tests.sh
python3 native-ios/Scripts/test-cloud-configuration.py
~~~

The All plan covers native unit, network, account-safety, persistence, and legacy-upgrade behavior. Performance has its own plan and scheme; see [PHONE-TESTS.md](native-ios/Docs/PHONE-TESTS.md). Legacy schema-v8 fixtures remain in the native suite even though the Expo source is retired.

GitHub Actions runs the native All plan and Cloud configuration tests on macOS with Xcode 26.3. Its required job retains the name **Jest Unit Tests** solely because main branch protection requires that exact GitHub Actions context. It executes Swift/Python, not Jest. Rename the job and protection together in a separate change after the replacement has passed remotely. No protection was weakened by this cleanup.

Xcode Cloud's Native External Beta workflow tests and archives main changes for external TestFlight distribution. The older Native Correctness workflow is scoped to the migration branch; GitHub's native PR job covers cleanup and future branches.

## Backend contract compatibility

~~~sh
npm ci
npm test
npm run typecheck
~~~

These commands validate only the retained enrichment contracts. Golden Taproom Contract additionally checks out ufobeer and tests the real worker against the legacy consumer contract. This is backend compatibility coverage; it does not execute the Swift client. Native NetworkTests cover Swift decoding and request behavior.

## Device checks

See [DEVICE-ACCESSIBILITY-CHECKS.md](native-ios/Docs/DEVICE-ACCESSIBILITY-CHECKS.md) for evidence and remaining hands-on work. Simulator tests do not establish physical Live Activity expiry or spoken VoiceOver behavior. Retired Maestro flows targeted the old React UI and are available in Git at daa5456e.
