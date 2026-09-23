import SwiftUI

enum Robo {
    // BeerIcons.ttf was exported with this internal PostScript name.
    static let beerIconFont = "Untitled"
    static let background = Color(red:10/255,green:10/255,blue:10/255)
    static let display = Color(red:13/255,green:17/255,blue:23/255)
    static let panel = Color(red:26/255,green:29/255,blue:34/255)
    static let border = Color(red:42/255,green:46/255,blue:53/255)
    static let steel = Color(red:138/255,green:145/255,blue:154/255)
    static let text = Color(red:200/255,green:205/255,blue:211/255)
    static let cyan = Color(red:0,green:1,blue:208/255)
    static let amber = Color(red:1,green:179/255,blue:0)
    static let red = Color(red:1,green:0.2,blue:0.2)
    static func color(_ hex: UInt32) -> Color { Color(red:Double((hex >> 16) & 255)/255,green:Double((hex >> 8) & 255)/255,blue:Double(hex & 255)/255) }
    static func metal(_ stops: [(UInt32,Double)], reversed: Bool = false) -> LinearGradient {
        LinearGradient(stops:stops.map { .init(color:color($0.0),location:$0.1) },startPoint:reversed ? .bottom : .top,endPoint:reversed ? .top : .bottom)
    }
    // RobocopChrome.pen: FilterButton/SteelPanel, BeerRow/SearchBar/NavCard, and TabBar.
    static let chrome = metal([(0xD4D8DD,0),(0x8A919A,0.3),(0x6B727B,1)])
    static let polished = metal([(0xE8ECF0,0),(0xA0A7B0,0.15),(0x6B727B,0.5),(0x8A919A,0.85),(0xD4D8DD,1)])
    static let tabChrome = metal([(0xE8ECF0,0),(0x8A919A,0.2),(0x6B727B,0.5),(0x8A919A,0.8),(0xD4D8DD,1)])
    static let brushed = metal([(0xD4D8DD,0),(0xC0C5CC,0.1),(0xA8AEB6,0.3),(0xB0B6BE,0.5),(0x969DA6,0.7),(0xA0A7B0,0.85),(0xB8BFC7,1)])
    static let brushedBottom = metal([(0xB8BFC7,0),(0xA0A7B0,0.15),(0x969DA6,0.3),(0xB0B6BE,0.5),(0xA8AEB6,0.7),(0xC0C5CC,0.85),(0xD4D8DD,1)],reversed:true)
    static let iconSteel = metal([(0xB8BFC7,0),(0x8A919A,0.5),(0x6B727B,1)])
    static let labelSteel = metal([(0x8A919A,0),(0x6B727B,0.5),(0x5A6069,1)])
    static let amberChrome = metal([(0xFFD54F,0),(0xFFB300,0.3),(0xE6A200,1)])
    static let redChrome = metal([(0xFF6666,0),(0xFF3333,0.3),(0xCC2222,1)])
    static func mono(_ size: CGFloat = 11) -> Font { .custom("SpaceMono-Regular",size:size,relativeTo:.caption) }
    static func title(_ size: CGFloat = 14) -> Font { .custom("SpaceGrotesk-SemiBold",size:size,relativeTo:.headline) }
    static func bold(_ size: CGFloat = 26) -> Font { .custom("SpaceGrotesk-Bold",size:size,relativeTo:.title) }
}

struct ChromeBezel: ViewModifier {
    var radius: CGFloat = 14
    var rim: CGFloat = 3
    var gradient = Robo.polished
    var well = Robo.display
    var edge = Color.white.opacity(0.25)
    var overlayTint = Color.clear
    func body(content: Content) -> some View {
        content
            .background(well,in:RoundedRectangle(cornerRadius:radius-rim))
            .overlay(RoundedRectangle(cornerRadius:radius-rim).strokeBorder(Robo.border,lineWidth:1))
            .padding(rim)
            .background {
                RoundedRectangle(cornerRadius:radius).fill(gradient)
                    .overlay(RoundedRectangle(cornerRadius:radius).fill(overlayTint).blendMode(.overlay))
            }
            .overlay(RoundedRectangle(cornerRadius:radius).strokeBorder(edge,lineWidth:1))
    }
}

