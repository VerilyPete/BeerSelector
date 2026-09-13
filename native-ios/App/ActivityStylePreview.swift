#if DEBUG
import SwiftUI

/// Renders the extension's actual views without starting an activity or loading an account.
struct ActivityStylePreview: View {
    private let beers = [
        QueuedBeer(id:"1",name:"Bell’s Two Hearted"),
        QueuedBeer(id:"2",name:"Firestone Walker Parabola"),
        QueuedBeer(id:"3",name:"Weihenstephaner Hefeweissbier"),
        QueuedBeer(id:"4",name:"Founders All Day IPA"),
        QueuedBeer(id:"5",name:"Sierra Nevada Pale Ale"),
        QueuedBeer(id:"6",name:"Stone Enjoy By IPA"),
        QueuedBeer(id:"7",name:"Dogfish Head 90 Minute IPA")
    ]
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:20) {
                Text("LIVE ACTIVITY").font(Robo.mono(11)).tracking(2).foregroundStyle(QueueChrome.cyan)
                Text("Your queue. At a glance.").font(Robo.bold(26)).foregroundStyle(.white)
                if ProcessInfo.processInfo.arguments.contains("--preview-island") {
                    Text("COMPACT ISLAND · CONTENT PREVIEW").font(Robo.mono(9)).foregroundStyle(QueueChrome.secondary)
                    HStack {
                        Image(systemName:"mug.fill").foregroundStyle(QueueChrome.cyan)
                        Spacer().frame(width:90)
                        Text("7").font(.system(size:14,weight:.semibold,design:.rounded)).foregroundStyle(QueueChrome.cyan)
                    }.padding(14).background(.black,in:Capsule()).frame(maxWidth:.infinity)
                    Text("EXPANDED ISLAND · CONTENT PREVIEW").font(Robo.mono(9)).foregroundStyle(QueueChrome.secondary)
                    VStack(spacing:10) {
                        HStack {
                            QueueActivityEmblem(size:28)
                            Text("Beer queue").font(QueueChrome.title(13)).foregroundStyle(QueueChrome.text)
                            Spacer()
                            Text("7 queued").font(QueueChrome.mono(11)).foregroundStyle(QueueChrome.cyan)
                        }
                        BeerQueueExpandedView(beers:beers)
                    }.padding(18).background(.black,in:RoundedRectangle(cornerRadius:35))
                    Text("SAVED / STALE QUEUE").font(Robo.mono(9)).foregroundStyle(QueueChrome.secondary)
                    BeerQueueCompactView(beers:beers,isStale:true)
                } else {
                    ForEach([1,3,7],id:\.self) { count in
                        VStack(alignment:.leading,spacing:8) {
                            Text("\(count) \(count == 1 ? "BEER" : "BEERS") · LOCK SCREEN").font(Robo.mono(9)).foregroundStyle(QueueChrome.secondary)
                            BeerQueueCompactView(beers:Array(beers.prefix(count)))
                                .accessibilityIdentifier("activity-preview-\(count)")
                        }
                    }
                }
            }.padding(20).frame(maxWidth:430).frame(maxWidth:.infinity)
        }.task { renderSizeChecks() }
        .background(LinearGradient(colors:[Color(red:0.14,green:0.18,blue:0.22),Color(red:0.06,green:0.08,blue:0.10)],startPoint:.topLeading,endPoint:.bottomTrailing).ignoresSafeArea())
    }
    @MainActor private func renderSizeChecks() {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("activity-style-preview")
        try? FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        var sizes: [[String:Any]] = []
        for width in [320.0,353.0,390.0] {
            for type in [DynamicTypeSize.xSmall,.small,.medium,.large,.xLarge,.xxLarge,.xxxLarge,.accessibility1,.accessibility2,.accessibility3,.accessibility4,.accessibility5] {
                let content = BeerQueueCompactView(beers:beers).environment(\.dynamicTypeSize,type)
                let renderer = ImageRenderer(content:content)
                renderer.proposedSize = ProposedViewSize(width:width,height:nil)
                renderer.scale = 2
                if let image = renderer.uiImage {
                    sizes.append(["width":width,"textSize":String(describing:type),"height":image.size.height])
                    if width == 353 && type == .large { try? image.pngData()?.write(to:directory.appendingPathComponent("lock-screen-card.png")) }
                }
            }
        }
        if let data = try? JSONSerialization.data(withJSONObject:sizes,options:[.prettyPrinted,.sortedKeys]) {
            try? data.write(to:directory.appendingPathComponent("sizes.json"))
        }
    }

}
#endif
