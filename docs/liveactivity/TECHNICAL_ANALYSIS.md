# iOS Live Activity Technical Analysis
## BeerSelector Implementation Options

**Version**: 1.0
**Last Updated**: 2025-11-21
**Status**: Research Phase
**Analyst**: Development Team

---

## Executive Summary

This document analyzes implementation approaches for adding iOS Live Activities to BeerSelector. **Key finding**: Since the project already uses custom development builds with Xcode, you have direct native access and can implement Live Activities without any workflow changes.

### Recommended Approach
**🎯 Direct Native Implementation with `react-native-live-activities` Package**

**Rationale**:
- Already building in Xcode with custom dev builds
- Already have native iOS directory and full native access
- No workflow changes needed
- Can add Swift widget extension directly in Xcode
- Community package provides clean React Native bridge
- Continue using Expo dev server for hot reload

---

## Current Project Context

### Expo Configuration
- **SDK Version**: Expo SDK 52
- **Workflow**: **Custom development builds** (native directories present)
- **iOS Bundle ID**: `org.verily.FSbeerselector`
- **Android Package**: `com.yourcompany.beerselector`
- **New Architecture**: Enabled in `app.json`

### Build System
- **iOS**: Building in Xcode
- **Development**: Expo dev server with custom dev build (not Expo Go)
- **Custom Native Code**: ✅ **Full native access available**

### Relevant Dependencies
```json
{
  "expo": "^52.0.0",
  "react-native": "0.76.x",
  "expo-router": "^4.x",
  "expo-sqlite": "^15.1.4"
}
```

---

## Implementation Options Comparison

### Option 1: react-native-live-activities Package (Recommended) 📱

**Package**: `react-native-live-activities` (v2.x)
- **GitHub**: https://github.com/iburn/react-native-live-activities
- **NPM**: https://www.npmjs.com/package/react-native-live-activities
- **Stars**: 800+ (as of 2024)
- **Maintenance**: Active, regular updates

#### ✅ Advantages
1. **No Workflow Changes**: Works with your existing Xcode setup
2. **Proven Solution**: Used in production apps
3. **Good Documentation**: Clear setup guides and examples
4. **TypeScript Support**: Full type definitions
5. **APNs Integration**: Built-in push notification support
6. **Dynamic Island**: Supports both compact and expanded views
7. **Clean Bridge**: Simple React Native API over ActivityKit
8. **Expo Compatible**: Works with Expo dev server for hot reload

