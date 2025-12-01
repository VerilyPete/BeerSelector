# Expo Local Module Fix Plan

> **FIX APPLIED**: This fix has been implemented in `modules/live-activity/ios/LiveActivity.podspec`. The `DEFINES_MODULE = YES` setting is now included and the module compiles successfully.

## Problem Statement

The local Expo module at `modules/live-activity/` is being correctly detected by expo-modules-autolinking, but when the iOS build tries to compile `ExpoModulesProvider.swift`, it fails with:

```
No such module 'LiveActivity'
```

The generated `ExpoModulesProvider.swift` contains:

```swift
import LiveActivity
// ...
LiveActivityModule.self
```

This import fails because the local pod is not being configured as a proper Swift module.

---

## Root Cause Analysis

### 1. Missing `DEFINES_MODULE` Build Setting

**The primary issue**: The LiveActivity podspec is missing the critical `pod_target_xcconfig` settings that enable Swift module compilation.

**Evidence from investigation**:

Comparing the generated xcconfig files:

**ExpoHaptics.debug.xcconfig** (works):

```
DEFINES_MODULE = YES
SWIFT_COMPILATION_MODE = wholemodule
```

**LiveActivity.debug.xcconfig** (broken):

```
(DEFINES_MODULE is missing)
(SWIFT_COMPILATION_MODE is missing)
```

### 2. Why This Matters

When `DEFINES_MODULE = YES` is not set:

- CocoaPods still generates a `modulemap` file
- However, the Swift compiler does not build the pod as a separate module
- The `import LiveActivity` statement in ExpoModulesProvider.swift fails
- The class `LiveActivityModule` is compiled but not exported in a way that other Swift files can import

### 3. How Expo Modules Autolinking Works

The autolinking process (`expo-modules-autolinking/build/platforms/apple.js`):

1. **Finds pods**: Searches for `.podspec` files in the module directory
2. **Derives Swift module names**: By default, converts pod name to module name (replacing non-alphanumeric chars with `_`)
3. **Generates ExpoModulesProvider.swift**: Creates import statements using these module names
4. **Expects module import**: The Swift compiler must be able to `import <ModuleName>`

For this to work, each pod must compile as a proper Swift module, which requires `DEFINES_MODULE = YES`.

### 4. Comparison with Working Modules

All working Expo modules (expo-haptics, expo-blur, expo-secure-store, etc.) have:

```ruby
s.pod_target_xcconfig = {
  'DEFINES_MODULE' => 'YES',
  'SWIFT_COMPILATION_MODE' => 'wholemodule'
}
```

Our current `LiveActivity.podspec` is missing this configuration.

---

## Required Changes

### Primary Fix: Update LiveActivity.podspec

**File**: `modules/live-activity/ios/LiveActivity.podspec`

**Current content**:

```ruby
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = package['version']
  s.summary        = 'Live Activity module for BeerSelector'
  s.description    = 'Expo module for iOS Live Activities with beer queue display'
  s.license        = 'MIT'
  s.author         = 'BeerSelector'
  s.homepage       = 'https://github.com/beerselector'
  s.platforms      = { :ios => '17.6' }
  s.source         = { git: 'https://github.com/beerselector/beerselector.git' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
end
```

**Required content** (add the `pod_target_xcconfig` block):

```ruby
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = package['version']
  s.summary        = 'Live Activity module for BeerSelector'
  s.description    = 'Expo module for iOS Live Activities with beer queue display'
  s.license        = 'MIT'
  s.author         = 'BeerSelector'
  s.homepage       = 'https://github.com/beerselector'
  s.platforms      = { :ios => '17.6' }
  s.source         = { git: 'https://github.com/beerselector/beerselector.git' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility - REQUIRED for module import
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
```

---

## Step-by-Step Implementation

### Step 1: Backup Current State

```bash
# Optional but recommended
cp modules/live-activity/ios/LiveActivity.podspec modules/live-activity/ios/LiveActivity.podspec.backup
```

### Step 2: Update the Podspec

Edit `modules/live-activity/ios/LiveActivity.podspec` and add the `pod_target_xcconfig` block as shown above.

### Step 3: Clean CocoaPods Cache

```bash
cd ios
rm -rf Pods
rm -rf ~/Library/Caches/CocoaPods
rm Podfile.lock
```

### Step 4: Reinstall Pods

```bash
cd ios
pod install
```

### Step 5: Verify the Fix

After `pod install`, verify the xcconfig was generated correctly:

```bash
# Check that DEFINES_MODULE is present
grep "DEFINES_MODULE" "ios/Pods/Target Support Files/LiveActivity/LiveActivity.debug.xcconfig"
```

