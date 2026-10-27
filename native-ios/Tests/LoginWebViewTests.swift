import XCTest
import SwiftUI
import WebKit
@testable import BeerSelectorNative

final class LoginWebViewTests: XCTestCase {
    private final class StubNavigationAction: WKNavigationAction {
        private let stubRequest: URLRequest
        init(url: URL) { stubRequest = URLRequest(url:url); super.init() }
        override var request: URLRequest { stubRequest }
    }

    @MainActor private func decision(for url: URL) -> WKNavigationActionPolicy? {
        let key = "login_web_view_test_" + UUID().uuidString
        let model = AppModel(api:HTTPFixture().api(configuration:APIConfiguration()),credentials:CredentialStore(prefix:key,sessionStorageKey:key + "_session"),monitorConnectivity:false)
        let delegate: WKNavigationDelegate = LoginWebView.Coordinator(LoginWebView(model:model,loading:.constant(false),failure:.constant(nil)))
        var policy: WKNavigationActionPolicy?
        delegate.webView?(WKWebView(),decidePolicyFor:StubNavigationAction(url:url),decisionHandler:{ policy = $0 })
        return policy
    }

    @MainActor func testWebKitCancelsNavigationToNonHTTPSURLs() {
        XCTAssertEqual(decision(for:URL(string:"http://fsbs.beerknurd.com/kiosk.php")!),.cancel,"WebKit must reach the https-only navigation policy")
        XCTAssertEqual(decision(for:URL(string:"javascript:alert(1)")!),.cancel)
    }

    @MainActor func testWebKitAllowsNavigationToHTTPSURLs() {
        XCTAssertEqual(decision(for:URL(string:"https://fsbs.beerknurd.com/kiosk.php")!),.allow)
    }
}
