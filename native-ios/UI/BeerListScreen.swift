import SwiftUI

struct BeerListScreen: View {
    let kind: AppTab
    @EnvironmentObject var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) var reducedMotion
    @State private var filter = BeerFilter()
    @State private var expandedID: String?
    @State private var search = ""
    private var beers: [Beer] { switch kind { case .finder:model.untasted; case .tasted:model.tastedBeers; default:model.allBeers } }
    private var filtered: [Beer] { filter.apply(beers,tasted:kind == .tasted) }
    var body: some View {
        let filtered = self.filtered
        return GeometryReader { geometry in
            // Match the reference tablet breakpoints using available window width (including Split View).
            let columnCount = typeSize.isAccessibilitySize ? 1 : geometry.size.width >= 1024 ? 3 : geometry.size.width >= 768 ? 2 : 1
            let columns = Array(repeating:GridItem(.flexible(),spacing:8,alignment:.top),count:columnCount)
            VStack(spacing:12) {
                HStack {
                    DisplayTitle(title:kind.title); Spacer()
                    if model.refreshing { ProgressView().tint(Robo.cyan) }
                    Button { model.showSettings = true } label: { IconWell(symbol:"gearshape").frame(width:44,height:44) }.buttonStyle(.plain).accessibilityLabel("Open settings")
                }
                HStack {
                    Image(systemName:"magnifyingglass").foregroundStyle(Robo.steel)
                    TextField(kind == .tasted ? "Search tasted beer..." : kind == .finder ? "Search available beer..." : "Search beer...",text:$search).font(Robo.mono(12)).autocorrectionDisabled().textInputAutocapitalization(.never).accessibilityIdentifier("search-input")
                    if !search.isEmpty { Button { search = "" } label: { Image(systemName:"xmark.circle.fill").frame(width:44,height:44) }.accessibilityLabel("Clear search") }
                }.padding(.horizontal,12).frame(minHeight:38).modifier(ChromeBezel(radius:12))
                Text("\(filtered.count) \(kind == .finder ? "to discover" : kind == .tasted ? "tasted beers" : "beers on tap")").font(Robo.mono(10)).foregroundStyle(Robo.steel).frame(maxWidth:.infinity,alignment:.leading)
                ViewThatFits(in:.horizontal) {
                    HStack(spacing:6) { filterControls; if kind == .finder { queueControls }; Spacer(minLength:0) }.fixedSize(horizontal:true,vertical:false)
                    VStack(alignment:.leading,spacing:0) {
                        HStack(spacing:6) { filterControls }
                        if kind == .finder { HStack(spacing:6) { queueControls } }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading)
                ScrollView {
                    LazyVStack(spacing:8) {
                        if beers.isEmpty && model.refreshing { ForEach(0..<8) { _ in ChromePanel { RoundedRectangle(cornerRadius:4).fill(Robo.steel.opacity(0.12)).frame(height:64) }.accessibilityLabel("Loading beer") } }
                        else if filtered.isEmpty {
                            VStack(spacing:16) {
                                Image(systemName:"mug").font(.system(size:40)).foregroundStyle(Robo.cyan)
                                Text(search.isEmpty ? "No beers to display" : "No beers match your search").font(Robo.title(18))
                                Text(model.error != nil ? "Saved data is still available. Try reading it again or pull to refresh." : "Try another filter or pull down to refresh.").font(Robo.mono()).multilineTextAlignment(.center)
                                if model.error != nil { Button("Try Again") { model.localRetry() }.buttonStyle(RoboButtonStyle()) }
                            }.padding(.vertical,40)
                        }
                        LazyVGrid(columns:columns,alignment:.leading,spacing:8) {
                            ForEach(filtered) { beer in
                                BeerCard(beer:beer,expanded:expandedID == beer.id,dateLabel:kind == .tasted ? "Tasted" : "Added",checkIn:kind == .finder,toggle:{ withAnimation(reducedMotion ? nil : .easeInOut(duration:0.2)) { expandedID = expandedID == beer.id ? nil : beer.id } })
                            }
                        }
                    }.padding(.bottom,20)
                }.refreshable { await model.refresh() }
            }.padding(.horizontal,18).padding(.top,8)
        }
            .task(id:search) { do { try await Task.sleep(for:.milliseconds(300)); filter.search = search; expandedID = nil } catch {} }
            .task {
                #if DEBUG
                if model.previewMode, ProcessInfo.processInfo.arguments.contains("--preview-expanded") {
                    try? await Task.sleep(for:.milliseconds(400))
                    expandedID = filtered.first?.id
                }
                #endif
            }
    }
    private var filterControls: some View {
        Group {
            Button(filter.container == .cans ? "CANS" : filter.container.rawValue) {
                UIImpactFeedbackGenerator(style:.light).impactOccurred()
                let cases = ContainerFilter.allCases
                filter.container = cases[(cases.firstIndex(of:filter.container)!+1)%cases.count]; expandedID = nil
            }.buttonStyle(BeerControlStyle(appearance:filter.container == .all ? .chrome : .selected))
                .accessibilityIdentifier("container-filter").accessibilityLabel("Container filter: \(filter.container == .cans ? "Cans and bottles" : filter.container.rawValue)")
                .accessibilityAddTraits(filter.container == .all ? [] : .isSelected)
            Button {
                UIImpactFeedbackGenerator(style:.light).impactOccurred()
                let cases = BeerSort.allCases
                filter.sort = cases[(cases.firstIndex(of:filter.sort)!+1)%cases.count]; filter.ascending = filter.sort != .date
            } label: {
                HStack(spacing:6) {
                    if filter.sort == .abv { Text("\u{f003}").font(.custom(Robo.beerIconFont,size:14)) }
                    else { Image(systemName:filter.sort == .date ? "calendar" : "textformat").font(.system(size:12)) }
                    Text(filter.sort.rawValue.uppercased())
                }
            }.buttonStyle(BeerControlStyle()).accessibilityIdentifier("sort-button").accessibilityLabel("Sort by \(filter.sort.rawValue)")
            Button(directionLabel + " ↓") {
                UIImpactFeedbackGenerator(style:.light).impactOccurred(); filter.ascending.toggle()
            }.buttonStyle(BeerControlStyle()).accessibilityIdentifier("sort-direction-button").accessibilityLabel("Sort direction: \(directionLabel)")
        }
    }
    private var directionLabel: String {
        switch filter.sort {
        case .date: filter.ascending ? "OLD" : "NEW"
        case .name: filter.ascending ? "A-Z" : "Z-A"
        case .abv: filter.ascending ? "LOW" : "HIGH"
        }
    }
    private var queueControls: some View {
        Group {
            Button { model.showQueue = true; Task { await model.refreshQueue() } } label: {
                if model.loadingQueue { ProgressView().tint(Robo.amber) } else { Text("QUEUE") }
            }.buttonStyle(BeerControlStyle(appearance:.amber,compact:true)).disabled(model.loadingQueue).accessibilityIdentifier("view-queue-button").accessibilityLabel("View beer queue").accessibilityValue(model.loadingQueue ? "Loading" : "")
            Button("REWARDS") { model.showRewards = true }.buttonStyle(BeerControlStyle(appearance:.amber,compact:true)).accessibilityIdentifier("finder-rewards-button")
        }
    }
}
struct BeerCard: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let beer: Beer
    let expanded: Bool
    let dateLabel: String
    let checkIn: Bool
    let toggle: () -> Void
    @EnvironmentObject var model: AppModel
    private var pending: Bool { model.operations.contains { $0.payload["beerId"] == beer.id && $0.payload["memberId"] == model.session?.memberId } }
    var body: some View {
        ChromePanel(padding:10) {
            VStack(alignment:.leading,spacing:10) {
                Button(action:toggle) {
                    (typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:10)) : AnyLayout(HStackLayout(spacing:10))) {
                        BeerIconWell(glyph:glyph).accessibilityLabel(beer.container_type ?? "Unknown container")
                        VStack(alignment:.leading,spacing:3) {
                            Text(beer.brew_name).font(Robo.title()).foregroundStyle(Robo.cyan).lineLimit(expanded || typeSize.isAccessibilitySize ? nil : 1).accessibilityIdentifier("beer-name-\(beer.id)")
                            Text(beer.brewer + (beer.tasted_date.isEmpty ? "" : " · \(dateLabel) \(beer.displayDate)")).font(Robo.mono(10)).foregroundStyle(Robo.steel).lineLimit(expanded || typeSize.isAccessibilitySize ? nil : 1)
                            Text([beer.brew_style,beer.brew_container].filter { !$0.isEmpty }.joined(separator:" · ")).font(Robo.mono(10)).foregroundStyle(Robo.steel).lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                        }.frame(maxWidth:.infinity,alignment:.leading)
                        if let abv = beer.abv { Text("\(abv.formatted())%").font(Robo.mono(11).weight(.bold)).foregroundStyle(Robo.cyan).padding(.horizontal,8).padding(.vertical,4).frame(minHeight:28).overlay(RoundedRectangle(cornerRadius:8).strokeBorder(Robo.cyan.opacity(0.267),lineWidth:1)) }
                    }.frame(minHeight:46).contentShape(Rectangle())
                }.buttonStyle(.plain).multilineTextAlignment(.leading).accessibilityIdentifier("beer-item-\(beer.id)").accessibilityValue(expanded ? "Expanded" : "Collapsed")
                if expanded {
                    Divider().overlay(Robo.steel.opacity(0.3))
                    if beer.tasted_date.isEmpty { Text("\(dateLabel): \(beer.displayDate)").font(Robo.mono(10)).foregroundStyle(Robo.steel) }
                    if !beer.brew_description.isEmpty {
                        Text("Description").font(Robo.title(13))
                        Text(beer.plainDescription).font(Robo.mono()).foregroundStyle(Robo.steel).lineSpacing(5).accessibilityIdentifier("beer-description-\(beer.id)")
                    }
                    HStack {
                        if checkIn {
                            Button { Task { await model.checkIn(beer) } } label: { if model.busyIDs.contains(beer.id) { ProgressView().tint(Robo.amber) } else { Text(pending ? "QUEUED" : "CHECK IN") } }.buttonStyle(BeerControlStyle(appearance:.amber)).disabled(pending || model.busyIDs.contains(beer.id)).accessibilityIdentifier("check-in-\(beer.id)").accessibilityLabel("Check in \(beer.brew_name)").accessibilityValue(pending ? "Queued" : model.busyIDs.contains(beer.id) ? "Submitting" : "")
                        }
                        if dateLabel != "Tasted" { Button("UNTAPPD") { model.openUntappd(beer) }.buttonStyle(BeerControlStyle(appearance:checkIn ? .amber : .outline)).accessibilityIdentifier("untappd-\(beer.id)") }
                    }
                }
            }
        }
    }
    private var glyph: String { ["tulip":"\u{f000}","pint":"\u{f001}","can":"\u{f002}","bottle":"\u{f003}","flight":"\u{f004}"][beer.container_type ?? ""] ?? "?" }
}
