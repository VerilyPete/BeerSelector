import Foundation
@testable import BeerSelectorNative

/// Each URLSession has its own script. Unscripted requests fail locally, never use the network.
@MainActor
final class HTTPFixture {
    typealias Handler = (URLRequest) async throws -> (Int, Data)
    private let id = UUID().uuidString
    var handler: Handler? {
        get { FixtureProtocol.handlers[id] }
        set { FixtureProtocol.handlers[id] = newValue }
    }
    func api(configuration: APIConfiguration) -> BeerAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FixtureProtocol.self]
        config.httpAdditionalHeaders = ["X-Test-Fixture": id]
        config.httpShouldSetCookies = false
        return BeerAPI(configuration:configuration,session:URLSession(configuration:config))
    }
}

private final class FixtureProtocol: URLProtocol {
    @MainActor static var handlers: [String: HTTPFixture.Handler] = [:]
    private let lock = NSRecursiveLock()
    private var stopped = false
    private var work: Task<Void, Never>?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        lock.lock()
        work = Task { @MainActor in
            do {
                guard let id = request.value(forHTTPHeaderField:"X-Test-Fixture"),
                      let handler = Self.handlers[id] else { throw URLError(.unsupportedURL) }
                let (status,data) = try await handler(request)
                try Task.checkCancellation()
                deliver {
                    let response = HTTPURLResponse(url:request.url!,statusCode:status,httpVersion:nil,headerFields:nil)!
                    client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
                    client?.urlProtocol(self,didLoad:data)
                    client?.urlProtocolDidFinishLoading(self)
                }
            } catch { deliver { client?.urlProtocol(self,didFailWithError:error) } }
        }
        lock.unlock()
    }
    private func deliver(_ body: () -> Void) {
        lock.lock(); defer { lock.unlock() }
        guard !stopped else { return }
        body()
    }
    override func stopLoading() {
        lock.lock(); stopped = true; let task = work; lock.unlock()
        task?.cancel()
    }
}
