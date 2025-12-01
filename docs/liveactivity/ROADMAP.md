# iOS Live Activity Implementation Roadmap

## BeerSelector Beer Queue Live Activity

**Version**: 1.0
**Last Updated**: 2025-11-21
**Status**: Planning Phase
**Timeline**: 3-4 weeks (3 sprints)
**Team Size**: 1-2 developers

---

## Executive Summary

This roadmap outlines a phased approach to implementing iOS Live Activities for the BeerSelector app's beer queue feature. The implementation uses the **react-native-live-activities** community package to maintain Expo's managed workflow while adding native iOS functionality.

### Key Milestones

1. **Sprint 1 (Week 1)**: Research, Setup & Prototype
2. **Sprint 2 (Week 2)**: Core Integration & Data Flow
3. **Sprint 3 (Week 3)**: UI Polish, Testing & Release

### Total Estimated Effort

- **Development**: 15-20 days
- **Testing**: 3-5 days
- **Documentation**: 2-3 days
- **Buffer**: 3-5 days
- **Total**: 23-33 days (approximately 1 month)

---

## Phase 0: Pre-Implementation (Completed ✅)

### Completed Deliverables

- ✅ Requirements document (`REQUIREMENTS.md`)
- ✅ Technical analysis (`TECHNICAL_ANALYSIS.md`)
- ✅ UI design specifications (`UI_DESIGN.md`)
- ✅ Implementation roadmap (this document)

### Decision Made

**Approach**: Expo Managed Workflow + `react-native-live-activities` community package

**Rationale**:

- Maintains existing Expo workflow (no ejection)
- Production-ready community package (800+ stars)
- 2-3 week implementation vs. 4+ weeks for bare workflow
- Lower maintenance burden
- Team can stay in JavaScript/TypeScript ecosystem

---

## Sprint 1: Research, Setup & Prototype (Week 1)

**Goal**: Validate technical approach with working prototype
**Duration**: 5 days
**Success Criteria**: Basic Live Activity visible on physical iOS device

### Day 1-2: Environment Setup

#### Tasks

- [ ] **Install Dependencies**

  ```bash
  npm install react-native-live-activities
  npx expo install expo-dev-client
  ```

  **Estimated**: 1 hour

- [ ] **Configure Xcode Project**
  - Open `ios/BeerSelector.xcworkspace` in Xcode
  - Add `NSSupportsLiveActivities = YES` to Info.plist
  - Verify Widget Extension target exists (`BeerQueueWidget`)
  - Verify App Group entitlement: `group.org.verily.FSbeerselector.shared`
    **Estimated**: 30 minutes

- [ ] **Install Pod Dependencies**
  ```bash
  cd ios && pod install
  ```
  **Estimated**: 10 minutes

**Deliverables**:

- Configured Xcode project with Live Activity support
- Widget extension target verified

**Blockers**:

- Apple Developer account access required
- Physical iOS 16.1+ device required for testing
- Xcode installed on development machine

---

### Day 3: Build and Deploy to Device

#### Tasks

- [ ] **Build in Xcode**
  - Open `ios/BeerSelector.xcworkspace`
  - Select physical device as build target
  - Product → Build (⌘B)
  - Product → Run (⌘R)
    **Estimated**: 30 minutes (build time: 5-10 minutes)

- [ ] **Install on Test Device**
  - Connect iOS device via USB
  - Trust developer certificate on device (Settings → General → Device Management)
  - Run from Xcode to install
    **Estimated**: 15 minutes

- [ ] **Test Basic Functionality**
  - Open app
  - Navigate to Beerfinder
  - Verify existing features work
    **Estimated**: 1 hour

**Deliverables**:

- Working app on physical device
- Verified existing functionality intact

**Blockers**:

- Physical iOS device with iOS 16.1+
- Valid Apple Developer signing certificate

---

### Day 4-5: Minimal Prototype

#### Tasks