#### ❌ Disadvantages
1. **Community Package**: Not official Expo support
2. **Breaking Changes**: May break with React Native updates (low risk)
3. **Manual Setup**: Need to configure in Xcode (but you're already doing this)

#### Technical Requirements
```bash
# Install package
npm install react-native-live-activities

# Note: You already have native directories and build in Xcode,
# so no prebuild or EAS build needed - just install the package!
```

#### Configuration (`app.json`)
```json
{
  "expo": {
    "plugins": [
      [
        "react-native-live-activities",
        {
          "deployment_target": "16.1",
          "widget_extension_name": "BeerQueueWidget"
        }
      ]
    ],
    "ios": {
      "bundleIdentifier": "org.verily.FSbeerselector",
      "infoPlist": {
        "NSSupportsLiveActivities": true
      }
    }
  }
}
```

#### Usage Example
```typescript
import LiveActivities from 'react-native-live-activities';

// Start Live Activity
const activityId = await LiveActivities.startActivity({
  attributes: {
    memberId: '12345',
    storeId: '1'
  },
  contentState: {
    queueCount: 3,
    beers: [
      { id: '1', name: 'Beer 1', date: 'Nov 21' },
      { id: '2', name: 'Beer 2', date: 'Nov 21' },
      { id: '3', name: 'Beer 3', date: 'Nov 21' }
    ],
    storeLocation: 'Addison',
    lastUpdated: new Date().toISOString()
  }
});

// Update Live Activity
await LiveActivities.updateActivity(activityId, {
  queueCount: 2,
  beers: [
    { id: '1', name: 'Beer 1', date: 'Nov 21' },
    { id: '2', name: 'Beer 2', date: 'Nov 21' }
  ],
  storeLocation: 'Addison',
  lastUpdated: new Date().toISOString()
});

// End Live Activity
await LiveActivities.endActivity(activityId);
```

#### Implementation Timeline
- **Setup**: 1-2 days (install, configure, build dev client)
- **Integration**: 3-5 days (connect to queue service)
- **UI Design**: 3-4 days (Swift widget UI)
- **Testing**: 3-5 days (physical device testing)
- **Total**: 10-16 days (2-3 weeks)

---

### Option 2: Expo Managed + expo-live-activities 🔬

**Package**: `expo-live-activities` (experimental)
- **GitHub**: https://github.com/expo/config-plugins (contrib)
- **NPM**: Community-maintained config plugin
- **Status**: Experimental, limited adoption

#### ✅ Advantages
1. **Expo Ecosystem**: Designed for Expo projects
2. **Minimal Config**: Simpler setup than bare workflow
3. **Config Plugin**: Uses Expo config plugin system

#### ❌ Disadvantages
1. **Experimental**: Not production-ready
2. **Limited Docs**: Poor documentation
3. **Low Adoption**: Few real-world users
4. **Uncertain Maintenance**: Unclear long-term support
5. **Feature Gaps**: May not support all ActivityKit features

#### Recommendation
**⚠️ Not Recommended**: Too experimental for production app. Consider for future when mature.

---

### Option 3: Pure Native Implementation (No Package) 🔧

**Approach**: Implement Live Activities entirely in Swift without any React Native bridge package

#### ✅ Advantages
1. **Full Control**: Direct access to all native iOS APIs
2. **No Dependencies**: Not reliant on community packages
3. **Official Apple Docs**: Follow standard iOS development guides
4. **Future-Proof**: No package breaking changes to worry about
5. **Performance**: Potentially more optimized (minimal difference in practice)
6. **Learning**: Deep understanding of ActivityKit

#### ❌ Disadvantages
1. **More Code**: Must write your own React Native bridge module
2. **Maintenance**: Responsible for bridge code between Swift and RN
3. **Time Investment**: 2-3 extra days to write and test bridge
4. **Reinventing Wheel**: Community package already solves this problem
5. **TypeScript Types**: Must write your own type definitions

#### Implementation Steps
```bash
# 1. Open Xcode (you're already doing this!)
open ios/BeerSelector.xcworkspace

# 2. Add Widget Extension target in Xcode
# File -> New -> Target -> Widget Extension
# Name: BeerQueueWidget

# 3. Implement ActivityKit in Swift
# Create widget views, attributes, etc.

# 4. Create React Native Bridge Module
# File: ios/BeerSelector/LiveActivityModule.swift
# File: ios/BeerSelector/LiveActivityModule.m (bridge header)

# 5. Expose native functions to JavaScript
# startActivity, updateActivity, endActivity
```

#### Swift Implementation (Example)
```swift
// BeerQueueLiveActivity.swift
import ActivityKit
import WidgetKit
import SwiftUI

struct BeerQueueAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var queueCount: Int
        var beers: [QueuedBeer]
        var storeLocation: String
        var lastUpdated: String
    }

    var memberId: String
    var storeId: String
}

struct BeerQueueLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BeerQueueAttributes.self) { context in
            // Lock screen / banner UI
            BeerQueueView(state: context.state)
        } dynamicIsland: { context in
            // Dynamic Island UI
            DynamicIsland {
                // Expanded view
                DynamicIslandExpandedRegion(.leading) {
                    QueueIcon()
                }
                DynamicIslandExpandedRegion(.trailing) {
                    QueueCount(count: context.state.queueCount)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    BeerList(beers: context.state.beers)
                }
            } compactLeading: {
                QueueIcon()
            } compactTrailing: {
                Text("\(context.state.queueCount)")
            } minimal: {
                QueueIcon()
            }
        }
    }
}
```

#### React Native Bridge (Example)
```objc
// LiveActivityBridge.m
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityModule, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(NSString *)activityId
                  state:(NSDictionary *)state
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(NSString *)activityId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
```

```swift
// LiveActivityModule.swift
import ActivityKit

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {

    @objc
    func startActivity(_ config: NSDictionary,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Implement activity start logic
        let attributes = BeerQueueAttributes(
            memberId: config["memberId"] as! String,
            storeId: config["storeId"] as! String
        )

        let contentState = BeerQueueAttributes.ContentState(
            queueCount: config["queueCount"] as! Int,
            beers: parseBeers(config["beers"] as! [[String: String]]),
            storeLocation: config["storeLocation"] as! String,
            lastUpdated: config["lastUpdated"] as! String
        )

        do {
            let activity = try Activity<BeerQueueAttributes>.request(
                attributes: attributes,
                contentState: contentState
            )
            resolve(activity.id)
        } catch {
            reject("START_ERROR", "Failed to start activity", error)
        }
    }

    // Implement updateActivity and endActivity...
}
```

#### Implementation Timeline (Pure Native - No Package)
- **Widget Extension**: 3-5 days (create target, implement UI)
- **Bridge Module**: 2-3 days (create bridge, test)
- **Integration**: 3-5 days (connect to queue service)
- **Testing**: 3-5 days (physical device testing)
- **Total**: 11-18 days (2-3.5 weeks)

**vs. Using react-native-live-activities Package**: 8-14 days (1.5-3 weeks)
- Saves 2-3 days by not writing custom bridge code

---

### Option 4: Wait for Official Expo Support ⏳

**Approach**: Wait for Expo to release official Live Activity module

#### ✅ Advantages
1. **Zero Migration**: No workflow changes
2. **Official Support**: Backed by Expo team
3. **Best Integration**: Seamless with Expo ecosystem
4. **Long-term Stable**: Well-maintained

#### ❌ Disadvantages
1. **Unknown Timeline**: Could be months or years
2. **Opportunity Cost**: Feature delayed indefinitely
3. **Competitive Disadvantage**: Other apps may have Live Activities
4. **User Expectation**: iOS users expect modern features

#### Recommendation
**❌ Not Recommended**: Timeline too uncertain for product roadmap.

---

## Detailed Comparison Matrix

**Note**: You're already using custom development builds (Xcode + Expo dev server), so all options below work with your current setup.

| Criteria | react-native-live-activities | expo-live-activities | Pure Native (No Package) | Wait for Expo |
|----------|------------------------------|----------------------|--------------------------|---------------|
| **Implementation Time** | 1.5-3 weeks | 1-2 weeks | 2-3.5 weeks | Unknown |
| **Complexity** | Low | Low | Medium-High | N/A |
| **Maintenance** | Low | Medium | Medium | N/A |
| **Risk** | Low | High | Low | High |
| **Your Current Setup** | ✅ Compatible | ✅ Compatible | ✅ Compatible | ✅ Compatible |
| **Production Ready** | ✅ | ❌ | ✅ | ❌ |
| **Community Support** | ✅ Good | ⚠️ Limited | ✅ iOS docs | N/A |
| **APNs Integration** | ✅ Built-in | ⚠️ Manual | ✅ Full control | N/A |
| **Dynamic Island** | ✅ | ⚠️ Unknown | ✅ | N/A |
| **TypeScript** | ✅ Included | ⚠️ Partial | ⚠️ Manual | N/A |
| **Breaking Changes Risk** | ⚠️ Medium | ⚠️ High | ✅ Low | N/A |
| **Learning Curve** | Low | Low | High | N/A |
| **Team Skill Req.** | React Native | React Native | Swift + RN | React Native |
| **Cost** | $0 | $0 | $0 | $0 |
| **Vendor Lock-in** | Community | Community | None | Expo |

**Legend**: ✅ Excellent | ⚠️ Acceptable | ❌ Poor

**Recommendation**: Use `react-native-live-activities` for fastest implementation with proven reliability.

---

## Technical Deep Dive: react-native-live-activities

### Architecture

```
┌─────────────────────────────────────────────┐
│         React Native App (JavaScript)        │
│  ┌───────────────────────────────────────┐  │
│  │   liveActivityService.ts              │  │
│  │   - startLiveActivity()               │  │
│  │   - updateLiveActivity()              │  │
│  │   - endLiveActivity()                 │  │
│  └───────────────┬───────────────────────┘  │
│                  │                           │
│                  ↓                           │
│  ┌───────────────────────────────────────┐  │
│  │  react-native-live-activities (Bridge)│  │
│  │   - JavaScript → Native translation   │  │
│  └───────────────┬───────────────────────┘  │
└──────────────────┼───────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│       iOS Widget Extension (Swift)          │
│  ┌───────────────────────────────────────┐  │
│  │   BeerQueueLiveActivity.swift         │  │
│  │   - ActivityAttributes                │  │
│  │   - ContentState                      │  │
│  │   - Widget UI (SwiftUI)               │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │   ActivityKit (Apple Framework)       │  │
│  │   - Activity lifecycle management     │  │
│  │   - System integration                │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│         iOS System (Lock Screen)            │
│  - Displays Live Activity                   │
│  - Handles user taps → Deep link to app     │
└─────────────────────────────────────────────┘
```

### Data Flow

**Starting Live Activity**:
```
User taps "Check Me In!" (Beerfinder)
  ↓
useOptimisticCheckIn hook
  ↓
checkInBeer() API call → Success
  ↓
getQueuedBeers() → Fetch current queue
  ↓
liveActivityService.startLiveActivity(queueState)
  ↓
react-native-live-activities bridge
  ↓
Swift: Activity.request(attributes, contentState)
  ↓
ActivityKit → iOS System
  ↓
Live Activity appears on lock screen
```

**Updating Live Activity (Immediate - User Action)**:
```
User deletes beer from queue
  ↓
deleteQueuedBeer(cid) API call → Success
  ↓
getQueuedBeers() → Fetch updated queue
  ↓
liveActivityService.updateLiveActivity(queueState)
  ↓
react-native-live-activities bridge
  ↓
Swift: activity.update(contentState)
  ↓
ActivityKit → iOS System
  ↓
Live Activity updates on lock screen
```

**Updating Live Activity (Periodic - Background Poll)**:
```
Background timer (every 6 minutes)
  ↓
BackgroundFetch.fetch()
  ↓
getQueuedBeers() API call
  ↓
Compare with last known state
  ↓
If changed:
  ↓
  liveActivityService.updateLiveActivity(queueState)
  ↓
  react-native-live-activities bridge
  ↓
  Swift: activity.update(via APNs push)
  ↓
  ActivityKit → iOS System
  ↓
  Live Activity updates on lock screen
```

**Ending Live Activity**:
```
Last beer removed from queue
  ↓
queueState.length === 0
  ↓
liveActivityService.endLiveActivity()
  ↓
react-native-live-activities bridge
  ↓
Swift: activity.end()
  ↓
ActivityKit → iOS System
  ↓
Live Activity dismissed from lock screen
```

### Configuration Files

**package.json**
```json
{
  "dependencies": {
    "react-native-live-activities": "^2.3.0",
    "expo-dev-client": "~5.0.0"
  }
}
```

**app.json**
```json
{
  "expo": {
    "name": "BeerSelector",
    "slug": "beerselector",
    "version": "1.1.0",
    "plugins": [
      [
        "react-native-live-activities",
        {
          "frequentUpdates": false,
          "deployment_target": "16.1",
          "widget_extension_name": "BeerQueueWidget"
        }
      ]
    ],
    "ios": {
      "bundleIdentifier": "org.verily.FSbeerselector",
      "buildNumber": "1",
      "infoPlist": {
        "NSSupportsLiveActivities": true,
        "NSSupportsLiveActivitiesPushNotifications": true
      }
    }
  }
}
```

**eas.json** (EAS Build config)
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "ios": {
        "simulator": false
      }
    }
  }
}
```

### Swift Widget Code Structure

**File**: `ios/BeerQueueWidget/BeerQueueLiveActivity.swift`

```swift
import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Attributes (Static, non-changing data)
struct BeerQueueAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var queueCount: Int
        var beers: [QueuedBeer]
        var storeLocation: String
        var lastUpdated: String
    }

    // Static attributes (set once at activity start)
    var memberId: String
    var storeId: String
}

