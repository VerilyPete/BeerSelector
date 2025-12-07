//
//  BeerQueueWidgetLiveActivity.swift
//  BeerQueueWidget
//
//  Live Activity UI for displaying the beer queue on lock screen and Dynamic Island.
//  Design follows UI_DESIGN.md specifications for a minimal, glanceable interface.
//

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Live Activity Widget

struct BeerQueueWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BeerQueueAttributes.self) { context in
            // Lock screen/banner UI
            BeerQueueCompactView(beers: context.state.beers)
                .activityBackgroundTint(Color.clear)
                .activitySystemActionForegroundColor(Color.primary)
                .widgetURL(URL(string: "beerselector://beerfinder"))

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI - shown when user long-presses Dynamic Island
                DynamicIslandExpandedRegion(.center) {
                    BeerQueueExpandedView(beers: context.state.beers)
                }
            } compactLeading: {
                // Compact leading - mug icon for each beer (max 5)
                HStack(spacing: 2) {
                    ForEach(context.state.beers.prefix(5)) { _ in
                        Image(systemName: "mug.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color.dynamicIslandAccent)
                    }
                }
                .accessibilityLabel("\(context.state.beers.count) beers in queue")
            } compactTrailing: {
                // Empty - count shown via number of mug icons
                EmptyView()
            } minimal: {
                // Minimal view - just the mug icon
                Image(systemName: "mug.fill")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Color.dynamicIslandAccent)
            }
            .widgetURL(URL(string: "beerselector://beerfinder"))
            .keylineTint(Color.dynamicIslandAccent)
        }
    }
}

// MARK: - Compact View (Lock Screen)

struct BeerQueueCompactView: View {
    let beers: [QueuedBeer]
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(beers.prefix(5).enumerated()), id: \.element.id) { index, beer in
                Text(beer.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(textColor)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // VoiceOver: Just read the beer name
                    .accessibilityLabel(beer.name)

                // Add divider between items (not after last item)
                if index < min(beers.count, 5) - 1 {
                    Divider()
                        .background(dividerColor)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(backgroundColor)
        // VoiceOver: Container label for entire Live Activity
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityContainerLabel)
        .accessibilityHint("Double-tap to open BeerSelector app")
    }

    // MARK: - Accessibility

    var accessibilityContainerLabel: String {
        let count = beers.count
        if count == 1 {
            return "Beer queue. 1 beer."
        } else {
            return "Beer queue. \(count) beers."
        }
    }

    // MARK: - Colors

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

// MARK: - Expanded View (Dynamic Island)

struct BeerQueueExpandedView: View {
    let beers: [QueuedBeer]
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(beers.prefix(3).enumerated()), id: \.element.id) { index, beer in
                Text(beer.name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(textColor)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // VoiceOver: Just read the beer name
                    .accessibilityLabel(beer.name)

                // Add divider between items (not after last item)
                if index < min(beers.count, 3) - 1 {
                    Divider()
                        .background(dividerColor)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        // VoiceOver: Container label for expanded view
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityContainerLabel)
        .accessibilityHint("Double-tap to open BeerSelector app")
    }

    // MARK: - Accessibility

    var accessibilityContainerLabel: String {
        let count = beers.count
        if count == 1 {
            return "Beer queue. 1 beer."
        } else {
            return "Beer queue. \(count) beers."
        }
    }

    // MARK: - Colors

    var textColor: Color {
        colorScheme == .dark ? Color(hex: "#ECEDEE") : Color(hex: "#11181C")
    }

    var dividerColor: Color {
        colorScheme == .dark ? Color(hex: "#333333") : Color(hex: "#E0E0E0")
    }
}

// MARK: - Dynamic Island Colors
//
// Note: @Environment doesn't work on static properties, so we use a constant for the
// Dynamic Island accent color. Dynamic Island always has a dark background, so we
// use the pink accent color (#E91E63) that provides good contrast.
//
// For views that need theme-aware colors (like BeerQueueCompactView and
// BeerQueueExpandedView), they access @Environment(\.colorScheme) directly.

extension Color {
    /// Accent color for Dynamic Island elements (always pink for dark background)
    static let dynamicIslandAccent = Color(hex: "#E91E63")
}

// MARK: - Color Extension for Hex Support

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6: // RGB (no alpha)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
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

// MARK: - Preview Providers

#Preview("Notification - 3 Beers", as: .content, using: BeerQueueAttributes(
    memberId: "12345",
    storeId: "1"
)) {
    BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueAttributes.ContentState(beers: [
        QueuedBeer(id: "1", name: "Bell's Hopslam"),
        QueuedBeer(id: "2", name: "Firestone Walker Parabola"),
        QueuedBeer(id: "3", name: "Stone Enjoy By IPA")
    ])
}

#Preview("Notification - 1 Beer", as: .content, using: BeerQueueAttributes(
    memberId: "12345",
    storeId: "1"
)) {
    BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueAttributes.ContentState(beers: [
        QueuedBeer(id: "1", name: "Bell's Hopslam")
    ])
}

#Preview("Notification - 5 Beers", as: .content, using: BeerQueueAttributes(
    memberId: "12345",
    storeId: "1"
)) {
    BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueAttributes.ContentState(beers: [
        QueuedBeer(id: "1", name: "Bell's Hopslam"),
        QueuedBeer(id: "2", name: "Firestone Walker Parabola"),
        QueuedBeer(id: "3", name: "Stone Enjoy By IPA"),
        QueuedBeer(id: "4", name: "Founders KBS"),
        QueuedBeer(id: "5", name: "Dogfish Head 90 Minute IPA")
    ])
}
