# Testing

## Native app

Use Xcode 27.1 and an isolated simulator, never a personal device or live account for automated tests:

~~~sh
sh native-ios/ci_scripts/ci_post_clone.sh
BEERSELECTOR_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 18 Pro' sh native-ios/Scripts/run-tests.sh
python3 native-ios/Scripts/test-cloud-configuration.py
~~~

The All plan covers native unit, network, account-safety, persistence, and legacy-upgrade behavior. Performance has its own plan and scheme; see [PHONE-TESTS.md](native-ios/Docs/PHONE-TESTS.md). Legacy schema-v8 fixtures remain in the native suite even though the Expo source is retired.

GitHub Actions runs the native All plan and Cloud configuration tests on the GitHub `xcode-27` runner image (macOS 27) with Xcode 27.1. Main branch protection requires its **Native iOS Tests** job; renaming that job means updating the protection rule in the same change. CI runs the tests serially (`BEERSELECTOR_TEST_PARALLEL=NO`); local runs stay parallel. With two simulator clones sharing the runner's disk, the system throttles the diagnostic journal's utility-priority writes until its tests pass the 60-second allowance, and serial runs are faster anyway (about 7 minutes against 18–20).

All three targets build in Swift 6 language mode. Its runtime isolation checks trap when an SDK calls a main-actor closure off the main thread, and neither the build nor the unit suite catches that (the Live Activity cleanup task is not registered under the test host). After changing a system callback, run the Swift 6 runtime checks under Device checks.

Tests that sign in or out must stub `webCookieCleanup` and `activityCleanup`. The real WebKit cookie store can block indefinitely on CI simulators.

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

Swift 6 runtime checks: record evidence (a breakpoint hit or log line) that each callback ran without an isolation trap.

- Simulator and device: member sign-in and sign-out, visitor mode, account switch during a refresh, web-view sign-in through a redirect, and Untappd sign-in opened, completed, cancelled and dismissed; offline to online; MetricKit delivery (Xcode → Debug → Simulate MetricKit Payloads).
- Device only, because Simulator does not run background tasks. With the debugger paused:
  - Launch: make a Live Activity whose `staleDate` has passed (3 hours after enqueue, or use an uncommitted debug-only shorter interval in `LiveActivityController.swift`). Run `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"org.verily.FSbeerselector.liveactivity.cleanup"]`, resume, and confirm the activity ended.
  - Expiration: simulate the launch with a breakpoint inside the cleanup loop, so the work is still pending. Then run `_simulateExpirationForTaskWithIdentifier:` with the same identifier, resume, and confirm the expiration handler cancelled the task. Expiring after completion tests nothing, because completion clears the handler.