// MARK: - Queued Beer Model
struct QueuedBeer: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let date: String
}

// MARK: - Live Activity Widget
struct BeerQueueLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BeerQueueAttributes.self) { context in
            // MARK: Lock Screen / Banner UI
            BeerQueueCompactView(
                beers: context.state.beers,
                storeLocation: context.state.storeLocation,
                queueCount: context.state.queueCount
            )
            .activityBackgroundTint(Color.black.opacity(0.1))
            .activitySystemActionForegroundColor(Color.accentColor)

        } dynamicIsland: { context in
            // MARK: Dynamic Island UI
            DynamicIsland {
                // Expanded view
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "beer.mug")
                        .font(.title2)
                        .foregroundColor(.pink)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text("\(context.state.queueCount)")
                            .font(.title2)
                            .fontWeight(.bold)
                        Text("beers")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    BeerListExpandedView(beers: context.state.beers)
                }

            } compactLeading: {
                // Minimal icon when collapsed
                Image(systemName: "beer.mug")
                    .foregroundColor(.pink)

            } compactTrailing: {
                // Queue count when collapsed
                Text("\(context.state.queueCount)")
                    .font(.caption2)
                    .fontWeight(.bold)

            } minimal: {
                // Most compact view (just icon)
                Image(systemName: "beer.mug")
                    .foregroundColor(.pink)
            }
        }
    }
}