Expected output:

```
DEFINES_MODULE = YES
```

### Step 6: Verify ExpoModulesProvider Includes LiveActivity

Check that autolinking is including our module:

```bash
npx expo-modules-autolinking resolve 2>&1 | grep -A20 "live-activity"
```

Verify it shows:

- `modules: [ 'LiveActivityModule' ]`
- `swiftModuleNames: [ 'LiveActivity' ]`

### Step 7: Build in Xcode

```bash
xed ios
```

1. Select BeerSelector target
2. Build (Cmd+B)
3. Verify no "No such module 'LiveActivity'" errors

---

## Testing Verification

### Test 1: Pod Install Success

- `pod install` completes without errors
- `LiveActivity.debug.xcconfig` contains `DEFINES_MODULE = YES`

### Test 2: Xcode Build Success

- Project builds without "No such module" errors
- ExpoModulesProvider.swift compiles successfully

### Test 3: Runtime Verification

- App launches without crashes related to LiveActivity module
- Module can be called from JavaScript:
  ```typescript
  import LiveActivityModule from '@/modules/live-activity';
  const enabled = await LiveActivityModule.areActivitiesEnabled();
  console.log('Live Activities enabled:', enabled);
  ```

### Test 4: Live Activity Functionality

- Start an activity and verify it appears on Lock Screen
- Update the activity and verify changes appear
- End the activity and verify it dismisses

---

## Risks and Alternatives

### Risk 1: CocoaPods Cache Issues

**Risk**: Old cached podspec might be used even after updating.

**Mitigation**:

- Delete `ios/Pods` folder
- Delete `ios/Podfile.lock`
- Clear CocoaPods cache: `rm -rf ~/Library/Caches/CocoaPods`

### Risk 2: Xcode Build Cache

**Risk**: Xcode might use cached module maps.

**Mitigation**:

- Clean build folder: Cmd+Shift+K in Xcode
- Clean derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData`

### Risk 3: SWIFT_COMPILATION_MODE Compatibility

**Risk**: `wholemodule` compilation might have different behavior.

**Mitigation**: This is the standard setting used by all Expo modules. If issues arise, it can be changed to `incremental` for development builds.

### Alternative 1: Use `use_frameworks! :linkage => :static`

If the podspec fix doesn't work, adding this to the Podfile would force all pods to compile as frameworks with proper module support:

```ruby
# In ios/Podfile
use_frameworks! :linkage => :static
```

**Downside**: May affect other pods and require additional configuration.

### Alternative 2: Specify swiftModuleNames in expo-module.config.json

The expo-modules-autolinking allows specifying custom Swift module names. This could be used to workaround naming issues, but won't fix the fundamental `DEFINES_MODULE` problem.

### Alternative 3: Move Module to node_modules

Instead of keeping the module in `modules/`, it could be published to npm or linked as a symlink in `node_modules`. This changes nothing functionally but might affect how CocoaPods resolves the path.

---

## Additional Considerations

### 1. Why Other Local Modules Work

When you run `npx create-expo-module@latest --local`, the generated podspec includes the `pod_target_xcconfig` settings by default. Our module was created manually without this configuration.

### 2. Documentation Reference

The fix aligns with:

- [CocoaPods: Using Static Libraries](https://stackoverflow.com/questions/53264846/using-static-libraries-with-cocoapods-1-5-no-such-module-at-import)
- [Expo Modules API Documentation](https://docs.expo.dev/modules/get-started/)
- [Expo Autolinking Documentation](https://docs.expo.dev/modules/autolinking/)

### 3. Module Naming Convention

The podspec name (`LiveActivity`) must match:

- The modulemap module name (auto-generated by CocoaPods)
- The import statement in ExpoModulesProvider.swift
- The Swift module name derived by autolinking

All of these are currently aligned correctly.

---

## Summary

| Issue                           | Root Cause                                | Fix                                               |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| "No such module 'LiveActivity'" | Missing `DEFINES_MODULE = YES` in podspec | Add `pod_target_xcconfig` to LiveActivity.podspec |

**Single Required Change**:

```ruby
# Add to modules/live-activity/ios/LiveActivity.podspec
s.pod_target_xcconfig = {
  'DEFINES_MODULE' => 'YES',
  'SWIFT_COMPILATION_MODE' => 'wholemodule'
}
```

**Commands to Apply**:

```bash
# After editing the podspec
cd ios
rm -rf Pods Podfile.lock
pod install
```

This is a one-line fix that aligns our local module with the standard Expo module configuration pattern used by all official Expo packages.
