import SwiftUI

enum AppTab: String, CaseIterable {
    case home = "HOME", all = "BEERS", finder = "FINDER", tasted = "TASTED"
    var symbol: String { switch self { case .home:"house"; case .all:"mug"; case .finder:"star"; case .tasted:"checkmark.circle" } }
    var title: String { switch self { case .home:"Home"; case .all:"All Beers"; case .finder:"Beerfinder"; case .tasted:"Tasted Brews" } }
}
extension View {
    /// `blocked` is true while this presenter shows its own alert or dialog.
    func noticeAlert(_ host: NoticeHost, model: AppModel, blocked: Bool = false) -> some View { modifier(NoticeAlert(host:host,model:model,blocked:blocked)) }
}
private struct NoticeAlert: ViewModifier {
    let host: NoticeHost
    @ObservedObject var model: AppModel
    let blocked: Bool
    @State private var appeared = false
    func body(content: Content) -> some View {
        // OK dismisses the notice it displayed; the setter cannot know which notice is on screen.
        content.onAppear { appeared = true }.onDisappear { appeared = false }
            .onChange(of:appeared && !blocked,initial:true) { _,ready in model.noticePresenter(host,isReady:ready) }
            .alert("Beer Selector",isPresented:Binding(get:{ model.presentedNotice != nil && model.noticeHost == host },set:{ _ in }),presenting:model.presentedNotice) { shown in
            Button("OK") { model.dismissNotice(shown) }
        } message: { Text($0.message) }
    }
}
struct RootView: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @EnvironmentObject var model: AppModel
    var body: some View {
        VStack(spacing:0) {
            if model.offline { Text("OFFLINE — Showing saved data").font(Robo.mono()).foregroundStyle(Robo.amber).frame(maxWidth:.infinity).padding(8).background(Robo.panel) }
            if let error = model.error {
                HStack(alignment:.top) {
                    Text(error).font(Robo.mono()).foregroundStyle(Robo.red)
                    Spacer()
                    Button("Dismiss") { model.error = nil }.font(Robo.mono()).foregroundStyle(Robo.text)
                }.padding(12).background(Robo.panel).accessibilityIdentifier("error-banner")
            }
            if !model.operations.isEmpty {
                Button { model.showOperations = true } label: {
                    Label("\(model.operations.count) pending operation\(model.operations.count == 1 ? "" : "s")",systemImage:"clock.arrow.circlepath").font(Robo.mono()).frame(maxWidth:.infinity).padding(8)
                }.foregroundStyle(Robo.amber).accessibilityIdentifier("queued-operations-indicator")
            }
            if model.loading {
                Spacer(); ProgressView("Loading saved data…").tint(Robo.cyan).font(Robo.mono()); Spacer()
            } else {
                ZStack {
                    HomeView().opacity(model.tab == .home ? 1 : 0).allowsHitTesting(model.tab == .home).accessibilityHidden(model.tab != .home)
                    BeerListScreen(kind:.all).opacity(model.tab == .all ? 1 : 0).allowsHitTesting(model.tab == .all).accessibilityHidden(model.tab != .all)
                    if model.isMember {
                        BeerListScreen(kind:.finder).opacity(model.tab == .finder ? 1 : 0).allowsHitTesting(model.tab == .finder).accessibilityHidden(model.tab != .finder)
                        BeerListScreen(kind:.tasted).opacity(model.tab == .tasted ? 1 : 0).allowsHitTesting(model.tab == .tasted).accessibilityHidden(model.tab != .tasted)
                    }
                }
            }
            if model.configured { tabBar }
        }
        .background(ChromeScreenBackground()).foregroundStyle(Robo.text)
        .sheet(isPresented:$model.showRecommendations) { RecommendationsScreen(model:model) }
        .sheet(isPresented:$model.showSettings) { SettingsScreen().environmentObject(model) }
        .sheet(isPresented:$model.showRewards) { RewardsScreen().environmentObject(model) }
        .sheet(isPresented:$model.showQueue) { QueueScreen().environmentObject(model) }
        .sheet(isPresented:$model.showOperations) { OperationsScreen().environmentObject(model) }
        .noticeAlert(.root,model:model)
        .background(UntappdBrowser(url:$model.browserURL))
    }
    private var tabBar: some View {
        Group {
            if typeSize.isAccessibilitySize {
                LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:3) { tabButtons }
            } else {
                HStack(spacing:3) { tabButtons }
            }
        }.padding(3)
            .background(LinearGradient(colors:[Robo.panel,Robo.display],startPoint:.top,endPoint:.bottom),in:RoundedRectangle(cornerRadius:30))
            .overlay(RoundedRectangle(cornerRadius:30).strokeBorder(Robo.border,lineWidth:1))
            .padding(4).background(Robo.tabChrome,in:RoundedRectangle(cornerRadius:34))
            .overlay(RoundedRectangle(cornerRadius:34).strokeBorder(.white.opacity(0.188),lineWidth:1))
            .padding(.horizontal,16).padding(.top,4).padding(.bottom,4)
            .background { BrushedChrome(bottom:true).ignoresSafeArea(edges:.bottom) }
    }
    private var tabButtons: some View {
        ForEach(AppTab.allCases.filter { model.isMember || $0 == .home || $0 == .all },id:\.self) { tab in
            Button {
                UIImpactFeedbackGenerator(style:.light).impactOccurred(); model.selectTab(tab)
            } label: {
                VStack(spacing:3) { Image(systemName:tab.symbol).font(.system(size:18)); Text(tab.rawValue).font(Robo.mono(9)).tracking(1).lineLimit(1) }
                    .frame(maxWidth:.infinity,minHeight:48).foregroundStyle(model.tab == tab ? Robo.cyan : Robo.color(0x3A3F47))
                    .background(model.tab == tab ? Robo.color(0x1A2A2A) : .clear,in:RoundedRectangle(cornerRadius:30))
                    .overlay(RoundedRectangle(cornerRadius:30).strokeBorder(model.tab == tab ? Robo.cyan.opacity(0.267) : .clear,lineWidth:1))
            }.accessibilityLabel(tab.title).accessibilityAddTraits(model.tab == tab ? .isSelected : []).accessibilityIdentifier("tab-\(tab.rawValue.lowercased())")
        }
    }
}
struct HomeView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var expandedHomeBeerID: String?
    @State private var tabletAsideHeight: CGFloat = 0
    @State private var compactFit = CompactFit.roomy
    var body: some View {
        GeometryReader { geometry in
            let tabletLayout = geometry.size.width >= 768 && !typeSize.isAccessibilitySize
            if model.configured && !tabletLayout { compactHome }
            else {
                ScrollView {
                    Group {
                        if model.configured { tabletHome.padding(.horizontal,28).padding(.vertical,20) }
                        else {
                            VStack(spacing:24) {
                                Image(systemName:"mug.fill").font(.system(size:48)).foregroundStyle(Robo.cyan)
                                Text("Beer Selector").font(Robo.bold())
                                Text("Log in to your UFO Club account or browse as a visitor.").font(Robo.mono()).multilineTextAlignment(.center)
                                Button("Get Started") { model.showSettings = true }.buttonStyle(RoboButtonStyle(color:Robo.cyan))
                            }.frame(maxWidth:760).padding(.horizontal,18).padding(.vertical,60).frame(maxWidth:.infinity)
                        }
                    }
                }
            }
        }
        // The chrome lives outside this safe-area viewport. Explicitly clip the
        // entire Home scroll surface so cards and their shadows stay beneath it.
        .clipped()
    }
    /// How the compact Home fits its screen: roomy spacing, tight spacing, then one New on Tap row.
    private enum CompactFit { case roomy, tight, oneRow }
    @ViewBuilder private var compactHome: some View {
        switch CompactHomeMode(expandedID:expandedHomeBeerID,taplist:model.allBeers,accessibility:typeSize.isAccessibilitySize,fittedRows:compactFit == .oneRow ? 1 : 2) {
        case .scrolling(let rows):
            // Reading a description, or accessibility text, is the only time a fitting Home scrolls.
            ScrollView { compactContent(rows == 1 ? .oneRow : compactFit == .oneRow ? .roomy : compactFit).background(HomeScrollBoundary()) }
        case .fitted:
            ViewThatFits(in:.vertical) {
                compactContent(.roomy).onAppear { compactFit = .roomy }.fixedHome
                compactContent(.tight).onAppear { compactFit = .tight }.fixedHome
                compactContent(.oneRow).onAppear { compactFit = .oneRow }.fixedHome
                // Nothing fits (a short landscape window, or long banners): scroll the one-row layout.
                ScrollView { compactContent(.oneRow).background(HomeScrollBoundary()) }.onAppear { compactFit = .oneRow }
            }.frame(maxHeight:.infinity,alignment:.top)
        }
    }
    private func compactContent(_ fit: CompactFit) -> some View {
        VStack(alignment:.leading,spacing:fit == .roomy ? 20 : 12) {
            accountHeader
            recommendationEntry
            if model.isMember { MetricPanel(count:model.tastedBeers.count) }
            newOnTap(rows:fit == .oneRow ? 1 : 2)
            if model.isMember { HomeRewardsCard(status:rewardsStatus,open:{ model.showRewards = true },retry:{ Task { await model.refreshRewardsManually() } }) }
            else { visitorPanel }
        }.padding(.horizontal,18).padding(.top,8).padding(.bottom,fit == .roomy ? 18 : 10)
            .frame(maxWidth:760).frame(maxWidth:.infinity)
    }
    private var recommendationEntry: some View {
        SuggestionEntryCard(modes:model.suggestionMode) { model.showRecommendations = true }
    }
    private var tabletHome: some View {
        VStack(alignment:.leading,spacing:24) {
            tabletAccountHeader
            recommendationEntry
            HStack(alignment:.latestOnTap,spacing:28) {
                VStack(alignment:.leading,spacing:14) {
                    sectionHeading("LATEST ON TAP","View all") { model.selectTab(.all) }
                    let arrivals = BeerFilter.recentArrivals(model.allBeers)
                    if model.allBeers.isEmpty {
                        Text("No saved beers yet. Refresh from Settings to load the taplist.").font(Robo.body(15)).foregroundStyle(Robo.textSecondary)
                            .alignmentGuide(.latestOnTap) { $0[.top] }
                    } else if arrivals.isEmpty {
                        Text("Nothing new on tap in the last week.").font(Robo.body(15)).foregroundStyle(Robo.textSecondary)
                            .alignmentGuide(.latestOnTap) { $0[.top] }
                    } else {
                        ScrollView {
                            LazyVStack(spacing:14) {
                                ForEach(arrivals) { beer in
                                    BeerCard(beer:beer,expanded:expandedHomeBeerID == beer.id,dateLabel:"Added",checkIn:false,large:true) {
                                        expandedHomeBeerID = expandedHomeBeerID == beer.id ? nil : beer.id
                                    }
                                }
                            }
                        }.scrollBounceBehavior(.basedOnSize).accessibilityIdentifier("home-latest-on-tap")
                            // Long arrival weeks scroll inside the box instead of outrunning the right-hand panels.
                            .frame(height:tabletAsideHeight > 0 ? max(tabletAsideHeight,480) : nil)
                            .alignmentGuide(.latestOnTap) { $0[.top] }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading)
                VStack(alignment:.leading,spacing:24) {
                    if model.isMember {
                        VStack(spacing:12) {
                            MetricPanel(count:model.tastedBeers.count)
                            MilestoneStrip(count:model.tastedBeers.count,size:15)
                        }
                        VStack(alignment:.leading,spacing:14) {
                            sectionHeading("RECENT TASTINGS","View all") { model.selectTab(.tasted) }
                            Group {
                                VStack(alignment:.leading,spacing:14) {
                                    if model.tastedBeers.isEmpty { Text("Your confirmed tastings will appear here.").font(Robo.body(15)).foregroundStyle(Robo.textSecondary) }
                                    ForEach(Array(BeerFilter().apply(model.tastedBeers,tasted:true).prefix(4).enumerated()),id:\.element.id) { index,beer in
                                        if index > 0 { Divider().overlay(Robo.hairline) }
                                        VStack(alignment:.leading,spacing:4) {
                                            Text(beer.brew_name).font(Robo.title(18)).foregroundStyle(Robo.textPrimary)
                                            Text([beer.brewer,beer.tasted_date].filter { !$0.isEmpty }.joined(separator:" · ")).font(Robo.body(15)).foregroundStyle(Robo.textSecondary)
                                        }.frame(maxWidth:.infinity,alignment:.leading)
                                    }
                                }.frame(maxWidth:.infinity,alignment:.leading)
                            }.padding(16).contentCard()
                        }
                        VStack(alignment:.leading,spacing:14) {
                            sectionHeading("AVAILABLE REWARDS","View all") { model.showRewards = true }
                            Group {
                                VStack(alignment:.leading,spacing:14) {
                                    let available = model.rewards.filter { !$0.redeemed }
                                    if available.isEmpty { Text("No unclaimed rewards. Keep tasting toward your next milestone.").font(Robo.body(15)).foregroundStyle(Robo.textSecondary) }
                                    ForEach(Array(available.prefix(3))) { reward in
                                        Label(reward.type,systemImage:"gift").font(Robo.title(18)).foregroundStyle(Robo.amber)
                                    }
                                }.frame(maxWidth:.infinity,alignment:.leading)
                            }.padding(16).contentCard()
                        }
                    } else { visitorPanel }
                }.frame(maxWidth:.infinity,alignment:.leading)
                    .onGeometryChange(for:CGFloat.self) { $0.size.height } action: { tabletAsideHeight = $0 }
            }
        }
    }
    private func sectionHeading(_ title: String,_ actionTitle: String,id: String? = nil,action: @escaping () -> Void) -> some View {
        HStack {
            LabelPlate(title:title,size:12)
            Spacer(minLength:8)
            Button(actionTitle,action:action).font(Robo.mono(14)).foregroundStyle(Robo.cyan).frame(minHeight:44)
                .accessibilityLabel("\(actionTitle) \(title.lowercased())").accessibilityIdentifier(id ?? "")
        }
    }
    private var accountHeader: some View {
        VStack(alignment:.leading,spacing:8) {
            HStack { DisplayTitle(title:model.isMember ? (model.session?.displayName ?? "Beer Enthusiast") : "Visitor"); Spacer(); settingsButton }
            if model.isMember { storeLabel.font(Robo.mono()) }
        }
    }
    private var tabletAccountHeader: some View {
        HStack(alignment:.bottom,spacing:16) {
            DisplayTitle(title:model.isMember ? (model.session?.displayName ?? "Beer Enthusiast") : "Visitor",size:34)
            Spacer(minLength:16)
            VStack(alignment:.trailing,spacing:10) {
                settingsButton
                if model.isMember { storeLabel.font(Robo.mono(15)).padding(.bottom,8) }
            }
        }
    }
    private var settingsButton: some View {
        Button { model.showSettings = true } label: { IconWell(symbol:"gearshape").frame(width:44,height:44) }.accessibilityLabel("Open settings").accessibilityIdentifier("settings-nav-button")
    }
    private var storeLabel: some View {
        Label("Flying Saucer — \(model.session?.storeName ?? "")",systemImage:"location.fill").foregroundStyle(Robo.steel)
    }
    private var rewardsStatus: RewardsCardStatus {
        RewardsCardStatus(isMember:model.isMember,loaded:model.rewardsLoaded,error:model.rewardsError,rewards:model.rewards)
    }
    private var visitorPanel: some View {
        VStack(alignment:.leading,spacing:14) {
            Text("YOUR UFO CLUB JOURNEY").font(Robo.title(20)).foregroundStyle(Robo.textPrimary)
            Text("Sign in to see your tasted beers, progress and rewards alongside the taplist.").font(Robo.body(15)).foregroundStyle(Robo.textSecondary)
            Button("SIGN IN") { model.showSettings = true; model.showLogin = true }.buttonStyle(BeerControlStyle(appearance:.amber))
        }.padding(28).frame(maxWidth:.infinity,alignment:.leading).contentCard()
    }
    private func newOnTap(rows: Int) -> some View {
        VStack(alignment:.leading,spacing:10) {
            sectionHeading("NEW ON TAP","View all",id:"home-new-on-tap-view-all") { model.selectTab(.all) }
            if model.allBeers.isEmpty {
                Text("No saved beers yet. Refresh from Settings to load the taplist.").font(Robo.body(15)).foregroundStyle(Robo.textSecondary)
                    .padding(16).frame(maxWidth:.infinity,alignment:.leading).contentCard().accessibilityIdentifier("home-new-on-tap-empty")
            }
            let beers = BeerFilter.newOnTap(model.allBeers,count:rows)
            if !beers.isEmpty {
                VStack(alignment:.leading,spacing:0) {
                    ForEach(Array(beers.enumerated()),id:\.element.id) { index, beer in
                        if index > 0 { Divider().overlay(Robo.hairline) }
                        NewOnTapRow(beer:beer,expanded:expandedHomeBeerID == beer.id) {
                            expandedHomeBeerID = expandedHomeBeerID == beer.id ? nil : beer.id
                        }
                    }
                }.padding(.horizontal,14).contentCard()
            }
        }.accessibilityElement(children:.contain).accessibilityIdentifier("home-new-on-tap")
    }
}