// MARK: - Compact View (Lock Screen)
struct BeerQueueCompactView: View {
    let beers: [QueuedBeer]
    let storeLocation: String
    let queueCount: Int

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                Image(systemName: "beer.mug")
                    .foregroundColor(accentColor)
                Text("Beer Queue (\(queueCount))")
                    .font(.headline)
                    .fontWeight(.bold)

                Spacer()

                Text(storeLocation)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Divider()

            // Beer list
            ForEach(beers.prefix(5)) { beer in
                VStack(alignment: .leading, spacing: 2) {
                    Text(beer.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .lineLimit(1)

                    Text(beer.date)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)

                if beer.id != beers.prefix(5).last?.id {
                    Divider()
                }
            }
        }
        .padding()
    }

    var accentColor: Color {
        colorScheme == .dark ? .pink : .blue
    }
}

// MARK: - Expanded View (Dynamic Island)
struct BeerListExpandedView: View {
    let beers: [QueuedBeer]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(beers.prefix(3)) { beer in
                HStack {
                    Text(beer.name)
                        .font(.caption)
                        .lineLimit(1)

                    Spacer()

                    Text(formatTime(beer.date))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            if beers.count > 3 {
                Text("+\(beers.count - 3) more")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal)
    }

    func formatTime(_ dateString: String) -> String {
        // Extract time from "Nov 21, 2025 @ 02:30:15pm"
        let components = dateString.components(separatedBy: " @ ")
        return components.count > 1 ? components[1] : dateString
    }
}

// MARK: - Preview Provider
struct BeerQueueLiveActivity_Previews: PreviewProvider {
    static var previews: some View {
        BeerQueueCompactView(
            beers: [
                QueuedBeer(id: "1", name: "Bell's Hopslam (Draft)", date: "Nov 21, 2025 @ 02:30pm"),
                QueuedBeer(id: "2", name: "Firestone Walker Parabola (BTL)", date: "Nov 21, 2025 @ 02:28pm"),
                QueuedBeer(id: "3", name: "Stone Enjoy By IPA (Draft)", date: "Nov 21, 2025 @ 02:25pm")
            ],
            storeLocation: "Addison",
            queueCount: 3
        )
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
```

### TypeScript Service Layer

**File**: `src/services/liveActivityService.ts`

```typescript
import LiveActivities from 'react-native-live-activities';
import { Platform } from 'react-native';
import { QueueState, QueuedBeer } from '@/src/types/liveActivity';
import { getSessionData } from '@/src/api/sessionManager';

let currentActivityId: string | null = null;

/**
 * Check if Live Activities are supported on this device
 * @returns true if iOS 16.1+ and ActivityKit available
 */
export async function isLiveActivitySupported(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    const isSupported = await LiveActivities.areActivitiesEnabled();
    return isSupported;
  } catch (error) {
    console.error('Error checking Live Activity support:', error);
    return false;
  }
}

/**
 * Start a new Live Activity for the beer queue
 * @param queueState - Current state of the beer queue
 * @returns Activity ID if successful
 */
export async function startLiveActivity(queueState: QueueState): Promise<string | null> {
  try {
    // Check support first
    const isSupported = await isLiveActivitySupported();
    if (!isSupported) {
      console.log('Live Activities not supported on this device');
      return null;
    }

    // Don't start if queue is empty
    if (queueState.beers.length === 0) {
      console.log('Cannot start Live Activity with empty queue');
      return null;
    }

    // Get session data for attributes
    const session = await getSessionData();
    if (!session) {
      console.error('No session data available');
      return null;
    }

    // Start activity
    const activityId = await LiveActivities.startActivity({
      attributes: {
        memberId: session.memberId,
        storeId: session.storeId,
      },
      contentState: {
        queueCount: queueState.queueCount,
        beers: queueState.beers,
        storeLocation: queueState.storeLocation,
        lastUpdated: queueState.lastUpdated,
      },
    });

    currentActivityId = activityId;
    console.log('Live Activity started:', activityId);
    return activityId;

  } catch (error) {
    console.error('Error starting Live Activity:', error);
    return null;
  }
}

/**
 * Update the existing Live Activity with new queue state
 * @param queueState - Updated state of the beer queue
 */
export async function updateLiveActivity(queueState: QueueState): Promise<void> {
  try {
    // If no activity exists and queue has beers, start one
    if (!currentActivityId && queueState.beers.length > 0) {
      await startLiveActivity(queueState);
      return;
    }

    // If activity exists but queue is empty, end it
    if (currentActivityId && queueState.beers.length === 0) {
      await endLiveActivity();
      return;
    }

    // Update existing activity
    if (currentActivityId) {
      await LiveActivities.updateActivity(currentActivityId, {
        queueCount: queueState.queueCount,
        beers: queueState.beers,
        storeLocation: queueState.storeLocation,
        lastUpdated: queueState.lastUpdated,
      });
      console.log('Live Activity updated');
    }

  } catch (error) {
    console.error('Error updating Live Activity:', error);
  }
}

/**
 * End the current Live Activity
 */
export async function endLiveActivity(): Promise<void> {
  try {
    if (!currentActivityId) {
      console.log('No Live Activity to end');
      return;
    }

    await LiveActivities.endActivity(currentActivityId);
    console.log('Live Activity ended');
    currentActivityId = null;

  } catch (error) {
    console.error('Error ending Live Activity:', error);
  }
}

/**
 * Get the current Live Activity ID
 */
export function getCurrentActivityId(): string | null {
  return currentActivityId;
}
```

---

## APNs Configuration

### Certificate Setup

**Step 1: Generate APNs Key**
1. Go to Apple Developer Portal → Certificates, Identifiers & Profiles
2. Click Keys → + (Create new key)
3. Name: "BeerSelector APNs Key"
4. Enable: Apple Push Notifications service (APNs)
5. Download `.p8` key file
6. Save Key ID and Team ID

**Step 2: Configure in Xcode**
1. Open Xcode project
2. Select BeerSelector target
3. Signing & Capabilities tab
4. Add capability: Push Notifications
5. Add capability: Live Activities (under App Groups)

**Step 3: Enable in Expo**
```json
// app.json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSSupportsLiveActivities": true,
        "NSSupportsLiveActivitiesPushNotifications": true
      }
    }
  }
}
```

### Push Notification Flow

**Immediate Update (User Action)**:
```
User adds/deletes beer
  ↓
