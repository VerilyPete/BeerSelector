> **SUPERSEDED**: This document contains the original implementation notes. For the final implementation details, see:
>
> - `IMPLEMENTATION_COMPLETE.md` - Summary of completed implementation
> - `AUTO_DISMISS_IMPLEMENTATION.md` - Detailed implementation plan with work items
>
> The key difference: This document described a legacy Native Modules approach, but the actual implementation uses Expo Modules API for better maintainability.

Here are detailed implementation notes for Claude Code:

---

## Live Activity Auto-Dismiss Implementation (Original Notes)

### Overview

Implement automatic dismissal of the BeerSelector Live Activity 3 hours after the last queue modification. Since dismissal policies can only be set when ending an activity (not updated on an existing one), we use an end-and-restart pattern to reset the timeout window on each queue change.

### Current Architecture Context

- BeerSelector is a React Native app built with Expo
- The app displays a beer queue on the iOS lock screen via Live Activity
- Queue updates come from the bar's backend server via API polling/push
- No backend server under our control exists to send ActivityKit push notifications

### Implementation Requirements

#### 1. Track the Live Activity Instance

Ensure the native Live Activity module maintains a reference to the current activity so it can be ended and restarted:

```swift
// In your LiveActivityModule.swift or equivalent
private var currentActivity: Activity<BeerQueueAttributes>?
```

#### 2. Create a `restartActivity` Function

This function ends the current activity and immediately starts a new one with the same state:

```swift
@objc(restartActivity:)
func restartActivity(queueData: NSDictionary) {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

    Task {
        // End existing activity if present
        if let existingActivity = currentActivity {
            await existingActivity.end(nil, dismissalPolicy: .immediate)
        }

        // Start fresh activity with current queue state
        let attributes = BeerQueueAttributes(/* static attributes */)
        let contentState = BeerQueueAttributes.ContentState(
            // Map queueData to your content state
        )

        let content = ActivityContent(
            state: contentState,
            staleDate: Calendar.current.date(byAdding: .hour, value: 3, to: Date())
        )

        do {
            currentActivity = try Activity<BeerQueueAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
        } catch {
            print("Failed to start Live Activity: \(error)")
        }
    }
}
```

#### 3. Modify Queue Update Handler

Wherever the app receives queue updates from the bar's API, call `restartActivity` instead of just updating:

**Before (conceptual):**

```javascript
// React Native side
function onQueueUpdate(newQueue) {
  LiveActivity.updateActivity(newQueue);
}
```

**After:**

```javascript
function onQueueUpdate(newQueue) {
  if (newQueue.length === 0) {
    LiveActivity.endActivity();
  } else {
    LiveActivity.restartActivity(newQueue);
  }
}
```

#### 4. End Activity When Queue is Empty

When the API returns an empty queue, end the activity immediately:

```swift
@objc(endActivity)
func endActivity() {
    Task {
        if let existingActivity = currentActivity {
            await existingActivity.end(nil, dismissalPolicy: .immediate)
            currentActivity = nil
        }
    }
}
```

#### 5. Handle App Launch with Existing Activities

When the app launches, check for orphaned Live Activities and clean them up or reconnect:

```swift
@objc(syncActivitiesOnLaunch:)
func syncActivitiesOnLaunch(currentQueueData: NSDictionary?) {
    Task {
        let existingActivities = Activity<BeerQueueAttributes>.activities

        if let queueData = currentQueueData, /* queue is not empty */ {
            // Restart with current data to reset the 3-hour timeout
            await restartActivity(queueData: queueData)
        } else {
            // No queue, end any orphaned activities
            for activity in existingActivities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
```

Call this from the React Native side during app initialization after fetching current queue state from the API.

#### 6. Update the React Native Bridge

Ensure the native module exports these methods:

```objc
// LiveActivityModule.m
RCT_EXTERN_MODULE(LiveActivity, NSObject)
RCT_EXTERN_METHOD(startActivity:(NSDictionary *)queueData)
RCT_EXTERN_METHOD(updateActivity:(NSDictionary *)queueData)  // Can keep for minor updates if needed
RCT_EXTERN_METHOD(restartActivity:(NSDictionary *)queueData)
RCT_EXTERN_METHOD(endActivity)
RCT_EXTERN_METHOD(syncActivitiesOnLaunch:(NSDictionary *)currentQueueData)
```

### Edge Cases to Handle

1. **Rapid queue updates**: If the bar updates the queue multiple times in quick succession, the end-and-restart will fire for each. This should be fine but consider debouncing on the JS side (e.g., 500ms) if you see UI flicker.

2. **App terminated while activity is live**: The activity will remain visible but become stale after 3 hours (via `staleDate`). It will auto-remove after 8 hours max per iOS system limits. The `syncActivitiesOnLaunch` handles cleanup when the app reopens.

3. **Activity authorization disabled**: Always check `ActivityAuthorizationInfo().areActivitiesEnabled` before attempting to start activities.

4. **Foreground requirement for start**: The restart must happen while the app is in the foreground. If a queue update arrives via background fetch, you can update an existing activity but cannot restart it. Consider storing a flag to restart on next foreground if needed.

### Testing Checklist

- [ ] Adding item to queue starts Live Activity (if not already active)
- [ ] Adding item to existing queue restarts activity (verify no persistent flicker)
- [ ] Emptying queue ends activity immediately
- [ ] Activity shows stale state after 3 hours if app never reopened
- [ ] Launching app with existing orphaned activity cleans it up appropriately
- [ ] Launching app with valid queue restarts activity with fresh timeout

---

Let me know if you need me to look at the existing codebase structure to tailor these notes more specifically to what's already there.
