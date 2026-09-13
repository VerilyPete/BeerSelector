# Native external TestFlight workflow

Created September 12, 2026 in Xcode Cloud for FSBeerSelector (App Store Connect app 6744178536). Xcode crashed after saving; reopening Manage Workflows confirmed that **Native External Beta** persisted. No build was started or app uploaded during setup.

## Saved configuration

- Repository: `VerilyPete/BeerSelector`; project: `native-ios/BeerSelectorNative.xcodeproj`.
- Branch Changes: exact branch `main`, any file change, auto-cancel older builds enabled. This also triggers on direct pushes to main; PR-only enforcement belongs in GitHub branch rules.
- Xcode: pinned `26.3 (17C529)`; macOS: Latest Release. Clean builds enabled, independently verified in the saved App Store Connect workflow (Clean checkbox value 1).
- Test: `BeerSelectorNative` scheme, explicit `All` plan, iPhone 17 Pro, latest simulator from selected Xcode; Required To Pass.
- Archive: `BeerSelectorNative` scheme, Release configuration, App Store Connect distribution preparation.
- Post-action: TestFlight External Testing, Archive - iOS artifact, existing **Beta testers** group (six members at setup).
- Editing restricted to Admins/App Managers, as required by Xcode for external deployment.
- Workflow variable: `BEERSELECTOR_DISTRIBUTION=external`.
- Product-wide next Cloud build number changed from **24 to 62**, verified in App Store Connect. Other workflows share this counter, so the first external build may be greater than 62.

## Remaining setup before the first merge/build

The user explicitly approved copying EnrichmentKey and EnrichmentURL into this workflow's redacted `BEERSELECTOR_SERVICE_CONFIGURATION_BASE64` secret, resolving the earlier approval-review blocker. After browser automation failed to persist the entry, the user saved it manually. Reloading the workflow from App Store Connect confirmed the variable is present with a masked value and Save disabled (no unsaved changes). Credential contents were not displayed. Runtime consumption remains to be verified by the first build.

The post-clone hook now requires valid configuration when distribution mode is external; it fails before building if the secret is absent or malformed. Test-only workflows retain their empty-resource behavior. The helper validates HTTPS and a nonempty enrichment key without logging values. Local verification: `python3 native-ios/Scripts/test-cloud-configuration.py` (three tests, including invalid-input subcases) passed.

These hook changes and the native rewrite must reach main together. Cached main does not yet contain the native project. Do not manually run the workflow on the existing Expo main branch. The local internal-only export plist is unrelated to Cloud’s App Store Connect archive preparation.

Apple documents clean builds as required for external TestFlight distribution. Although the Xcode editor did not expose the control, the saved App Store Connect workflow confirms Clean is enabled.

External availability remains subject to processing and any required TestFlight Beta App Review. A saved workflow is not evidence of a successful native archive or external delivery. Live Activity expiry remains pending the user's separate hands-on check.

References: [TestFlight distribution](https://developer.apple.com/documentation/xcode/distributing-your-xcode-cloud-builds-through-testflight), [workflow reference](https://developer.apple.com/documentation/xcode/xcode-cloud-workflow-reference), [Cloud build numbering](https://developer.apple.com/documentation/xcode/setting-the-next-build-number-for-xcode-cloud-builds/).
