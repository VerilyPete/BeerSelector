# Native Module Architecture for Live Activities

## BeerSelector Implementation Analysis

**Version**: 1.1
**Last Updated**: 2025-11-30
**Status**: IMPLEMENTED - Migration Complete
**Analyst**: Development Team

> **Migration Complete**: The recommendation in this document has been implemented. The Live Activity module has been migrated to Expo Modules API. See `IMPLEMENTATION_COMPLETE.md` for details.

---

## Executive Summary

This document analyzes three approaches for implementing the Live Activity native module in BeerSelector: Legacy Native Modules (current implementation), TurboModules (React Native New Architecture), and Expo Modules API. Based on the analysis, we recommend **migrating to Expo Modules API** for long-term maintainability and developer experience.

### Quick Recommendation

**For BeerSelector: Use Expo Modules API**

**Rationale**:

- Project already uses Expo SDK 52 with New Architecture enabled
- `expo-modules-core` is already installed and used by other Expo packages
- Simpler API with pure Swift, no Objective-C bridge required
- Better long-term maintainability
- Automatic backwards compatibility with old architecture
- The performance overhead is negligible for Live Activity use case (infrequent calls)

---

## Current Project Context

### Configuration

- **Expo SDK**: 52.0.46
- **React Native**: 0.76.9
- **New Architecture**: Enabled (`newArchEnabled: true` in app.json)
- **iOS Bundle ID**: `org.verily.FSbeerselector`
- **Build Approach**: Local Xcode builds (not EAS)

### Current Implementation (Legacy Native Modules)

The current Live Activity implementation uses the legacy Native Modules pattern:

```
ios/BeerSelector/
  LiveActivityModule.swift      # Swift implementation (239 lines)
  LiveActivityModule.m          # Objective-C bridge (47 lines)
```

**Current Swift Module** (`LiveActivityModule.swift`):

```swift
import Foundation
import ActivityKit
import React

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc func areActivitiesEnabled(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 16.1, *) {
      resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
    } else {
      resolve(false)
    }
  }
  // ... more methods
}
```

