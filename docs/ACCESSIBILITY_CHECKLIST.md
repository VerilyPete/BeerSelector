# Accessibility Testing Checklist

This document provides a comprehensive accessibility testing checklist for the BeerSelector app UI redesign. Use this checklist during each phase of the redesign to ensure WCAG 2.1 AA compliance and platform-specific accessibility standards.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Phase 0: Prerequisites](#phase-0-prerequisites)
3. [Phase 1: Foundation](#phase-1-foundation)
4. [Phase 2: Core Components](#phase-2-core-components)
5. [Phase 3: Screen Updates](#phase-3-screen-updates)
6. [Phase 4: Tablet Support](#phase-4-tablet-support)
7. [Phase 5: Polish](#phase-5-polish)
8. [Platform-Specific Testing Guides](#platform-specific-testing-guides)
9. [Accessibility Props Reference](#accessibility-props-reference)

---

## Quick Reference

### Minimum Requirements

| Requirement                       | Target                              | Standard             |
| --------------------------------- | ----------------------------------- | -------------------- |
| Color Contrast (Normal Text)      | 4.5:1 minimum                       | WCAG AA              |
| Color Contrast (Large Text 18pt+) | 3:1 minimum                         | WCAG AA              |
| Touch Target Size                 | 44x44pt minimum                     | Apple HIG / Material |
| Focus Indicators                  | Visible on all interactive elements | WCAG 2.4.7           |
| Screen Reader Support             | All content accessible              | WCAG 1.1.1           |
| Motion                            | Respect reduced motion preferences  | WCAG 2.3.3           |
| Dynamic Type                      | Support all system text sizes       | Apple HIG            |

### Testing Tools

| Tool                          | Platform      | Purpose                          |
| ----------------------------- | ------------- | -------------------------------- |
| VoiceOver                     | iOS           | Screen reader testing            |
| TalkBack                      | Android       | Screen reader testing            |
| Accessibility Inspector       | macOS/iOS     | Audit accessibility tree         |
| Accessibility Scanner         | Android       | Automated accessibility scanning |
| Xcode Accessibility Inspector | iOS Simulator | Debug accessibility properties   |
| Color Contrast Analyzer       | Any           | Verify contrast ratios           |

---

## Phase 0: Prerequisites

No UI changes in Phase 0, but use this phase to establish baseline accessibility metrics.

### Baseline Audit

- [ ] Run Accessibility Inspector on current app
- [ ] Document all existing accessibility issues
- [ ] Create issue tickets for critical violations
- [ ] Establish color contrast baseline with new palette
- [ ] Test current app with VoiceOver/TalkBack

### Color Palette Verification (Section 3 of UI_REDESIGN_PLAN.md)

| Combination                  | Light Mode Ratio | Dark Mode Ratio | Pass/Fail |
| ---------------------------- | ---------------- | --------------- | --------- |
| Primary text on background   |                  |                 |           |
| Secondary text on background |                  |                 |           |
| Muted text on background     |                  |                 |           |
| Amber tint on white          |                  |                 |           |
| Error red on background      |                  |                 |           |
| Success green on background  |                  |                 |           |
| Button text on amber         |                  |                 |           |

---

## Phase 1: Foundation

### Color System Verification

#### Light Mode

- [ ] Primary text (`#292524`) on Background (`#FAFAFA`) - Target: 14.8:1
- [ ] Secondary text (`#57534E`) on Background (`#FAFAFA`) - Target: 7.2:1
- [ ] Muted text (`#78716C`) on Background (`#FAFAFA`) - Target: 4.6:1
- [ ] Amber Primary (`#D97706`) on White (`#FFFFFF`) - Target: 4.9:1
- [ ] Error text (`#DC2626`) on Background (`#FAFAFA`) - Target: 5.9:1
- [ ] Success text (`#16A34A`) on Background (`#FAFAFA`) - Target: 4.5:1
- [ ] Button text (White) on Amber (`#D97706`) - Target: 4.9:1

#### Dark Mode

- [ ] Primary text (`#FAFAF9`) on Background (`#0C0A09`) - Target: 15.2:1
- [ ] Secondary text (`#E7E5E4`) on Background (`#0C0A09`) - Target: 12.8:1
- [ ] Muted text (`#A8A29E`) on Background (`#0C0A09`) - Target: 5.1:1
- [ ] Amber Primary (`#F59E0B`) on Background (`#0C0A09`) - Target: 6.3:1
- [ ] Error text (`#F87171`) on Background (`#0C0A09`) - Target: 6.8:1
- [ ] Success text (`#4ADE80`) on Background (`#0C0A09`) - Target: 8.2:1

### Typography Scale

- [ ] ThemedText renders correctly at all Dynamic Type sizes
- [ ] No text truncation at largest sizes (AX5)
- [ ] Adequate line height for readability (1.4-1.6x)
- [ ] Font weights distinguishable at all sizes

### Theme Transitions

- [ ] No flash of wrong colors during theme switch
- [ ] All components update to correct theme colors
- [ ] No white-on-white or black-on-black text

---

## Phase 2: Core Components

### BeerItem Card Redesign

#### VoiceOver Testing (iOS)

- [ ] Card announced as single accessible element with summary
- [ ] Accessibility label includes: Beer name, brewery, style
- [ ] Expand/collapse state announced ("collapsed" / "expanded")
- [ ] Description read when expanded
- [ ] Swipe navigation moves to next card (not internal elements)
- [ ] Double-tap expands/collapses card
- [ ] Custom actions available for Untappd search (if applicable)

#### TalkBack Testing (Android)

- [ ] Card announced as single accessible element
- [ ] All text content read in logical order
- [ ] Expand/collapse state announced
- [ ] Double-tap to activate works correctly
- [ ] Explore by touch navigates logically

#### Touch Targets

- [ ] Card tap area: minimum 44x44pt
- [ ] Expand/collapse tap area covers full card width
- [ ] Action buttons (if any): minimum 44x44pt each
- [ ] Adequate spacing between action buttons (8pt minimum)

#### Dynamic Type

- [ ] Test at xSmall - all text visible
- [ ] Test at Small - all text visible
- [ ] Test at Medium (default) - baseline appearance
- [ ] Test at Large - card height adjusts
- [ ] Test at xLarge - card height adjusts
- [ ] Test at xxLarge - card height adjusts
- [ ] Test at xxxLarge - card height adjusts, no truncation
- [ ] Test at AX1 - layout adapts, all text readable
- [ ] Test at AX2 - layout adapts, all text readable
- [ ] Test at AX3 - layout adapts, all text readable
- [ ] Test at AX4 - layout adapts, may require scrolling
- [ ] Test at AX5 - layout adapts, may require scrolling

#### Color Contrast

- [ ] Beer name visible in light mode
- [ ] Beer name visible in dark mode
- [ ] Brewery name visible in light mode
- [ ] Brewery name visible in dark mode
- [ ] Style badge text visible on badge background
- [ ] Date text visible in both modes
- [ ] Description text visible when expanded

---

### SearchBar Redesign

#### VoiceOver Testing (iOS)

- [ ] Search field announced as "Search, text field"
- [ ] Placeholder text read when empty
- [ ] Current search text read when populated
- [ ] Clear button announced as "Clear search, button"
- [ ] Keyboard appears when search field activated
- [ ] Typing feedback provided

#### TalkBack Testing (Android)

- [ ] Search field has appropriate role
- [ ] Hint text announced
- [ ] Clear button has content description
- [ ] Focus management correct when clearing

#### Touch Targets

- [ ] Search field: height 48pt (meets 44pt minimum)
- [ ] Clear button: 44x44pt minimum touch area
- [ ] Adequate padding for finger input

#### Dynamic Type

- [ ] Search text scales with system setting
- [ ] Placeholder text scales appropriately
- [ ] Field height adjusts for larger text
- [ ] Clear button remains accessible

---

### FilterBar Redesign

#### VoiceOver Testing (iOS)

- [ ] Each filter chip announced with name and state
- [ ] Example: "Draft, toggle button, selected" or "not selected"
- [ ] Sort button announced with current sort order
- [ ] Horizontal scroll container identified
- [ ] Swipe to navigate between chips works

#### TalkBack Testing (Android)

- [ ] Filter chips have role "toggle button"
- [ ] Selected state announced
- [ ] Sort button state announced
- [ ] Linear navigation through chips works

#### Touch Targets

- [ ] Each filter chip: minimum 44pt height
- [ ] Minimum 8pt spacing between chips
- [ ] Sort button: minimum 44x44pt
- [ ] Scroll indicators visible (if content overflows)

#### Dynamic Type

- [ ] Chip text scales with system setting
- [ ] Chip padding adjusts for larger text
- [ ] Chips remain single-line (no wrapping)
- [ ] Filter count badge visible at all sizes

---

## Phase 3: Screen Updates

### Home Screen Redesign

#### VoiceOver Testing (iOS)

- [ ] Welcome message read first
- [ ] Stats cards announced with values
- [ ] Navigation cards announced as buttons
- [ ] Reading order: Welcome > Stats > Navigation cards
- [ ] Settings access point announced

#### TalkBack Testing (Android)

- [ ] Logical reading order maintained
- [ ] All cards have appropriate roles
- [ ] Stats values read correctly
- [ ] Navigation cards activate on double-tap

#### Touch Targets

- [ ] Stats cards: informational, not interactive (or min 44pt)
- [ ] Navigation cards: minimum 44x44pt (preferably larger)
- [ ] Settings button: minimum 44x44pt
- [ ] Adequate spacing between navigation cards (16pt)

#### Dynamic Type

- [ ] Welcome text wraps appropriately
- [ ] Stats numbers visible at all sizes
- [ ] Navigation card labels visible
- [ ] Layout adjusts from 2x2 grid to single column at largest sizes

---

### Settings Screen Redesign

#### VoiceOver Testing (iOS)

- [ ] Profile section read first (if logged in)
- [ ] Section headers announced as headings
- [ ] Each setting row announced with icon, title, current value
- [ ] Toggles announce on/off state
- [ ] Buttons announce their action
- [ ] Destructive actions (logout, clear data) announced with warning

#### TalkBack Testing (Android)

- [ ] Section structure communicated
- [ ] Setting rows have appropriate roles
- [ ] Toggle states announced
- [ ] Button labels descriptive

#### Touch Targets

- [ ] Each setting row: full width, minimum 44pt height
- [ ] Toggle controls: minimum 44x44pt
- [ ] Action buttons: minimum 44x44pt
- [ ] Close/back button: minimum 44x44pt

#### Dynamic Type

- [ ] Setting titles wrap to multiple lines if needed
- [ ] Values/subtitles remain readable
- [ ] Row height adjusts for content
- [ ] Icons scale proportionally (optional)

---

### Rewards Screen Redesign

#### VoiceOver Testing (iOS)

- [ ] Reward cards announced with type and status
- [ ] Available rewards distinguished from redeemed
- [ ] Queue button announced with action
- [ ] Empty state message read if no rewards

#### TalkBack Testing (Android)

- [ ] Reward cards navigable
- [ ] Status clearly communicated
- [ ] Action buttons labeled

#### Touch Targets

- [ ] Reward cards: minimum 44pt height
- [ ] Queue buttons: minimum 44x44pt
- [ ] Adequate spacing between rewards

#### Dynamic Type

- [ ] Reward type text scales
- [ ] Status badges readable
- [ ] Action buttons remain accessible

---

## Phase 4: Tablet Support

### Responsive Layout Accessibility

#### Multi-Column Layouts

- [ ] Reading order logical in 2-column layout
- [ ] Reading order logical in 3-column layout
- [ ] VoiceOver navigates column by column (not row by row)
- [ ] No content lost between columns
- [ ] Column boundaries clear to screen readers

#### Side Navigation (if implemented)

- [ ] Navigation rail accessible
- [ ] Current location announced
- [ ] Navigation items have labels
- [ ] Keyboard navigation works (with external keyboard)

#### Larger Touch Targets

- [ ] Touch targets scale appropriately for tablet
- [ ] Spacing between elements adequate for larger screens
- [ ] No "too small" targets on tablet layouts

---

## Phase 5: Polish

### Animation Accessibility

#### Reduced Motion

- [ ] Check `UIAccessibility.isReduceMotionEnabled` (iOS)
- [ ] Check `Settings.Global.ANIMATOR_DURATION_SCALE` (Android)
- [ ] Disable/reduce animations when reduced motion enabled
- [ ] Provide instant state changes as alternative
- [ ] No essential information conveyed only through animation

#### Animation Timing

- [ ] Expansion animations: max 300ms
- [ ] Fade animations: max 200ms
- [ ] Tab transition: instant or max 150ms
- [ ] No flashing content (risk of seizures)

### Haptic Feedback Accessibility

- [ ] Haptics supplement (not replace) visual feedback
- [ ] No haptic-only feedback for critical actions
- [ ] Haptic patterns consistent across similar actions

### Focus Management

- [ ] Focus visible on all interactive elements
- [ ] Focus order follows reading order
- [ ] Focus trapped appropriately in modals
- [ ] Focus returns to trigger when modal closes
- [ ] No focus loss during navigation

---

## Platform-Specific Testing Guides

### VoiceOver Testing (iOS)

#### Setup

1. Enable VoiceOver: Settings > Accessibility > VoiceOver
2. Or triple-click side button (if configured)
3. Connect AirPods for audio output (recommended)

#### Basic Gestures

| Gesture                    | Action                     |
| -------------------------- | -------------------------- |
| Single tap                 | Select and announce item   |
| Double tap                 | Activate selected item     |
| Swipe left/right           | Move to previous/next item |
| Three-finger swipe up/down | Scroll                     |
| Two-finger tap             | Pause/resume speech        |
| Two-finger scrub (Z)       | Go back                    |

#### Testing Checklist

- [ ] Navigate through all screens using swipes only
- [ ] Verify all interactive elements reachable
- [ ] Check reading order matches visual order
- [ ] Test all buttons/links with double-tap
- [ ] Verify modal focus trapping
- [ ] Test with Rotor for headings, links, buttons

---

### TalkBack Testing (Android)

#### Setup

1. Enable TalkBack: Settings > Accessibility > TalkBack
2. Or hold both volume keys for 3 seconds (if configured)

#### Basic Gestures

| Gesture               | Action                     |
| --------------------- | -------------------------- |
| Single tap            | Select and announce item   |
| Double tap            | Activate selected item     |
| Swipe left/right      | Move to previous/next item |
| Two-finger swipe      | Scroll                     |
| Swipe down then right | Open TalkBack menu         |
| Swipe up then left    | Go back                    |

#### Testing Checklist

- [ ] Navigate through all screens using swipes
- [ ] Verify all interactive elements reachable
- [ ] Check reading order matches visual order
- [ ] Test all buttons with double-tap
- [ ] Verify content descriptions for images
- [ ] Test with local context menu

---

### Dynamic Type Testing

#### iOS Dynamic Type Sizes

| Size     | Settings Path                                                                   |
| -------- | ------------------------------------------------------------------------------- |
| xSmall   | Settings > Accessibility > Display & Text Size > Larger Text > OFF, slider left |
| Small    | Slider slightly right of minimum                                                |
| Medium   | Default position                                                                |
| Large    | Slider slightly right of center                                                 |
| xLarge   | Slider right of center                                                          |
| xxLarge  | Slider further right                                                            |
| xxxLarge | Slider near maximum (before Accessibility sizes)                                |
| AX1-AX5  | Enable "Larger Accessibility Sizes" toggle, then slider                         |

#### Testing Steps

1. Change text size in Settings
2. Return to app (should update immediately)
3. Navigate through all screens
4. Verify no truncation or overlap
5. Verify scrolling works for overflowing content
6. Repeat for each size

---

### Color Contrast Verification

#### Using macOS Accessibility Inspector

1. Open Xcode > Open Developer Tool > Accessibility Inspector
2. Select iOS Simulator as target
3. Click on elements to inspect contrast
4. Use Audit tab for automated checks

#### Using Online Tools

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Colour Contrast Analyser (CCA)](https://www.tpgi.com/color-contrast-checker/)

#### Manual Verification

1. Screenshot app in light mode
2. Screenshot app in dark mode
3. Use color picker to get exact hex values
4. Calculate contrast ratios for all text/background combinations
5. Document any failures

---

## Accessibility Props Reference

### React Native Accessibility Props

```tsx
// Basic accessibility props
<TouchableOpacity
  accessible={true}                           // Group as single element
  accessibilityLabel="Add beer to queue"      // Screen reader label
  accessibilityHint="Double tap to add"       // Additional context
  accessibilityRole="button"                  // Element role
  accessibilityState={{                       // Current state
    disabled: false,
    selected: true,
    checked: 'mixed',                         // for checkboxes
    expanded: true,                           // for expandable items
  }}
  accessibilityValue={{                       // For sliders, progress
    min: 0,
    max: 100,
    now: 50,
    text: "50%"
  }}
/>

// For live regions (dynamic content)
<Text
  accessibilityLiveRegion="polite"  // or "assertive"
  accessibilityRole="alert"
/>

// For hiding decorative elements
<Image
  accessible={false}
  importantForAccessibility="no-hide-descendants"
/>
```

### Common Accessibility Roles

| Role       | Use Case                    |
| ---------- | --------------------------- |
| `button`   | Buttons, touchable elements |
| `link`     | Navigation links            |
| `search`   | Search inputs               |
| `image`    | Images with alt text        |
| `text`     | Static text                 |
| `header`   | Section headers             |
| `checkbox` | Toggles, checkboxes         |
| `radio`    | Radio buttons               |
| `slider`   | Sliders, progress bars      |
| `alert`    | Important notifications     |
| `menu`     | Menus, dropdowns            |
| `menuitem` | Items within menus          |
| `tab`      | Tab buttons                 |
| `tablist`  | Tab container               |

### Best Practices

1. **Group related content**: Use `accessible={true}` on parent to group
2. **Provide context**: Use `accessibilityHint` for non-obvious actions
3. **Announce state changes**: Update `accessibilityState` dynamically
4. **Use semantic roles**: Help screen readers understand element purpose
5. **Test with real users**: Automated tools miss context issues

---

## Related Documentation

- **UI Redesign Plan**: `docs/UI_REDESIGN_PLAN.md`
- **Maestro Migration Plan**: `.maestro/MIGRATION_PLAN.md`
- **Apple Human Interface Guidelines - Accessibility**: https://developer.apple.com/design/human-interface-guidelines/accessibility
- **Material Design Accessibility**: https://m3.material.io/foundations/accessible-design
- **WCAG 2.1 Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/

---

**Last Updated**: 2025-12-05
**Maintainer**: BeerSelector Team
**Status**: Ready for Phase 0 Testing
