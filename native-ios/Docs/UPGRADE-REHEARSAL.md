# Legacy binary upgrade rehearsal

## Offline preflight — 2026-09-11

The actual legacy **1.1.0 (59)** archive is available under `~/Library/Developer/Xcode/Archives/2026-08-31/` (BeerSelector, 7.04 PM). The native comparison archive is `native-ios/.build/InternalTestFlight/BeerSelectorNative-internal-1.1.0-61.xcarchive`.

Read-only inspection of both app Info.plists and signed entitlements found identical values:

| Property | Both archives |
| --- | --- |
| Bundle identifier | org.verily.FSbeerselector |
| Application identifier | N9F7839KSX.org.verily.FSbeerselector |
| Team | N9F7839KSX |
| Shared app group | group.org.verily.FSbeerselector.shared |
| Minimum iOS | 17.6 |
| Supported platform | iPhoneOS |

Neither inspected app signature declares an explicit keychain-access-groups override. Both local archives have development get-task-allow enabled; exported TestFlight signing is a separate step. These checks support identity continuity but do not establish runtime Keychain or container preservation by themselves.

Both archives are device builds and cannot run in an iOS simulator. The checkout currently has no React Native node_modules, ios/Pods or Podfile.lock, so a simulator rebuild would require reconstructing the legacy dependency environment; it would not be the archived build-59 binary. No rebuilding, re-signing, provisioning changes, installs or live account activity occurred in this preflight.

## Device rehearsal when a spare device is identified

1. Use an explicitly identified spare iPhone/iPad whose BeerSelector installation may be replaced with test data. Do not downgrade the user's signed-in phone or use personal account data.
2. Validate/installability of build 59 for that device. If an export or re-sign is needed, work from an archive copy, retaining its team/application/group identity. Preserve the original archive and symbols. Do not distribute anything externally.
3. Install and run the actual legacy app; establish controlled test-account state. Record its database version, beer/tasting/reward counts, selected settings and pending-operation metadata without recording credentials. Keep submission attempts offline or fixture-controlled; do not create live check-ins as test setup.
4. Terminate the legacy app and install a reviewed native build **over it without uninstalling**. An uninstall would invalidate this preservation check.
5. Start native offline first. Verify account identity and cached data/settings/pending operations, then relaunch to check persistence. Existing signed-out/visitor behavior should remain consistent. Network refresh should be a separate later step so it cannot hide a migration failure by repopulating data.
6. Save version/build and pass/fail evidence. Compare against the 74-test synthetic-schema suite. A simulator fixture check, archive entitlement match or previously confirmed native login is not a substitute for this old-binary-to-native run.

No rehearsal device has been selected and no real binary upgrade is claimed. Automated complete-v8 schema and Expo Keychain-format checks are already green; this is the remaining installation-level evidence.

## Actual iPad run — 2026-09-11 (in progress)

The user supplied iPPPPPPad with legacy 1.1.0 (50), schema 7. Documents/Library backup succeeded; the full root copy was denied for iOS-protected metadata. The database passed integrity checks and held 195 beers, 175 tastings, 13 rewards and no pending operations. Build 61 was installed over it without uninstalling; a before-first-launch copy matched every legacy table. Keychain was not backed up.

First launch required user developer-profile verification. The subsequent successful launch recorded a successful refresh, yielding 188 beers/12 tastings/14 rewards and advanced refresh timestamps. It cannot be called an offline cache-preservation check. A no-network native database probe on a disposable copy of the original real database passed all original-column comparisons, integrity and expected plaintext-cookie purge (1/1, /private/tmp/BeerSelectorNative-ipad-local-upgrade-probe.log). No personal database was added to the repository. Existing-account UI confirmation and a controlled offline relaunch remain pending.

## Completed result — 2026-09-11

User confirmed the original account and tasted/reward data appeared without logging in again, with Wi-Fi off. Native build 61 then relaunched successfully; all six tables match the post-first-launch snapshot exactly (188 beers, 12 tastings, 14 rewards, zero operations, unchanged preferences and schema history), integrity OK. Evidence: /private/tmp/BeerSelectorNative-ipad-relaunch-result.json and BeerSelectorNative-ipad-offline-relaunch.json.

The first launch did record successful refresh work; that numeric journal does not identify live versus cached responses or prove Wi-Fi was enabled. Do not contradict the user's Wi-Fi-off confirmation. Initial container preservation and the separate no-network probe of the real original database establish migration preservation despite first-launch refresh changes. Account continuity is user-confirmed, not a raw Keychain export comparison.

The basic actual build-50-to-native-61 upgrade rehearsal is complete. No uninstall, live check-in, phone modification or TestFlight distribution change occurred. Original private backup remains available; it excludes Keychain. Physical Live Activity behavior and actual crash delivery remain separate checks.

## Compatibility follow-up — 2026-09-11

The actual build-50-to-native-61 rehearsal above remains complete; it was not repeated or invalidated by later chronological checkpoint notes.

Current source passed **104/104 correctness tests**, including a new combined legacy migration test with six variants: all three Expo Keychain services, each with separate legacy session storage or committed-generation session storage, multi-chunk Unicode cookies and a full schema-v8 database. The model restores account/cache/settings/operations without network refresh, rotates credentials through one fixture auto-login, and restores the renewed credentials alongside unchanged caches after reopening. Credential clearing also removes the legacy-format keys. Existing rollback, malformed-generation, schema-failure and account-cleanup tests remain green.

New cancellation fixtures verify that cancelling a suspended dashboard login preserves the previous account and that cancelling a login waiting for logout cleanup cannot commit. Five red regressions reproduced old reward/delete completions changing new-account feedback/refreshes and an old queue request preventing a new login's queue load. Account epoch checks and queue-request ownership now prevent those outcomes. The account fixture injects Live Activity updates so a nonempty queue cannot start real OS work in the test host. Initial full-suite attempts exposed that fixture leak as a BGTaskScheduler unregistered-task assertion; the final isolated run has zero failures. These tests do not establish physical Live Activity behavior.

Final suite: `/private/tmp/BeerSelectorNative-compatibility-final.log`. Final signed Release device SDK build: `/private/tmp/BeerSelectorNative-compatibility-device-final.log`. Signature comparison evidence: `/private/tmp/BeerSelectorNative-compatibility-signing.json`; legacy build 59 and current native build 61 share bundle/team/application IDs, app group, Keychain-group configuration and minimum OS, with valid signatures. This is identity/build evidence, not a new installation rehearsal or minimum-OS runtime test. No reinstall, uninstall, upload, provisioning change or build-number change occurred.