**Current Objective-C Bridge** (`LiveActivityModule.m`):

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(areActivitiesEnabled:
                  (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
// ... more method declarations
@end
```

---

## Comparison Table

| Criteria                       | Legacy Native Modules | TurboModules              | Expo Modules API                      |
| ------------------------------ | --------------------- | ------------------------- | ------------------------------------- |
| **React Native Compatibility** | All versions          | RN 0.68+                  | All versions (with expo-modules-core) |
| **New Architecture Support**   | Works (via interop)   | Native support            | Native support + backwards compat     |
| **Swift Support**              | Via ObjC bridge       | Via ObjC/C++ bridge       | Native Swift DSL                      |
| **Code Required (iOS)**        | Swift + ObjC bridge   | Swift + ObjC++ + Codegen  | Swift only                            |
| **Codegen**                    | None                  | Required (can be brittle) | None                                  |
| **TypeScript Types**           | Manual                | Auto-generated            | Manual                                |
| **Performance**                | Baseline              | Faster (JSI)              | Comparable to TurboModules            |
| **DX (Developer Experience)**  | Fair                  | Complex                   | Excellent                             |
| **Expo Compatibility**         | Works                 | Complex setup             | Native                                |
| **Long-term Support**          | Deprecated direction  | React Native future       | Expo ecosystem future                 |
| **Maintenance Burden**         | Medium                | High                      | Low                                   |
| **Learning Curve**             | Low                   | High (C++, codegen)       | Low                                   |
| **Community Examples**         | Many                  | Growing                   | Many (Expo packages)                  |

---

## Detailed Analysis

### Option A: Legacy Native Modules (Current Approach)

The current implementation uses the React Native Bridge pattern with an Objective-C bridge file exposing Swift methods to JavaScript.

#### How It Works

```
JavaScript                    Objective-C Bridge              Swift
-----------                   -----------------               -----
NativeModules.LiveActivity -> RCT_EXTERN_MODULE() ->         @objc class
  .startActivity()            RCT_EXTERN_METHOD()             func startActivity()
```

#### Pros

1. **Already implemented**: Current code works and is tested
2. **No migration needed**: Zero development effort to continue using
3. **Simple pattern**: Well-documented, many examples online
4. **Works with New Architecture**: React Native provides an interop layer

#### Cons

1. **Deprecated direction**: React Native is moving away from this pattern
2. **Requires Objective-C knowledge**: Bridge file must be maintained
3. **Two files for one module**: Swift + ObjC creates maintenance overhead
4. **Not optimal for New Architecture**: Uses interop layer, not native JSI
5. **Type safety gaps**: Manual type conversion between JS and Swift

#### Long-term Support Outlook

React Native explicitly states that legacy Native Modules are "still supported but not optimal for New Architecture." While they work via the interop layer, new development should use TurboModules or Expo Modules API.

From the React Native documentation:

> "The interop layer is meant to be a temporary solution to ease the migration to the New Architecture. You should still plan to migrate your native modules to TurboModules."

#### When to Use

- Quick prototyping
- Projects not yet on New Architecture
- When team has no Swift/C++ expertise for alternatives

---

### Option B: TurboModules

TurboModules are React Native's official New Architecture solution for native modules, using JSI (JavaScript Interface) for direct native calls without the bridge.

#### How It Works

```
TypeScript Spec                Codegen                  Native Implementation
---------------                -------                  --------------------
NativeMyModule.ts         ->   Generate C++ files  ->  Swift (via ObjC++)
  export interface Spec                                MyModule.mm + .swift
```

#### Pros

1. **Official React Native solution**: Part of core React Native
2. **Best performance**: Direct JSI calls, no bridge serialization
3. **Type-safe**: TypeScript specs generate native interfaces
4. **Lazy loading**: Modules loaded only when needed
5. **No Expo dependency**: Works in any React Native project

#### Cons

1. **No direct Swift support**: Must bridge through Objective-C++
2. **Complex codegen setup**: Requires Flow/TypeScript specs, code generation
3. **Brittle codegen**: Known to break between React Native versions
4. **High learning curve**: Requires understanding of C++, JSI, and codegen
5. **More boilerplate**: Multiple files required for one module
6. **Documentation gaps**: Less community examples than Expo Modules

#### Swift Integration Complexity

From React Native documentation:

> "The core of React Native is mainly written in C++ and the interoperability between Swift and C++ is not great. Therefore, the module you are going to write won't be a pure Swift implementation."

TurboModules with Swift require:

1. TypeScript/Flow spec file
2. Codegen-generated C++ files
3. Objective-C++ wrapper (.mm)
4. Swift implementation
5. Bridging header

#### Example Implementation

```typescript
// NativeLiveActivityModule.ts (Spec)
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  areActivitiesEnabled(): Promise<boolean>;
  startActivity(data: Object): Promise<string>;
  updateActivity(activityId: string, data: Object): Promise<boolean>;
  endActivity(activityId: string): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('LiveActivityModule');
```

```objc
// LiveActivityModule.mm (Objective-C++ wrapper)
#import "LiveActivityModule.h"
#import "BeerSelector-Swift.h"
#import <React/RCTBridge+Private.h>
#import <ReactCommon/RCTTurboModule.h>

@implementation LiveActivityModule

RCT_EXPORT_MODULE()

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeLiveActivityModuleSpecJSI>(params);
}

RCT_EXPORT_METHOD(areActivitiesEnabled:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [self.swiftImpl areActivitiesEnabledWithResolve:resolve reject:reject];
}
// ... more wrapper methods
@end
```

#### When to Use

- Performance-critical modules (hundreds of thousands of calls/second)
- Pure React Native projects (no Expo)
- Teams with strong C++ expertise
- Modules that need to be shared across many non-Expo projects

---

### Option C: Expo Modules API (Recommended)

The Expo Modules API provides a modern, Swift-first approach to native modules with automatic backwards compatibility.

#### How It Works

```
Swift Module                    expo-modules-core                JavaScript
------------                    ----------------                 ----------
ExpoModulesCore.Module    ->    JSI Runtime          <->         import
  func definition()              (automatic bridging)            { Module }
    Name("LiveActivity")
    AsyncFunction("start")
```

#### Pros

1. **Pure Swift**: No Objective-C bridge code required
2. **No codegen**: No code generation step to break
3. **Simple DSL**: SwiftUI-like declarative syntax
4. **Automatic type conversion**: Built-in primitives, records, enums
5. **New Architecture support**: Full JSI support with backwards compatibility
6. **Already in project**: `expo-modules-core` is already installed
7. **Well-maintained**: Used by all official Expo packages
8. **Great documentation**: Comprehensive examples in Expo packages
9. **Local module support**: Can create modules in `modules/` directory
10. **Lower maintenance**: Single Swift file per module

#### Cons

1. **Requires expo-modules-core dependency**: Already present in this project
2. **Slightly slower than TurboModules**: Not noticeable for most use cases
3. **No auto-generated TypeScript types**: Must maintain types manually
4. **Expo ecosystem lock-in**: Some concern about dependency on Expo

#### Performance Consideration

From community benchmarks:

> "Compared to TurboModules they are slow. Compared to Nitro Modules and raw C++ JSI modules they are way slower. They are good enough for the general use case."

**For Live Activities specifically**: Performance is not a concern. The module is called:

- Once when starting an activity
- Occasionally when updating (max 10 updates/hour per iOS guidelines)
- Once when ending an activity

This is far below the threshold where JSI performance differences matter.

#### Example Implementation (Expo Modules API)

```swift
// modules/live-activity/ios/LiveActivityModule.swift
import ExpoModulesCore
import ActivityKit

public class LiveActivityModule: Module {
  private var currentActivityId: String?

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    AsyncFunction("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.1, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("startActivity") { (data: StartActivityData) -> String in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityUnsupportedException()
      }

      let attributes = BeerQueueAttributes(
        memberId: data.memberId,
        storeId: data.storeId
      )

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60)

      let activity = try Activity<BeerQueueAttributes>.request(
        attributes: attributes,
        content: ActivityContent(state: contentState, staleDate: staleDate),
        pushType: nil
      )

      self.currentActivityId = activity.id
      return activity.id
    }

    AsyncFunction("updateActivity") { (activityId: String, data: UpdateActivityData) -> Bool in
      guard #available(iOS 16.1, *) else {
        throw LiveActivityUnsupportedException()
      }

      let beers = data.beers.map { QueuedBeer(id: $0.id, name: $0.name) }
      let contentState = BeerQueueAttributes.ContentState(beers: beers)
      let staleDate = Date().addingTimeInterval(3 * 60 * 60)
      let content = ActivityContent(state: contentState, staleDate: staleDate)

      for activity in Activity<BeerQueueAttributes>.activities {
        if activity.id == activityId {
          await activity.update(content)
          return true
        }
      }
      throw ActivityNotFoundException(activityId)
    }

    AsyncFunction("endActivity") { (activityId: String) -> Bool in
      guard #available(iOS 16.1, *) else {
        return true
      }

      for activity in Activity<BeerQueueAttributes>.activities {
        if activity.id == activityId {
          await activity.end(dismissalPolicy: .immediate)
          if self.currentActivityId == activityId {
            self.currentActivityId = nil
          }
          return true
        }
      }
      return true
    }

    AsyncFunction("endAllActivities") { () -> Bool in
      guard #available(iOS 16.1, *) else {
        return true
      }

      for activity in Activity<BeerQueueAttributes>.activities {
        await activity.end(dismissalPolicy: .immediate)
      }
      self.currentActivityId = nil
      return true
    }

    AsyncFunction("getAllActivityIds") { () -> [String] in
      guard #available(iOS 16.1, *) else {
        return []
      }
      return Activity<BeerQueueAttributes>.activities.map { $0.id }
    }
  }
}

