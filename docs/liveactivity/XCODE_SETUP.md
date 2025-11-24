# Xcode Setup Guide for Live Activities
## BeerSelector - Step-by-Step Configuration

**Xcode Version**: 16.x (tested with 16.1+)
**iOS Requirement**: 16.1+
**Last Updated**: 2025-11-21
**Package**: react-native-live-activities

---

## Prerequisites

Before starting, ensure you have:
- ✅ Xcode 16.0 or later installed
- ✅ iOS deployment target set to 16.1 or higher
- ✅ Physical iOS device with iOS 16.1+ (Live Activities don't work in Simulator)
- ✅ Valid Apple Developer account

**Note**: You mentioned "Xcode 26" - the current version is **Xcode 16.x**. This guide is updated for Xcode 16.1+ (November 2025).

---

## Step 1: Install react-native-live-activities Package

```bash
cd /workspace/BeerSelector
npm install react-native-live-activities

# Install CocoaPods dependencies
cd ios
pod install
cd ..
```

---

## Step 2: Create Widget Extension Target in Xcode

### 2.1 Open Your Xcode Project
```bash
cd ios
open BeerSelector.xcworkspace  # Use .xcworkspace, not .xcodeproj
```

### 2.2 Add Widget Extension Target

1. In Xcode menu: **File → New → Target...**

2. In the template selector:
   - **iOS** tab → **Application Extension** section
   - Select **Widget Extension**
   - Click **Next**

3. Configure the extension:
   - **Product Name**: `BeerQueueWidget` (or your preferred name)
   - **Team**: Select your Apple Developer team
   - **Organization Identifier**: `org.verily` (match your app's identifier)
   - ✅ **CRITICAL**: Check **"Include Live Activity"** checkbox
   - **Language**: Swift
   - Click **Finish**

4. When prompted "Activate 'BeerQueueWidget' scheme?":
   - Click **"Don't Activate"** (you'll continue using the main app scheme)

### 2.3 Verify Widget Extension Created

You should now see in your Project Navigator:
```
BeerSelector/
├── BeerSelector/          (main app)
├── BeerQueueWidget/       (new widget extension)
│   ├── BeerQueueWidget.swift
│   ├── BeerQueueWidgetLiveActivity.swift  ← Live Activity code goes here
│   ├── Assets.xcassets
│   └── Info.plist
└── Pods/
```

---

## Step 3: Configure Main App Target

### 3.1 Enable Live Activities in Info.plist

**Option A: Using Xcode UI** (Recommended)
1. Select **BeerSelector** target (not the widget)
2. Go to **Info** tab
3. Hover over any key and click **+** to add a new key
4. Add the following keys:

| Key | Type | Value |
|-----|------|-------|
| `NSSupportsLiveActivities` | Boolean | YES |
| `NSSupportsLiveActivitiesPushNotifications` | Boolean | YES (for push updates) |

**Option B: Direct XML Editing**
1. Right-click `Info.plist` in Project Navigator
2. **Open As → Source Code**
3. Add inside the `<dict>` tag:

```xml
<key>NSSupportsLiveActivities</key>
<true/>
<key>NSSupportsLiveActivitiesPushNotifications</key>
<true/>
```

### 3.2 Add Required Capabilities

1. Select **BeerSelector** target
2. Go to **Signing & Capabilities** tab
3. Click **+ Capability** button
4. Add the following capabilities:

#### a) Push Notifications
- Search for **"Push Notifications"**
- Click to add

#### b) Background Modes
- Search for **"Background Modes"**
- Click to add
- Check the following options:
  - ✅ **Remote notifications**

### 3.3 Set Deployment Target

1. Select **BeerSelector** target
2. **General** tab → **Deployment Info**
3. Set **Minimum Deployments** to **iOS 16.1** or higher

---

## Step 4: Configure Widget Extension Target

### 4.1 Set Deployment Target

1. Select **BeerQueueWidget** target (the widget, not main app)
2. **General** tab → **Deployment Info**
3. Set **Minimum Deployments** to **iOS 16.1** or higher

**Important**: Widget and main app must have matching or compatible deployment targets.

### 4.2 Configure Widget Extension Frameworks

1. Select **BeerQueueWidget** target
2. **General** tab → **Frameworks, Libraries, and Embedded Content**
3. Verify the following frameworks are present:
   - **WidgetKit.framework**
   - **SwiftUI.framework**
   - **ActivityKit.framework** (should be auto-added with "Include Live Activity")

If any are missing:
- Click **+** button
- Search for the framework name
- Add it with **Embed** setting: **Do Not Embed**

### 4.3 Add react-native-live-activities to Widget (Optional)

If you need to share code between your widget and the package:

1. In your **Podfile**, add a target for the widget:

```ruby
target 'BeerSelector' do
  # Existing pods...

  # Add this block
  target 'BeerQueueWidget' do
    inherit! :search_paths
    # Only add if you need the package in the widget itself
    # Most implementations don't need this
  end
end
```

2. Run `pod install` after editing the Podfile

---

## Step 5: Configure App Groups (For Shared Data)

If you need to share data between your main app and widget:

### 5.1 Enable App Groups Capability

**For Main App:**
1. Select **BeerSelector** target
2. **Signing & Capabilities** tab
3. Click **+ Capability** → **App Groups**
4. Click **+** under App Groups
5. Enter: `group.org.verily.FSbeerselector.shared`
6. Check the checkbox to enable it

**For Widget Extension:**
1. Select **BeerQueueWidget** target
2. **Signing & Capabilities** tab
3. Click **+ Capability** → **App Groups**
4. Click **+** under App Groups
5. Enter the **same group ID**: `group.org.verily.FSbeerselector.shared`
6. Check the checkbox to enable it

**Important**: Both targets must use the exact same App Group identifier.

---

## Step 6: Configure Build Phases

### 6.1 Verify Widget Embedding

1. Select **BeerSelector** target (main app)
2. **Build Phases** tab
3. Expand **Embed Foundation Extensions** (or **Embed App Extensions**)
4. Verify `BeerQueueWidget.appex` is listed
5. **CRITICAL**: Ensure **"Copy only when installing"** is **UNCHECKED**

This ensures the widget is embedded in your app bundle for testing.

---

## Step 7: Update Target Membership for Live Activity Files

To make your Live Activity attributes accessible from both the widget and main app:

### 7.1 Locate Live Activity Swift File

Find the file created by Xcode:
- **BeerQueueWidget/BeerQueueWidgetLiveActivity.swift**

### 7.2 Add to Main App Target

1. Select the file in Project Navigator
2. Open **Inspector** panel (right sidebar, File Inspector icon)
3. Under **Target Membership** section:
   - ✅ Check **BeerQueueWidget** (already checked)
   - ✅ Check **BeerSelector** (add this!)

This allows your React Native code to reference the Swift Live Activity attributes.

---

## Step 8: Configure Signing

### 8.1 Main App Signing

1. Select **BeerSelector** target
2. **Signing & Capabilities** tab
3. Ensure **Automatically manage signing** is checked
4. Select your **Team**
5. Verify **Bundle Identifier**: `org.verily.FSbeerselector`

### 8.2 Widget Extension Signing

1. Select **BeerQueueWidget** target
2. **Signing & Capabilities** tab
3. Ensure **Automatically manage signing** is checked
4. Select your **Team** (same as main app)
5. Verify **Bundle Identifier**: `org.verily.FSbeerselector.BeerQueueWidget`

**Important**: Widget bundle ID must be a child of the main app's bundle ID.

---

## Step 9: Setup APNs for Push Updates (Optional but Recommended)

### 9.1 Generate APNs Key in Apple Developer Portal

1. Go to [developer.apple.com](https://developer.apple.com)
2. **Certificates, Identifiers & Profiles** → **Keys**
3. Click **+** to create a new key
4. **Key Name**: `BeerSelector APNs Key`
5. Check **Apple Push Notifications service (APNs)**
6. Click **Continue** → **Register**
7. Download the `.p8` file
8. **Save these values** (you'll need them):
   - **Key ID**: (10-character ID shown)
   - **Team ID**: (in top-right of developer portal)

**Critical**: `.p8` keys are the modern approach. Do NOT use `.p12` certificates for Live Activities.

### 9.2 Store APNs Credentials Securely

Save the `.p8` file and credentials in a secure location:
```
/path/to/secure/location/
└── AuthKey_XXXXXXXXXX.p8  (your downloaded key)
```

You'll use these to send push notifications for Live Activity updates.

---

## Step 10: Verify Installation

### 10.1 Build Settings Check

Run these checks to ensure everything is configured:

**For BeerSelector Target:**
```
Deployment Target: iOS 16.1+
Capabilities:
  - Push Notifications ✅
  - App Groups (if using shared data) ✅
  - Background Modes ✅
Info.plist:
  - NSSupportsLiveActivities = YES ✅
  - NSSupportsLiveActivitiesPushNotifications = YES ✅
```

**For BeerQueueWidget Target:**
```
Deployment Target: iOS 16.1+
Capabilities:
  - App Groups (if using shared data) ✅
Frameworks:
  - WidgetKit.framework ✅
  - SwiftUI.framework ✅
  - ActivityKit.framework ✅
```

### 10.2 Build the Project

1. Select **BeerSelector** scheme (not the widget scheme)
2. Select your physical iOS device (not Simulator)
3. Press **⌘+B** to build

**Expected outcome**: Build succeeds with no errors

**Common errors**:
- "No such module 'ActivityKit'" → Check deployment target is iOS 16.1+
- Widget embedding issues → Check Build Phases → Embed Extensions
- Signing errors → Verify both targets use the same Team

---

## Step 11: Link react-native-live-activities Bridge

The package includes native modules that need to be linked:

### 11.1 Verify Auto-Linking

Since you're building in Xcode with CocoaPods, auto-linking should work automatically. Verify by:

1. Open **BeerSelector.xcworkspace**
2. Check **Pods** project → **Pods-BeerSelector** target
3. Under **Build Phases** → **Link Binary with Libraries**
4. Look for **RNLiveActivities** or similar

If not found:

### 11.2 Manual Linking (If Needed)

```bash
cd ios
pod install  # Re-run to ensure linking
cd ..
```

Then rebuild in Xcode.

---

## Step 12: Test Live Activities Support

### 12.1 Verify Device Requirements

**Minimum Requirements:**
- iPhone XR or later (2018+)
- iOS 16.1 or later
- Physical device (Simulator does NOT support Live Activities)

**Dynamic Island Requirements** (optional):
- iPhone 14 Pro / 14 Pro Max
- iPhone 15 Pro / 15 Pro Max
- iPhone 16 Pro / 16 Pro Max
- iOS 16.1 or later

### 12.2 Run on Device

1. Connect your iPhone to your Mac
2. Trust the device if prompted
3. In Xcode, select your device from the scheme selector
4. Click **Run** (⌘+R)

### 12.3 Check for Live Activity Support in Code

Add this test code to verify setup:

```typescript
// In your React Native code
import LiveActivities from 'react-native-live-activities';

async function checkSupport() {
  if (Platform.OS !== 'ios') {
    console.log('Live Activities only on iOS');
    return false;
  }

  try {
    const isSupported = await LiveActivities.areActivitiesEnabled();
    console.log('Live Activities supported:', isSupported);
    return isSupported;
  } catch (error) {
    console.error('Error checking Live Activities:', error);
    return false;
  }
}
```

**Expected result**: Should return `true` on iOS 16.1+ devices

---

## Troubleshooting

### Problem: "No such module 'ActivityKit'" Error

**Solution**:
1. Verify iOS Deployment Target is 16.1+ for BOTH targets
2. Clean build folder: **Product → Clean Build Folder** (⌘+Shift+K)
3. Rebuild: **Product → Build** (⌘+B)

### Problem: Widget Extension Not Embedding

**Solution**:
1. Select **BeerSelector** target
2. **Build Phases** → **Embed Foundation Extensions**
3. If `BeerQueueWidget.appex` is missing:
   - Click **+**
   - Select **BeerQueueWidget.appex**
   - Ensure "Copy only when installing" is **unchecked**

### Problem: Live Activities Not Showing on Device

**Checklist**:
- [ ] Device is iOS 16.1 or later (check Settings → General → About)
- [ ] App is running on physical device (not Simulator)
- [ ] `NSSupportsLiveActivities` is set to YES in Info.plist
- [ ] Live Activity code is calling ActivityKit correctly
- [ ] App has necessary entitlements

### Problem: Signing Issues

**Solution**:
1. Verify both targets use the same Apple Developer Team
2. Check Bundle IDs follow hierarchy:
   - Main: `org.verily.FSbeerselector`
   - Widget: `org.verily.FSbeerselector.BeerQueueWidget`
3. Ensure App Groups (if used) are enabled in both targets

### Problem: Build Succeeds but Live Activity Doesn't Start

**Debug Steps**:
1. Check Xcode console for errors when calling `Activity.request()`
2. Verify ActivityAttributes are properly defined in Swift
3. Ensure Live Activity code is in a file with target membership in both widget and main app
4. Check that `areActivitiesEnabled()` returns true

---

## Verification Checklist

Before implementing your Live Activity widget, verify:

### Xcode Project Configuration
- [ ] Widget Extension target created with "Include Live Activity" checked
- [ ] Main app deployment target: iOS 16.1+
- [ ] Widget deployment target: iOS 16.1+
- [ ] `NSSupportsLiveActivities` = YES in main app Info.plist
- [ ] `NSSupportsLiveActivitiesPushNotifications` = YES (if using push)
- [ ] Push Notifications capability enabled on main app
- [ ] App Groups capability enabled (if sharing data)
- [ ] Widget embedded in main app (Build Phases)
- [ ] Live Activity file has target membership in both main app and widget

### Frameworks & Dependencies
- [ ] `react-native-live-activities` installed via npm
- [ ] CocoaPods installed (`pod install` run)
- [ ] WidgetKit.framework linked
- [ ] SwiftUI.framework linked
- [ ] ActivityKit.framework linked

### Signing & Capabilities
- [ ] Main app signing configured
- [ ] Widget extension signing configured
- [ ] Both targets use same Apple Developer Team
- [ ] APNs key generated (if using push updates)

### Testing
- [ ] Building on Xcode 16.0+
- [ ] Testing on physical iOS 16.1+ device
- [ ] `areActivitiesEnabled()` returns true
- [ ] No build errors or warnings

---

## Next Steps

Once Xcode is configured:

1. **Implement Live Activity UI** in Swift (see `UI_DESIGN.md`)
2. **Create TypeScript service layer** (see `TECHNICAL_ANALYSIS.md`)
3. **Integrate with queue system** (see `ROADMAP.md`)
4. **Test on physical device**
5. **Setup APNs for production** (use the `.p8` key you generated)

---

## References

- **Apple Documentation**: [ActivityKit Framework](https://developer.apple.com/documentation/activitykit)
- **Package Documentation**: [react-native-live-activities](https://github.com/iburn/react-native-live-activities)
- **Xcode Version**: Check with `xcodebuild -version` in Terminal
- **iOS Version**: Settings → General → About → Software Version

---

## Questions?

If you encounter issues not covered here:
1. Check the package GitHub issues
2. Verify all deployment targets are consistent
3. Ensure you're testing on a physical device
4. Review Xcode console logs for specific error messages

**Document Version**: 1.0 (Xcode 16.x compatible)
**Last Verified**: November 2025
