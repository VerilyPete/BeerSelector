import SwiftUI

@main
struct BeerSelectorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    private static var isTestHost: Bool {
        ProcessInfo.processInfo.environment["BEERSELECTOR_TEST_HOST"] == "1" ||
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
    @StateObject private var model = AppModel(monitorConnectivity: !Self.isTestHost)
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model).preferredColorScheme(.dark)
                .task { if !Self.isTestHost { await model.start() } }
                .onOpenURL { model.handleURL($0) }
                .onChange(of:scenePhase) { _,phase in if !Self.isTestHost && phase == .active { Task { await model.foreground() } } }
        }
    }
}