// MARK: - Data Records
struct StartActivityData: Record {
  @Field var memberId: String
  @Field var storeId: String
  @Field var beers: [BeerData]
}

struct UpdateActivityData: Record {
  @Field var beers: [BeerData]
}

struct BeerData: Record {
  @Field var id: String
  @Field var name: String
}

// MARK: - Exceptions
class LiveActivityUnsupportedException: Exception {
  override var reason: String {
    "Live Activities require iOS 16.1+"
  }
}

class ActivityNotFoundException: GenericException<String> {
  override var reason: String {
    "Activity not found with ID: \(param)"
  }
}
```

```json
// modules/live-activity/expo-module.config.json
{
  "platforms": ["ios"],
  "ios": {
    "modules": ["LiveActivityModule"]
  }
}
```

```typescript
// modules/live-activity/src/index.ts
import { NativeModule, requireNativeModule } from 'expo-modules-core';

interface BeerData {
  id: string;
  name: string;
}

interface StartActivityData {
  memberId: string;
  storeId: string;
  beers: BeerData[];
}

interface UpdateActivityData {
  beers: BeerData[];
}

interface LiveActivityModuleType extends NativeModule {
  areActivitiesEnabled(): Promise<boolean>;
  startActivity(data: StartActivityData): Promise<string>;
  updateActivity(activityId: string, data: UpdateActivityData): Promise<boolean>;
  endActivity(activityId: string): Promise<boolean>;
  endAllActivities(): Promise<boolean>;
  getAllActivityIds(): Promise<string[]>;
}

export default requireNativeModule<LiveActivityModuleType>('LiveActivity');
```

---

## iOS Version Availability Handling

All three approaches need to handle `@available` checks for iOS 16.1+ (Live Activities requirement).

### Expo Modules API Pattern

Expo Modules handles iOS availability within function bodies using Swift's standard `#available` checks:

