import ActivityKit
import WidgetKit
import SwiftUI

struct BeerQueueWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for:BeerQueueAttributes.self) { context in
            BeerQueueCompactView(beers:context.state.beers,isStale:context.isStale)
                .activityBackgroundTint(QueueChrome.background)
                .activitySystemActionForegroundColor(QueueChrome.cyan)
                .widgetURL(URL(string:"beerselector://mybeers"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing:8) {
                        QueueActivityEmblem(size:28)
                        Text(context.isStale ? "Saved queue" : "Beer queue").font(QueueChrome.title(13)).foregroundStyle(QueueChrome.text).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(QueueChrome.count(context.state.beers.count)) queued")
                        .font(QueueChrome.mono(11)).foregroundStyle(QueueChrome.cyan)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .accessibilityLabel("\(context.state.beers.count) beers in queue")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    BeerQueueExpandedView(beers:context.state.beers,isStale:context.isStale)
                }
            } compactLeading: {
                Image(systemName:"mug.fill").font(.system(size:14,weight:.semibold)).foregroundStyle(QueueChrome.cyan)
                    .accessibilityLabel("Beer queue")
            } compactTrailing: {
                Text(QueueChrome.count(context.state.beers.count))
                    .font(.system(size:14,weight:.semibold,design:.rounded)).monospacedDigit().foregroundStyle(QueueChrome.cyan)
                    .accessibilityLabel("\(context.state.beers.count) beers queued")
            } minimal: {
                Image(systemName:"mug.fill").font(.system(size:14,weight:.semibold)).foregroundStyle(QueueChrome.cyan)
                    .accessibilityLabel("Beer queue, \(context.state.beers.count) beers")
            }
            .widgetURL(URL(string:"beerselector://mybeers"))
            .keylineTint(QueueChrome.cyan)
        }
    }
}

private let previewBeers = [
    QueuedBeer(id:"1",name:"Bell’s Two Hearted"),
    QueuedBeer(id:"2",name:"Firestone Walker Parabola"),
    QueuedBeer(id:"3",name:"Weihenstephaner Hefeweissbier"),
    QueuedBeer(id:"4",name:"Founders All Day IPA"),
    QueuedBeer(id:"5",name:"Sierra Nevada Pale Ale")
]

#Preview("Lock Screen",as:.content,using:BeerQueueAttributes(memberId:"preview",storeId:"preview")) {
    BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueAttributes.ContentState(beers:Array(previewBeers.prefix(1)))
    BeerQueueAttributes.ContentState(beers:Array(previewBeers.prefix(3)))
    BeerQueueAttributes.ContentState(beers:previewBeers)
}

#Preview("Expanded Island",as:.dynamicIsland(.expanded),using:BeerQueueAttributes(memberId:"preview",storeId:"preview")) {
    BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueAttributes.ContentState(beers:previewBeers)
}

#Preview("Compact Island",as:.dynamicIsland(.compact),using:BeerQueueAttributes(memberId:"preview",storeId:"preview")) {
    BeerQueueWidgetLiveActivity()
} contentStates: {
    BeerQueueAttributes.ContentState(beers:previewBeers)
}
