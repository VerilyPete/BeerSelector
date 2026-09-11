import SwiftUI

enum AppTab: String, CaseIterable {
    case home = "HOME", all = "BEERS", finder = "FINDER", tasted = "TASTED"
    var symbol: String { switch self { case .home:"house"; case .all:"mug"; case .finder:"star"; case .tasted:"checkmark.circle" } }
    var title: String { switch self { case .home:"Home"; case .all:"All Beers"; case .finder:"Beerfinder"; case .tasted:"Tasted Brews" } }
}
struct RootView: View {
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
        .sheet(isPresented:$model.showSettings) { SettingsScreen().environmentObject(model) }
        .sheet(isPresented:$model.showRewards) { RewardsScreen().environmentObject(model) }
        .sheet(isPresented:$model.showQueue) { QueueScreen().environmentObject(model) }
        .sheet(isPresented:$model.showOperations) { OperationsScreen().environmentObject(model) }
        .alert("Beer Selector",isPresented:Binding(get:{ model.notice != nil },set:{ if !$0 { model.notice = nil } })) { Button("OK") { model.notice = nil } } message: { Text(model.notice ?? "") }
        .background(UntappdBrowser(url:$model.browserURL))
    }
    private var tabBar: some View {
        HStack(spacing:3) {
            ForEach(AppTab.allCases.filter { model.isMember || $0 == .home || $0 == .all },id:\.self) { tab in
                Button {
                    UIImpactFeedbackGenerator(style:.light).impactOccurred(); model.tab = tab
                } label: {
                    VStack(spacing:3) { Image(systemName:tab.symbol).font(.system(size:18)); Text(tab.rawValue).font(Robo.mono(9)).tracking(1) }
                        .frame(maxWidth:.infinity,minHeight:48).foregroundStyle(model.tab == tab ? Robo.cyan : Robo.color(0x3A3F47))
                        .background(model.tab == tab ? Robo.color(0x1A2A2A) : .clear,in:RoundedRectangle(cornerRadius:30))
                        .overlay(RoundedRectangle(cornerRadius:30).strokeBorder(model.tab == tab ? Robo.cyan.opacity(0.267) : .clear,lineWidth:1))
                }.accessibilityLabel(tab.title).accessibilityAddTraits(model.tab == tab ? .isSelected : []).accessibilityIdentifier("tab-\(tab.rawValue.lowercased())")
            }
        }.padding(3)
            .background(LinearGradient(colors:[Robo.panel,Robo.display],startPoint:.top,endPoint:.bottom),in:Capsule())
            .overlay(Capsule().strokeBorder(Robo.border,lineWidth:1))
            .padding(4).background(Robo.tabChrome,in:Capsule())
            .overlay(Capsule().strokeBorder(.white.opacity(0.188),lineWidth:1))
            .padding(.horizontal,16).padding(.top,4).padding(.bottom,4)
            .background { BrushedChrome(bottom:true).ignoresSafeArea(edges:.bottom) }
    }
}
struct HomeView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:20) {
                if model.configured {
                    VStack(alignment:.leading,spacing:8) {
                        HStack { LabelPlate(title:model.isMember ? "WELCOME BACK" : "GUEST MODE"); Spacer(); Button { model.showSettings = true } label: { IconWell(symbol:"gearshape") }.accessibilityLabel("Open settings").accessibilityIdentifier("settings-nav-button") }
                        DisplayTitle(title:model.isMember ? (model.session?.displayName ?? "Beer Enthusiast") : "Visitor")
                        if model.isMember { Label("Flying Saucer — \(model.session?.storeName ?? "")",systemImage:"location.fill").font(Robo.mono()).foregroundStyle(Robo.steel) }
                    }
                    if model.isMember { MetricPanel(count:model.tastedBeers.count) }
                    VStack(alignment:.leading,spacing:10) {
                        LabelPlate(title:"EXPLORE")
                        nav("All Beers","Browse the complete taplist","mug",id:"nav-all-beers") { model.tab = .all }
                        nav("Beerfinder",model.isMember ? "Find beers you haven't tasted" : "Log in to find untasted beers","magnifyingglass",disabled:!model.isMember,id:"nav-beerfinder") { model.tab = .finder }
                        nav("Tasted Brews",model.isMember ? "View your tasting history" : "Log in to track your history","checkmark.circle",disabled:!model.isMember,id:"nav-tasted-brews") { model.tab = .tasted }
                        nav("Rewards",model.isMember ? "View your UFO Club rewards" : "Log in to view rewards","gift",disabled:!model.isMember,id:"nav-rewards") { model.showRewards = true }
                    }
                } else {
                    VStack(spacing:24) {
                        Image(systemName:"mug.fill").font(.system(size:48)).foregroundStyle(Robo.cyan)
                        Text("Beer Selector").font(Robo.bold())
                        Text("Log in to your UFO Club account or browse as a visitor.").font(Robo.mono()).multilineTextAlignment(.center)
                        Button("Get Started") { model.showSettings = true }.buttonStyle(RoboButtonStyle(color:Robo.cyan))
                    }.frame(maxWidth:.infinity).padding(.vertical,60)
                }
            }.padding(.horizontal,18).padding(.top,8).padding(.bottom,18).frame(maxWidth:760).frame(maxWidth:.infinity)
        }
    }
    private func nav(_ title: String,_ subtitle: String,_ icon: String,disabled: Bool = false,id: String,action: @escaping () -> Void) -> some View {
        Button { UIImpactFeedbackGenerator(style:.light).impactOccurred(); action() } label: {
            ChromePanel(padding:10) {
                HStack(spacing:14) { IconWell(symbol:icon,color:title == "Rewards" ? Robo.amber : Robo.cyan,etched:true); VStack(alignment:.leading,spacing:2) { Text(title.uppercased()).font(Robo.title(13)).tracking(0.5).foregroundStyle(title == "Rewards" ? Robo.amber : Robo.cyan); Text(subtitle).font(Robo.mono(10)).foregroundStyle(Robo.steel).multilineTextAlignment(.leading) }; Spacer(); Image(systemName:"chevron.right").font(.system(size:16)).foregroundStyle(Robo.color(0x3A3F47)) }
            }
        }.disabled(disabled).opacity(disabled ? 0.5 : 1).accessibilityIdentifier(id)
    }
}
