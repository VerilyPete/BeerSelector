import Foundation

@MainActor
final class EnrichmentService {
    struct Metrics { var requests = 0; var successes = 0; var failures = 0; var rateLimited = 0; var cacheHits = 0; var fallbacks = 0 }
    private(set) var metrics = Metrics()
    private var requests: [Date] = []
    private var blockedUntil = Date.distantPast
    let api: BeerAPI
    init(api: BeerAPI) { self.api = api }
    var configured: Bool { api.configuration.enrichmentURL?.scheme == "https" && api.configuration.enrichmentKey?.isEmpty == false }
    private func call(_ path: String,query: [URLQueryItem] = [],json: Data? = nil,etag: String? = nil) async throws -> (Data,HTTPURLResponse) {
        guard configured, let base = api.configuration.enrichmentURL, let key = api.configuration.enrichmentKey else { throw BeerError.invalidResponse("Enrichment is not configured") }
        let now = Date(); requests.removeAll { now.timeIntervalSince($0) >= 60 }
        guard requests.count < 10, now >= blockedUntil else { metrics.rateLimited += 1; throw HTTPFailure(status:429) }
        requests.append(now); metrics.requests += 1
        var url = URLComponents(url:base.appendingPathComponent(path),resolvingAgainstBaseURL:false)!
        if !query.isEmpty { url.queryItems = query }
        var headers = ["X-API-Key":key]
        if let etag { headers["If-None-Match"] = etag }
        do {
            let result = try await api.request(url.url!,method:json == nil ? "GET" : "POST",headers:headers,retry:false,json:json)
            metrics.successes += 1
            if result.1.statusCode == 304 { metrics.cacheHits += 1 }
            return result
        } catch {
            metrics.failures += 1
            if (error as? HTTPFailure)?.status == 429 { blockedUntil = Date().addingTimeInterval(60); metrics.rateLimited += 1 }
            throw error
        }
    }
    func taplist(storeID: String,etag: String?) async throws -> (beers:[Beer]?,etag:String?) {
        let (data,response) = try await call("beers",query:[.init(name:"sid",value:storeID)],etag:etag)
        if response.statusCode == 304 {
            guard etag != nil else { throw BeerError.invalidResponse("Unexpected cache response") }
            return (nil,etag)
        }
        guard let object = try JSONSerialization.jsonObject(with:data) as? [String:Any], object["storeId"] as? String == storeID else { throw BeerError.invalidResponse("Taplist store does not match the selected store") }
        return (try BeerAPI.parseBeers(data,proxy:true),response.value(forHTTPHeaderField:"ETag"))
    }
    func enrich(_ beers: [Beer]) async -> [Beer] {
        await enrich(beers, allowSync: true)
    }
    private func enrich(_ beers: [Beer], allowSync: Bool) async -> [Beer] {
        guard configured, !beers.isEmpty else { return beers }
        var result = beers
        let ids = Array(Set(beers.map(\.id))).sorted()
        var enriched: [String:[String:Any]] = [:]
        var missing: Set<String> = []
        for offset in stride(from:0,to:ids.count,by:100) {
            do {
                let chunk = Array(ids[offset..<min(offset+100,ids.count)])
                let (data,_) = try await call("beers/batch",json:JSONEncoder().encode(["ids":chunk]))
                guard let object = try JSONSerialization.jsonObject(with:data) as? [String:Any], let rows = object["enrichments"] as? [String:[String:Any]], let absent = object["missing"] as? [String] else { throw BeerError.invalidResponse("Invalid enrichment batch") }
                let allowed = Set(chunk)
                for (id,row) in rows where allowed.contains(id) { enriched[id] = row }
                missing.formUnion(absent.filter(allowed.contains))
            } catch { break } // Enrichment failure must not discard usable upstream beer data.
        }
        for index in result.indices {
            guard let row = enriched[result[index].id] else { continue }
            if let value = row["enriched_abv"] as? Double, value.isFinite, (0...100).contains(value) { result[index].abv = value }
            if let confidence = row["enrichment_confidence"] as? Double, confidence.isFinite { result[index].enrichment_confidence = confidence }
            if let source = row["enrichment_source"] as? String, ["description","description-fallback","perplexity","manual"].contains(source) { result[index].enrichment_source = source == "description-fallback" ? "description" : source }
            if row["has_cleaned_description"] as? Bool == true, let description = row["brew_description"] as? String { result[index].brew_description = description }
            result[index].container_type = result[index].inferredContainer
        }
        if allowSync, !missing.isEmpty, !Task.isCancelled {
            let syncedIDs = await sync(beers.filter { missing.contains($0.id) })
            if !syncedIDs.isEmpty, !Task.isCancelled {
                // One follow-up lookup only: cleanup can still be pending on the Worker.
                let refreshed = await enrich(result.filter { syncedIDs.contains($0.id) }, allowSync: false)
                let updates = Dictionary(refreshed.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
                result = result.map { updates[$0.id] ?? $0 }
            }
        }
        return result
    }
    private struct SyncResponse: Decodable {
        let synced: Double
        let queued_for_cleanup: Double
        let requestId: String
        let errors: [String]?
    }
    private func sync(_ beers: [Beer]) async -> Set<String> {
        var syncedIDs: Set<String> = []
        var seen: Set<String> = []
        let valid = beers.filter {
            !$0.id.isEmpty && $0.id.count <= 50 && !$0.brew_name.isEmpty &&
            $0.brew_name.count <= 200 && seen.insert($0.id).inserted
        }
        for offset in stride(from:0,to:valid.count,by:50) {
            guard !Task.isCancelled else { break }
            let chunk = valid[offset..<min(offset+50,valid.count)]
            let rows = chunk.map { ["id":$0.id,"brew_name":$0.brew_name,"brewer":$0.brewer,"brew_description":String($0.brew_description.prefix(2000))] }
            do {
                let (data,_) = try await call("beers/sync",json:JSONEncoder().encode(["beers":rows]))
                let response = try JSONDecoder().decode(SyncResponse.self,from:data)
                guard response.synced.isFinite, response.synced > 0,
                      response.queued_for_cleanup.isFinite, response.queued_for_cleanup >= 0 else { continue }
                syncedIDs.formUnion(chunk.map(\.id))
            } catch {
                if error is DecodingError { continue }
                break
            }
        }
        return syncedIDs
    }
    func health() async throws -> String {
        let (data,_) = try await call("health")
        guard let object = try JSONSerialization.jsonObject(with:data) as? [String:Any], let status = object["status"] as? String, ["ok","error"].contains(status) else { throw BeerError.invalidResponse("Invalid enrichment health") }
        return status
    }
    func recordFallback() { metrics.fallbacks += 1 }
    func resetMetrics() { metrics = Metrics() }
}
