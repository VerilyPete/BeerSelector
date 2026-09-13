import SwiftUI
import WebKit
import AuthenticationServices

struct LoginScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State private var loading = true
    @State private var failure: String?
    @State private var reloadID = UUID()
    var body: some View {
        NavigationStack {
            VStack(spacing:0) {
                if loading { ProgressView("Signing in…").font(Robo.mono()).padding().tint(Robo.cyan) }
                if let failure {
                    Text(failure).font(Robo.mono()).foregroundStyle(Robo.red).padding()
                    Button("Try Again") { self.failure = nil; loading = true; reloadID = UUID() }.buttonStyle(RoboButtonStyle())
                }
                LoginWebView(model:model,loading:$loading,failure:$failure).id(reloadID)
            }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Flying Saucer Login").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Cancel") { dismiss() } } }
        }.tint(Robo.cyan)
    }
}
struct LoginWebView: UIViewRepresentable {
    let model: AppModel
    @Binding var loading: Bool
    @Binding var failure: String?
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration(); config.websiteDataStore = .default()
        let view = WKWebView(frame:.zero,configuration:config)
        view.navigationDelegate = context.coordinator; view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url:model.api.configuration.endpoint("kiosk.php")))
        return view
    }
    func updateUIView(_ view: WKWebView,context: Context) { context.coordinator.parent = self }
    static func dismantleUIView(_ view: WKWebView,coordinator: Coordinator) { coordinator.cancelled = true; coordinator.loginTask?.cancel(); view.stopLoading(); view.navigationDelegate = nil }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: LoginWebView
        var completing = false
        var cancelled = false
        var loginTask: Task<Void,Never>?
        init(_ parent: LoginWebView) { self.parent = parent }
        func webView(_ webView: WKWebView,decidePolicyFor navigationAction: WKNavigationAction,decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, url.scheme == "https" else { decisionHandler(.cancel); return }
            decisionHandler(.allow)
        }
        func webView(_ webView: WKWebView,didStartProvisionalNavigation navigation: WKNavigation!) { parent.loading = true }
        func webView(_ webView: WKWebView,didFinish navigation: WKNavigation!) {
            parent.loading = false
            guard let url = webView.url, parent.model.api.configuration.trustedLogin(url), ["/member-dash.php","/visitor.php"].contains(url.path), !completing else { return }
            completing = true; parent.loading = true
            loginTask = Task { @MainActor [weak self,weak webView] in
                guard let self, let webView else { return }
                do {
                    let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
                    guard !self.cancelled, webView.url == url else { self.completing = false; return }
                    try await self.parent.model.completeLogin(url:url,nativeCookies:cookies)
                } catch { self.parent.failure = error.localizedDescription; self.completing = false }
                self.parent.loading = false
            }
        }
        func webView(_ webView: WKWebView,didFailProvisionalNavigation navigation: WKNavigation!,withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { parent.failure = error.localizedDescription }; parent.loading = false }
        func webView(_ webView: WKWebView,didFail navigation: WKNavigation!,withError error: Error) { parent.failure = error.localizedDescription; parent.loading = false }
    }
}
/// Uses the same system authentication browser as the reference to retain Safari's Untappd login.
struct UntappdBrowser: UIViewControllerRepresentable {
    @Binding var url: URL?
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller,context: Context) {
        guard let url, controller.session == nil else { return }
        DispatchQueue.main.async { controller.open(url) { self.url = nil } }
    }
    final class Controller: UIViewController, ASWebAuthenticationPresentationContextProviding {
        var session: ASWebAuthenticationSession?
        func open(_ url: URL,completion: @escaping () -> Void) {
            guard session == nil else { return }
            session = ASWebAuthenticationSession(url:url,callbackURLScheme:nil) { [weak self] _,_ in
                DispatchQueue.main.async { self?.session = nil; completion() }
            }
            session?.presentationContextProvider = self
            session?.prefersEphemeralWebBrowserSession = false
            if session?.start() != true { session = nil; completion() }
        }
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { view.window ?? ASPresentationAnchor() }
    }
}
