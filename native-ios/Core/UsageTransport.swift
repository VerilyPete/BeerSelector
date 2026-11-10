import Foundation

enum UsageSendOutcome: Equatable, Sendable {
    case accepted, notAccepted
}

protocol UsageTransport: Sendable {
    func send(_ body: Data) async -> UsageSendOutcome
}

/// POSTs a frozen batch to the worker's /usage route. Exists only when usage telemetry is
/// switched on and the worker is configured. Only a 204 accepts the batch; nothing is retried here.
struct UsageHTTPTransport: UsageTransport {
    private let api: BeerAPI
    private let url: URL
    private let key: String

    init?(api: BeerAPI) {
        let configuration = api.configuration
        guard configuration.usageTelemetryEnabled, let base = configuration.enrichmentURL, base.scheme == "https",
              let key = configuration.enrichmentKey, !key.isEmpty else { return nil }
        self.api = api; self.url = base.appendingPathComponent("usage"); self.key = key
    }

    func send(_ body: Data) async -> UsageSendOutcome {
        guard let result = try? await api.request(url,method:"POST",headers:["X-API-Key":key],retry:false,json:body) else { return .notAccepted }
        return result.1.statusCode == 204 ? .accepted : .notAccepted
    }
}