- [ ] **Create Basic Swift Widget** (ios/BeerQueueWidget/)
  - Create `BeerQueueAttributes.swift` with minimal attributes
  - Create `BeerQueueLiveActivity.swift` with simple UI
  - Add to Xcode project as widget extension target
    **Estimated**: 3-4 hours

  **Minimal UI**: Just display queue count and single beer name

- [ ] **Create TypeScript Service**
  - Create `src/services/liveActivityService.ts`
  - Implement `startLiveActivity()` function
  - Implement `isLiveActivitySupported()` check
    **Estimated**: 2 hours

- [ ] **Wire Up to Queue Add**
  - Modify `hooks/useOptimisticCheckIn.ts`
  - Call `startLiveActivity()` after successful check-in
  - Handle errors gracefully
    **Estimated**: 2 hours

- [ ] **Test End-to-End**
  - Add beer to queue in app
  - Lock screen
  - Verify Live Activity appears
  - Tap Live Activity → verify app opens
    **Estimated**: 2 hours

**Deliverables**:

- Minimal working prototype
- End-to-end flow validated
- Confidence in technical approach

**Blockers**:

- Swift/Xcode knowledge gap (may need pairing or external help)
- Xcode setup on development machine

---

### Sprint 1 Review & Retrospective

**Outcomes**:

- ✅ Working prototype demonstrates feasibility
- ✅ Team comfortable with development workflow
- ✅ Identified any unexpected technical challenges

**Risks Identified**:

- Document any issues encountered
- Adjust timeline if needed
- Escalate blockers to stakeholders

**Next Sprint Prep**:

- Review REQUIREMENTS.md and UI_DESIGN.md
- Plan detailed tasks for core integration

---

## Sprint 2: Core Integration & Data Flow (Week 2)

**Goal**: Complete Live Activity lifecycle (start, update, end)
**Duration**: 5 days
**Success Criteria**: Live Activity updates in real-time with queue changes

### Day 1-2: Complete Service Layer

#### Tasks

- [ ] **Implement updateLiveActivity()**

  ```typescript
  export async function updateLiveActivity(queueState: QueueState): Promise<void> {
    // Check if activity exists
    // If not, start new activity
    // If queue empty, end activity
    // Otherwise, update existing activity
  }
  ```

  **Estimated**: 2 hours

- [ ] **Implement endLiveActivity()**

  ```typescript
  export async function endLiveActivity(): Promise<void> {
    // End current activity
    // Clear activity ID
    // Handle errors
  }
  ```

  **Estimated**: 1 hour

- [ ] **Add Activity State Management**
  - Track current activity ID
  - Persist activity state across app restarts
  - Handle multiple activity edge cases
    **Estimated**: 2 hours

- [ ] **Type Definitions**
  - Create `src/types/liveActivity.ts`
  - Define `QueueState`, `QueuedBeer`, `LiveActivityConfig` interfaces
  - Add type guards
    **Estimated**: 1 hour

- [ ] **Error Handling**
  - Wrap all calls in try-catch
  - Log errors for debugging
  - Graceful degradation if Live Activity fails
    **Estimated**: 2 hours

**Deliverables**:

- Complete `liveActivityService.ts` implementation
- Type-safe interfaces
- Robust error handling

---

### Day 3: Queue Integration

#### Tasks

- [ ] **Integrate with Queue Add** (useOptimisticCheckIn)

  ```typescript
  // After successful checkInBeer()
  const queueState = await getQueuedBeers();
  await updateLiveActivity({
    queueCount: queueState.length,
    beers: queueState,
    storeLocation: session.storeName,
    lastUpdated: new Date().toISOString(),
  });
  ```

  **Estimated**: 2 hours

- [ ] **Integrate with Queue Delete** (Beerfinder component)

  ```typescript
  // After successful deleteQueuedBeer()
  const queueState = await getQueuedBeers();
  if (queueState.length === 0) {
    await endLiveActivity();
  } else {
    await updateLiveActivity(...);
  }
  ```

  **Estimated**: 2 hours

