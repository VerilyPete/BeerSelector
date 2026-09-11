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