```swift
AsyncFunction("startActivity") { (data: StartActivityData) -> String in
  guard #available(iOS 16.1, *) else {
    throw LiveActivityUnsupportedException()
  }
  // iOS 16.1+ code here
}
```

The `@available` attribute cannot be used directly on `AsyncFunction` closures, so version checks must be inside the function body. This is the same pattern used by the current implementation and works correctly.

---

## Migration Path: Legacy to Expo Modules API

### Step 1: Create Local Module Structure

```bash
# Create module directory
mkdir -p modules/live-activity/ios
mkdir -p modules/live-activity/src
```

### Step 2: Create expo-module.config.json

```json
// modules/live-activity/expo-module.config.json
{
  "platforms": ["ios"],
  "ios": {
    "modules": ["LiveActivityModule"]
  }
}
```

### Step 3: Create TypeScript Interface

```typescript
// modules/live-activity/src/index.ts
import { requireNativeModule, NativeModule } from 'expo-modules-core';

interface LiveActivityModule extends NativeModule {
  areActivitiesEnabled(): Promise<boolean>;
  startActivity(data: {
    memberId: string;
    storeId: string;
    beers: { id: string; name: string }[];
  }): Promise<string>;
  updateActivity(
    activityId: string,
    data: {
      beers: { id: string; name: string }[];
    }
  ): Promise<boolean>;
  endActivity(activityId: string): Promise<boolean>;
  endAllActivities(): Promise<boolean>;
  getAllActivityIds(): Promise<string[]>;
  endActivitiesOlderThan(maxAgeSeconds: number): Promise<number>;
}

export default requireNativeModule<LiveActivityModule>('LiveActivity');
```

### Step 4: Migrate Swift Code

Convert the current `LiveActivityModule.swift` to use Expo Modules API (see full example above).

### Step 5: Delete Objective-C Bridge

Remove `ios/BeerSelector/LiveActivityModule.m` as it's no longer needed.

### Step 6: Update Imports in Service Layer

```typescript
// src/services/liveActivityService.ts
// Before:
import { NativeModules } from 'react-native';
const { LiveActivityModule } = NativeModules;

// After:
import LiveActivityModule from '@/modules/live-activity';
```

### Step 7: Reinstall Pods

```bash
cd ios && pod install && cd ..
```

### Step 8: Test

Build and test all Live Activity functionality on a physical device.

### Migration Effort Estimate

- **Time**: 2-4 hours for experienced developer
- **Risk**: Low (same underlying Swift code, just different bridge)
- **Testing**: Full regression test of Live Activity features

---

## Risk Assessment

### Sticking with Legacy Native Modules

| Risk                                 | Probability        | Impact | Mitigation                                     |
| ------------------------------------ | ------------------ | ------ | ---------------------------------------------- |
| Deprecated in future RN version      | Medium (2-3 years) | High   | Plan migration to TurboModules or Expo Modules |
| New Architecture performance penalty | Low                | Low    | Negligible for this use case                   |
| Reduced community support            | Medium             | Medium | Internal expertise, Stack Overflow             |

### Migrating to TurboModules

| Risk                             | Probability | Impact | Mitigation                        |
| -------------------------------- | ----------- | ------ | --------------------------------- |
| Codegen breaks during RN upgrade | Medium      | High   | Pin versions, test before upgrade |
| Complex C++ debugging            | Medium      | Medium | Team training, documentation      |
| Swift bridging issues            | Low         | High   | Follow official guide strictly    |
| Longer migration time            | High        | Medium | Allocate extra time               |

### Migrating to Expo Modules API (Recommended)

| Risk                            | Probability | Impact | Mitigation                     |
| ------------------------------- | ----------- | ------ | ------------------------------ |
| Expo API breaking changes       | Low         | Medium | Pin expo-modules-core version  |
| Performance not acceptable      | Very Low    | Low    | Not relevant for this use case |
| Team unfamiliar with DSL        | Low         | Low    | DSL is simple, good docs       |
| Future Expo SDK incompatibility | Very Low    | Medium | Well-maintained by Expo team   |

---

## Recommendation

### For BeerSelector: Migrate to Expo Modules API

**Why**:

1. **Already using Expo**: The project is built on Expo SDK 52, making Expo Modules the natural choice
2. **expo-modules-core installed**: The dependency is already present
3. **Simpler code**: Eliminates 47 lines of Objective-C bridge code
4. **Pure Swift**: Matches the team's iOS expertise
5. **Future-proof**: Expo Modules API is actively maintained and evolving
6. **No codegen complexity**: Avoids TurboModules' brittle code generation
7. **Better DX**: SwiftUI-like declarative syntax is easier to read and maintain
8. **Performance sufficient**: Live Activity calls are infrequent, no JSI overhead concerns