- [ ] **App Launch Sync** (app/\_layout.tsx)

  ```typescript
  // During app initialization
  if (await isLiveActivitySupported()) {
    const queueState = await getQueuedBeers();
    if (queueState.length > 0) {
      await startLiveActivity(queueState);
    }
  }
  ```

  **Estimated**: 1 hour

- [ ] **Handle Visitor Mode**
  - Check `is_visitor_mode` preference
  - Disable Live Activity for visitor mode users
  - Show appropriate messaging
    **Estimated**: 1 hour

**Deliverables**:

- Fully integrated queue add/delete flows
- App launch synchronization
- Visitor mode handling

---

### Day 4: Deep Linking

#### Tasks

- [ ] **Configure Expo Router Deep Link**
  - Update `app.json` with URL scheme

  ```json
  {
    "expo": {
      "scheme": "beerselector",
      "ios": {
        "associatedDomains": ["applinks:beerselector.app"]
      }
    }
  }
  ```

  **Estimated**: 30 minutes

- [ ] **Handle Deep Link in Swift Widget**

  ```swift
  Link(destination: URL(string: "beerselector://beerfinder")!) {
    BeerQueueView(...)
  }
  ```

  **Estimated**: 1 hour

- [ ] **Handle Deep Link in App** (app/\_layout.tsx)
  - Use Expo Router's `useURL()` hook
  - Parse `beerselector://beerfinder`
  - Navigate to Beerfinder tab
    **Estimated**: 2 hours

- [ ] **Test Deep Link Flow**
  - Lock screen
  - Tap Live Activity
  - Verify app opens to Beerfinder
  - Test from closed, backgrounded, and open states
    **Estimated**: 1 hour

**Deliverables**:

- Working deep link from Live Activity to app
- Tested across all app states

---

### Day 5: Testing & Bug Fixes

#### Tasks

- [ ] **Manual Testing**
  - Add 1 beer → Verify Live Activity starts
  - Add 2nd beer → Verify Live Activity updates
  - Delete 1 beer → Verify Live Activity updates
  - Delete last beer → Verify Live Activity ends
  - Offline mode → Verify graceful handling
  - Session expiry → Verify error handling
    **Estimated**: 3 hours

- [ ] **Edge Case Testing**
  - Add 5 beers (maximum) → Verify layout
  - Long beer names → Verify truncation
  - Rapid add/delete → Verify no race conditions
  - Kill app while Live Activity active → Verify recovery
    **Estimated**: 2 hours

- [ ] **Bug Fixes**
  - Fix any issues identified in testing
  - Document workarounds for known limitations
    **Estimated**: 3 hours (buffer)

**Deliverables**:

- Stable core functionality
- Known issues documented
- Test report

---

### Sprint 2 Review & Retrospective

**Outcomes**:

- ✅ Complete Live Activity lifecycle implemented
- ✅ Queue integration working end-to-end
- ✅ Deep linking functional

**Quality Gates**:

- [ ] All manual test cases pass
- [ ] No critical bugs
- [ ] Performance acceptable (< 2s update latency)

**Next Sprint Prep**:

- Review UI_DESIGN.md specifications
- Prepare design assets (icons, colors)

---

## Sprint 3: UI Polish, Testing & Release (Week 3)

**Goal**: Production-ready UI and comprehensive testing
**Duration**: 5 days
**Success Criteria**: App Store ready feature

### Day 1-2: UI Implementation

#### Tasks

- [ ] **Implement Full Swift UI** (BeerQueueLiveActivity.swift)
  - Following UI_DESIGN.md specifications exactly
  - Compact view with all beers (up to 5)
  - Header with queue count and location
  - Beer list with names and timestamps
  - Proper dividers and spacing
    **Estimated**: 4-5 hours

- [ ] **Implement Theme Support**
  - Light mode colors (teal accent)
  - Dark mode colors (pink accent)
  - Dynamic theme switching
  - Test both themes extensively
    **Estimated**: 2-3 hours

