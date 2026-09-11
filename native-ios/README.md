# Native iOS migration

SwiftUI app and ActivityKit widget targeting iOS 17.6, iPhone and iPad. Work is in progress; see [the parity ledger](Docs/PARITY.md) and [the checkpoint](Docs/WORK-CHECKPOINT.md) for remaining verification.

Run these commands from the `BeerSelector-native` repository root with Xcode and XcodeGen installed.

## Configuration and project generation

The configuration importer copies supported app configuration only and does not print values. Its output is ignored by Git. Choose the environment explicitly; omit the import to use the direct upstream API without enrichment.

```sh
python3 native-ios/Scripts/import-configuration.py ../BeerSelector/.env.production
xcodegen generate --spec native-ios/project.yml
```

Regenerate after adding source or resource files. Fonts, icons, and optional service configuration are included through the `Resources` source entry with `buildPhase: resources`.

## Build and test

See [the test strategy and Xcode Cloud setup](Docs/TESTING.md) for the Unit, Integration and All plans, isolated fixtures, parallel runs, and mutation probes.

Use an available simulator ID from `xcrun simctl list devices available` if the one below differs on your machine. Simulator tests need ad hoc signing for Keychain access; `CODE_SIGNING_ALLOWED=NO` produces Keychain error -34018.

```sh
xcodebuild -project native-ios/BeerSelectorNative.xcodeproj \
  -scheme BeerSelectorNative \
  -destination 'platform=iOS Simulator,id=3A8B89DC-35F0-4FCB-886B-448EA2B961AA' \
  -parallel-testing-enabled NO \
  -derivedDataPath /private/tmp/BeerSelectorNative-build \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES test

xcodebuild -project native-ios/BeerSelectorNative.xcodeproj \
  -scheme BeerSelectorNative -sdk iphoneos -configuration Debug \
  -derivedDataPath /private/tmp/BeerSelectorNative-device \
  CODE_SIGNING_ALLOWED=NO build
```

The device SDK command checks compilation without provisioning. Signed in-place upgrade and physical-device tests are separate release gates.

## Design

The chrome is a required part of the design. [Chrome specifications](Docs/CHROME.md) map the saved Pen material values to the shared SwiftUI components.

## Offline visual fixtures

After installing the Debug simulator build, launch with isolated sample data:

```sh
xcrun simctl launch --terminate-running-process booted \
  org.verily.FSbeerselector --preview-fixtures --preview-screen rewards
```

Supported screens: `home`, `beers`, `finder`, `tasted`, `rewards`, `settings`. Add `--preview-expanded` to inspect the first beer’s action buttons. This mode uses a separate temporary database, bypasses saved credentials, and disables API mutations and refreshes. Screenshots under `Docs/Screenshots` contain fixture data; they do not verify live account behavior. Developer tools also expose the fixture session in Debug builds.

Keep the existing app installed when testing migration. The native app retains the App Store bundle identifier and opens `Documents/SQLite/beers.db` in place. Live-account verification requires interactive sign-in, followed by separately authorized check-in, deletion, and reward tests.