### Not Recommended: TurboModules

**Why avoid for this project**:

1. **Overkill for use case**: Performance benefits are not needed
2. **Added complexity**: C++, codegen, ObjC++ wrappers add maintenance burden
3. **Doesn't align with Expo ecosystem**: Project already uses Expo Modules for other packages
4. **Higher risk**: Codegen is known to be brittle

### Not Recommended: Staying with Legacy Native Modules

**Why avoid**:

1. **Deprecated direction**: React Native is moving away from this pattern
2. **Technical debt**: Objective-C bridge adds unnecessary maintenance
3. **Not optimal**: Uses interop layer instead of native JSI
4. **Missing opportunity**: Migration effort is small, benefits are lasting

---

## Action Items

1. **Create migration branch**: `feature/expo-modules-live-activity`
2. **Create local module structure**: `modules/live-activity/`
3. **Port Swift code**: Convert to Expo Modules DSL
4. **Delete ObjC bridge**: Remove `LiveActivityModule.m`
5. **Update service imports**: Change from NativeModules to module import
6. **Test thoroughly**: All Live Activity functionality on physical device
7. **Update documentation**: CLAUDE.md and other docs
8. **Create PR**: Review and merge

**Estimated Effort**: 2-4 hours

---

## Appendix

### A: Reference Links

**Expo Modules API**:

- [Expo Modules Overview](https://docs.expo.dev/modules/overview/)
- [Module API Reference](https://docs.expo.dev/modules/module-api/)
- [Native Module Tutorial](https://docs.expo.dev/modules/native-module-tutorial/)
- [Design Considerations](https://docs.expo.dev/modules/design/)

**TurboModules**:

- [React Native New Architecture](https://reactnative.dev/docs/the-new-architecture/landing-page)
- [TurboModules with Swift](https://reactnative.dev/docs/the-new-architecture/turbo-modules-with-swift)

**Community Resources**:

- [expo-modules vs codegen complexity (React Native WG)](https://github.com/reactwg/react-native-new-architecture/discussions/199)
- [Nitro Benchmarks](https://github.com/mrousavy/NitroBenchmarks)
- [Client Guide to React Native Modules](https://ospfranco.com/client-guide-to-react-native-modules/)

**Live Activity with Expo**:

- [Implementing Live Activities with Expo](https://fizl.io/blog/posts/live-activities)
- [expo-live-activity (Software Mansion Labs)](https://github.com/software-mansion-labs/expo-live-activity)
- [expo-live-activity-timer Example](https://github.com/tarikfp/expo-live-activity-timer)

### B: Expo Haptics Module (Reference Example)

The `expo-haptics` package in this project uses Expo Modules API. Here's its iOS implementation:

```swift
// node_modules/expo-haptics/ios/HapticsModule.swift
import ExpoModulesCore

public class HapticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoHaptics")

    AsyncFunction("notificationAsync") { (notificationType: NotificationType) in
      let generator = UINotificationFeedbackGenerator()
      generator.prepare()
      generator.notificationOccurred(notificationType.toFeedbackType())
    }
    .runOnQueue(.main)

    AsyncFunction("impactAsync") { (style: ImpactStyle) in
      let generator = UIImpactFeedbackGenerator(style: style.toFeedbackStyle())
      generator.prepare()
      generator.impactOccurred()
    }
    .runOnQueue(.main)

    AsyncFunction("selectionAsync") {
      let generator = UISelectionFeedbackGenerator()
      generator.prepare()
      generator.selectionChanged()
    }
    .runOnQueue(.main)
  }

  enum NotificationType: String, Enumerable {
    case success, warning, error
    // ...
  }

  enum ImpactStyle: String, Enumerable {
    case light, medium, heavy, soft, rigid
    // ...
  }
}
```

This demonstrates the clean, declarative pattern that should be used for the Live Activity module.

### C: Project File Locations (After Migration)

```
modules/
  live-activity/
    ios/
      LiveActivityModule.swift        # Main module implementation
    src/
      index.ts                        # TypeScript interface
    expo-module.config.json           # Module configuration

ios/
  BeerQueueWidget/
    BeerQueueAttributes.swift         # ActivityKit attributes (shared)
    BeerQueueWidgetLiveActivity.swift # SwiftUI widget views
```

---

## Version History

| Version | Date       | Author           | Changes                       |
| ------- | ---------- | ---------------- | ----------------------------- |
| 1.0     | 2025-11-30 | Development Team | Initial architecture analysis |
