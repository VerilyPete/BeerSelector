# iOS Live Activity UI Design
## BeerSelector Beer Queue Visual Specifications (Simplified)

**Version**: 2.0
**Last Updated**: 2025-11-21
**Status**: Design Complete
**Designer**: UI/UX Team

---

## Design Overview

### Design Philosophy

The BeerSelector Live Activity design prioritizes **extreme simplicity and glanceability**. The interface presents a clean list of beer names without any additional metadata, allowing users to instantly see what's in their queue at a glance.

**Core Principles**:
- **Minimal Complexity**: Just beer names, nothing else
- **Maximum Readability**: Clean list with clear separators
- **Platform Native**: Follows iOS design language
- **Accessibility First**: Full Dynamic Type support and WCAG AA compliance

---

## Visual Mockups

### Compact View - Light Mode (Lock Screen)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Bell's Hopslam                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Firestone Walker Parabola                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Stone Enjoy By IPA                                │
│                                                     │
└─────────────────────────────────────────────────────┘

Colors:
- Background: #FFFFFF
- Text: #11181C
- Dividers: #E0E0E0
```

### Compact View - Dark Mode (Lock Screen)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Bell's Hopslam                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Firestone Walker Parabola                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Stone Enjoy By IPA                                │
│                                                     │
└─────────────────────────────────────────────────────┘

Colors:
- Background: #151718
- Text: #ECEDEE
- Dividers: #333333
```

### Expanded View - Light Mode (Dynamic Island)

```
┌───────────────────────────────────────────────────────────┐
│                                                           │
│   Bell's Hopslam                                         │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│   Firestone Walker Parabola                              │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│   Stone Enjoy By IPA                                     │
│                                                           │
└───────────────────────────────────────────────────────────┘

Layout: More spacious with increased padding
Beer names: 16pt semibold
```

### Minimal View (Dynamic Island - Collapsed)

```
Light Mode:           Dark Mode:
┌────────┐           ┌────────┐
│   🍺   │           │   🍺   │
└────────┘           └────────┘

24pt diameter badge
Icon: 16pt
Background: System fill
```

### State Variations

**1 Beer in Queue**:
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Bell's Hopslam                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**2 Beers in Queue**:
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Bell's Hopslam                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Firestone Walker Parabola                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**5 Beers in Queue (Maximum)**:
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  Bell's Hopslam                                    │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Firestone Walker Parabola                         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Stone Enjoy By IPA                                │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Founders KBS                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  Dogfish Head 90 Minute IPA                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Layout Specifications

### Component Hierarchy

```
BeerQueueLiveActivity
└── Container (VStack)
    └── BeerList (VStack)
        ├── BeerItem (Text) [Repeated]
        └── ItemDivider (Divider) [Between items]
```

### Spacing & Dimensions

**Container**:
- Total height: Variable based on beer count (40-140pt)
- Width: Full available width
- Border radius: 12pt
- Background blur: 10% system material

**Padding**:
- Outer horizontal: 16pt
- Outer vertical: 12pt
- Inner horizontal (Dynamic Island): 20pt

**Beer List**:
- Item vertical padding: 12pt
- Divider height: 0.5pt (hairline)
- Divider horizontal inset: 0pt

**Text Truncation**:
- Beer names: 1 line, ellipsis at end

---

## Typography Scale

### Font Specifications

| Element | Font Family | Size | Weight | Line Height | Letter Spacing |
|---------|------------|------|--------|-------------|----------------|
| **Beer Name (Compact)** | SF Pro Text | 15pt | Semibold (600) | 20pt | -0.01em |
| **Beer Name (Expanded)** | SF Pro Text | 16pt | Semibold (600) | 21pt | -0.01em |
| **Beer Name (Minimal Icon)** | - | 16pt | - | - | - |

### Dynamic Type Support

| Text Style | xSmall | Small | Medium | Large | xLarge | xxLarge | xxxLarge | AX1 | AX2 | AX3 | AX4 | AX5 |
|------------|--------|-------|--------|-------|--------|---------|----------|-----|-----|-----|-----|-----|
| **Beer Name** | 13pt | 14pt | 15pt | 16pt | 18pt | 20pt | 22pt | 24pt | 26pt | 28pt | 30pt | 32pt |