- [ ] **Implement Dynamic Island Views**
  - Expanded view (larger spacing)
  - Compact leading/trailing (icon + count)
  - Minimal view (icon only)
    **Estimated**: 2-3 hours

- [ ] **Add Icons and Assets**
  - Beer mug SF Symbol
  - Offline indicator icon
  - Any custom imagery
    **Estimated**: 1 hour

**Deliverables**:

- Fully designed Live Activity UI
- Light and dark theme support
- Dynamic Island support

---

### Day 3: Accessibility & Polish

#### Tasks

- [ ] **VoiceOver Support**
  - Add accessibility labels to all elements
  - Test with VoiceOver enabled
  - Ensure logical reading order
    **Example**: "Beer queue with 3 items. Bell's Hopslam, draft, added November 21st at 2:30 PM"
    **Estimated**: 2 hours

- [ ] **Dynamic Type Support**
  - Test with all iOS text size settings (xSmall to AX5)
  - Verify text doesn't clip or overlap
  - Adjust layout for larger text if needed
    **Estimated**: 2 hours

- [ ] **High Contrast Mode**
  - Increase border widths in high contrast
  - Verify text contrast ratios (WCAG AA)
  - Test with high contrast enabled
    **Estimated**: 1 hour

- [ ] **Reduce Motion**
  - Disable animations if Reduce Motion enabled
  - Use instant state changes
    **Estimated**: 30 minutes

- [ ] **Visual Polish**
  - Fine-tune spacing and alignment
  - Verify colors match design specs
  - Test on multiple device sizes (iPhone SE, 14 Pro Max, etc.)
    **Estimated**: 2 hours

**Deliverables**:

- Fully accessible Live Activity
- Polished, production-quality UI
- Multi-device compatibility

---

### Day 4: Comprehensive Testing

#### Tasks

- [ ] **Unit Tests** (Jest)
  - `liveActivityService.test.ts`
    - Test `startLiveActivity()` with valid/invalid data
    - Test `updateLiveActivity()` state transitions
    - Test `endLiveActivity()` cleanup
    - Test `isLiveActivitySupported()` version checks
  - `liveActivity.test.ts` (type guards)
    - Test `isQueueState()` validation
      **Estimated**: 3 hours

- [ ] **Integration Tests** (Consider Maestro if time permits)
  - Queue add flow (app → Live Activity visible)
  - Queue delete flow (Live Activity updates/ends)
  - Deep link flow (Live Activity tap → app opens)
    **Estimated**: 2-3 hours (if manual, less if scripted)

- [ ] **Device Testing Matrix**
  - iPhone SE (2022) - iOS 16.1 (compact screen)
  - iPhone 13 - iOS 16.4 (standard)
  - iPhone 14 Pro - iOS 17.0 (Dynamic Island)
  - iPhone 15 Pro Max - iOS 17.1 (largest screen + Dynamic Island)
    **Estimated**: 2 hours

- [ ] **Scenario Testing**
  - New user onboarding (first queue add)
  - Returning user (queue from previous session)
  - Session expiry during Live Activity
  - Offline mode (no network)
  - Battery saver mode (reduced updates)
    **Estimated**: 2 hours

- [ ] **Performance Testing**
  - Measure update latency (target: < 2s)
  - Monitor battery usage (with Xcode Instruments)
  - Check memory footprint (target: < 15 MB widget)
  - Verify update frequency (max 10/hour)
    **Estimated**: 2 hours

**Deliverables**:

- Test suite with 80%+ coverage
- Performance validation report
- Device compatibility matrix
- Known issues log

---

### Day 5: Documentation & Release Prep

#### Tasks

- [ ] **User Documentation**
  - Add section to app settings explaining Live Activity
  - Create in-app tooltip or onboarding for first use
  - Screenshot for App Store (show Live Activity on lock screen)
    **Estimated**: 2 hours

- [ ] **Developer Documentation**
  - Update CLAUDE.md with Live Activity architecture
  - Document maintenance procedures
  - Add troubleshooting guide
    **Estimated**: 2 hours