/// Home's Rewards card: an honest status line, with a retry when rewards couldn't refresh.
struct HomeRewardsCard: View {
    let status: RewardsCardStatus
    let open: () -> Void
    let retry: () -> Void
    var body: some View {
        VStack(alignment:.leading,spacing:0) {
            Button(action:open) {
                HStack(spacing:14) {
                    AmberIcon(symbol:"gift")
                    VStack(alignment:.leading,spacing:3) {
                        Text("REWARDS").font(Robo.title(15)).foregroundStyle(Robo.amber)
                        Text(status.cardLine).font(Robo.body(14)).foregroundStyle(Robo.textSecondary)
                    }.frame(maxWidth:.infinity,alignment:.leading).multilineTextAlignment(.leading)
                    Image(systemName:"chevron.right").font(.system(size:12)).foregroundStyle(Robo.textSecondary).accessibilityHidden(true)
                }.padding(14).frame(minHeight:44).contentShape(Rectangle())
            }.buttonStyle(.plain)
                .accessibilityElement(children:.ignore).accessibilityLabel(status.spokenSummary).accessibilityHint("Opens Rewards")
                .accessibilityAddTraits(.isButton).accessibilityIdentifier("home-rewards-card")
            if status.offersRetry {
                Button("Try Again",action:retry).buttonStyle(BeerControlStyle()).accessibilityLabel("Try loading rewards again")
                    .accessibilityIdentifier("home-rewards-retry").padding([.horizontal,.bottom],14)
            }
        }.frame(maxWidth:.infinity,alignment:.leading).contentCard()
    }
}

