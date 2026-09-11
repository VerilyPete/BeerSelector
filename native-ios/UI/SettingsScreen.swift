import SwiftUI

struct SettingsScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State private var diagnosticsReport: String?
    @State private var confirmLogout = false
    @State private var confirmReset = false
    @State private var confirmTimestamps = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:24) {
                    if !model.configured {
                        VStack(spacing:8) {
                            Text("Welcome to Beer Selector").font(Robo.bold(24))
                            Text("Track your UFO Club progress, discover new beers, and never miss a tap takeover.").font(Robo.mono()).multilineTextAlignment(.center).foregroundStyle(Robo.steel)
                        }.frame(maxWidth:.infinity).padding(24).background(Robo.panel)
                        LabelPlate(title:"GET STARTED")
                        row("Sign In to Flying Saucer","Access your UFO Club account","person.crop.circle.badge.plus") { model.showLogin = true }.accessibilityIdentifier("login-button")
                        Text("Sign in with your UFO Club account to track your tasted beers, or continue as a visitor to browse taplists.").font(Robo.mono()).foregroundStyle(Robo.steel)
                    } else {
                        LabelPlate(title:"DATA")
                        row(model.refreshing ? "Refreshing..." : "Refresh All Data","Download latest beers and rewards","arrow.clockwise") { Task { await model.refresh() } }.disabled(model.refreshing).accessibilityIdentifier("refresh-all-data-button")
                        row("Login to Flying Saucer","Sign in with your UFO Club account","person.crop.circle") { model.showLogin = true }.disabled(model.refreshing)
                        row("Go to Home Screen","Return to the main beer list","house.fill") { model.tab = .home; dismiss() }
                        Button("LOG OUT") { confirmLogout = true }.buttonStyle(RoboButtonStyle(color:Robo.red)).frame(maxWidth:.infinity).accessibilityIdentifier("logout-button")
                    }
                    LabelPlate(title:"ABOUT")
                    ChromePanel { HStack { IconWell(symbol:"info.circle.fill"); VStack(alignment:.leading,spacing:4) { Text("Beer Selector").font(Robo.title()); Text("Version \(Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? ""))").font(Robo.mono()).foregroundStyle(Robo.steel) } } }
                    #if DEBUG
                    LabelPlate(title:"DEVELOPER TOOLS")
                    row("Create Mock Session","Open isolated offline sample data","flask.fill") {
                        do { try model.loadPreviewFixtures(); dismiss() } catch { model.error = error.localizedDescription }
                    }.accessibilityIdentifier("create-mock-session-button")
                    row("Performance Diagnostics","View and share numeric session aggregates","waveform.path.ecg") {
                        let m = model.enrichment.metrics
                        diagnosticsReport = Diagnostics.shared.report() + "\nEnrichment requests=\(m.requests) ok=\(m.successes) failed=\(m.failures) cancelled=\(m.cancellations) limited=\(m.rateLimited) cache=\(m.cacheHits) fallback=\(m.fallbacks)"
                    }
                    if let diagnosticsReport {
                        Text(diagnosticsReport).font(Robo.mono()).textSelection(.enabled)
                        ShareLink(item: diagnosticsReport) { Label("Share Diagnostics", systemImage: "square.and.arrow.up") }
                    }
                    row("Database Statistics","View database counts and refresh times","chart.bar.fill") {
                        model.notice = "All Beers: \(model.allBeers.count)\nTasted Beers: \(model.tastedBeers.count)\nRewards: \(model.rewards.count)\nPending operations: \(model.operations.count)"
                    }
                    row("Clear Refresh Timestamps","Force data refresh on next start","clock.arrow.circlepath") { confirmTimestamps = true }
                    row("View Preferences","Display non-sensitive preference values","gearshape.fill") {
                        do {
                            let keys = ["is_visitor_mode","first_launch","last_all_beers_refresh","last_my_beers_refresh","native_schema_version"]
                            model.notice = try keys.map { "\($0): \(try model.db?.preference($0) ?? "null")" }.joined(separator:"\n")
                        } catch { model.error = error.localizedDescription }
                    }
                    row("Reset to First-Run State","Clear all data and settings","arrow.counterclockwise") { confirmReset = true }.foregroundStyle(Robo.red).accessibilityIdentifier("reset-first-run-button")
                    #endif
                    Text("\(String(Calendar.current.component(.year,from:Date()))) Beer Selector. All rights reserved.").font(Robo.mono()).foregroundStyle(Robo.steel).frame(maxWidth:.infinity).padding(.vertical,24)
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge:.top,spacing:0) { ChromeScreenHeader(title:"Settings",close:{ dismiss() }) }
                .toolbar(.hidden,for:.navigationBar)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Done") { dismiss() } } }
                .sheet(isPresented:$model.showLogin) { LoginScreen().environmentObject(model) }
                .confirmationDialog("Log out of Flying Saucer?",isPresented:$confirmLogout,titleVisibility:.visible) { Button("Log Out",role:.destructive) { Task { await model.logout() } } }
                .confirmationDialog("Clear all data and reset the app?",isPresented:$confirmReset,titleVisibility:.visible) {
                    Button("Reset",role:.destructive) {
                        Task {
                            await model.logout()
                            do {
                                try model.db?.transaction {
                                    for table in ["allbeers","tasted_brew_current_round","rewards","operation_queue","preferences"] { try model.db?.execute("DELETE FROM \(table)") }
                                }
                                model.localRetry()
                            } catch { model.error = error.localizedDescription }
                        }
                    }
                }
                .confirmationDialog("Force a data refresh on next start?",isPresented:$confirmTimestamps,titleVisibility:.visible) {
                    Button("Clear",role:.destructive) {
                        do { try model.db?.setPreference("last_all_beers_refresh","0"); try model.db?.setPreference("last_my_beers_refresh","0"); model.notice = "Refresh timestamps cleared" }
                        catch { model.error = error.localizedDescription }
                    }
                }
        }.tint(Robo.cyan)
    }
    private func row(_ title: String,_ subtitle: String,_ symbol: String,action: @escaping () -> Void) -> some View {
        Button(action:action) {
            ChromePanel { HStack(spacing:12) { IconWell(symbol:symbol,etched:true); VStack(alignment:.leading,spacing:4) { Text(title).font(Robo.title()).foregroundStyle(Robo.cyan); Text(subtitle).font(Robo.mono()).foregroundStyle(Robo.steel) }.frame(maxWidth:.infinity,alignment:.leading); Image(systemName:"chevron.right").foregroundStyle(Robo.steel) } }
        }.buttonStyle(.plain)
    }
}