- [ ] **Code Review**
  - Self-review all changes
  - Peer review (if team available)
  - Address feedback
    **Estimated**: 2 hours

- [ ] **Final QA Pass**
  - Complete end-to-end test
  - Verify all requirements met (REQUIREMENTS.md checklist)
  - Sign-off from stakeholders
    **Estimated**: 1 hour

- [ ] **Release Build**
  - Build in Xcode: Product → Archive
  - Distribute via App Store Connect (Xcode Organizer)
  - Submit to App Store
  - Update release notes
  - Set release date
    **Estimated**: 1 hour (build + upload time: 20-30 minutes)

**Deliverables**:

- Complete documentation
- Production build ready for App Store
- Release notes

---

### Sprint 3 Review & Retrospective

**Outcomes**:

- ✅ Production-ready feature
- ✅ All acceptance criteria met
- ✅ App Store submission ready

**Success Metrics**:

- [ ] All requirements from REQUIREMENTS.md satisfied
- [ ] UI matches UI_DESIGN.md specifications
- [ ] Test coverage > 80%
- [ ] Performance targets met (< 2s latency, < 15 MB memory)
- [ ] Accessibility compliance (WCAG AA)

**Lessons Learned**:

- Document challenges and solutions
- Note any technical debt for future sprints
- Identify areas for improvement

---

## Post-Release: Monitoring & Iteration (Ongoing)

### Week 1-2 Post-Launch

#### Monitoring

- [ ] **Crash Reporting**
  - Monitor Sentry/Crashlytics for Live Activity crashes
  - Track error rates in `liveActivityService.ts`
  - Set up alerts for > 1% error rate
    **Action**: Daily review for first week

- [ ] **Analytics**
  - Track Live Activity start/update/end events
  - Measure adoption rate (% of users enabling)
  - Monitor deep link tap rate
  - Measure update latency (avg and p95)
    **Metrics**:
    - Target adoption: 60% of UFO Club members
    - Target tap rate: 30% of Live Activity views
    - Target latency: < 2s p95

- [ ] **User Feedback**
  - Monitor App Store reviews
  - Check in-app feedback/support tickets
  - Conduct user interviews (if possible)
    **Action**: Weekly sentiment analysis

#### Bug Fixes & Iteration

- [ ] **Priority 1 (P1) Issues**: Fix within 24-48 hours
  - Crashes or data loss
  - Live Activity not appearing
  - App not opening from deep link

- [ ] **Priority 2 (P2) Issues**: Fix within 1 week
  - UI glitches (misalignment, wrong colors)
  - Performance issues (slow updates)
  - Accessibility problems

- [ ] **Priority 3 (P3) Issues**: Fix in next minor release
  - Enhancement requests
  - Edge case handling
  - UX improvements

### Month 1-3 Post-Launch

#### Feature Enhancements

- [ ] **V1.1 Enhancements** (optional)
  - Add store logo/icon
  - Show beer ABV and style in expanded view
  - Customizable privacy setting (show/hide beer names)
  - Haptic feedback on queue updates
    **Timeline**: 2-3 weeks after V1.0

- [ ] **V1.2 Enhancements** (optional)
  - Employee confirmation notification (when beer marked as tasted)
  - Multiple location support (if user visits different stores)
  - Queue history (show previously confirmed beers)
    **Timeline**: 1-2 months after V1.0

#### Optimization

- [ ] **Performance Tuning**
  - Profile battery usage with large sample size
  - Optimize update frequency based on real-world usage
  - Reduce memory footprint if needed

- [ ] **A/B Testing** (if applicable)
  - Test different UI layouts
  - Test update frequency (immediate vs. periodic)
  - Test deep link destinations (Beerfinder vs. Queue modal)

---

## Risk Management

### Technical Risks

