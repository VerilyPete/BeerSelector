# Beer Selector

Native SwiftUI app for the Flying Saucer UFO Club, supporting iPhone and iPad on iOS 17.6 or later.

## Build

Open [BeerSelectorNative.xcodeproj](native-ios/BeerSelectorNative.xcodeproj) in Xcode 26.3. Select the BeerSelectorNative scheme and an iPhone or iPad simulator. The committed project is ready to use; XcodeGen is only needed when changing project structure.

For a checkout without private service settings, run:

~~~sh
sh native-ios/ci_scripts/ci_post_clone.sh
open native-ios/BeerSelectorNative.xcodeproj
~~~

The hook creates an empty ignored resource for local tests. For enrichment, create native-ios/Resources/ServiceConfiguration.plist with string keys EnrichmentURL (HTTPS) and EnrichmentKey. Keep credentials out of Git. Existing installations can use the legacy dotenv importer in native-ios/Scripts/import-configuration.py.

The app requires no npm install, Expo, Metro, CocoaPods, or React Native tooling.

## Development

- [Testing](TESTING.md)
- [UI conventions](UI.md)
- [Latest checkpoint](native-ios/Docs/WORK-CHECKPOINT.md)
- [External TestFlight workflow](native-ios/Docs/EXTERNAL-TESTFLIGHT-CLOUD.md)
- [Device checks](native-ios/Docs/DEVICE-ACCESSIBILITY-CHECKS.md)
- [Legacy retirement and retained contracts](native-ios/Docs/LEGACY-RETIREMENT.md)

App code, resources, tests, widget, scripts, and distribution configuration live in native-ios/. The Cloudflare enrichment service lives in the separate VerilyPete/ufobeer repository.

## Contract compatibility package

The small root Node package exists only because ufobeer's contract tests import src/contracts/enrichment.ts, src/contracts/enrichmentAdapter.ts, and src/types/beer.ts from this repository. It is not linked into the native app. Use the Node version in .nvmrc, then npm ci, npm test, and npm run typecheck to validate it.

The retired Expo app, Android project, and development tooling remain available in Git at daa5456e (the native cutover merge).
