# Expo SDK 54 Migration Plan

## BeerSelector App Migration: SDK 52 to SDK 54

**Created:** December 4, 2025
**Last Updated:** December 5, 2025
**Current SDK Version:** 53.0.24 (Phase 1 complete, stabilizing)
**Target SDK Version:** 54.x.x

> **Important:** Expo recommends upgrading SDK versions incrementally, one at a time. This plan is structured as **two separate migrations** - complete SDK 53 fully before starting SDK 54. Do not rush through both in a single session.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Prerequisites](#prerequisites)
3. [Breaking Changes Overview](#breaking-changes-overview)
4. [Phase 1: SDK 52 to SDK 53](#phase-1-sdk-52-to-sdk-53)
5. [Phase 2: SDK 53 to SDK 54](#phase-2-sdk-53-to-sdk-54)
6. [AppDelegate Swift Migration](#appdelegate-swift-migration)
7. [Live Activity Module Updates](#live-activity-module-updates)
8. [Dependency Updates](#dependency-updates)
9. [Testing Checklist](#testing-checklist)
10. [Rollback Plan](#rollback-plan)
11. [Post-Migration Verification](#post-migration-verification)

---

## Executive Summary

This migration involves significant changes:

| Change                 | SDK 53            | SDK 54                      |
| ---------------------- | ----------------- | --------------------------- |
| React Native           | 0.76.9 -> 0.79.0  | 0.79.0 -> 0.81.0            |
| React                  | 18.3.1 -> 19.0.0  | 19.0.0 -> 19.1.0            |
| Xcode Minimum          | 16.0              | 16.1 (Xcode 26 recommended) |
| AppDelegate            | **ObjC -> Swift** | Swift (already migrated)    |
| New Architecture       | Default enabled   | Required (legacy frozen)    |
| Edge-to-Edge (Android) | Opt-in            | Mandatory                   |

### Critical Changes for BeerSelector

1. **AppDelegate Migration (SDK 53)**: Must convert `AppDelegate.mm` (Objective-C) to `AppDelegate.swift`
2. **Live Activity Module**: May need updates for new Expo Modules API
3. **Jest Setup**: Deep imports from `react-native/Libraries/` are deprecated in RN 0.80
4. **expo-file-system**: API changes in SDK 54 (new API is now default)

---

## Prerequisites

### Before Starting Migration

- [x] **Node.js**: Ensure Node 20.19.4+ is installed (Node 18 EOL as of April 2025)
- [ ] **Xcode**: Update to Xcode 16.1+ (Xcode 26 recommended for SDK 54)
- [x] **Backup**: Create a git branch or tag for the current stable state
- [x] **Clean State**: Ensure all tests pass on current SDK 52

```bash
# Verify Node version
node --version  # Should be >= 20.19.4

# Create backup branch (COMPLETED)
git checkout -b backup/pre-sdk53-migration
git push origin backup/pre-sdk53-migration

# Create migration branch (COMPLETED)
git checkout -b migration/sdk-53
```

### Recommended Approach

Given the significant changes, this plan uses a **sequential migration**:

1. **SDK 52 -> SDK 53** (includes AppDelegate Swift migration)
   - Complete all Phase 1 steps
   - Run full test suite
   - Deploy to TestFlight and verify stability
   - **Only proceed to Phase 2 after SDK 53 is stable**

2. **SDK 53 -> SDK 54** (after stabilizing SDK 53)
   - Complete all Phase 2 steps
   - Run full test suite
   - Deploy to TestFlight and verify stability

**Do not attempt both migrations in a single session.** Allow at least a few days between phases to catch any subtle issues.

---

## Breaking Changes Overview

### SDK 53 Breaking Changes (React Native 0.79, React 19)

| Change                              | Impact on BeerSelector                   | Action Required                                           |
| ----------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| AppDelegate moves to Swift          | **HIGH** - Must migrate `AppDelegate.mm` | See [AppDelegate Migration](#appdelegate-swift-migration) |
| New Architecture default            | LOW - Already enabled in `app.json`      | None                                                      |
| React 19 changes                    | MEDIUM - Check component compatibility   | Review hooks usage                                        |
| Metro respects package.json exports | LOW                                      | Verify module resolution                                  |
| expo-av deprecated                  | NONE - Not used                          | None                                                      |
| Edge-to-edge Android (opt-in)       | LOW                                      | Consider enabling                                         |

### SDK 54 Breaking Changes (React Native 0.81, React 19.1)

| Change                       | Impact on BeerSelector                                | Action Required                 |
| ---------------------------- | ----------------------------------------------------- | ------------------------------- |
| Android 16 targeting         | MEDIUM - Edge-to-edge mandatory                       | Test Android UI                 |
| SafeAreaView removed from RN | NONE - Already using `react-native-safe-area-context` | None                            |
| expo-file-system API change  | LOW - Using via config only                           | Update imports if used directly |
| JSC engine removed           | NONE - Using Hermes                                   | None                            |
| Deep imports deprecated      | **HIGH** - `jest.setup.js` uses deep imports          | Update test mocks               |
| Precompiled XCFrameworks     | LOW - Build time improvement                          | None                            |

---

## Phase 1: SDK 52 to SDK 53

### Progress Status (Updated: December 5, 2025)

| Step                        | Status       | Notes                                                                  |
| --------------------------- | ------------ | ---------------------------------------------------------------------- |
| 1.0 Cleanup Dependencies    | ✅ COMPLETED | Removed `react-native-live-activities`, updated `react-native-webview` |
| 1.1 Update Expo SDK         | ✅ COMPLETED | Updated to expo@53.0.24                                                |
| 1.2 Update React/RN         | ✅ COMPLETED | React 19.0.0, React Native 0.79.6                                      |
| 1.3 AppDelegate Migration   | ✅ COMPLETED | Created `AppDelegate.swift`, updated project.pbxproj                   |
| 1.4 Update iOS Dependencies | ✅ COMPLETED | `pod install` successful, verified in Xcode                            |
| 1.5 Verify SDK 53 Build     | ✅ COMPLETED | Xcode build successful                                                 |
| 1.6 SDK 53 Stabilization    | ✅ COMPLETED | Tested on physical device, tagged `sdk-53-stable`                      |

**Jest Tests**: All 435 tests pass after SDK 53 upgrade (38 suites)

**Xcode Build**: Successful (December 5, 2025)

- Note: `pod install` shows deprecation warning about `dependency_targets.flat_map` but this is informational only - pods install correctly and Xcode builds work

**Additional Fix Applied**:

- `components/UntappdWebView.tsx` - Changed from `openBrowserAsync` to `openAuthSessionAsync` to restore Safari cookie sharing (uses ASWebAuthenticationSession instead of SFSafariViewController)

**Files Modified**:

- `package.json` - SDK 53, React 19, RN 0.79.6
- `jest.config.js` - Removed custom transforms/patterns for RN 0.79+ compatibility
- `jest.setup.js` - Added LiveActivity mock functions, eslint-env directive, removed deprecated deep import mocks
- `ios/BeerSelector/AppDelegate.swift` - NEW: Swift AppDelegate for SDK 53
- `ios/BeerSelector/BeerSelector-Bridging-Header.h` - Updated bridging header
- `ios/BeerSelector.xcodeproj/project.pbxproj` - Updated for Swift AppDelegate
- `components/UntappdWebView.tsx` - Fixed Safari cookie sharing

**Commits**:

- `9fea3ed` - "Upgrade to Expo SDK 53 with Swift AppDelegate"
- `a20b42e` - "Remove old Objective-C AppDelegate files and update migration plan"
- `94697cc` - "Document UntappdWebView Safari cookie sharing requirement"

**Tag**: `sdk-53-stable`

**Phase 1 Complete** ✅ - Ready to proceed to Phase 2 (SDK 54) when desired

---

### Step 1.0: Cleanup Dependencies (Critical)

> [!IMPORTANT]
> **Conflict Prevention:** You have an unused `react-native-live-activities` package in `package.json` that conflicts with your local module. You must remove it to avoid build errors.

```bash
# Remove unused package that conflicts with local module
npm uninstall react-native-live-activities

# Update react-native-webview to latest (Required for New Architecture)
npm install react-native-webview@latest
```

### Step 1.1: Update Expo SDK

```bash
# Install SDK 53
npm install expo@^53.0.0

# Fix dependencies automatically
npx expo install --fix

# Check for issues
npx expo-doctor
```

### Step 1.2: Update React and React Native

SDK 53 requires React Native 0.79.0 and React 19.0.0:

```bash
npm install react@19.0.0 react-native@0.79.0
npx expo install --fix
```

### Step 1.3: AppDelegate Swift Migration

**This is the most critical step for SDK 53.**

See [AppDelegate Swift Migration](#appdelegate-swift-migration) section for detailed instructions.

### Step 1.4: Update Podfile and iOS Dependencies

```bash
# Navigate to iOS directory
cd ios

# Remove existing Pods
rm -rf Pods Podfile.lock

> [!WARNING]
> **Potential Podfile Conflict:** Your `Podfile` currently contains a manual entry for `pod 'LiveActivity'`. Expo Autolinking might now pick this up automatically via `package.json`.
>
> If `pod install` fails with "Duplicate symbol" errors, try removing the manual `pod 'LiveActivity'` line from your `Podfile`.
> If it fails with "Module not found", keep the manual line.

# Update deployment target in Podfile.properties.json if needed
# Current: "ios.deploymentTarget": "17.6" (already sufficient)

# Install pods
pod install --repo-update

cd ..
```

### Step 1.5: Verify SDK 53 Build

```bash
# iOS
npx expo run:ios --device

# Android (if applicable)
npx expo run:android
```

### Step 1.6: SDK 53 Stabilization (Required Before Phase 2)

Before proceeding to SDK 54, complete the following:

- [ ] All Jest tests pass
- [ ] App builds and runs on physical device
- [ ] Live Activity module works correctly
- [ ] Deploy to TestFlight for broader testing
- [ ] Run app for 2-3 days in normal usage to catch subtle issues
- [ ] Commit all SDK 53 changes with clear commit message

```bash
git add -A
git commit -m "Migrate to Expo SDK 53 with Swift AppDelegate"
git tag sdk-53-stable
```

> **STOP HERE.** Do not proceed to Phase 2 until SDK 53 is stable and you've used the app for a few days. There's no rush.

---

## Phase 2: SDK 53 to SDK 54

> **Prerequisite:** Ensure SDK 53 is stable and has been running without issues before starting this phase.

### Step 2.1: Update to SDK 54

```bash
# Install SDK 54
npm install expo@^54.0.0

# Fix dependencies
npx expo install --fix

# Check for issues
npx expo-doctor
```

### Step 2.2: Update React Native to 0.81

```bash
npm install react@19.1.0 react-native@0.81.0
npx expo install --fix
```

### Step 2.3: Update Jest Configuration

The deep imports in `/workspace/BeerSelector/jest.setup.js` will cause deprecation warnings and may break in future versions:

**Current problematic code (lines 89-106):**

```javascript
// These deep imports are deprecated in RN 0.80+
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => { ... });
jest.mock('react-native/Libraries/Lists/FlatList', () => { ... });
```

**Updated approach:**

```javascript
// Mock using public API
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    ScrollView: jest.fn().mockImplementation(({ children, ...props }) => {
      const React = require('react');
      return React.createElement('ScrollView', props, children);
    }),
    FlatList: jest.fn().mockImplementation(({ data, renderItem, ListEmptyComponent, ...props }) => {
      const React = require('react');
      if (!data || data.length === 0) {
        return ListEmptyComponent
          ? typeof ListEmptyComponent === 'function'
            ? React.createElement(ListEmptyComponent)
            : ListEmptyComponent
          : null;
      }
      return React.createElement(
        'View',
        props,
        data.map((item, index) => renderItem({ item, index, separators: {} }))
      );
    }),
  };
});
```

### Step 2.4: Update expo-file-system Import (if used directly)

**SDK 54 Change:** The new API is now the default export.

```typescript
// Before (SDK 52/53)
import * as FileSystem from 'expo-file-system/next';

// After (SDK 54)
import * as FileSystem from 'expo-file-system';

// Legacy API (if needed)
import * as FileSystem from 'expo-file-system/legacy';
```

**Files to check:**

- `/workspace/BeerSelector/app.json` - Has expo-file-system config plugin (OK as-is)
- Search for any direct imports of `expo-file-system` in source code

### Step 2.5: Handle Android Edge-to-Edge

Edge-to-edge is mandatory in SDK 54 for Android 16. Update your Android layout handling:

```json
// app.json - add if experiencing UI issues
{
  "expo": {
    "android": {
      "adaptiveIcon": { ... },
      "edgeToEdgeEnabled": true  // Explicit for older Android versions
    }
  }
}
```

### Step 2.6: Rebuild iOS

```bash
cd ios
rm -rf Pods Podfile.lock build
pod install --repo-update
cd ..

# Build
npx expo run:ios --device
```

### Step 2.7: SDK 54 Stabilization

After completing the SDK 54 upgrade:

- [ ] All Jest tests pass
- [ ] App builds and runs on physical device
- [ ] All features work correctly (especially those affected by React 19.1 changes)
- [ ] Deploy to TestFlight for broader testing
- [ ] Commit all SDK 54 changes

```bash
git add -A
git commit -m "Migrate to Expo SDK 54"
git tag sdk-54-stable
```

---

## AppDelegate Swift Migration

This is the most complex part of the SDK 53 upgrade.

### Current Files to Modify

| File                                                         | Action     |
| ------------------------------------------------------------ | ---------- |
| `/workspace/BeerSelector/ios/BeerSelector/AppDelegate.h`     | **DELETE** |
| `/workspace/BeerSelector/ios/BeerSelector/AppDelegate.mm`    | **DELETE** |
| `/workspace/BeerSelector/ios/BeerSelector/main.m`            | **DELETE** |
| `/workspace/BeerSelector/ios/BeerSelector/AppDelegate.swift` | **CREATE** |

> **Note:** The `main.m` file must be deleted because the new Swift AppDelegate uses `@UIApplicationMain` which provides the application entry point. Having both would cause duplicate entry point errors.

### Step-by-Step Migration

#### 1. Create AppDelegate.swift

Create `/workspace/BeerSelector/ios/BeerSelector/AppDelegate.swift`:

```swift
import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
    var window: UIWindow?

    var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
    var reactNativeFactory: RCTReactNativeFactory?

    public override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let delegate = ReactNativeDelegate()
        let factory = ExpoReactNativeFactory(delegate: delegate)
        delegate.dependencyProvider = RCTAppDependencyProvider()

        reactNativeDelegate = delegate
        reactNativeFactory = factory
        bindReactNativeFactory(factory)

        #if os(iOS) || os(tvOS)
        window = UIWindow(frame: UIScreen.main.bounds)
        factory.startReactNative(
            withModuleName: "main",
            in: window,
            launchOptions: launchOptions
        )
        #endif

        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    // Linking API
    public override func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return super.application(app, open: url, options: options) ||
               RCTLinkingManager.application(app, open: url, options: options)
    }

    // Universal Links
    public override func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        let result = RCTLinkingManager.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
        return super.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        ) || result
    }

    // Remote notification delegates
    public override func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        return super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
    }

    public override func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        return super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
    }

    public override func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        return super.application(
            application,
            didReceiveRemoteNotification: userInfo,
            fetchCompletionHandler: completionHandler
        )
    }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
    override func sourceURL(for bridge: RCTBridge) -> URL? {
        bridge.bundleURL ?? bundleURL()
    }

    override func bundleURL() -> URL? {
        #if DEBUG
        return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
        #else
        return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
        #endif
    }
}
```

#### 2. Update Bridging Header

Update `/workspace/BeerSelector/ios/BeerSelector/BeerSelector-Bridging-Header.h` to include necessary imports:

```objc
//
//  BeerSelector-Bridging-Header.h
//  BeerSelector
//

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTBridge.h>
```

#### 3. Delete (or Rename) Objective-C Files

> [!CAUTION]
> **Safety First:** We recommend renaming these files initially rather than deleting them immediately. This allows for an instant rollback if the Swift migration has issues.

```bash
# Safer option: Rename instead of delete
mv /workspace/BeerSelector/ios/BeerSelector/AppDelegate.h /workspace/BeerSelector/ios/BeerSelector/AppDelegate.old.h
mv /workspace/BeerSelector/ios/BeerSelector/AppDelegate.mm /workspace/BeerSelector/ios/BeerSelector/AppDelegate.old.mm
mv /workspace/BeerSelector/ios/BeerSelector/main.m /workspace/BeerSelector/ios/BeerSelector/main.old.m
```

> **Critical:** The `main.m` file MUST be removed/renamed. It contains `UIApplicationMain()` which conflicts with `@UIApplicationMain` in the new Swift AppDelegate.

#### 4. Update Xcode Project

In Xcode:

1. Open `BeerSelector.xcworkspace`
2. Remove `AppDelegate.h`, `AppDelegate.mm`, and `main.m` from the project navigator (select files -> Delete -> "Remove Reference")
3. Add `AppDelegate.swift` to the project
4. Ensure `BeerSelector-Bridging-Header.h` is set in Build Settings -> Swift Compiler - General -> Objective-C Bridging Header

#### 5. Clean and Rebuild

```bash
cd ios
rm -rf Pods Podfile.lock build ~/Library/Developer/Xcode/DerivedData
pod install --repo-update
cd ..
npx expo run:ios
```

---

## Live Activity Module Updates

The Live Activity module at `/workspace/BeerSelector/modules/live-activity/` uses Expo Modules API and should be compatible with SDK 53/54.

### Files to Review

| File                                                      | Status    | Notes                                             |
| --------------------------------------------------------- | --------- | ------------------------------------------------- |
| `modules/live-activity/ios/LiveActivityModule.swift`      | **Check** | Uses `ExpoModulesCore` - verify API compatibility |
| `modules/live-activity/ios/LiveActivityAppDelegate.swift` | **Check** | Uses `ExpoAppDelegateSubscriber`                  |
| `modules/live-activity/expo-module.config.json`           | OK        | Configuration should work                         |
| `modules/live-activity/src/index.ts`                      | OK        | TypeScript interface unchanged                    |

### Potential Issues

1. **ExpoAppDelegateSubscriber**: The `LiveActivityAppDelegate.swift` extends `ExpoAppDelegateSubscriber`. Verify this protocol still exists in SDK 53/54.

2. **Module Registration**: The `expo-module.config.json` registers `LiveActivityAppDelegate` as an app delegate subscriber. This may need adjustment if the Expo Modules API changes.

### Verification Steps

After SDK upgrade:

```bash
# Build iOS to verify module compiles
npx expo run:ios

# Test Live Activity functionality
# 1. Start app
# 2. Queue a beer
# 3. Verify Live Activity appears
# 4. Verify auto-dismiss works after 3 hours (or test with shorter duration)
```

---

## Dependency Updates

### Package.json Changes Required

```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "react": "19.1.0",
    "react-native": "0.81.0",

    // These will be auto-updated by npx expo install --fix
    "expo-blur": "~14.x.x",
    "expo-constants": "~17.x.x",
    "expo-dev-client": "~5.x.x",
    "expo-font": "~13.x.x",
    "expo-haptics": "~14.x.x",
    "expo-linking": "~7.x.x",
    "expo-router": "~4.x.x",
    "expo-secure-store": "~14.x.x",
    "expo-splash-screen": "~0.x.x",
    "expo-sqlite": "~15.x.x",
    "expo-status-bar": "~2.x.x",
    "expo-symbols": "~0.x.x",
    "expo-system-ui": "~4.x.x",
    "expo-web-browser": "~14.x.x",

    // React Native ecosystem
    "@react-navigation/bottom-tabs": "^7.x.x",
    "@react-navigation/native": "^7.x.x",
    "react-native-gesture-handler": "~2.x.x",
    "react-native-reanimated": "~3.x.x",
    "react-native-safe-area-context": "4.x.x",
    "react-native-screens": "~4.x.x",
    "react-native-webview": "^14.x.x"
  },
  "devDependencies": {
    "jest-expo": "~54.0.0",
    "@types/react": "~19.x.x"
  }
}
```

### Commands to Run

```bash
# Update all expo packages
npx expo install --fix

# Update React types
npm install @types/react@latest

# Check for issues
npx expo-doctor
```

---

## Testing Checklist

### Pre-Migration Tests (on SDK 52)

- [ ] All Jest tests pass: `npm run test:ci`
- [ ] App builds for iOS: `npx expo run:ios`
- [ ] App builds for Android: `npx expo run:android`
- [ ] Live Activity starts correctly
- [ ] Live Activity auto-dismisses after 3 hours
- [ ] Deep links work from Live Activity tap

### Post SDK 53 Migration Tests

- [ ] Jest tests pass (after updating deep imports)
- [ ] iOS builds successfully
- [ ] Android builds successfully
- [ ] AppDelegate Swift migration works:
  - [ ] App launches without crash
  - [ ] Deep linking works
  - [ ] Remote notifications work
- [ ] Live Activity module:
  - [ ] Activities can be started
  - [ ] Activities can be updated
  - [ ] Activities can be ended
  - [ ] Auto-dismiss works

### Post SDK 54 Migration Tests

- [ ] All SDK 53 tests still pass
- [ ] Android edge-to-edge UI looks correct
- [ ] No SafeAreaView regressions
- [ ] Performance improvements noticed (XCFrameworks)

### Maestro E2E Tests

```bash
# Run full E2E suite after migration
npm run test:e2e:ios

# Critical flows to verify:
# - Login flow
# - Beer browsing
# - Queue management
# - Live Activity lifecycle
```

---

## Rollback Plan

### If SDK 53 Migration Fails

```bash
# Restore from backup branch
git checkout backup/pre-sdk54-migration
git checkout -b feature/sdk54-rollback

# Or revert specific commits
git revert <migration-commit-hash>

# Restore iOS files
git checkout backup/pre-sdk54-migration -- ios/BeerSelector/AppDelegate.h
git checkout backup/pre-sdk54-migration -- ios/BeerSelector/AppDelegate.mm
git checkout backup/pre-sdk54-migration -- ios/BeerSelector/main.m
git checkout backup/pre-sdk54-migration -- package.json
git checkout backup/pre-sdk54-migration -- package-lock.json

# Clean and reinstall
rm -rf node_modules ios/Pods
npm install
cd ios && pod install
```

### If SDK 54 Migration Fails (After SDK 53 Success)

```bash
# Revert to SDK 53 state
npm install expo@^53.0.0 react@19.0.0 react-native@0.79.0
npx expo install --fix

cd ios
rm -rf Pods Podfile.lock
pod install
```

### Critical Files to Backup

Before starting migration, ensure these are committed:

```
ios/BeerSelector/AppDelegate.h
ios/BeerSelector/AppDelegate.mm
ios/BeerSelector/main.m
ios/Podfile
ios/Podfile.properties.json
package.json
package-lock.json
modules/live-activity/ios/*.swift
jest.setup.js
```

---

## Post-Migration Verification

### 1. Build Verification

```bash
# Clean build iOS
cd ios
rm -rf build ~/Library/Developer/Xcode/DerivedData/BeerSelector*
xcodebuild -workspace BeerSelector.xcworkspace -scheme BeerSelector -configuration Debug clean build

# Clean build Android
cd android
./gradlew clean assembleDebug
```

### 2. Runtime Verification

- [ ] App starts without crash
- [ ] Navigation works (all tabs accessible)
- [ ] Database operations work (beer list loads)
- [ ] API calls work (refresh functionality)
- [ ] Login flow works
- [ ] Settings persist after restart
- [ ] Dark/Light mode switching works

### 3. Performance Verification

- [ ] App launch time is acceptable
- [ ] Scrolling is smooth (60fps)
- [ ] Memory usage is stable
- [ ] No excessive re-renders

### 4. Update Documentation

After successful migration, update:

- [ ] `/workspace/BeerSelector/CLAUDE.md` - Update SDK version references
- [ ] `/workspace/BeerSelector/package.json` - Version bump if applicable
- [ ] This migration plan - Add any lessons learned

---

## Resources

### Official Documentation

- [Expo SDK 53 Changelog](https://expo.dev/changelog/sdk-53)
- [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54)
- [Expo SDK Upgrade Guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [React Native 0.80 Release](https://reactnative.dev/blog/2025/06/12/react-native-0.80)
- [React Native 0.81 Release](https://www.bacancytechnology.com/blog/react-native-0.81)

### Community Resources

- [Expo AppDelegate Swift Template (SDK 53)](https://github.com/expo/expo/blob/sdk-53/templates/expo-template-bare-minimum/ios/HelloWorld/AppDelegate.swift)
- [React Native Upgrade Helper](https://react-native-community.github.io/upgrade-helper/)

### Troubleshooting

- [SDK 53 AppDelegate Type Error](https://github.com/expo/expo/issues/37490) - Common ExpoModulesProvider.swift error
- [Expo Modules Upgrade Guide](https://medium.com/@shanavascruise/from-frustration-to-triumph-my-bare-react-native-expo-modules-upgrade-saga-expo-51-53-9894a27fdcbd)

---

## Migration Timeline Estimate

### Phase 1: SDK 52 -> SDK 53

| Step                               | Estimated Time | Risk Level |
| ---------------------------------- | -------------- | ---------- |
| Prerequisites & Backup             | 30 min         | Low        |
| SDK 52 -> 53 (without AppDelegate) | 1-2 hours      | Medium     |
| AppDelegate Swift Migration        | 2-4 hours      | **High**   |
| SDK 53 Testing & Stabilization     | 2-3 days       | Medium     |

### Phase 2: SDK 53 -> SDK 54

| Step                           | Estimated Time | Risk Level |
| ------------------------------ | -------------- | ---------- |
| SDK 53 -> 54 upgrade           | 1-2 hours      | Low        |
| Jest configuration updates     | 1-2 hours      | Medium     |
| SDK 54 Testing & Stabilization | 1-2 days       | Low        |

### Total Timeline

- **Phase 1 active work:** 4-8 hours
- **Phase 1 stabilization:** 2-3 days
- **Phase 2 active work:** 2-4 hours
- **Phase 2 stabilization:** 1-2 days

**Recommendation:** Allow a full week for each phase, including stabilization time. Do not rush.