/// A compact New on Tap row: name, arrival day · style · container, and ABV. Tapping shows the description.
private struct NewOnTapRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @EnvironmentObject var model: AppModel
    let beer: Beer
    let expanded: Bool
    let toggle: () -> Void
    var body: some View {
        VStack(alignment:.leading,spacing:10) {
            Button(action:toggle) {
                HStack(spacing:10) {
                    VStack(alignment:.leading,spacing:3) {
                        Text(beer.brew_name).font(Robo.title(15)).foregroundStyle(Robo.textPrimary).lineLimit(lines)
                        Text(beer.newOnTapLine()).font(Robo.mono(10)).foregroundStyle(Robo.textSecondary).lineLimit(lines)
                    }.frame(maxWidth:.infinity,alignment:.leading)
                    if let abv = beer.abv { Text("\(abv.formatted())%").font(Robo.mono(12).weight(.bold)).foregroundStyle(Robo.textPrimary) }
                }.frame(minHeight:44).contentShape(Rectangle())
            }.buttonStyle(.plain).multilineTextAlignment(.leading)
                .accessibilityIdentifier("beer-item-\(beer.id)").accessibilityValue(expanded ? "Expanded" : "Collapsed")
            if expanded {
                if !beer.brew_description.isEmpty {
                    Text(beer.plainDescription).font(Robo.body(14)).foregroundStyle(Robo.textSecondary).lineSpacing(4)
                        .accessibilityIdentifier("beer-description-\(beer.id)")
                }
                Button("UNTAPPD") { model.openUntappd(beer) }.buttonStyle(BeerControlStyle(appearance:.outline)).accessibilityIdentifier("untappd-\(beer.id)")
            }
        }.padding(.vertical,8)
    }
    private var lines: Int? { expanded || typeSize.isAccessibilitySize ? nil : 1 }
}