App calls updateLiveActivity()
  ↓
LiveActivities.updateActivity() (local update)
  ↓
Optional: App sends push to own backend
  ↓
Backend sends APNs push to device
  ↓
iOS updates Live Activity (even if app backgrounded)
```

**Periodic Update (Background)**:
```
iOS Background App Refresh (every 15 min)
  ↓
App wakes up briefly
  ↓
Fetch getQueuedBeers() API
  ↓
Compare with last known state
  ↓
If changed: updateLiveActivity()
  ↓
iOS updates Live Activity
```

---

## Risk Analysis

### Technical Risks

**R-1: Community Package Breaks with RN Update**
- **Probability**: Medium (30%)
- **Impact**: High (feature stops working)
- **Mitigation**:
  - Pin `react-native-live-activities` to specific version
  - Test thoroughly before React Native upgrades
  - Have rollback plan (disable Live Activity temporarily)
  - Monitor package GitHub for breaking change announcements

**R-2: APNs Delivery Issues**
- **Probability**: Low (10%)
- **Impact**: Medium (stale data)
- **Mitigation**:
  - Periodic polling as fallback (every 6 min)
  - Display "last updated" timestamp
  - User can manually refresh by opening app

**R-3: iOS Version Fragmentation**
- **Probability**: Medium (25%)
- **Impact**: Low (older devices don't get feature)
- **Mitigation**:
  - Check iOS version before enabling
  - Show feature in settings only for iOS 16.1+
  - Graceful degradation for older devices

**R-4: Dev Client Build Failures**
- **Probability**: Medium (20%)
- **Impact**: Medium (dev workflow disrupted)
- **Mitigation**:
  - Use EAS Build cloud builds
  - Cache successful builds
  - Document troubleshooting steps

### Product Risks

**P-1: Low Adoption**
- **Probability**: Medium (30%)
- **Impact**: Medium (feature underutilized)
- **Mitigation**:
  - In-app prompt to enable Live Activity
  - Show preview/screenshot in settings
  - Analytics to track adoption rate

**P-2: Battery Complaints**
- **Probability**: Low (15%)
- **Impact**: Medium (negative reviews)
- **Mitigation**:
  - Respect Apple's 10 updates/hour limit
  - Profile battery usage with Xcode Instruments
  - Add setting to disable Live Activity

**P-3: Privacy Concerns**
- **Probability**: Low (10%)
- **Impact**: Low (user disables feature)
- **Mitigation**:
  - Clear messaging about lock screen visibility
  - Optional: Add setting for generic view (no beer names)

---

## Recommendation Summary

### Primary Recommendation: react-native-live-activities

**Why**:
1. ✅ **No Workflow Changes**: Works with your existing Xcode setup
2. ✅ **Production Ready**: 800+ GitHub stars, active maintenance
3. ✅ **Proven**: Used in real production apps
4. ✅ **Good DX**: Clear docs, TypeScript support
5. ✅ **APNs Support**: Built-in push notification handling
6. ✅ **Low Risk**: Can disable if issues arise
7. ✅ **Fast Implementation**: 1.5-3 weeks vs. 2-3.5 for pure native
8. ✅ **Saves Time**: No need to write custom React Native bridge

**Why Not Pure Native Implementation**:
- ❌ Extra 2-3 days to write and maintain bridge code
- ❌ Reinventing the wheel (community package solves this)
- ❌ Must write own TypeScript type definitions
- ❌ More ongoing maintenance burden

### Implementation Plan

**Phase 1: Setup (Week 1)**
- [ ] Install `react-native-live-activities` package
- [ ] Add Widget Extension target in Xcode
- [ ] Configure package in existing Xcode project
- [ ] Test basic Live Activity on physical iOS device
- **Note**: You're already building in Xcode, so no prebuild/EAS needed!

**Phase 2: Integration (Week 2)**
- [ ] Create `liveActivityService.ts` abstraction
- [ ] Integrate with `useOptimisticCheckIn` hook
- [ ] Integrate with `deleteQueuedBeer` function
- [ ] Test queue add/delete flows

**Phase 3: UI & Polish (Week 3)**
- [ ] Design Swift widget UI (compact and expanded)
- [ ] Implement light/dark theme support
- [ ] Add offline indicator
- [ ] Accessibility testing (VoiceOver, Dynamic Type)

### Success Criteria

- ✅ Live Activity appears within 2 seconds of queue add
- ✅ Live Activity updates within 2 seconds of queue change
- ✅ Supports 1-5 beers in queue
- ✅ Works in light and dark mode
- ✅ Deep link opens app to Beerfinder tab
- ✅ No crashes or performance issues on iOS 16.1+

---

## Next Steps

1. **Approve Recommendation**: Confirm `react-native-live-activities` approach
2. **Setup APNs**: Generate APNs key in Apple Developer Portal
3. **Install Dependencies**: Run npm install commands
4. **Build Dev Client**: Create custom dev client with EAS Build
5. **Prototype**: Test basic Live Activity on physical device
6. **Iterate**: Follow implementation plan phases

---

## Appendix

### A: Useful Links

- **react-native-live-activities**: https://github.com/iburn/react-native-live-activities
- **Apple ActivityKit Docs**: https://developer.apple.com/documentation/activitykit
- **Expo Dev Client**: https://docs.expo.dev/development/introduction/
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **Apple HIG Live Activities**: https://developer.apple.com/design/human-interface-guidelines/live-activities

### B: Example Apps Using react-native-live-activities

- **Sports Score Tracker**: Live game scores on lock screen
- **Food Delivery**: Order status and ETA updates
- **Ride Sharing**: Driver location and arrival time
- **Package Tracking**: Delivery status updates

### C: Expo SDK 52 Considerations

Expo SDK 52 includes:
- React Native 0.76.x
- New Architecture support
- Improved dev client experience
- Better config plugin system

All compatible with `react-native-live-activities` v2.x.

### D: Cost Analysis

**Development Time**:
- Setup: 1 week
- Integration: 1 week
- UI/Polish: 1 week
- **Total**: 3 weeks @ developer rate = **Estimate cost based on team**

**Ongoing Maintenance**:
- ~2 hours/month for updates
- ~4 hours/quarter for React Native upgrades testing

**Infrastructure**:
- APNs: Free (included with Apple Developer account)
- EAS Build: Included in Expo plan or $29/month for priority builds

**Total First Year**: Development + ~12 hours maintenance = **Minimal ongoing cost**