**Layout Reflow**: At AX3 and above, consider showing only first 3 beers to maintain readability.

---

## Color Palette

### Light Mode Colors

| Element | Hex Code | RGB | Usage | Contrast Ratio |
|---------|----------|-----|--------|-----------------|
| **Background** | #FFFFFF | 255, 255, 255 | Container background | - |
| **Primary Text** | #11181C | 17, 24, 28 | Beer names | 18.1:1 ✅ |
| **Divider** | #E0E0E0 | 224, 224, 224 | Separators | 1.5:1 |
| **Icon** | #0a7ea4 | 10, 126, 164 | Beer mug icon (minimal view) | 4.5:1 ✅ |

### Dark Mode Colors

| Element | Hex Code | RGB | Usage | Contrast Ratio |
|---------|----------|-----|--------|-----------------|
| **Background** | #151718 | 21, 23, 24 | Container background | - |
| **Primary Text** | #ECEDEE | 236, 237, 238 | Beer names | 17.3:1 ✅ |
| **Divider** | #333333 | 51, 51, 51 | Separators | 1.9:1 |
| **Icon** | #E91E63 | 233, 30, 99 | Beer mug icon (minimal view) | 5.8:1 ✅ |

**WCAG Compliance**: All text combinations meet WCAG AA standards (4.5:1 for normal text).

---

## Component Breakdown

### Beer List Item Component

**Structure**:
```swift
Text(beerName)
    .font(.system(size: 15, weight: .semibold))
    .foregroundColor(primaryTextColor)
    .lineLimit(1)
    .truncationMode(.tail)
    .padding(.vertical, 12)
```

**Visual Properties**:
- Min height: 44pt (accessibility tap target)
- Tap target: Full width × 44pt
- Selection style: None (not interactive within Live Activity)

### Divider Component

**Properties**:
- Height: 0.5pt (1px on 2x displays)
- Color: Divider color from palette
- Horizontal inset: 0pt
- Opacity: 100%

### Icon Component (Minimal View Only)

**SF Symbol**: `mug.fill`

**Configuration**:
```swift
Image(systemName: "mug.fill")
    .symbolRenderingMode(.hierarchical)
    .font(.system(size: 16, weight: .medium))
    .foregroundStyle(accentColor)
```

---

## State Variations

### Loading State
Not applicable - Live Activity only shows when data is available

### Error State
If data fetch fails, Live Activity ends gracefully

### Empty State
Live Activity ends when queue is empty (no empty state shown)

### Data Variations

**Long Beer Names**:
```
"Founders Kentucky Breakfast Stout (KBS) Bourbon Barrel-Aged Imperial Stout"
→ "Founders Kentucky Breakfast Stout (KBS) Bourbon Ba..."
```

**Beer Name Formatting**:
- Strip container type from name (e.g., "(Draft)", "(BTL)")
- Show only the core beer name
- Examples:
  - "Bell's Hopslam (Draft)" → "Bell's Hopslam"
  - "Firestone Walker Parabola (BTL)" → "Firestone Walker Parabola"

---

## Accessibility

### VoiceOver Labels

**Live Activity Container**:
```
"Beer queue. 3 beers. Double-tap to open BeerSelector."
```

**Individual Beer Item**:
```
"Bell's Hopslam"
"Firestone Walker Parabola"
"Stone Enjoy By IPA"
```

**Minimal View**:
```
"Beer queue icon. Double-tap to open BeerSelector."
```

### Dynamic Type Support

- All text scales with Dynamic Type preferences
- Layout maintains single-line per beer at all sizes
- At AX3+: Consider limiting to 3 beers maximum for readability

### High Contrast Mode

When high contrast is enabled:
- Divider width increases to 1pt
- All colors adjust to system high contrast palette
- Text weight increases to bold

### Reduce Motion

- No animations in Live Activity itself
- Transitions are instant (no fade/slide)
- Static presentation only

---

## SwiftUI Implementation Guide

### Main Widget Structure

