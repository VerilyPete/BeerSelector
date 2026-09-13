# Repository guidance

Beer Selector is a native SwiftUI iPhone/iPad app. The active Xcode project is native-ios/BeerSelectorNative.xcodeproj; minimum iOS is 17.6. Read README.md, TESTING.md, UI.md, and native-ios/Docs/WORK-CHECKPOINT.md before changes.

The app uses SwiftUI, SQLite, Keychain, URLSession, and ActivityKit. Keep account-switch, logout, and asynchronous completion guards intact. Preserve the legacy schema-v8 upgrade fixtures and stable bundle/app-group identities.

Beerfinder is the set difference of the current taplist and tasted beer IDs. Visitor mode permits taplist browsing without member-only queue, tasted beer, or rewards actions. Enrichment is global by beer ID; taplist membership and added dates are location-specific.

Root TypeScript files are a compatibility package consumed by the separate ufobeer backend, not an app runtime. Do not remove its three exported files or package manifest without coordinating that backend's contract workflow.

Use isolated simulator fixtures for automation. Never commit Resources/ServiceConfiguration.plist, credentials, personal databases, crash reports, or distribution artifacts. Do not reintroduce Expo, React, CocoaPods, or npm app build instructions.

Historical Expo implementation and documentation can be inspected with git show daa5456e:<path>. Native migration and release evidence remains under native-ios/Docs.
