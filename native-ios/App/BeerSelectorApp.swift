import SwiftUI

@main
struct BeerSelectorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    private static var isTestHost: Bool {
        ProcessInfo.processInfo.environment["BEERSELECTOR_TEST_HOST"] == "1" ||
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
    private static var isStylePreview: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--preview-activity-style")
        #else
        false
        #endif
    }
    @ViewBuilder private var rootView: some View {
        #if DEBUG
        if Self.isStylePreview { ActivityStylePreview() } else { RootView() }
        #else
        RootView()
        #endif
    }
    @StateObject private var model = AppModel(monitorConnectivity: !Self.isTestHost && !Self.isStylePreview)
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            rootView.environmentObject(model).preferredColorScheme(.dark)
                .task { if !Self.isTestHost && !Self.isStylePreview { await model.start() } }
                .onOpenURL { if !Self.isStylePreview { model.handleURL($0) } }
                .onChange(of:scenePhase,initial:true) { _,phase in
                    guard !Self.isTestHost && !Self.isStylePreview else { return }
                    MainThreadMonitor.shared.setActive(phase == .active)
                    switch phase {
                    case .active:
                        DiagnosticJournal.shared.record(.active)
                        Task { await model.foreground() }
                    case .inactive: DiagnosticJournal.shared.record(.inactive)
                    case .background:
                        DiagnosticJournal.shared.record(.background)
                        Task { try? await DiagnosticJournal.shared.flush() }
                    @unknown default: break
                    }
                }
        }
    }
}
