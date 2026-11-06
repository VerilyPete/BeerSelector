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
    private var refreshing: Bool { model.refreshing || (kind == .finder && model.loadingQueue) }
    private var hasFilters: Bool { !filter.search.isEmpty || !search.isEmpty || filter.container != .all }
    private var refreshError: String? { model.error ?? (kind == .finder ? model.queueError : nil) }
    private func refreshList() async {
        if kind == .finder { await model.refreshFinder() } else { await model.refresh() }
    }
    var body: some View {
        let filtered = self.filtered
        return GeometryReader { geometry in
            // Match the reference tablet breakpoints using available window width (including Split View).
            let columnCount = typeSize.isAccessibilitySize ? 1 : geometry.size.width >= 1024 ? 3 : geometry.size.width >= 768 ? 2 : 1
            let columns = Array(repeating:GridItem(.flexible(),spacing:8,alignment:.top),count:columnCount)
            VStack(spacing:12) {
                HStack {
                    DisplayTitle(title:kind.title); Spacer()
                    if refreshing { ProgressView().tint(Robo.cyan).accessibilityLabel("Refreshing beers") }
                    Button { model.showSettings = true } label: { IconWell(symbol:"gearshape").frame(width:44,height:44) }.buttonStyle(.plain).accessibilityLabel("Open settings")
                }
                HStack {
                    Image(systemName:"magnifyingglass").foregroundStyle(Robo.steel)
                    TextField(kind == .tasted ? "Search tasted beer..." : kind == .finder ? "Search available beer..." : "Search beer...",text:$search).font(Robo.mono(12)).autocorrectionDisabled().textInputAutocapitalization(.never).accessibilityIdentifier("search-input")
                    if !search.isEmpty { Button { search = "" } label: { Image(systemName:"xmark.circle.fill").frame(width:44,height:44) }.accessibilityLabel("Clear search") }
                }.padding(.horizontal,12).frame(minHeight:38).modifier(ChromeBezel(radius:12))
                Text("\(filtered.count) \(kind == .finder ? "to discover" : kind == .tasted ? "tasted beers" : "beers on tap")").font(Robo.mono(10)).foregroundStyle(Robo.steel).frame(maxWidth:.infinity,alignment:.leading)
                ViewThatFits(in:.horizontal) {
                    HStack(spacing:6) { containerSegments(vertical:false); sortControls; if kind == .finder { queueControls }; Spacer(minLength:0) }.fixedSize(horizontal:true,vertical:false)
                    VStack(alignment:.leading,spacing:0) {
                        HStack(spacing:4) { containerSegments(vertical:false) }.fixedSize(horizontal:true,vertical:false)
                        HStack(spacing:6) { sortControls; if kind == .finder { queueControls } }.fixedSize(horizontal:true,vertical:false)
                    }
                    VStack(alignment:.leading,spacing:0) {
                        containerSegments(vertical:true)
                        HStack(spacing:6) { sortControls }
                        if kind == .finder { HStack(spacing:6) { queueControls } }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading)
                if kind == .finder, let queueError = model.queueError {
                    Text(queueError).font(Robo.mono()).foregroundStyle(Robo.red)
                        .frame(maxWidth:.infinity,alignment:.leading).accessibilityIdentifier("finder-queue-error")
                }
                ScrollView {
                    LazyVStack(spacing:8) {
                        if filtered.isEmpty && refreshing {
                            ProgressView("Refreshing beers…").tint(Robo.cyan).font(Robo.mono())
                                .padding(.vertical,40).accessibilityIdentifier("beer-list-refreshing")
                        }
                        else if filtered.isEmpty {
                            VStack(spacing:16) {
                                Image(systemName:"mug").font(.system(size:40)).foregroundStyle(Robo.cyan)
                                Text(hasFilters ? "No beers match your filters" : "No beers to display").font(Robo.title(18))
                                Text(refreshError != nil ? "Try refreshing again to update this list." : "Try another filter or refresh the list.").font(Robo.mono()).multilineTextAlignment(.center)
                                if hasFilters {
                                    Button("Clear Filters") { search = ""; filter.search = ""; filter.container = .all; expandedID = nil }
                                        .buttonStyle(RoboButtonStyle()).accessibilityIdentifier("clear-beer-filters")
                                }
                                Button(refreshError != nil ? "Try Again" : "Refresh") { Task { await refreshList() } }
                                    .buttonStyle(RoboButtonStyle()).accessibilityIdentifier("retry-beer-refresh")
                            }.padding(.vertical,40)
                        }
                        LazyVGrid(columns:columns,alignment:.leading,spacing:8) {
                            ForEach(filtered) { beer in
                                BeerCard(beer:beer,expanded:expandedID == beer.id,dateLabel:kind == .tasted ? "Tasted" : "Added",checkIn:kind == .finder,toggle:{ withAnimation(reducedMotion ? nil : .easeInOut(duration:0.2)) { expandedID = expandedID == beer.id ? nil : beer.id } })
                            }
                        }
                    }.padding(.bottom,20)
                }.scrollBounceBehavior(.always).refreshable { await refreshList() }
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
    private func containerSegments(vertical: Bool) -> some View {
        (vertical ? AnyLayout(VStackLayout(alignment:.leading,spacing:0)) : AnyLayout(HStackLayout(spacing:4))) {
            ForEach(ContainerFilter.allCases,id:\.self) { option in
                let selected = filter.container == option
                Button(option.segmentTitle) {
                    UIImpactFeedbackGenerator(style:.light).impactOccurred()
                    filter.container = option; expandedID = nil
                }.buttonStyle(BeerControlStyle(appearance:selected ? .selected : .chrome))
                    .accessibilityIdentifier("container-filter-\(option.segmentID)")
                    .accessibilityLabel(option.spokenTitle)
                    .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }.accessibilityElement(children:.contain).accessibilityLabel("Container filter")
    }
    private var sortControls: some View {
        let current = SortOption(filter:filter)
        return Menu {
            Picker("Sort",selection:Binding(get:{ SortOption(filter:filter) },set:{ option in
                UIImpactFeedbackGenerator(style:.light).impactOccurred(); option.apply(to:&filter)
            })) {
                ForEach(SortOption.all,id:\.chipLabel) { option in
                    Label { Text(option.menuTitle) } icon: { SortGlyph.menuImage(option) }.tag(option)
                }
            }.pickerStyle(.inline)
        } label: {
            HStack(spacing:6) {
                SortGlyph(option:current)
                Text(current.chipLabel)
                Image(systemName:"chevron.down").font(.system(size:10,weight:.semibold))
            }
        }.menuStyle(.button).buttonStyle(BeerControlStyle())
            .accessibilityIdentifier("sort-menu").accessibilityLabel("Sort: \(current.spokenLabel)")
    }
    private var queueControls: some View {
        Group {
            Button { model.showQueue = true } label: {
                if model.loadingQueue { ProgressView().tint(Robo.amber) } else { Text("QUEUE") }
            }.buttonStyle(BeerControlStyle(appearance:.amber,compact:true)).disabled(model.loadingQueue).accessibilityIdentifier("view-queue-button").accessibilityLabel("View beer queue").accessibilityValue(model.loadingQueue ? "Loading" : "")
            Button("REWARDS") { model.showRewards = true }.buttonStyle(BeerControlStyle(appearance:.amber,compact:true)).accessibilityIdentifier("finder-rewards-button")
        }
    }
}
/// The sort chip's icon: the BeerIcons glyph for ABV, an SF Symbol otherwise.
private struct SortGlyph: View {
    let option: SortOption
    var body: some View {
        if option.usesBeerIcon { Text("\u{f003}").font(.custom(Robo.beerIconFont,size:14)) }
        else { Image(systemName:SortGlyph.symbol(option)).font(.system(size:12)) }
    }
    static func symbol(_ option: SortOption) -> String { option.sort == .date ? "calendar" : "textformat" }
    /// Menus draw only images, so the BeerIcons glyph is rendered to one.
    @MainActor static func menuImage(_ option: SortOption) -> Image {
        guard option.usesBeerIcon, let font = UIFont(name:Robo.beerIconFont,size:20) else { return Image(systemName:symbol(option)) }
        let glyph = NSAttributedString(string:"\u{f003}",attributes:[.font:font,.foregroundColor:UIColor.label])
        let image = UIGraphicsImageRenderer(size:glyph.size()).image { _ in glyph.draw(at:.zero) }
        return Image(uiImage:image.withRenderingMode(.alwaysTemplate))
    }
}
private extension ContainerFilter {
    var segmentTitle: String { self == .cans ? "CANS & BOTTLES" : rawValue }
    var spokenTitle: String { switch self { case .all: "All"; case .draft: "Draft"; case .cans: "Cans and bottles" } }
    var segmentID: String { switch self { case .all: "all"; case .draft: "draft"; case .cans: "cans" } }
}
struct BeerCard: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let beer: Beer
    let expanded: Bool
    let dateLabel: String
    let checkIn: Bool
    var large = false
    let toggle: () -> Void
    @EnvironmentObject var model: AppModel
    private var pending: Bool { model.hasSavedCheckIn(beer.id) }
    var body: some View {
        VStack(alignment:.leading,spacing:10) {
                Button(action:toggle) {
                    (typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:10)) : AnyLayout(HStackLayout(spacing:10))) {
                        BeerIconWell(glyph:glyph).accessibilityLabel(beer.container_type ?? "Unknown container")
                        VStack(alignment:.leading,spacing:3) {
                            Text(beer.brew_name).font(Robo.title(large ? 18 : 15)).foregroundStyle(Robo.textPrimary).lineLimit(expanded || typeSize.isAccessibilitySize ? nil : 1).accessibilityIdentifier("beer-name-\(beer.id)")
                            Group {
                                if let arrival {
                                    ViewThatFits(in:.horizontal) {
                                        Text("\(beer.brewer) · \(arrival)").lineLimit(1)
                                        VStack(alignment:.leading,spacing:3) { Text(beer.brewer).lineLimit(textLines); Text(arrival).lineLimit(textLines) }
                                    }
                                } else {
                                    Text(brewerLine).lineLimit(textLines)
                                }
                            }.font(Robo.body(large ? 15 : 13)).foregroundStyle(Robo.textSecondary)
                            Text([beer.brew_style,beer.brew_container].filter { !$0.isEmpty }.joined(separator:" · ")).font(Robo.mono(large ? 13 : 10)).foregroundStyle(Robo.textSecondary).lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                        }.frame(maxWidth:.infinity,alignment:.leading)
                        if let abv = beer.abv { Text("\(abv.formatted())%").font(Robo.mono(large ? 14 : 11).weight(.bold)).foregroundStyle(Robo.textPrimary).padding(.horizontal,8).padding(.vertical,4).frame(minHeight:28).overlay(RoundedRectangle(cornerRadius:8).strokeBorder(Color.white.opacity(0.2),lineWidth:1)) }
                    }.frame(minHeight:46).contentShape(Rectangle())
                }.buttonStyle(.plain).multilineTextAlignment(.leading).accessibilityIdentifier("beer-item-\(beer.id)").accessibilityValue(expanded ? "Expanded" : "Collapsed")
                if expanded {
                    Divider().overlay(Robo.hairline)
                    if beer.tasted_date.isEmpty { Text("\(dateLabel): \(beer.displayDate)").font(Robo.mono(10)).foregroundStyle(Robo.textSecondary) }
                    if !beer.brew_description.isEmpty {
                        Text("Description").font(Robo.title(13)).foregroundStyle(Robo.textPrimary)
                        Text(beer.plainDescription).font(Robo.body(14)).foregroundStyle(Robo.textSecondary).lineSpacing(4).accessibilityIdentifier("beer-description-\(beer.id)")
                    }
                    if dateLabel == "Tasted", model.isMember { BeerFeedbackControls(beer:beer) }
                    HStack {
                        if checkIn {
                            Button { if pending { model.showOperations = true } else { Task { await model.checkIn(beer) } } } label: { if model.busyIDs.contains(beer.id) { ProgressView().tint(Robo.amber) } else { Text(pending ? "REVIEW REQUEST" : "CHECK IN") } }.buttonStyle(BeerControlStyle(appearance:.amber)).disabled(model.busyIDs.contains(beer.id)).accessibilityIdentifier("check-in-\(beer.id)").accessibilityLabel(pending ? "Review saved request for \(beer.brew_name)" : "Check in \(beer.brew_name)").accessibilityValue(pending ? "Saved request" : model.busyIDs.contains(beer.id) ? "Submitting" : "")
                        }
                        if dateLabel != "Tasted" { Button("UNTAPPD") { model.openUntappd(beer) }.buttonStyle(BeerControlStyle(appearance:checkIn ? .amber : .outline)).accessibilityIdentifier("untappd-\(beer.id)") }
                    }
                }
        }.padding(12).contentCard()
    }
    private var brewerLine: String {
        beer.tasted_date.isEmpty ? beer.brewer : "\(beer.brewer) · \(dateLabel) \(beer.displayDate)"
    }
    private var textLines: Int? { expanded || typeSize.isAccessibilitySize ? nil : 1 }
    private var arrival: String? { large && beer.tasted_date.isEmpty ? beer.arrivalLabel() : nil }
    private var glyph: String { ["tulip":"\u{f000}","pint":"\u{f001}","can":"\u{f002}","bottle":"\u{f003}","flight":"\u{f004}"][beer.container_type ?? ""] ?? "?" }
}

struct BeerFeedbackControls: View {
    let beer: Beer
    @EnvironmentObject var model: AppModel
    var body: some View {
        let account = model.recommendationAccount
        let rating = model.beerFeedback.first { $0.id == beer.id }?.rating
        ViewThatFits(in:.horizontal) {
            HStack { buttons(rating:rating,account:account) }
            VStack(alignment:.leading) { buttons(rating:rating,account:account) }
        }
    }
    @ViewBuilder private func buttons(rating: BeerRating?, account: String?) -> some View {
        ForEach(BeerRating.allCases,id:\.self) { choice in
            Button { model.setBeerRating(beer,rating:choice,account:account) } label: {
                Label(choice.label,systemImage:choice == .liked ? "hand.thumbsup" : "hand.thumbsdown")
            }.buttonStyle(BeerControlStyle(appearance:rating == choice ? .selected : .outline))
                .accessibilityIdentifier("beer-feedback-\(beer.id)-\(choice.rawValue)")
                .accessibilityAddTraits(rating == choice ? .isSelected : [])
        }
    }
}
