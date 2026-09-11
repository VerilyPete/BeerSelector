import SwiftUI

@main
struct BeerSelectorApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model).preferredColorScheme(.dark)
                .task { if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil { await model.start() } }
                .onOpenURL { model.handleURL($0) }
                .onChange(of:scenePhase) { _,phase in if phase == .active { Task { await model.foreground() } } }
        }
    }
}