private extension View {
    /// Marks the compact Home when it fits its screen without scrolling.
    var fixedHome: some View { accessibilityElement(children:.contain).accessibilityIdentifier("home-fixed") }
}

private extension VerticalAlignment {
    private enum LatestOnTap: AlignmentID { static func defaultValue(in context: ViewDimensions) -> CGFloat { context[.top] } }
    /// Aligns the first Latest on Tap card with the top of the tablet Home side panels.
    static let latestOnTap = VerticalAlignment(LatestOnTap.self)
}

/// SwiftUI's basedOnSize still rubber-bands when content exceeds the viewport by
/// even one point. Configure only Home's enclosing scroll view, never appearance
/// defaults, so tall content can scroll without elastic movement at either end.
private struct HomeScrollBoundary: UIViewRepresentable {
    func makeUIView(context: Context) -> BoundaryView { BoundaryView() }
    func updateUIView(_ uiView: BoundaryView, context: Context) { uiView.applyBoundary() }
    static func dismantleUIView(_ uiView: BoundaryView, coordinator: ()) { uiView.restoreBoundary() }

    final class BoundaryView: UIView {
        private weak var scrollView: UIScrollView?
        private var originalBounces = true

        override func didMoveToWindow() { super.didMoveToWindow(); applyBoundary() }
        override func didMoveToSuperview() { super.didMoveToSuperview(); applyBoundary() }
        override func layoutSubviews() { super.layoutSubviews(); applyBoundary() }