| Risk                                                 | Probability | Impact | Mitigation                                | Contingency                                                |
| ---------------------------------------------------- | ----------- | ------ | ----------------------------------------- | ---------------------------------------------------------- |
| react-native-live-activities breaks with Expo update | Medium      | High   | Pin package version, test before upgrades | Rollback to previous Expo version, wait for package update |
| Swift widget crashes on older iOS versions           | Low         | High   | Test on iOS 16.1, 16.2, 17.0+, 18.0+      | Add iOS version checks, disable for problematic versions   |
| Xcode build failures                                 | Low         | Medium | Keep Xcode updated, clean builds          | Reinstall pods, clean derived data                         |
| Deep linking doesn't work on some devices            | Low         | Medium | Test on multiple devices/iOS versions     | Provide manual navigation instructions in app              |
| Stale data when app backgrounded                     | High        | Low    | Clear user expectations                   | Update on app foreground, consider push in V2              |

### Product Risks

| Risk                                         | Probability | Impact | Mitigation                                      | Contingency                                     |
| -------------------------------------------- | ----------- | ------ | ----------------------------------------------- | ----------------------------------------------- |
| Low user adoption (< 30%)                    | Medium      | Medium | In-app onboarding, clear value prop             | Improve discoverability, add app icon badge     |
| Battery drain complaints                     | Low         | High   | Profile with Instruments, respect update limits | Add setting to disable, reduce update frequency |
| Privacy concerns (beer names on lock screen) | Low         | Low    | Clear messaging about visibility                | Add privacy mode (generic "X beers queued")     |
| App Store rejection                          | Low         | High   | Follow Apple HIG strictly                       | Address reviewer feedback, resubmit             |

### Schedule Risks

| Risk                                   | Probability | Impact | Mitigation                                        | Contingency                           |
| -------------------------------------- | ----------- | ------ | ------------------------------------------------- | ------------------------------------- |
| Swift development slower than expected | Medium      | Medium | Allocate buffer time in Sprint 1                  | Extend Sprint 1, delay other features |
| Xcode/Apple Developer issues           | Medium      | Low    | Document setup process, keep certificates current | Pair with iOS expert, reinstall Xcode |
| Testing finds critical bugs late       | Low         | High   | Test early and often, automate tests              | Allocate buffer in Sprint 3           |
| Stakeholder requests major changes     | Low         | High   | Align on requirements upfront                     | Fast-follow release with changes      |

---

## Success Criteria

### Feature Completeness

- [ ] All functional requirements from REQUIREMENTS.md implemented
- [ ] All UI specifications from UI_DESIGN.md matched
- [ ] All edge cases handled gracefully

### Quality Gates

- [ ] Zero P1 bugs (crashes, data loss)
- [ ] < 5 P2 bugs (UI glitches, performance)
- [ ] Test coverage > 80%
- [ ] Performance targets met:
  - Update latency < 2s (p95)
  - Memory usage < 15 MB
  - Battery impact < 5% increase

### User Metrics (Post-Launch)

- [ ] 60%+ adoption rate within 1 month
- [ ] 30%+ deep link tap rate
- [ ] 4.5+ star rating on App Store (no negative reviews about Live Activity)
- [ ] < 1% error rate

### Business Impact

- [ ] Increased app engagement (measured by daily active users)
- [ ] Positive user sentiment (App Store reviews, feedback)
- [ ] Competitive advantage (Live Activity as differentiator)

---

## Dependencies & Prerequisites

### Technical Dependencies

- [ ] Apple Developer account with valid signing certificates
- [ ] Physical iOS device with iOS 16.1+ for testing
- [ ] Xcode installed on development machine (latest stable version)
- [ ] Sentry or Crashlytics for error tracking (optional)

### Team Skills

- [ ] React Native/TypeScript proficiency
- [ ] Basic Swift/SwiftUI knowledge (for widget UI)
- [ ] iOS development toolchain familiarity (Xcode, CocoaPods)
- [ ] Understanding of iOS App Extensions architecture

### External Dependencies