```swift
import ActivityKit
import WidgetKit
import SwiftUI

struct BeerQueueLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BeerQueueAttributes.self) { context in
            BeerQueueCompactView(beers: context.state.beers)
                .activityBackgroundTint(Color.clear)
        } dynamicIsland: { context in
            DynamicIslandConfiguration(beers: context.state.beers)
        }
    }
}
```

### Compact View Implementation

```swift
struct BeerQueueCompactView: View {
    let beers: [QueuedBeer]
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(beers.enumerated()), id: \.element.id) { index, beer in
                Text(stripContainerType(from: beer.name))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(textColor)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if index < beers.count - 1 {
                    Divider()
                        .background(dividerColor)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(backgroundColor)
        .cornerRadius(12)
    }

    // Strip container type like "(Draft)" or "(BTL)" from beer name
    func stripContainerType(from name: String) -> String {
        name.replacingOccurrences(of: " \\([^)]+\\)$", with: "", options: .regularExpression)
    }

    // Color computed properties
    var backgroundColor: Color {
        colorScheme == .dark ? Color(hex: "#151718") : .white
    }

    var textColor: Color {
        colorScheme == .dark ? Color(hex: "#ECEDEE") : Color(hex: "#11181C")
    }

    var dividerColor: Color {
        colorScheme == .dark ? Color(hex: "#333333") : Color(hex: "#E0E0E0")
    }
}
```

### Dynamic Island Implementation

```swift
struct DynamicIslandConfiguration: DynamicIslandExpandedContent {
    let beers: [QueuedBeer]
    @Environment(\.colorScheme) var colorScheme

    var expandedContent: some DynamicIslandExpandedContent {
        DynamicIslandExpandedRegion(.center) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(beers.prefix(3).enumerated()), id: \.element.id) { index, beer in
                    Text(stripContainerType(from: beer.name))
                        .font(.system(size: 16, weight: .semibold))
                        .lineLimit(1)
                        .padding(.vertical, 10)

                    if index < min(beers.count, 3) - 1 {
                        Divider()
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
    }

    var compactLeading: some View {
        Image(systemName: "mug.fill")
            .foregroundColor(accentColor)
    }

    var compactTrailing: some View {
        Text("\(beers.count)")
            .font(.system(size: 12, weight: .bold))
    }

    var minimal: some View {
        Image(systemName: "mug.fill")
            .foregroundColor(accentColor)
    }

    var accentColor: Color {
        colorScheme == .dark ? Color(hex: "#E91E63") : Color(hex: "#0a7ea4")
    }

    func stripContainerType(from name: String) -> String {
        name.replacingOccurrences(of: " \\([^)]+\\)$", with: "", options: .regularExpression)
    }
}
```

### Color Extension

```swift
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: // RGB
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
```

---

## Interaction Design

### Tap Behavior

**Tap Target**: Entire Live Activity area
**Action**: Deep link to BeerSelector app
**URL Scheme**: `beerselector://beerfinder`
**Visual Feedback**:
- Scale down to 95% on touch down (if Reduce Motion disabled)
- Return to 100% on touch up
- Duration: 0.1s

### Deep Link Handling

```swift
// In Live Activity
.widgetURL(URL(string: "beerselector://beerfinder"))

// In React Native app
import { Linking } from 'react-native';
import { router } from 'expo-router';

Linking.addEventListener('url', (event) => {
  if (event.url === 'beerselector://beerfinder') {
    router.push('/beerlist');
  }
});
```

---

## Implementation Notes

### Performance Considerations

1. **Text Rendering**: Use system fonts for optimal performance
2. **Layout Calculations**: Simple vertical stack, no complex calculations
3. **Memory Usage**: Minimal - just text rendering, well under 15MB limit

### Data Processing

**Beer Name Cleanup**:
The beer names from the API include container types like "(Draft)" or "(BTL)". Strip these before displaying:

```typescript
// In liveActivityService.ts
function stripContainerType(beerName: string): string {
  return beerName.replace(/ \([^)]+\)$/, '');
}

// Example:
stripContainerType("Bell's Hopslam (Draft)") // → "Bell's Hopslam"
stripContainerType("Firestone Walker Parabola (BTL)") // → "Firestone Walker Parabola"
```

### Testing Checklist

