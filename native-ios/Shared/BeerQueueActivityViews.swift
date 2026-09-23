import SwiftUI

/// Shared by the extension and the isolated in-app design preview.
enum QueueChrome {
    static let background = color(0x101419)
    static let text = color(0xE2E7EB)
    static let secondary = color(0xA4AEB8)
    static let cyan = color(0x54D7C2)
    static let amber = color(0xD4AB50)
    static let metal = LinearGradient(colors:[color(0xB8C0C8),color(0x505B66),color(0x89949F)],startPoint:.topLeading,endPoint:.bottomTrailing)
    static func color(_ value: UInt32) -> Color {
        Color(red:Double(value >> 16 & 255)/255,green:Double(value >> 8 & 255)/255,blue:Double(value & 255)/255)
    }
    static func title(_ size: CGFloat) -> Font { .custom("SpaceGrotesk-SemiBold",size:size,relativeTo:.headline) }
    static func mono(_ size: CGFloat) -> Font { .custom("SpaceMono-Regular",size:size,relativeTo:.caption) }
    static func count(_ count: Int) -> String { count > 99 ? "99+" : String(count) }
}

struct QueueActivityEmblem: View {
    var size: CGFloat = 34
    var body: some View {
        Image(systemName:"mug.fill")
            .font(.system(size:size * 0.43,weight:.semibold))
            .foregroundStyle(QueueChrome.cyan)
            .frame(width:size,height:size)
            .background(LinearGradient(colors:[QueueChrome.color(0x28323C),QueueChrome.background],startPoint:.topLeading,endPoint:.bottomTrailing),in:RoundedRectangle(cornerRadius:size * 0.3))
            .overlay(RoundedRectangle(cornerRadius:size * 0.3).strokeBorder(QueueChrome.metal,lineWidth:1))
            .accessibilityHidden(true)
    }
}

struct BeerQueueCompactView: View {
    let beers: [QueuedBeer]
    var isStale = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.isLuminanceReduced) private var dimmed
    private var visibleCount: Int { typeSize >= .xxxLarge ? 1 : (typeSize >= .xLarge ? 2 : 3) }

    var body: some View {
        VStack(alignment:.leading,spacing:8) {
            HStack(spacing:10) {
                QueueActivityEmblem()
                if typeSize.isAccessibilitySize {
                    Text("\(beers.count) queued").font(QueueChrome.title(14)).lineLimit(1).minimumScaleFactor(0.75)
                } else {
                    VStack(alignment:.leading,spacing:2) {
                        Text("BEER SELECTOR").font(QueueChrome.mono(8)).tracking(1.6).foregroundStyle(QueueChrome.secondary)
                        Text(isStale ? "Saved queue" : "Beer queue").font(QueueChrome.title(16))
                    }
                    Spacer(minLength:8)
                    HStack(alignment:.firstTextBaseline,spacing:5) {
                        Text(QueueChrome.count(beers.count)).font(.custom("SpaceGrotesk-Bold",size:26,relativeTo:.title2)).monospacedDigit()
                        Text("QUEUED").font(QueueChrome.mono(8)).tracking(0.6)
                    }.foregroundStyle(accent)
                }
            }
            Rectangle().fill(LinearGradient(colors:[accent.opacity(0.5),QueueChrome.secondary.opacity(0.15),.clear],startPoint:.leading,endPoint:.trailing)).frame(height:1).accessibilityHidden(true)
            QueueActivityRows(beers:beers,limit:visibleCount)
            if !typeSize.isAccessibilitySize {
                QueueActivityFooter(total:beers.count,visible:visibleCount,isStale:isStale)
            }
        }
        .foregroundStyle(QueueChrome.text)
        .padding(.horizontal,15).padding(.vertical,10)
        .background(LinearGradient(colors:[QueueChrome.color(0x222B34),QueueChrome.background],startPoint:.topLeading,endPoint:.bottomTrailing))
        .overlay(RoundedRectangle(cornerRadius:22).strokeBorder(QueueChrome.metal.opacity(dimmed ? 0.2 : 0.5),lineWidth:1).padding(1))
        .clipShape(RoundedRectangle(cornerRadius:23))
        .accessibilityElement(children:.ignore)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint("Double-tap to open Beerfinder")
    }
    private var accent: Color { (isStale ? QueueChrome.amber : QueueChrome.cyan).opacity(dimmed ? 0.75 : 1) }
    private var accessibilitySummary: String {
        let names = beers.prefix(visibleCount).map(\.name).joined(separator:". ")
        let extra = max(0,beers.count - visibleCount)
        return "\(isStale ? "Saved beer queue" : "Beer queue"). \(beers.count) \(beers.count == 1 ? "beer" : "beers"). \(names)." + (extra > 0 ? " \(extra) more in the app." : "") + (isStale ? " Open the app to refresh." : "")
    }
}

struct QueueActivityRows: View {
    let beers: [QueuedBeer]
    var limit = 3
    var body: some View {
        VStack(alignment:.leading,spacing:5) {
            if beers.isEmpty { Text("Queue is empty").font(QueueChrome.title(14)).foregroundStyle(QueueChrome.secondary) }
            ForEach(Array(beers.prefix(limit).enumerated()),id:\.element.id) { index,beer in
                HStack(alignment:.firstTextBaseline,spacing:9) {
                    Text(String(format:"%02d",index + 1)).font(QueueChrome.mono(9)).foregroundStyle(QueueChrome.secondary).accessibilityHidden(true)
                    Text(beer.name).font(QueueChrome.title(14)).foregroundStyle(QueueChrome.text).lineLimit(1).truncationMode(.tail)
                }.accessibilityElement(children:.ignore).accessibilityLabel(beer.name)
            }
        }
    }
}

struct QueueActivityFooter: View {
    let total: Int
    let visible: Int
    var isStale = false
    var body: some View {
        HStack(spacing:6) {
            if total > visible { Text("+\(total-visible) more").foregroundStyle(QueueChrome.secondary) }
            Spacer(minLength:4)
            Text(isStale ? "Open app to refresh" : "Open queue")
            Image(systemName:"arrow.up.right").font(.system(size:8,weight:.semibold))
        }.font(QueueChrome.mono(9)).foregroundStyle(isStale ? QueueChrome.amber : QueueChrome.cyan).lineLimit(1)
    }
}

struct BeerQueueExpandedView: View {
    let beers: [QueuedBeer]
    var isStale = false
    @Environment(\.dynamicTypeSize) private var typeSize
    private var limit: Int { typeSize >= .xxxLarge ? 1 : (typeSize >= .xLarge ? 2 : 3) }
    var body: some View {
        VStack(alignment:.leading,spacing:10) {
            Rectangle().fill(QueueChrome.secondary.opacity(0.25)).frame(height:1).accessibilityHidden(true)
            QueueActivityRows(beers:beers,limit:limit)
            QueueActivityFooter(total:beers.count,visible:limit,isStale:isStale)
        }.padding(.horizontal,4).padding(.bottom,4)
    }
}
