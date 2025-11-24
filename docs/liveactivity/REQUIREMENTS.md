# iOS Live Activity Requirements
## BeerSelector Beer Queue Live Activity

**Version**: 1.0
**Last Updated**: 2025-11-21
**Status**: Requirements Gathering
**Owner**: Development Team

---

## Executive Summary

### Feature Overview
An iOS Live Activity that displays the user's beer queue on their iPhone lock screen and Dynamic Island, providing at-a-glance visibility of beers awaiting confirmation at Flying Saucer locations.

### User Benefit Statement
UFO Club members will be able to monitor their beer queue status without unlocking their phone, reducing the need to repeatedly open the app to check which beers are awaiting employee confirmation. This enhances the check-in experience and keeps users informed throughout their visit.

### Success Criteria
- ✅ Live Activity appears on lock screen when user adds first beer to queue
- ✅ Displays all queued beer names (typically 1-3, max 5)
- ✅ Updates immediately when user adds/removes beers in-app
- ✅ Updates periodically (every 6 minutes) to reflect external changes
- ✅ Tapping Live Activity opens app to Beerfinder tab
- ✅ Supports both light and dark mode
- ✅ Ends gracefully when queue becomes empty
- ✅ Meets Apple accessibility standards (VoiceOver, Dynamic Type)

---

## User Stories

### Story 1: Queue Visibility on Lock Screen
**As a** UFO Club member
**I want to** see my beer queue on my lock screen
**So that** I can monitor which beers are awaiting confirmation without unlocking my phone

**Acceptance Criteria**:
- [ ] When I add a beer to my queue from the Beerfinder tab, a Live Activity appears on my lock screen within 2 seconds
- [ ] The Live Activity shows all beers currently in my queue (up to 5, typically 1-3)
- [ ] Each beer displays its name only (no timestamps, no container type, no location)
- [ ] Beer names are stripped of container types (e.g., "Firestone Walker Parabola (BTL)" displays as "Firestone Walker Parabola")
- [ ] The Live Activity is visible without unlocking my phone
- [ ] The Live Activity respects my iPhone's light/dark mode setting

### Story 2: Real-Time Queue Updates
**As a** UFO Club member
**I want to** see immediate updates when I add or remove beers from my queue
**So that** the Live Activity always shows accurate information

**Acceptance Criteria**:
- [ ] When I add a beer via "Check Me In!" button, the Live Activity updates within 2 seconds
- [ ] When I remove a beer via "Delete" in the queue modal, the Live Activity updates within 2 seconds
- [ ] If the app is offline, the Live Activity shows the last known state with an offline indicator
- [ ] When connectivity resumes, the Live Activity syncs to the current server state within 6 minutes

### Story 3: External Queue Changes
**As a** UFO Club member
**I want to** see updates when a Flying Saucer employee confirms my beer
**So that** I know when beers have been processed without opening the app