- [ ] Test with 1, 2, 3, and 5 beers
- [ ] Verify light/dark mode switching
- [ ] Test all Dynamic Type sizes (especially AX sizes)
- [ ] Verify VoiceOver labels
- [ ] Test on iPhone 12 mini (smallest screen)
- [ ] Test on iPhone 14 Pro Max (Dynamic Island)
- [ ] Verify beer name truncation for long names
- [ ] Test container type stripping (no "(Draft)" or "(BTL)" visible)
- [ ] Test deep linking from Live Activity
- [ ] Measure memory usage in Instruments

### Known Constraints

1. **Height Limit**: iOS enforces ~170pt max for compact view (5 beers fit comfortably)
2. **No Scrolling**: All content must fit without scrolling
3. **No Interactive Elements**: Only tap-to-open is allowed
4. **Update Frequency**: Maximum 10 updates per hour
5. **Static Content**: No animations within Live Activity

---

## Design Rationale

### Why No Metadata?

The simplified design removes all extraneous information (location, dates, container types, counts) to create an ultra-clean, glanceable list. This design:

1. **Reduces Visual Clutter**: Users can instantly see what beers are queued
2. **Maximizes Readability**: Larger text, more breathing room
3. **Faster Scanning**: No need to parse multiple pieces of information
4. **Better Accessibility**: Simpler VoiceOver experience
5. **Cleaner Aesthetic**: Minimalist iOS design language

### Why Keep Dividers?

Hairline dividers provide visual separation between beers without adding clutter. They help the eye distinguish between items in the list.

### Why Vertical Layout?

Vertical list layout is the most scannable format for reading multiple items quickly. It matches the mental model users have from the main app.

---

## Next Steps

1. **Implementation Priority**:
   - Compact view (primary use case)
   - Container type stripping logic
   - Dynamic Island expanded view
   - Minimal/collapsed states

2. **Design Validation**:
   - Review with iOS development team
   - Validate against Apple HIG
   - User testing with prototype

3. **Accessibility Testing**:
   - VoiceOver testing on device
   - Dynamic Type validation
   - High contrast mode verification

---

## Appendix

### A: Color Constants

```swift
extension Color {
    // Light Mode
    static let beerQueueBackground = Color.white
    static let beerQueueText = Color(hex: "#11181C")
    static let beerQueueDivider = Color(hex: "#E0E0E0")
    static let beerQueueAccent = Color(hex: "#0a7ea4")

    // Dark Mode
    static let beerQueueDarkBackground = Color(hex: "#151718")
    static let beerQueueDarkText = Color(hex: "#ECEDEE")
    static let beerQueueDarkDivider = Color(hex: "#333333")
    static let beerQueueDarkAccent = Color(hex: "#E91E63")
}
```

### B: Spacing Constants

```swift
enum BeerQueueSpacing {
    static let outerHorizontal: CGFloat = 16
    static let outerVertical: CGFloat = 12
    static let itemVertical: CGFloat = 12
    static let cornerRadius: CGFloat = 12
}
```

### C: Typography Constants

```swift
enum BeerQueueTypography {
    static let beerNameCompact = Font.system(size: 15, weight: .semibold)
    static let beerNameExpanded = Font.system(size: 16, weight: .semibold)
    static let iconFont = Font.system(size: 16, weight: .medium)
}
```

### D: Sample Data for Testing

```swift
let sampleBeers = [
    QueuedBeer(
        id: "123456",
        name: "Bell's Hopslam (Draft)",  // Will display as "Bell's Hopslam"
        date: "Nov 21, 2025 @ 02:30:15pm"
    ),
    QueuedBeer(
        id: "123457",
        name: "Firestone Walker Parabola (BTL)",  // Will display as "Firestone Walker Parabola"
        date: "Nov 21, 2025 @ 02:28:42pm"
    ),
    QueuedBeer(
        id: "123458",
        name: "Stone Enjoy By IPA (Draft)",  // Will display as "Stone Enjoy By IPA"
        date: "Nov 21, 2025 @ 02:25:10pm"
    )
]
```

---

**Document Status**: Complete (Simplified Version)
**Ready for Implementation**: Yes
**Reviewed By**: UI/UX Team
**Approved**: Pending developer review