struct BrushedChrome: View {
    var bottom = false
    var body: some View {
        (bottom ? Robo.brushedBottom : Robo.brushed)
            .overlay { Rectangle().fill(Color.white.opacity(0.03)).blendMode(.overlay) }
            .overlay {
                Canvas { context,size in
                    var grain = Path()
                    for y in stride(from:0.0,to:size.height,by:2) {
                        grain.move(to:.init(x:0,y:y)); grain.addLine(to:.init(x:size.width,y:y))
                    }
                    context.stroke(grain,with:.color(.white.opacity(0.035)),lineWidth:0.5)
                }
            }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct ChromeScreenBackground: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Robo.background
                VStack(spacing:0) {
                    BrushedChrome().frame(height:geometry.safeAreaInsets.top)
                    Spacer(minLength:0)
                    BrushedChrome(bottom:true).frame(height:geometry.safeAreaInsets.bottom)
                }
            }.ignoresSafeArea()
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct DisplayTitle: View {
    let title: String
    var size: CGFloat = 26
    var body: some View {
        Text(title).font(Robo.bold(size)).foregroundStyle(Robo.background)
            .padding(.horizontal,12).padding(.vertical,4)
            .background(Robo.cyan,in:RoundedRectangle(cornerRadius:4))
            .overlay(Scanlines()).clipShape(RoundedRectangle(cornerRadius:4))
    }
}

struct ChromeScreenHeader: View {
    let title: String
    let close: () -> Void
    var refresh: (() -> Void)? = nil
    var refreshing = false
    var body: some View {
        HStack(spacing:12) {
            Button(action:close) { IconWell(symbol:"arrow.left").frame(width:44,height:44) }
                .buttonStyle(.plain).accessibilityLabel("Close \(title)")
            DisplayTitle(title:title)
            Spacer(minLength:0)
            if let refresh {
                Button(action:refresh) { IconWell(symbol:"arrow.clockwise").frame(width:44,height:44) }
                    .buttonStyle(.plain).disabled(refreshing).accessibilityLabel("Refresh queue")
            }
        }.padding(.horizontal,18).padding(.vertical,8).background(Robo.background)
    }
}

struct Rivets: View {
    private var rivet: some View {
        Circle().fill(RadialGradient(stops:[.init(color:Robo.color(0xE8ECF0),location:0),.init(color:Robo.steel,location:0.5),.init(color:Robo.color(0x5A6069),location:1)],center:.center,startRadius:0,endRadius:3.5))
            .overlay(Circle().strokeBorder(.white.opacity(0.25),lineWidth:0.5)).frame(width:7,height:7)
    }
    var body: some View {
        VStack { HStack { rivet; Spacer(); rivet }; Spacer(); HStack { rivet; Spacer(); rivet } }
            .padding(8).allowsHitTesting(false).accessibilityHidden(true)
    }
}

struct ChromePanel<Content: View>: View {
    var padding: CGFloat = 12
    var riveted = false
    @ViewBuilder var content: Content
    var body: some View {
        content.padding(padding).frame(maxWidth:.infinity,alignment:.leading)
            .modifier(ChromeBezel(radius:riveted ? 16 : 14,gradient:riveted ? Robo.chrome : Robo.polished,edge:riveted ? Robo.color(0xE8ECF0) : .white.opacity(0.25),overlayTint:riveted ? Robo.color(0x5A6069) : .clear))
            .overlay { if riveted { Rivets() } }
    }
}
struct LabelPlate: View {
    let title: String
    var cyan = false
    var body: some View {
        Text(title).font(Robo.mono(9).weight(.bold)).tracking(3).foregroundStyle(Robo.border)
            .padding(.horizontal,10).padding(.vertical,4)
            .background {
                if cyan { RoundedRectangle(cornerRadius:4).fill(Robo.cyan) }
                else { RoundedRectangle(cornerRadius:4).fill(Robo.labelSteel) }
            }
            .overlay(RoundedRectangle(cornerRadius:4).strokeBorder(Robo.color(0xA0A7B0).opacity(0.25),lineWidth:1))
            .shadow(color:.black.opacity(0.375),radius:2,y:1)
    }
}
struct IconWell: View {
    var symbol: String
    var color: Color = Robo.cyan
    var etched = false
    var size: CGFloat = 36
    var body: some View {
        Group {
            if etched {
                ZStack {
                    Image(systemName:symbol).foregroundStyle(.white.opacity(0.25)).offset(y:1)
                    Image(systemName:symbol).foregroundStyle(Robo.background).offset(y:-1)
                }.font(.system(size:20)).frame(width:size,height:size)
                    .background(Robo.iconSteel,in:RoundedRectangle(cornerRadius:10))
                    .overlay(RoundedRectangle(cornerRadius:10).strokeBorder(color,lineWidth:1.5))
            } else {
                Image(systemName:symbol).font(.system(size:18)).foregroundStyle(Robo.steel)
                    .frame(width:size-4,height:size-4)
                    .modifier(ChromeBezel(radius:10,rim:2,gradient:Robo.chrome,edge:.white.opacity(0.188)))
            }
        }.accessibilityHidden(true)
    }
}

struct BeerIconWell: View {
    let glyph: String
    var body: some View {
        ZStack {
            Text(glyph).foregroundStyle(.white.opacity(0.25)).offset(y:1)
            Text(glyph).foregroundStyle(Robo.background).offset(y:-1)
        }.font(.custom(Robo.beerIconFont,size:22)).frame(width:40,height:40)
            .background(Robo.iconSteel,in:RoundedRectangle(cornerRadius:10))
            .overlay(RoundedRectangle(cornerRadius:10).strokeBorder(Robo.cyan,lineWidth:1.5))
            .accessibilityElement(children:.ignore)
    }
}
struct RoboButtonStyle: ButtonStyle {
    var color: Color = Robo.amber
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(Robo.mono(12)).tracking(1).foregroundStyle(color)
            .padding(.horizontal,14).frame(minHeight:44)
            .modifier(ChromeBezel(radius:10,rim:2,gradient:color == Robo.red ? Robo.redChrome : color == Robo.amber ? Robo.amberChrome : Robo.chrome,well:color == Robo.red ? Robo.color(0x1A0000) : color == Robo.amber ? Robo.color(0x1A1200) : Robo.display))
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Pen FilterButton and ActionButton materials, with a 44-point hit area.
struct BeerControlStyle: ButtonStyle {
    enum Appearance { case chrome, selected, amber, outline }
    var appearance: Appearance = .chrome
    var compact = false
    @Environment(\.isEnabled) private var enabled
    private var amber: Bool { appearance == .amber }
    private var selected: Bool { appearance == .selected }
    private var bezel: LinearGradient {
        amber ? Robo.metal([(0xB99742,0),(0x927020,0.3),(0x725719,1)]) : Robo.chrome
    }
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Robo.mono(amber ? 11 : 10).weight(amber ? .bold : .semibold)).tracking(0.5)
            .foregroundStyle(selected ? Robo.background : amber ? Robo.color(0xD4AB50) : Robo.cyan)
            .padding(.horizontal,amber && !compact ? 14 : 10).padding(.vertical,amber && !compact ? 6 : 4).frame(minHeight:amber && !compact ? 32 : 28)
            .background(selected ? Robo.cyan : amber ? Robo.color(0x1A1200) : Robo.display,in:RoundedRectangle(cornerRadius:8))
            .overlay(RoundedRectangle(cornerRadius:8).strokeBorder(amber ? Robo.color(0x332800).opacity(0.5) : Robo.border,lineWidth:selected ? 0 : 1))
            .padding(2)
            .background(bezel,in:RoundedRectangle(cornerRadius:10))
            .overlay(RoundedRectangle(cornerRadius:10).strokeBorder(amber ? Robo.color(0xFFE082).opacity(0.18) : .white.opacity(0.188),lineWidth:1))
            .overlay {
                if selected || appearance == .outline { RoundedRectangle(cornerRadius:10).strokeBorder(Robo.cyan,lineWidth:1.5) }
            }
            .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.45)
            .frame(minWidth:44,minHeight:44).contentShape(Rectangle())
    }
}
struct Scanlines: View {
    var body: some View {
        Canvas { context,size in
            var path = Path()
            for y in stride(from:0.0,to:size.height,by:4) { path.move(to:.init(x:0,y:y)); path.addLine(to:.init(x:size.width,y:y)) }
            context.stroke(path,with:.color(.black.opacity(0.15)),lineWidth:1)
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}
struct MetricPanel: View {
    let count: Int
    private var displayDigits: [Character] {
        let value = String(count)
        return Array(String(repeating:" ",count:max(0,3-value.count)) + value)
    }
    var body: some View {
        ChromePanel(padding:14,riveted:true) {
            VStack(alignment:.center,spacing:6) {
                Text("BEERS TASTED")
                    .font(Robo.bold(22)).tracking(2).lineLimit(1).minimumScaleFactor(0.7)
                    .foregroundStyle(Robo.background)
                    .frame(maxWidth:.infinity).padding(.vertical,6)
                    .background(Robo.cyan,in:RoundedRectangle(cornerRadius:5))
                HStack(alignment:.firstTextBaseline,spacing:6) {
                    HStack(spacing:2) {
                        ForEach(Array(displayDigits.enumerated()),id:\.offset) { _, digit in
                            Text("8").foregroundStyle(Robo.cyan.opacity(0.12))
                                .overlay {
                                    if digit != " " { Text(String(digit)).foregroundStyle(Robo.cyan) }
                                }
                        }
                    }.font(.custom("DSEG7Classic-Bold",size:88,relativeTo:.largeTitle))
                        .accessibilityHidden(true).layoutPriority(1)
                    Text("/200").font(Robo.title(30)).foregroundStyle(Robo.cyan.opacity(0.65))
                        .lineLimit(1).minimumScaleFactor(0.7)
                }.frame(maxWidth:.infinity).padding(.vertical,6)
                    .accessibilityElement(children:.ignore).accessibilityLabel("\(count) of 200 beers tasted")
                ProgressView(value:Double(min(count,200)),total:200).tint(Robo.cyan)
                Text(String(format:"%.1f%% UFO CLUB PROGRESS",min(Double(count)/200,1)*100))
                    .font(Robo.mono(11)).tracking(0.5).foregroundStyle(Robo.steel)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }.overlay(Scanlines())
        }
    }
}