        func applyBoundary() {
            var ancestor = superview
            while let view = ancestor {
                if let enclosingScrollView = view as? UIScrollView {
                    if scrollView !== enclosingScrollView {
                        restoreBoundary()
                        scrollView = enclosingScrollView
                        originalBounces = enclosingScrollView.bounces
                    }
                    enclosingScrollView.bounces = false
                    return
                }
                ancestor = view.superview
            }
        }

        func restoreBoundary() {
            scrollView?.bounces = originalBounces
            scrollView = nil
        }
    }
}

/// The Home entry names its mode: Apple Intelligence or local matching.
struct SuggestionEntryCard: View {
    @ObservedObject var modes: SuggestionModeState
    let open: () -> Void
    var body: some View {
        if modes.mode != .off {
            Button(action:open) {
                HStack(spacing:12) {
                    Image(systemName:modes.mode.symbol).foregroundStyle(Robo.textSecondary)
                    VStack(alignment:.leading,spacing:4) {
                        Text(modes.mode.homeTitle).font(Robo.title(16))
                        Text(modes.mode.homeDetail).font(Robo.body(13)).foregroundStyle(QueueChrome.secondary)
                            .fixedSize(horizontal:false,vertical:true)
                    }.frame(maxWidth:.infinity,alignment:.leading)
                    Image(systemName:"chevron.right").font(.system(size:12)).foregroundStyle(QueueChrome.secondary)
                }.padding(14).frame(maxWidth:.infinity,alignment:.leading)
                    .contentCard()
            }.buttonStyle(.plain).foregroundStyle(QueueChrome.text).accessibilityIdentifier("home-recommendations")
        }
    }
}