**Acceptance Criteria**:
- [ ] When an employee confirms a beer (removing it from queue), the Live Activity updates within 6 minutes
- [ ] If all beers are confirmed by employees, the Live Activity ends gracefully
- [ ] The Live Activity polls the API every 6 minutes for external changes (respecting Apple's ~10 updates/hour limit)

### Story 4: App Navigation from Live Activity
**As a** UFO Club member
**I want to** tap the Live Activity to open the app
**So that** I can quickly access the Beerfinder tab for more details

**Acceptance Criteria**:
- [ ] When I tap the Live Activity, the app opens to the Beerfinder tab
- [ ] If the app is already open to a different tab, tapping switches to Beerfinder
- [ ] Deep linking works even when app is fully closed
- [ ] Transition from lock screen to app is smooth (< 1 second)

### Story 5: Queue Completion
**As a** UFO Club member
**I want to** see the Live Activity end when my queue is empty
**So that** my lock screen doesn't show stale information

**Acceptance Criteria**:
- [ ] When the last beer is removed from queue (via delete or employee confirmation), the Live Activity ends within 10 seconds
- [ ] The Live Activity does not persist indefinitely when queue is empty
- [ ] If I delete all beers manually, the Live Activity ends immediately

---

## Functional Requirements

### FR-1: Live Activity Lifecycle

**FR-1.1: Activity Start**
- **Trigger**: User successfully adds first beer to queue via `checkInBeer()` API call
- **Timing**: Live Activity starts within 2 seconds of successful API response
- **Initial State**: Displays single queued beer with name and timestamp
- **Prerequisite**: User must be logged in as UFO Club member (not visitor mode)

**FR-1.2: Activity Update**
- **Trigger Events**:
  - User adds beer to queue (immediate)
  - User deletes beer from queue (immediate)
  - Periodic poll detects external change (every 6 minutes)
- **Update Mechanism**:
  - **In-app changes**: Push notification via APNs (immediate)
  - **External changes**: Background fetch every 6 minutes
- **Update Limit**: Maximum 10 updates per hour (Apple constraint)
- **Data Source**: `getQueuedBeers()` API endpoint

**FR-1.3: Activity End**
- **Trigger**: Queue becomes empty (all beers deleted or confirmed)
- **Timing**: Ends within 10 seconds of queue becoming empty
- **Cleanup**: Remove Live Activity from lock screen and Dynamic Island
- **State Persistence**: Do not preserve ended activity on device restart

### FR-2: Content Display

**FR-2.1: Compact View (Lock Screen)**
- **Primary Content**: List of all queued beer names (1-5 items, typically 1-3)
- **Beer Information**:
  - Beer name only (no container type, no timestamp, no location)
  - Container type stripped from API data (e.g., "Bell's Hopslam (Draft)" → "Bell's Hopslam")
- **Layout**: Vertical list with hairline dividers between items
- **Maximum Height**: Variable based on beer count (~40-140pt)

**FR-2.2: Expanded View (Dynamic Island - iPhone 14 Pro+)**
- **Content**: Same beer names as compact view with increased spacing
- **Layout**: Taller vertical list with better readability
- **Maximum Height**: Variable based on beer count
- **Interaction**: Same tap-to-open behavior as compact view

**FR-2.3: Minimal View (Dynamic Island - Inactive)**
- **Content**: Beer mug icon only
- **Icon**: Beer mug SF Symbol (`mug.fill`)
- **Purpose**: Persistent, non-intrusive indicator when not expanded

### FR-3: Data Synchronization

**FR-3.1: Immediate Updates (User Actions)**
- **Mechanism**: APNs push notification triggered by app
- **Latency**: < 2 seconds from user action to Live Activity update
- **Events**:
  - Beer added to queue via `checkInBeer()`
  - Beer deleted from queue via `deleteQueuedBeer()`
- **Payload**: Full updated queue state (beer names and IDs only)

**FR-3.2: Periodic Updates (External Changes)**
- **Mechanism**: Background URL session fetch
- **Frequency**: Every 6 minutes (10 updates/hour maximum)
- **Endpoint**: `getQueuedBeers()` API
- **Purpose**: Detect employee confirmations or other external queue changes
- **Budget Management**: Track update count to stay within Apple's limit

**FR-3.3: Offline Behavior**
- **Network Unavailable**: Display last known queue state
- **Visual Indicator**: Subtle "Offline" badge or icon
- **User Action**: Queue changes in-app (via operation queue) still reflected in Live Activity
- **Recovery**: Auto-sync when connectivity resumes, within next periodic poll window

### FR-4: Deep Linking

**FR-4.1: Tap Interaction**
- **Action**: Open BeerSelector app to Beerfinder tab
- **Deep Link URL**: `beerselector://beerfinder` (Expo Router)
- **Handling**:
  - App closed: Launch app and navigate to Beerfinder
  - App backgrounded: Bring to foreground and navigate to Beerfinder
  - App open (different tab): Switch to Beerfinder tab
- **Analytics**: Track Live Activity tap events for engagement metrics

**FR-4.2: Navigation State**
- **Target**: `app/(tabs)/beerlist.tsx` (Beerfinder component)
- **State Preservation**: Do not reset search/filter state in Beerfinder
- **Focus**: Scroll to top of Beerfinder list on arrival

### FR-5: Theme Support

**FR-5.1: Light Mode**
- **Background**: White (`#FFFFFF`)
- **Text**: Dark gray (`#11181C`)
- **Accent**: Teal (`#0a7ea4`) for queue count badge
- **Border**: Light gray (`#E0E0E0`)

**FR-5.2: Dark Mode**
- **Background**: Near-black (`#151718`)
- **Text**: Light gray (`#ECEDEE`)
- **Accent**: Pink (`#E91E63` - Untappd brand color) for queue count badge
- **Border**: Dark gray (`#333333`)

**FR-5.3: Automatic Switching**
- **Trigger**: Follow iOS system appearance setting
- **Update**: Live Activity theme updates immediately when user changes system setting

---

## Technical Requirements

### TR-1: Platform & Dependencies

**TR-1.1: iOS Version**
- **Minimum**: iOS 16.1 (Live Activities introduced)
- **Recommended**: iOS 16.2+ (improved stability)
- **Dynamic Island**: iPhone 14 Pro, iPhone 14 Pro Max, iPhone 15 Pro, iPhone 15 Pro Max (and newer)
- **Standard Live Activity**: All iOS 16.1+ devices

**TR-1.2: Expo SDK**
- **Current Version**: Expo SDK 52
- **Official Support**: No official Expo Live Activity module as of SDK 52
- **Options**:
  1. Community package with `expo-dev-client` (recommended)
  2. Bare workflow with custom Swift code (fallback)
  3. Wait for official Expo support (not viable for immediate implementation)

**TR-1.3: Required Dependencies**
```json
{
  "expo-live-activities": "^1.0.0",  // Community package (if available)
  "react-native-live-activities": "^2.0.0",  // Alternative option
  "expo-dev-client": "^5.0.0"  // Required for community packages
}
```

### TR-2: APNs Configuration

**TR-2.1: Apple Developer Requirements**
- **Certificate**: APNs certificate for BeerSelector app
- **Capabilities**: Push Notifications enabled in Xcode
- **Bundle ID**: `org.verily.FSbeerselector`
- **Entitlements**: `com.apple.developer.live-activities` entitlement

**TR-2.2: Push Notification Payload**
```json
{
  "aps": {
    "timestamp": 1699999999,
    "event": "update",
    "content-state": {
      "beers": [
        {
          "id": "123456",
          "name": "Bell's Hopslam"
        },
        {
          "id": "123457",
          "name": "Firestone Walker Parabola"
        },
        {
          "id": "123458",
          "name": "Stone Enjoy By IPA"
        }
      ]
    }
  }
}
```

**Note**: Beer names should be stripped of container type (e.g., "(Draft)", "(BTL)") before sending payload.

**TR-2.3: Push Notification Server**
- **Current**: BeerSelector app currently does not send push notifications
- **New Requirement**: Backend service to send APNs push for Live Activity updates
- **Trigger Points**:
  - User adds beer → Send push to update user's Live Activity
  - User deletes beer → Send push to update user's Live Activity
  - Employee confirms beer → Send push to update user's Live Activity (future enhancement)

### TR-3: Native Implementation (iOS)

**TR-3.1: Swift Widget Extension**
- **Target**: `BeerSelectorLiveActivity` (new iOS widget extension)
- **Framework**: `ActivityKit` (iOS 16.1+)
- **File Structure**:
  ```
  ios/
  ├── BeerSelectorLiveActivity/
  │   ├── BeerQueueLiveActivity.swift
  │   ├── BeerQueueAttributes.swift
  │   ├── Assets.xcassets/
  │   └── Info.plist
  └── BeerSelector.xcodeproj
  ```

**TR-3.2: ActivityKit Attributes**
```swift
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

struct QueuedBeer: Codable, Hashable {
    let id: String
    let name: String
    let date: String
}
```

**TR-3.3: React Native Bridge**
- **Purpose**: Expose Swift Live Activity functions to React Native
- **Module**: `LiveActivityModule.swift`
- **Methods**:
  - `startActivity(queueState: QueueState)` → String (activity ID)
  - `updateActivity(activityId: String, queueState: QueueState)` → Bool
  - `endActivity(activityId: String)` → Bool

### TR-4: React Native Integration

**TR-4.1: Service Layer**
- **File**: `src/services/liveActivityService.ts`
- **Purpose**: Abstract native Live Activity module
- **Functions**:
  ```typescript
  export async function startLiveActivity(queueState: QueueState): Promise<string>
  export async function updateLiveActivity(queueState: QueueState): Promise<void>
  export async function endLiveActivity(): Promise<void>
  export async function isLiveActivitySupported(): Promise<boolean>
  ```

**TR-4.2: Integration Points**
1. **Queue Add** (`hooks/useOptimisticCheckIn.ts`):
   ```typescript
   // After successful checkInBeer()
   const queueState = await getQueuedBeers();
   await updateLiveActivity(queueState);
   ```

2. **Queue Delete** (`components/Beerfinder.tsx`):
   ```typescript
   // After successful deleteQueuedBeer()
   const queueState = await getQueuedBeers();
   if (queueState.length === 0) {
     await endLiveActivity();
   } else {
     await updateLiveActivity(queueState);
   }
   ```

3. **App Launch** (`app/_layout.tsx`):
   ```typescript
   // During initialization
   const isSupported = await isLiveActivitySupported();
   if (isSupported) {
     const queueState = await getQueuedBeers();
     if (queueState.length > 0) {
       await startLiveActivity(queueState);
     }
   }
   ```

**TR-4.3: Type Definitions**
```typescript
// src/types/liveActivity.ts
export interface QueueState {
  beers: QueuedBeer[];
}

export interface QueuedBeer {
  id: string;
  name: string;  // Stripped of container type
}

export interface LiveActivityConfig {
  activityId: string | null;
  isActive: boolean;
  lastUpdated: Date | null;
}
```

### TR-5: Error Handling

**TR-5.1: Network Failures**
- **Scenario**: API call to `getQueuedBeers()` fails
- **Behavior**: Display last known queue state with offline indicator
- **Recovery**: Retry on next periodic poll or user-triggered refresh

**TR-5.2: Session Expiration**
- **Scenario**: User session expires while Live Activity is active
- **Behavior**: Show generic message: "Please open app to refresh"
- **Action**: End Live Activity gracefully, do not show sensitive data

**TR-5.3: APNs Delivery Failure**
- **Scenario**: Push notification fails to deliver
- **Fallback**: Periodic poll will catch update within 6 minutes
- **Logging**: Log APNs errors for debugging

**TR-5.4: Widget Extension Crash**
- **Scenario**: Swift widget extension crashes
- **Recovery**: iOS automatically restarts widget, Live Activity recreated on next update
- **Mitigation**: Comprehensive error handling in Swift code, avoid force unwraps

**TR-5.5: Unsupported Device**
- **Scenario**: User on iOS < 16.1
- **Behavior**: `isLiveActivitySupported()` returns false
- **Graceful Degradation**: App continues to work normally without Live Activity feature

---

## UI/UX Specifications

### UX-1: Visual Design

**UX-1.1: Layout Structure**
```
┌───────────────────────────────────────┐
│                                       │
│  Bell's Hopslam                       │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Firestone Walker Parabola            │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Stone Enjoy By IPA                   │
│                                       │
└───────────────────────────────────────┘
```

**UX-1.2: Typography**
- **Beer Name**: SF Pro Text, 15pt, Semibold
- **Dynamic Type**: Support all iOS text size settings (xSmall to AX5)

**UX-1.3: Spacing**
- **Outer Padding**: 16pt horizontal, 12pt vertical
- **Inter-item Spacing**: 12pt vertical padding per beer
- **Dividers**: 0.5pt hairline between beers

**UX-1.4: Colors** (see FR-5 for full palette)
- **Dividers**: 0.5pt hairline, border color
- **Minimal Icon**: Beer mug SF Symbol (`mug.fill`), 16pt, accent color

### UX-2: Accessibility

**UX-2.1: VoiceOver**
- **Live Activity Label**: "Beer queue. 3 beers."
- **Beer Item**: "Bell's Hopslam", "Firestone Walker Parabola", "Stone Enjoy By IPA"
- **Tap Hint**: "Double-tap to open BeerSelector app"

**UX-2.2: Dynamic Type**
- **Minimum Font Size**: 15pt (beer names)
- **Maximum Font Size**: Scale up to AX5 (accessibility extra extra extra large)
- **Layout Reflow**: Text wraps to single line with ellipsis if needed

**UX-2.3: High Contrast Mode**
- **Border Width**: Increase from 0.5pt to 1pt in high contrast
- **Text Contrast**: Ensure WCAG AA compliance (4.5:1 minimum)

**UX-2.4: Reduce Motion**
- **Animation**: Disable all animations if Reduce Motion enabled
- **Transitions**: Instant state changes instead of fades/slides

### UX-3: Interaction Design

**UX-3.1: Tap Target**
- **Entire Live Activity**: Tappable area (no internal buttons)
- **Minimum Size**: 44pt height (Apple HIG minimum)
- **Visual Feedback**: Subtle scale-down animation on tap (if Reduce Motion disabled)

**UX-3.2: State Transitions**
- **Appear**: Fade in from bottom over 0.3s
- **Update**: Cross-fade content over 0.2s
- **Dismiss**: Fade out over 0.3s

---

## Security & Privacy

### SEC-1: Data Exposure

**SEC-1.1: Lock Screen Visibility**
- **Risk**: Beer names visible on lock screen to anyone
- **Mitigation**: User explicitly triggered Live Activity by checking in beer
- **Assumption**: User understands lock screen visibility when using feature
- **Future Enhancement**: Add setting to show generic "X beers queued" instead of names

**SEC-1.2: Session Data**
- **Requirement**: Do not display sensitive session data (member ID, session token)
- **Display**: Only beer names, timestamps, store location (public information)
- **Storage**: Session tokens stored in shared app group keychain (iOS secure enclave)

### SEC-2: Authentication

**SEC-2.1: Session Validation**
- **Check**: Validate session before starting Live Activity
- **Expiry Handling**: End Live Activity gracefully if session expires
- **Re-authentication**: User must re-login in app to restart Live Activity

**SEC-2.2: Visitor Mode**
- **Restriction**: Live Activity disabled for visitor mode users
- **Reason**: Visitors cannot queue beers (no check-in functionality)
- **Check**: `getPreference('is_visitor_mode')` returns false

---

## Testing Strategy

### TEST-1: Unit Tests (Jest)

**TEST-1.1: Service Layer**
- File: `src/services/__tests__/liveActivityService.test.ts`
- Tests:
  - `startLiveActivity()` calls native module correctly
  - `updateLiveActivity()` handles empty queue state
  - `endLiveActivity()` cleans up activity ID
  - `isLiveActivitySupported()` returns false on iOS < 16.1

**TEST-1.2: Type Guards**
- File: `src/types/__tests__/liveActivity.test.ts`
- Tests:
  - `isQueueState()` validates queue state structure
  - Invalid data returns false

### TEST-2: Integration Tests (Maestro)

**TEST-2.1: Queue Add Flow**
- File: `.maestro/live-activity-add.yaml`
- Steps:
  1. Launch app
  2. Navigate to Beerfinder
  3. Search for beer
  4. Tap "Check Me In!"
  5. Lock screen
  6. Assert Live Activity visible
  7. Assert beer name displayed

**TEST-2.2: Queue Delete Flow**
- File: `.maestro/live-activity-delete.yaml`
- Steps:
  1. Launch app with queue
  2. Open queue modal
  3. Delete all beers
  4. Lock screen
  5. Assert Live Activity ended

**TEST-2.3: Deep Link Flow**
- File: `.maestro/live-activity-deeplink.yaml`
- Steps:
  1. Launch app
  2. Add beer to queue
  3. Navigate to different tab
  4. Lock screen
  5. Tap Live Activity
  6. Assert app opens to Beerfinder tab

### TEST-3: Manual Testing

**TEST-3.1: Theme Switching**
- Switch iOS between light/dark mode
- Verify Live Activity updates theme immediately
- Check color contrast and readability

**TEST-3.2: Update Timing**
- Add beer, measure time to Live Activity update (< 2s target)
- Delete beer, measure time to Live Activity update (< 2s target)
- Verify periodic poll occurs every 6 minutes

**TEST-3.3: Edge Cases**
- Add 5 beers (maximum expected), verify layout
- Add 1 beer, verify minimal layout
- Offline mode, verify offline indicator
- Session expiry, verify graceful degradation

---

## Performance Requirements

### PERF-1: Latency

**PERF-1.1: Update Latency**
- **Target**: < 2 seconds from user action to Live Activity update
- **Measurement**: Time from `checkInBeer()` success to Live Activity render
- **Acceptance**: 95th percentile < 2s

**PERF-1.2: App Launch**
- **Target**: < 500ms from Live Activity tap to app foreground
- **Measurement**: Time from tap to Beerfinder screen visible
- **Acceptance**: 95th percentile < 500ms

### PERF-2: Battery Impact

**PERF-2.1: Update Frequency**
- **Constraint**: Maximum 10 updates per hour (Apple limit)
- **Strategy**:
  - Immediate updates for user actions (not counted against limit)
  - Periodic polls every 6 minutes = 10/hour exactly
- **Monitoring**: Track update count in app logs

**PERF-2.2: Network Usage**
- **Target**: < 5 KB per update
- **Payload**: Minimal JSON (queue state only)
- **Optimization**: Use gzip compression for APNs payloads

### PERF-3: Memory

**PERF-3.1: Widget Extension**
- **Target**: < 15 MB memory footprint
- **Measurement**: Xcode Instruments Memory Profiler
- **Optimization**: Release images/assets when not visible

---

## Open Questions & Risks

### Q-1: Expo SDK Support

**Question**: Does Expo SDK 52 support Live Activities via community packages?
**Impact**: High - determines implementation approach (managed vs. bare)
**Action**: Research `expo-live-activities` and `react-native-live-activities` packages
**Decision By**: End of Phase 1 (Research & Decision)

### Q-2: APNs Certificate

**Question**: Who manages the APNs certificate for BeerSelector app?
**Impact**: High - required for immediate updates
**Action**: Identify certificate owner, request access
**Decision By**: Start of Phase 3 (APNs Integration)

### Q-3: Backend Push Service

**Question**: Does Flying Saucer API support sending APNs push notifications?
**Impact**: Medium - affects hybrid update strategy
**Alternatives**:
  - App-initiated push (app sends push to itself via backend)
  - Periodic polling only (acceptable fallback)
**Action**: Investigate API documentation, contact backend team
**Decision By**: End of Phase 2 (Prototype Development)

### R-1: Battery Drain Risk

**Risk**: Frequent updates may drain user battery
**Probability**: Medium
**Mitigation**:
  - Respect Apple's 10 updates/hour limit
  - Profile battery usage with Xcode Energy Diagnostics
  - Provide user setting to disable Live Activity
**Monitoring**: Track battery complaints in user feedback

### R-2: Expo Ejection Risk

**Risk**: May need to eject from Expo managed workflow
**Probability**: Medium
**Impact**: High - increases maintenance complexity
**Mitigation**:
  - Exhaust all community package options first
  - Document bare workflow setup thoroughly
  - Consider waiting for official Expo support if not urgent

### R-3: APNs Reliability

**Risk**: APNs push notifications may not always deliver
**Probability**: Low
**Impact**: Medium - Live Activity shows stale data
**Mitigation**:
  - Periodic polling as fallback (every 6 minutes)
  - Display "last updated" timestamp
  - User can manually refresh by opening app

---

## Implementation Phases

### Phase 1: Research & Decision (1-2 weeks)
- [ ] Investigate Expo SDK 52 Live Activity support
- [ ] Evaluate community packages (`expo-live-activities`, `react-native-live-activities`)
- [ ] Prototype basic Live Activity in test project
- [ ] Decide: Managed workflow + community package OR bare workflow
- [ ] Document chosen approach in `TECHNICAL_ANALYSIS.md`

### Phase 2: Prototype Development (2-3 weeks)
- [ ] Set up Live Activity widget extension (if bare workflow)
- [ ] Create `liveActivityService.ts` abstraction layer
- [ ] Implement start/update/end functions
- [ ] Integrate with queue add/delete flows
- [ ] Build basic UI (single beer, minimal styling)
- [ ] Test on physical iOS device (Live Activities don't work in simulator)

### Phase 3: APNs Integration (1-2 weeks)
- [ ] Configure APNs certificate in Apple Developer account
- [ ] Set up push notification backend service (or app-initiated push)
- [ ] Implement immediate update via push notifications
- [ ] Test push delivery and latency
- [ ] Add error handling for push failures

### Phase 4: UI Polish & Theming (1 week)
- [ ] Implement full UI design (compact and expanded views)
- [ ] Add light/dark theme support
- [ ] Test with 1-5 beers in queue
- [ ] Ensure accessibility compliance (VoiceOver, Dynamic Type)
- [ ] Add offline indicator and error states

### Phase 5: Testing & Refinement (1-2 weeks)
- [ ] Write unit tests for service layer
- [ ] Create Maestro E2E tests for queue flows
- [ ] Manual testing on multiple iOS versions (16.1, 16.2, 17.x)
- [ ] Test Dynamic Island on iPhone 14 Pro / 15 Pro
- [ ] Profile battery usage with Instruments
- [ ] Fix bugs and performance issues

### Phase 6: Production Release (1 week)
- [ ] Final QA testing
- [ ] Update app store screenshots (show Live Activity)
- [ ] Submit to App Store review
- [ ] Monitor crash reports and user feedback
- [ ] Iterate based on real-world usage

---

## Success Metrics

### Adoption
- **Target**: 60% of UFO Club members enable Live Activity within first month
- **Measurement**: Track `startLiveActivity()` calls vs. total active users

### Engagement
- **Target**: 30% of Live Activity taps result in app opens
- **Measurement**: Track deep link events from Live Activity

### Reliability
- **Target**: 99% uptime (Live Activity visible when queue non-empty)
- **Measurement**: Error rate for `startLiveActivity()` and `updateLiveActivity()`

### Performance
- **Target**: < 2s average update latency
- **Measurement**: Time from API success to Live Activity render

### User Satisfaction
- **Target**: 4.5+ star rating on App Store with Live Activity mentions
- **Measurement**: Sentiment analysis of user reviews mentioning "live activity" or "lock screen"

---

## Appendix

### A: Apple Human Interface Guidelines Reference
- Official Docs: https://developer.apple.com/design/human-interface-guidelines/live-activities
- ActivityKit Framework: https://developer.apple.com/documentation/activitykit
- Best Practices: https://developer.apple.com/videos/play/wwdc2023/10184/

### B: Flying Saucer API Endpoints
- **Get Queue**: `GET /memberQueues.php`
- **Add to Queue**: `POST /addToQueue.php`
- **Delete from Queue**: `GET /deleteQueuedBrew.php?cid={cid}`

### C: BeerSelector Queue Service
- **Service**: `src/api/queueService.ts`
- **Types**: `src/utils/htmlParser.ts` (QueuedBeer type)
- **Context**: `context/AppContext.tsx` (queuedBeerIds)

### D: Related Documentation
- `CLAUDE.md` - Project overview and conventions
- `docs/ENVIRONMENT_VARIABLES.md` - Configuration guide
- `docs/REFRESH_PLAN.md` - Data refresh strategy
- `MIGRATION_GUIDE_REPOSITORIES.md` - Database patterns