- [ ] Flying Saucer API availability (getQueuedBeers endpoint)
- [ ] Network connectivity for testing
- [ ] App Store review process (typically 1-3 days)

---

## Budget & Resources

### Development Time

- **Sprint 1**: 40 hours (1 FTE week)
- **Sprint 2**: 40 hours (1 FTE week)
- **Sprint 3**: 40 hours (1 FTE week)
- **Post-Release**: 8-16 hours/month (maintenance)
- **Total**: 120 hours (3 FTE weeks)

### Infrastructure Costs

- **Apple Developer Account**: $99/year (required for App Store distribution)
- **Local Xcode Builds**: Free (no EAS Build subscription needed)
- **Physical Device**: If not available, ~$400-$1000 (iPhone SE to 15 Pro)

### External Resources (Optional)

- **Swift Developer Consulting**: $100-$200/hour if team lacks Swift expertise
  - Estimated: 4-8 hours for widget UI implementation
  - Cost: $400-$1600

### Total Estimated Cost

- **Development**: 120 hours @ developer rate
- **Infrastructure**: $99/year (Apple Developer account)
- **One-time**: $400-$1600 (device + consulting, if needed)

---

## Communication Plan

### Stakeholder Updates

- **Weekly**: Sprint progress email (Fridays)
  - Completed tasks
  - Blockers and risks
  - Next week plan

- **End of Sprint**: Demo session
  - Live demonstration of features
  - Q&A
  - Sign-off on sprint deliverables

### Team Collaboration

- **Daily**: Async updates in Slack/team chat
  - What you worked on
  - Any blockers
  - Plan for today

- **Bi-weekly**: Sync meeting (30 minutes)
  - Technical discussions
  - Architecture decisions
  - Code review

### Documentation

- **Continuously**: Update documentation as you go
  - Code comments
  - README updates
  - CLAUDE.md updates

- **End of Sprint**: Formal documentation review
  - Ensure accuracy
  - Add examples
  - Update diagrams

---

## Rollout Strategy

### Phased Release

#### Phase 1: Internal Testing (Week 4)

- **Audience**: Development team only
- **Build**: TestFlight internal testing
- **Duration**: 3-5 days
- **Goal**: Validate stability and performance
- **Metrics**: Zero crashes, all features working

#### Phase 2: Beta Testing (Week 5)

- **Audience**: 10-20 trusted users (UFO Club members)
- **Build**: TestFlight external testing
- **Duration**: 1 week
- **Goal**: Gather real-world feedback
- **Metrics**:
  - 80%+ positive feedback
  - < 5 bugs reported
  - Adoption rate among beta users

#### Phase 3: Soft Launch (Week 6)

- **Audience**: 10% of users (gradual rollout)
- **Build**: App Store production with feature flag
- **Duration**: 3-5 days
- **Goal**: Monitor at scale before full release
- **Metrics**:
  - < 0.1% crash rate
  - < 5% error rate
  - No critical bugs

#### Phase 4: Full Release (Week 7)

- **Audience**: All users (100%)
- **Build**: App Store production, feature flag enabled for all
- **Announcement**: In-app notification, social media, email
- **Support**: Prepare FAQ, monitor support channels

### Feature Flag Strategy

```typescript
// src/config/features.ts
export const features = {
  liveActivity: {
    enabled: true, // Toggle for gradual rollout
    minIOSVersion: '16.1',
    requiresSession: true, // Only for logged-in members
    excludeVisitorMode: true,
  },
};

// In code:
if (features.liveActivity.enabled && !isVisitorMode && (await isLiveActivitySupported())) {
  await startLiveActivity(queueState);
}
```

### Rollback Plan

If critical issues are discovered:

1. **Immediate**: Disable feature flag (0% rollout)
2. **Within 24 hours**: Push hotfix if possible
3. **Within 1 week**: Root cause analysis and fix
4. **Re-launch**: Repeat soft launch phase

**Criteria for Rollback**:

- Crash rate > 1%
- Error rate > 10%
- Negative App Store reviews spike
- Security vulnerability discovered

