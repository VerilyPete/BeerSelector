//
//  BeerQueueWidgetLiveActivity.swift
//  BeerQueueWidget
//
//  Created by Peter Hollmer on 11/21/25.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct BeerQueueWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct BeerQueueWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BeerQueueWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension BeerQueueWidgetAttributes {
    fileprivate static var preview: BeerQueueWidgetAttributes {
        BeerQueueWidgetAttributes(name: "World")
    }
}

extension BeerQueueWidgetAttributes.ContentState {
    fileprivate static var smiley: BeerQueueWidgetAttributes.ContentState {
        BeerQueueWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: BeerQueueWidgetAttributes.ContentState {
         BeerQueueWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: BeerQueueWidgetAttributes.preview) {
   BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueWidgetAttributes.ContentState.smiley
    BeerQueueWidgetAttributes.ContentState.starEyes
}
