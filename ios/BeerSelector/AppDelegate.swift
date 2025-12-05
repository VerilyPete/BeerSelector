import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
    var window: UIWindow?

    var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
    var reactNativeFactory: RCTReactNativeFactory?

    public override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let delegate = ReactNativeDelegate()
        let factory = ExpoReactNativeFactory(delegate: delegate)
        delegate.dependencyProvider = RCTAppDependencyProvider()

        reactNativeDelegate = delegate
        reactNativeFactory = factory
        bindReactNativeFactory(factory)

        #if os(iOS) || os(tvOS)
        window = UIWindow(frame: UIScreen.main.bounds)
        factory.startReactNative(
            withModuleName: "main",
            in: window,
            launchOptions: launchOptions
        )
        #endif

        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    // Linking API
    public override func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return super.application(app, open: url, options: options) ||
               RCTLinkingManager.application(app, open: url, options: options)
    }

    // Universal Links
    public override func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        let result = RCTLinkingManager.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
        return super.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        ) || result
    }

    // Remote notification delegates
    public override func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        return super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
    }

    public override func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        return super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
    }

    public override func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        return super.application(
            application,
            didReceiveRemoteNotification: userInfo,
            fetchCompletionHandler: completionHandler
        )
    }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
    override func sourceURL(for bridge: RCTBridge) -> URL? {
        bridge.bundleURL ?? bundleURL()
    }

    override func bundleURL() -> URL? {
        #if DEBUG
        return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
        #else
        return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
        #endif
    }
}