---

## Appendix

### A: Key Files & Locations

**Documentation**:

- `/docs/liveactivity/REQUIREMENTS.md` - Complete requirements
- `/docs/liveactivity/TECHNICAL_ANALYSIS.md` - Implementation approach
- `/docs/liveactivity/UI_DESIGN.md` - Design specifications
- `/docs/liveactivity/ROADMAP.md` - This document

**Code**:

- `src/services/liveActivityService.ts` - Main service layer
- `src/types/liveActivity.ts` - TypeScript types
- `ios/BeerQueueWidget/BeerQueueLiveActivity.swift` - Swift widget UI
- `hooks/useOptimisticCheckIn.ts` - Queue add integration
- `components/Beerfinder.tsx` - Queue delete integration
- `app/_layout.tsx` - App launch sync

**Configuration**:

- `ios/BeerSelector.xcworkspace` - Main Xcode workspace
- `ios/BeerSelector/Info.plist` - iOS app configuration
- `ios/BeerSelector/BeerSelector.entitlements` - App capabilities
- `package.json` - JavaScript dependencies

### B: Useful Commands

```bash
# Install JS dependencies
npm install

# Install iOS pods
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Build and run in Xcode
# Open ios/BeerSelector.xcworkspace
# Select device target, then Product → Run (⌘R)

# Archive for App Store
# In Xcode: Product → Archive
# Then: Window → Organizer → Distribute App

# Run tests
npm test
npm run test:ci

# Lint code
npm run lint

# Increment build number (before App Store submission)
./scripts/increment-build.sh
```

### C: Testing Checklist

**Manual Test Cases**:

- [ ] Add 1 beer → Live Activity starts
- [ ] Add 2nd beer → Live Activity updates
- [ ] Add 3rd beer → Live Activity updates
- [ ] Delete 1 beer → Live Activity updates
- [ ] Delete all beers → Live Activity ends
- [ ] Tap Live Activity → App opens to Beerfinder
- [ ] Lock screen view → All beers visible
- [ ] Light mode → Colors match design
- [ ] Dark mode → Colors match design
- [ ] VoiceOver enabled → Accessible labels work
- [ ] Dynamic Type XL → Text doesn't clip
- [ ] Offline mode → Shows last known state
- [ ] Session expires → Live Activity ends gracefully
- [ ] App backgrounded → Live Activity persists
- [ ] App killed → Live Activity persists
- [ ] Device restart → Live Activity cleared

**Device Test Matrix**:

- [ ] iPhone SE (2022) - iOS 16.1
- [ ] iPhone 13 - iOS 16.4
- [ ] iPhone 14 Pro - iOS 17.0 (Dynamic Island)
- [ ] iPhone 15 Pro Max - iOS 17.1

### D: Support & Resources

**Internal**:

- Development team: [Contact info]
- Product owner: [Contact info]
- QA lead: [Contact info]

**External**:

- react-native-live-activities GitHub: https://github.com/iburn/react-native-live-activities
- Expo Discord: https://chat.expo.dev
- Apple Developer Forums: https://developer.apple.com/forums
- Stack Overflow tag: [react-native-live-activities]

**Documentation**:

- Apple ActivityKit: https://developer.apple.com/documentation/activitykit
- Apple HIG Live Activities: https://developer.apple.com/design/human-interface-guidelines/live-activities
- SwiftUI Documentation: https://developer.apple.com/documentation/swiftui
- App Extensions Guide: https://developer.apple.com/app-extensions/

---

## Version History

| Version | Date       | Author           | Changes                 |
| ------- | ---------- | ---------------- | ----------------------- |
| 1.0     | 2025-11-21 | Development Team | Initial roadmap created |

---

**Next Steps**:

1. Review and approve this roadmap with stakeholders
2. Allocate developer resources (1-2 FTE for 3 weeks)
3. Set up project in task tracking system (Jira, Linear, etc.)
4. Kick off Sprint 1 planning session
5. Begin implementation!
