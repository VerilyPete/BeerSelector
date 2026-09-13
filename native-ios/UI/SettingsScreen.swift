import SwiftUI

struct SettingsScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State private var diagnosticsReport: String?
    @State private var diagnosticFile: URL?
    @State private var preparingDiagnostics = false
    @State private var developerToolsExpanded = false
    @State private var confirmLogout = false
    @State private var confirmReset = false
    @State private var confirmTimestamps = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:22) {
                    section("ACCOUNT") {
                        accountSummary
                        separator
                        row(model.isMember ? "Sign in with another account" : "Sign in to Flying Saucer",
                            "Access your UFO Club account","person.crop.circle") { model.showLogin = true }
                            .disabled(model.refreshing).accessibilityIdentifier("login-button")
                        if model.configured {
                            separator
                            row("Log Out","End this session on your device","rectangle.portrait.and.arrow.right",destructive:true) { confirmLogout = true }
                                .accessibilityIdentifier("logout-button")
                        }
                    }
                    if model.configured {
                        section("DATA & NAVIGATION") {
                            row(model.refreshing ? "Refreshing…" : "Refresh All Data","Update your taplist, tastings and rewards","arrow.clockwise",busy:model.refreshing) { Task { await model.refresh() } }
                                .disabled(model.refreshing).accessibilityIdentifier("refresh-all-data-button")
                            separator
                            row("Go to Home Screen","Return to your dashboard","house") { model.tab = .home; dismiss() }
                        }
                    }
                    section("SUPPORT") {
                        Text("Trouble with the app? Prepare a report after a freeze or unexpected exit. It includes activity timings and build details, without account or request contents. It stays on this device until you share it.")
                            .font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary)
                            .fixedSize(horizontal:false,vertical:true).padding(14)
                        separator
                        row(preparingDiagnostics ? "Preparing Report…" : "Prepare Diagnostic Report","Includes recent activity across app restarts","doc.text.magnifyingglass",busy:preparingDiagnostics) {
                            preparingDiagnostics = true; diagnosticFile = nil
                            Task {
                                defer { preparingDiagnostics = false }
                                do { diagnosticFile = try await DiagnosticJournal.shared.export() }
                                catch { model.error = "Could not prepare the diagnostic report. Please try again." }
                            }
                        }.disabled(preparingDiagnostics).accessibilityIdentifier("prepare-diagnostics-button")
                        separator
                        if let diagnosticFile {
                            ShareLink(item:diagnosticFile) { rowLabel("Share Diagnostic Report","Choose where to send your report","square.and.arrow.up") }.buttonStyle(SettingsActionStyle())
                            separator
                        }
                        row("Clear Diagnostic History","Remove saved reports from this device","trash", destructive:true) {
                            diagnosticFile = nil
                            Task {
                                do { try await DiagnosticJournal.shared.clear(); model.notice = "Diagnostic history cleared" }
                                catch { model.error = "Could not clear diagnostic history. Please try again." }
                            }
                        }.disabled(preparingDiagnostics)
                    }
                    section("ABOUT") {
                        HStack(alignment:.top,spacing:12) {
                            settingsIcon("info.circle")
                            VStack(alignment:.leading,spacing:5) {
                                Text("Beer Selector").font(Robo.title(16)).foregroundStyle(QueueChrome.text)
                                Text("Version \(Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? ""))")
                                    .font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary)
                            }.frame(maxWidth:.infinity,alignment:.leading)
                        }.padding(14)
                    }
                    #if DEBUG
                    VStack(alignment:.leading,spacing:0) {
                        Button { developerToolsExpanded.toggle() } label: {
                            HStack {
                                Text("DEVELOPER TOOLS").font(Robo.mono(10)).tracking(1.5)
                                Spacer()
                                Image(systemName:developerToolsExpanded ? "chevron.down" : "chevron.right").font(.system(size:12,weight:.semibold))
                            }.foregroundStyle(QueueChrome.secondary).frame(minHeight:44).contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityIdentifier("developer-tools")
                            .accessibilityValue(developerToolsExpanded ? "Expanded" : "Collapsed")
                        if developerToolsExpanded {
                            panel {
                                row("Create Mock Session","Open isolated offline sample data","flask.fill") {
                                    do { try model.loadPreviewFixtures(); dismiss() } catch { model.error = error.localizedDescription }
                                }.accessibilityIdentifier("create-mock-session-button")
                                separator
                                row("Performance Diagnostics","View and share numeric session aggregates","waveform.path.ecg") {
                                    let m = model.enrichment.metrics
                                    diagnosticsReport = Diagnostics.shared.report() + "\nEnrichment requests=\(m.requests) ok=\(m.successes) failed=\(m.failures) cancelled=\(m.cancellations) limited=\(m.rateLimited) cache=\(m.cacheHits) fallback=\(m.fallbacks)"
                                }
                                if let diagnosticsReport {
                                    Text(diagnosticsReport).font(Robo.mono(11)).textSelection(.enabled).padding(14)
                                    ShareLink(item: diagnosticsReport) { rowLabel("Share Diagnostics","Export session aggregates","square.and.arrow.up") }.buttonStyle(SettingsActionStyle())
                                }
                                separator
                                row("Database Statistics","View database counts and refresh times","chart.bar.fill") {
                                    model.notice = "All Beers: \(model.allBeers.count)\nTasted Beers: \(model.tastedBeers.count)\nRewards: \(model.rewards.count)\nPending operations: \(model.operations.count)"
                                }
                                separator
                                row("Clear Refresh Timestamps","Force data refresh on next start","clock.arrow.circlepath") { confirmTimestamps = true }
                                separator
                                row("View Preferences","Display non-sensitive preference values","gearshape.fill") {
                                    do {
                                        let keys = ["is_visitor_mode","first_launch","last_all_beers_refresh","last_my_beers_refresh","native_schema_version"]
                                        model.notice = try keys.map { "\($0): \(try model.db?.preference($0) ?? "null")" }.joined(separator:"\n")
                                    } catch { model.error = error.localizedDescription }
                                }
                                separator
                                row("Reset to First-Run State","Clear all data and settings","arrow.counterclockwise", destructive:true) { confirmReset = true }.accessibilityIdentifier("reset-first-run-button")
                            }.padding(.top,10)
                        }
                    }
                    #endif
                    Text("\(String(Calendar.current.component(.year,from:Date()))) Beer Selector")
                        .font(Robo.mono(10)).foregroundStyle(Robo.steel)
                        .frame(maxWidth:.infinity).padding(.vertical,6)
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
    private var accountSummary: some View {
        HStack(alignment:.top,spacing:12) {
            settingsIcon(model.isMember ? "person.crop.circle.fill" : "person.crop.circle")
            VStack(alignment:.leading,spacing:6) {
                Text(model.isMember ? "UFO CLUB MEMBER" : model.configured ? "VISITOR" : "WELCOME")
                    .font(Robo.mono(9)).tracking(1.5).foregroundStyle(QueueChrome.cyan)
                Text(model.isMember ? (model.session?.firstName ?? "UFO Club member") : "Welcome to Beer Selector")
                    .font(Robo.title(20)).foregroundStyle(QueueChrome.text)
                Text(model.isMember ? "Flying Saucer · \(model.session?.storeName ?? "")" : "Sign in to track your tasted beers, or browse taplists as a visitor.")
                    .font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary)
                    .fixedSize(horizontal:false,vertical:true)
            }.frame(maxWidth:.infinity,alignment:.leading)
        }.padding(16).accessibilityElement(children:.combine)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment:.leading,spacing:9) {
            Text(title).font(Robo.mono(10)).tracking(1.5).foregroundStyle(QueueChrome.secondary)
                .padding(.horizontal,4).accessibilityAddTraits(.isHeader)
            panel(content:content)
        }
    }

    private func panel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment:.leading,spacing:0,content:content)
            .frame(maxWidth:.infinity,alignment:.leading)
            .background(LinearGradient(colors:[Robo.color(0x202830),QueueChrome.background],startPoint:.topLeading,endPoint:.bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius:17))
            .overlay(RoundedRectangle(cornerRadius:17).strokeBorder(QueueChrome.metal.opacity(0.45),lineWidth:1))
    }

    private var separator: some View {
        Rectangle().fill(QueueChrome.metal.opacity(0.22)).frame(height:1).padding(.horizontal,14).accessibilityHidden(true)
    }

    private func settingsIcon(_ symbol: String, destructive: Bool = false) -> some View {
        Image(systemName:symbol).font(.system(size:16,weight:.medium))
            .foregroundStyle(destructive ? Robo.color(0xDB8F91) : QueueChrome.cyan)
            .frame(width:32,height:32)
            .background(destructive ? Robo.color(0x241C20) : Robo.color(0x192B2D),in:RoundedRectangle(cornerRadius:9))
            .overlay(RoundedRectangle(cornerRadius:9).strokeBorder(QueueChrome.metal.opacity(0.22),lineWidth:1))
            .accessibilityHidden(true)
    }

    private func rowLabel(_ title: String,_ subtitle: String,_ symbol: String,destructive: Bool = false,busy: Bool = false) -> some View {
        HStack(alignment:.top,spacing:12) {
            settingsIcon(symbol,destructive:destructive)
            VStack(alignment:.leading,spacing:5) {
                Text(title).font(Robo.title(15)).foregroundStyle(destructive ? Robo.color(0xDB8F91) : QueueChrome.text)
                Text(subtitle).font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary)
            }.fixedSize(horizontal:false,vertical:true).frame(maxWidth:.infinity,alignment:.leading)
            if busy { ProgressView().tint(QueueChrome.secondary).frame(width:14,height:32) }
            else { Image(systemName:"chevron.right").font(.system(size:11,weight:.semibold)).foregroundStyle(QueueChrome.secondary.opacity(0.6)).frame(height:32).accessibilityHidden(true) }
        }.padding(14).frame(minHeight:60).contentShape(Rectangle())
    }

    private func row(_ title: String,_ subtitle: String,_ symbol: String,destructive: Bool = false,busy: Bool = false,action: @escaping () -> Void) -> some View {
        Button(action:action) { rowLabel(title,subtitle,symbol,destructive:destructive,busy:busy) }
            .buttonStyle(SettingsActionStyle())
    }
}

private struct SettingsActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(QueueChrome.metal.opacity(configuration.isPressed ? 0.15 : 0))
            .opacity(isEnabled ? 1 : 0.5)
    }
}
