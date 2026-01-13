# iOS Build & Live Activities

## Build Approach

**Local Xcode Builds**: This project uses **local Xcode builds**, not EAS (Expo Application Services).

### Why Local Builds?
- Direct control over native iOS features (Live Activities, Widgets)
- Manual code signing and provisioning profile configuration
- Widget Extensions require direct Xcode project access
- No dependency on EAS build servers

### Build Steps

```bash
# 1. Install dependencies
npm install

# 2. Generate native projects (if needed)
npx expo prebuild --platform ios

# 3. Install CocoaPods
cd ios && pod install && cd ..

# 4. Open in Xcode
open ios/BeerSelector.xcworkspace
```

**Important**: Always open `.xcworkspace`, not `.xcodeproj`.

### Build Configuration

| Setting | Value |
|---------|-------|
| Bundle ID | `org.verily.FSbeerselector` |
| Minimum iOS | 17.6 |
| New Architecture | Enabled |
| Code Signing | Manual |

## Live Activities

iOS Live Activities show beer queue status on the Lock Screen and Dynamic Island.

### Architecture

```
┌─────────────────────────────────────┐
│  React Native App                   │
│  └── modules/live-activity/         │
│      └── LiveActivityModule.swift   │
└──────────────┬──────────────────────┘
               │ Expo Modules API
               ▼
┌─────────────────────────────────────┐
│  Widget Extension                   │
│  └── ios/BeerQueueWidget/           │
│      └── BeerQueueWidgetLiveActivity│
└─────────────────────────────────────┘
               │
               ▼
        ┌──────────────┐
        │ App Group    │
        │ Shared Data  │
        └──────────────┘
```

### Key Details

| Setting | Value |
|---------|-------|
| App Group | `group.org.verily.FSbeerselector.beerqueue` |
| Update Mode | Local only (no push) |
| Auto-dismiss | 3 hours after last update |
| Implementation | Pure Swift via Expo Modules API |

### Usage in React Native

```typescript
import LiveActivityModule from '@/modules/live-activity';

// Check if Live Activities are enabled
const enabled = await LiveActivityModule.areActivitiesEnabled();

// Start or restart activity (recommended - handles auto-dismiss)
const activityId = await LiveActivityModule.restartActivity({
  memberId: 'M123',
  storeId: 'S456',
  beers: [
    { id: '1', name: 'Test IPA' },
    { id: '2', name: 'Lager' }
  ],
});

// Update existing activity
await LiveActivityModule.updateActivity(activityId, {
  memberId: 'M123',
  storeId: 'S456',
  beers: updatedBeers,
});

// End all activities
await LiveActivityModule.endAllActivities();
```

### Auto-Dismiss Pattern

Live Activities use an end-and-restart pattern for auto-dismiss:

1. When starting/updating, activity is configured to auto-dismiss in 3 hours
2. Each update restarts the 3-hour timer
3. If no updates for 3 hours, iOS automatically dismisses the activity
4. No backend or push notifications required

### Module Files

| File | Purpose |
|------|---------|
| `modules/live-activity/ios/LiveActivityModule.swift` | Swift implementation |
| `modules/live-activity/ios/LiveActivity.podspec` | CocoaPods config |
| `modules/live-activity/src/index.ts` | TypeScript exports |
| `modules/live-activity/expo-module.config.json` | Expo module config |

### Widget Extension Files

| File | Purpose |
|------|---------|
| `ios/BeerQueueWidget/BeerQueueWidgetLiveActivity.swift` | Live Activity UI |
| `ios/BeerQueueWidget/BeerQueueWidgetBundle.swift` | Widget bundle |
| `ios/BeerQueueWidget/Info.plist` | Extension config |

### Troubleshooting

**Activity not appearing:**
1. Check `areActivitiesEnabled()` returns true
2. Verify App Group is configured in both app and extension
3. Check iOS Settings > BeerSelector > Live Activities is enabled

**CocoaPods issues:**
```bash
cd ios
pod deintegrate
pod install
```

**Module not linking:**
1. Ensure `DEFINES_MODULE = YES` in podspec
2. Run `npx expo prebuild --clean`
3. Reinstall pods

### Full Documentation

See `docs/liveactivity/IMPLEMENTATION_COMPLETE.md` for complete implementation details.
