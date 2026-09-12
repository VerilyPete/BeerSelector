import Foundation

@MainActor
final class EnrichmentService {
    struct Metrics { var requests = 0; var successes = 0; var failures = 0; var cancellations = 0; var rateLimited = 0; var cacheHits = 0; var fallbacks = 0 }
    private(set) var metrics = Metrics()
    private var requests: [Date] = []
    private var blockedUntil = Date.distantPast
    let api: BeerAPI
    private let now: () -> Date
    private let sleep: (TimeInterval) async throws -> Void
    init(api: BeerAPI, now: @escaping () -> Date = Date.init,
         sleep: @escaping (TimeInterval) async throws -> Void = { try await Task.sleep(for:.seconds($0)) }) {
        self.api = api; self.now = now; self.sleep = sleep
    }
    struct Pending {
        var ids: Set<String> = []
        var cleanupIDs: Set<String> = []
        mutating func merge(_ other: Pending) { ids.formUnion(other.ids); cleanupIDs.formUnion(other.cleanupIDs) }
    }
    struct Result {
        var beers: [Beer]
        var pending = Pending()
        var readyIDs: Set<String> = []
        var cleanedIDs: Set<String> = []
    }
    private var policy: APIConfiguration.EnrichmentPolicy { api.configuration.enrichment }
    private func lookupCount(_ count: Int) -> Int { count / policy.batchSize + (count % policy.batchSize == 0 ? 0 : 1) }
    private func reserve(_ count: Int) throws {
        try Task.checkCancellation()
        let time = now()
        requests.removeAll { time.timeIntervalSince($0) >= policy.rateWindow }
        guard time >= blockedUntil, count <= policy.rateMax - requests.count else {
            metrics.rateLimited += 1
            throw HTTPFailure(status:429)
        }
        requests.append(contentsOf:repeatElement(time,count:count))
    }
    var configured: Bool { api.configuration.enrichmentURL?.scheme == "https" && api.configuration.enrichmentKey?.isEmpty == false }
    private func call<Value>(_ path: String,query: [URLQueryItem] = [],json: Data? = nil,etag: String? = nil, reserved: Bool = false, decode: (Data, HTTPURLResponse) throws -> Value) async throws -> Value {
        guard configured, let base = api.configuration.enrichmentURL, let key = api.configuration.enrichmentKey else { throw BeerError.invalidResponse("Enrichment is not configured") }
        try Task.checkCancellation()
        if reserved {
            guard now() >= blockedUntil else { metrics.rateLimited += 1; throw HTTPFailure(status:429) }
        } else { try reserve(1) }
        metrics.requests += 1
        var url = URLComponents(url:base.appendingPathComponent(path),resolvingAgainstBaseURL:false)!
        if !query.isEmpty { url.queryItems = query }
        var headers = ["X-API-Key":key]
        if let etag { headers["If-None-Match"] = etag }
        do {
            let result = try await api.request(url.url!,method:json == nil ? "GET" : "POST",headers:headers,retry:false,json:json,timeout:policy.timeout)
            try Task.checkCancellation()
            let value = try decode(result.0, result.1)
            metrics.successes += 1
            if result.1.statusCode == 304 { metrics.cacheHits += 1 }
            return value
        } catch {
            if Diagnostics.isCancellation(error) { metrics.cancellations += 1 }
            else { metrics.failures += 1 }
            if let failure = error as? HTTPFailure {
                let time = now()
                let delay = failure.retryDelay(now:time)
                if failure.status == 429 || (failure.status == 503 && delay != nil) {
                    // Concurrent responses may extend a cooldown, never shorten it.
                    blockedUntil = max(blockedUntil,time.addingTimeInterval(delay ?? policy.rateWindow))
                    if failure.status == 429 { metrics.rateLimited += 1 }
                }
            }
            throw error
        }
    }
    func taplist(storeID: String,etag: String?) async throws -> (beers:[Beer]?,etag:String?) {
        return try await call("beers",query:[.init(name:"sid",value:storeID)],etag:etag) { data, response in
            if response.statusCode == 304 {
                guard etag != nil else { throw BeerError.invalidResponse("Unexpected cache response") }
                return (nil,etag)
            }
            let payload = try JSONDecoder().decode(ProxyResponse.self,from:data)
            guard payload.storeId == storeID else { throw BeerError.invalidResponse("Taplist store does not match the selected store") }
            return (try BeerAPI.parseBeers(data,proxy:true),response.value(forHTTPHeaderField:"ETag"))
        }
    }
    func enrich(_ beers: [Beer]) async -> [Beer] {
        await enrichWithPending(beers).beers
    }
    func enrichWithPending(_ beers: [Beer]) async -> Result { await enrich(beers,allowSync:true) }
    private func enrich(_ beers: [Beer], allowSync: Bool) async -> Result {
        guard configured, !beers.isEmpty else { return Result(beers:beers) }
        var result = beers
        let ids = Array(Set(beers.map(\.id))).sorted()
        var enriched: [String:EnrichmentRow] = [:]
        var missing: Set<String> = []
        // Reserve the entire operation before its first await so concurrent callers
        // cannot consume slots needed by its remaining chunks.
        do { try reserve(lookupCount(ids.count)) } catch { return Result(beers:beers) }
        for offset in stride(from:0,to:ids.count,by:policy.batchSize) {
            do {
                let chunk = Array(ids[offset..<min(offset+policy.batchSize,ids.count)])
                let (rows, absent) = try await call("beers/batch",json:JSONEncoder().encode(["ids":chunk]),reserved:true) { data, _ in
                    let response = try JSONDecoder().decode(BatchResponse.self,from:data)
                    return (response.enrichments,response.missing)
                }
                let allowed = Set(chunk)
                for (id,row) in rows where allowed.contains(id) { enriched[id] = row }
                missing.formUnion(absent.filter(allowed.contains))
            } catch { break } // Enrichment failure must not discard usable upstream beer data.
        }
        result = result.map { enriched[$0.id]?.applying(to:$0) ?? $0 }
        var output = Result(beers:result,
                            readyIDs:Set(enriched.filter { $0.value.ready }.keys),
                            cleanedIDs:Set(enriched.filter { $0.value.cleaned }.keys))
        if allowSync, !missing.isEmpty, !Task.isCancelled {
            let synced = await sync(beers.filter { missing.contains($0.id) })
            if !synced.ids.isEmpty, !Task.isCancelled {
                let refreshed = await enrich(result.filter { synced.ids.contains($0.id) }, allowSync:false)
                let updates = Dictionary(refreshed.beers.map { ($0.id,$0) },uniquingKeysWith:{ _,new in new })
                output.beers = result.map { updates[$0.id] ?? $0 }
                output.pending.ids = synced.ids.subtracting(refreshed.readyIDs)
                    .union(synced.cleanupIDs.subtracting(refreshed.cleanedIDs))
                output.pending.cleanupIDs = synced.cleanupIDs.intersection(output.pending.ids)
            }
        }
        return output
    }
    /// Optional follow-up work: never sync again or bypass the shared request budget.
    /// Stop scheduling after two minutes or seven attempts; in-flight requests retain
    /// the API's normal timeout. Publish successful chunks without waiting for all IDs.
    func poll(_ pending: Pending, isCurrent: () -> Bool,
              onUpdate: ([String:EnrichmentRow]) throws -> Void) async {
        guard configured, !pending.ids.isEmpty else { return }
        let deadline = now().addingTimeInterval(120)
        var remaining = pending.ids
        for attempt in 0..<7 {
            let delay = min(Double(attempt + 1) * 5,20)
            guard !Task.isCancelled, isCurrent(), !remaining.isEmpty,
                  now().addingTimeInterval(delay) < deadline else { return }
            do { try await sleep(delay); try Task.checkCancellation() } catch { return }
            guard isCurrent(), now() < deadline else { return }
            let ids = remaining.sorted()
            do { try reserve(lookupCount(ids.count)) } catch {
                if Task.isCancelled { return }
                continue
            }
            for offset in stride(from:0,to:ids.count,by:policy.batchSize) {
                guard !Task.isCancelled, isCurrent(), now() < deadline else { return }
                let chunk = Array(ids[offset..<min(offset+policy.batchSize,ids.count)])
                let rows: [String:EnrichmentRow]
                do {
                    rows = try await call("beers/batch",json:JSONEncoder().encode(["ids":chunk]),reserved:true) { data,_ in
                        try JSONDecoder().decode(BatchResponse.self,from:data).enrichments
                    }
                } catch {
                    if Diagnostics.isCancellation(error) { return }
                    break
                }
                guard !Task.isCancelled, isCurrent(), now() < deadline else { return }
                let allowed = Set(chunk)
                let updates = rows.filter { allowed.contains($0.key) && $0.value.ready }
                do { if !updates.isEmpty { try onUpdate(updates) } } catch { return }
                for (id,row) in updates where !pending.cleanupIDs.contains(id) || row.cleaned { remaining.remove(id) }
            }
        }
    }
    private struct BatchResponse: Decodable {
        let enrichments: [String:EnrichmentRow]
        let missing: [String]
        let requestId: String
    }
    struct EnrichmentRow: Decodable {
        var cleaned: Bool { has_cleaned_description && brew_description != nil }
        var ready: Bool { enriched_abv != nil || cleaned }
        func applying(to beer: Beer) -> Beer {
            var result = beer
            if let enriched_abv { result.abv = enriched_abv }
            if let enrichment_confidence { result.enrichment_confidence = enrichment_confidence }
            if let enrichment_source { result.enrichment_source = enrichment_source == "description-fallback" ? "description" : enrichment_source }
            if cleaned { result.brew_description = brew_description! }
            result.container_type = result.inferredContainer
            return result
        }
        let enriched_abv: Double?
        let enrichment_confidence: Double?
        let enrichment_source: String?
        let brew_description: String?
        let has_cleaned_description: Bool
        enum CodingKeys: String, CodingKey, CaseIterable {
            case enriched_abv, enrichment_confidence, enrichment_source, brew_description, has_cleaned_description
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy:CodingKeys.self)
            guard CodingKeys.allCases.allSatisfy(c.contains) else { throw BeerError.invalidResponse("Incomplete enrichment row") }
            enriched_abv = try c.decodeIfPresent(Double.self,forKey:.enriched_abv)
            enrichment_confidence = try c.decodeIfPresent(Double.self,forKey:.enrichment_confidence)
            enrichment_source = try c.decodeIfPresent(String.self,forKey:.enrichment_source)
            brew_description = try c.decodeIfPresent(String.self,forKey:.brew_description)
            has_cleaned_description = try c.decode(Bool.self,forKey:.has_cleaned_description)
            guard enriched_abv.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  enrichment_confidence.map(\.isFinite) ?? true,
                  enrichment_source.map({ ["description","description-fallback","perplexity","manual"].contains($0) }) ?? true else {
                throw BeerError.invalidResponse("Invalid enrichment values")
            }
        }
    }
    private struct SyncResponse: Decodable {
        let synced: Double
        let queued_for_cleanup: Double
        let requestId: String
        let errors: [String]?
    }
    private func sync(_ beers: [Beer]) async -> Pending {
        var synced = Pending()
        var seen: Set<String> = []
        let valid = beers.filter {
            !$0.id.isEmpty && $0.id.count <= 50 && !$0.brew_name.isEmpty &&
            $0.brew_name.count <= 200 && seen.insert($0.id).inserted
        }
        guard !valid.isEmpty else { return synced }
        do { try reserve((valid.count + 49) / 50) } catch { return synced }
        for offset in stride(from:0,to:valid.count,by:50) {
            guard !Task.isCancelled else { break }
            let chunk = valid[offset..<min(offset+50,valid.count)]
            let rows = chunk.map { ["id":$0.id,"brew_name":$0.brew_name,"brewer":$0.brewer,"brew_description":String($0.brew_description.prefix(2000))] }
            do {
                let response = try await call("beers/sync",json:JSONEncoder().encode(["beers":rows]),reserved:true) { data, _ in
                    let response = try JSONDecoder().decode(SyncResponse.self,from:data)
                    guard response.synced.isFinite, response.synced >= 0,
                          response.queued_for_cleanup.isFinite, response.queued_for_cleanup >= 0 else { throw BeerError.invalidResponse("Invalid sync counts") }
                    return response
                }
                guard response.synced > 0 else { continue }
                synced.ids.formUnion(chunk.map(\.id))
                if response.queued_for_cleanup > 0 { synced.cleanupIDs.formUnion(chunk.map(\.id)) }
            } catch {
                if error is DecodingError { continue }
                break
            }
        }
        return synced
    }
    private struct ProxyResponse: Decodable {
        let storeId: String
        let beers: [ProxyBeer]
        enum CodingKeys: String, CodingKey { case storeId, beers, requestId, source, cached_at }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy:CodingKeys.self)
            storeId = try c.decode(String.self,forKey:.storeId)
            beers = try c.decode([ProxyBeer].self,forKey:.beers)
            for key in [CodingKeys.requestId,.cached_at] where c.contains(key) { _ = try c.decode(String.self,forKey:key) }
            if c.contains(.source), !["live","cache","stale"].contains(try c.decode(String.self,forKey:.source)) {
                throw BeerError.invalidResponse("Invalid proxy source")
            }
        }
    }
    private struct ProxyBeer: Decodable {
        enum CodingKeys: String, CodingKey {
            case id, brew_name, brewer, brewer_loc, brew_style, brew_container, review_count, review_rating
            case brew_description, added_date, enriched_abv, enrichment_confidence, enrichment_source
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy:CodingKeys.self)
            for key in [CodingKeys.id,.brew_name,.brewer] { _ = try c.decode(String.self,forKey:key) }
            for key in [CodingKeys.brewer_loc,.brew_style,.brew_container,.brew_description,.added_date] where c.contains(key) {
                _ = try c.decode(String.self,forKey:key)
            }
            for key in [CodingKeys.review_count,.review_rating] { _ = try c.decodeIfPresent(String.self,forKey:key) }
            guard [CodingKeys.enriched_abv,.enrichment_confidence,.enrichment_source].allSatisfy(c.contains) else {
                throw BeerError.invalidResponse("Incomplete proxy enrichment")
            }
            let abv = try c.decodeIfPresent(Double.self,forKey:.enriched_abv)
            let confidence = try c.decodeIfPresent(Double.self,forKey:.enrichment_confidence)
            let source = try c.decodeIfPresent(String.self,forKey:.enrichment_source)
            guard abv.map({ $0.isFinite && (0...100).contains($0) }) ?? true,
                  confidence.map(\.isFinite) ?? true,
                  source.map({ ["description","description-fallback","perplexity","manual"].contains($0) }) ?? true else {
                throw BeerError.invalidResponse("Invalid proxy enrichment")
            }
        }
    }
    private struct HealthResponse: Decodable {
        let status: String
        enum CodingKeys: String, CodingKey { case status, database, enrichment }
        struct Quotas: Decodable {
            let enabled: Bool
            let daily: Quota
            let monthly: Quota
        }
        struct Quota: Decodable {
            let used: Double
            let limit: Double
            let remaining: Double
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy:CodingKeys.self)
            status = try c.decode(String.self,forKey:.status)
            _ = try c.decode(String.self,forKey:.database)
            guard ["ok","error"].contains(status) else { throw BeerError.invalidResponse("Invalid enrichment health") }
            if c.contains(.enrichment) {
                let quotas = try c.decode(Quotas.self,forKey:.enrichment)
                guard [quotas.daily,quotas.monthly].allSatisfy({ $0.used.isFinite && $0.limit.isFinite && $0.remaining.isFinite }) else {
                    throw BeerError.invalidResponse("Invalid enrichment quota")
                }
            }
        }
    }
    func health() async throws -> String {
        try await call("health") { data, _ in try JSONDecoder().decode(HealthResponse.self,from:data).status }
    }
    func recordFallback() { metrics.fallbacks += 1 }
    func resetMetrics() { metrics = Metrics() }
}
