import Foundation

struct APIConfiguration {
    var baseURL = URL(string:"https://tapthatapp.beerknurd.com")!
    var enrichmentURL: URL?
    var enrichmentKey: String?
    var timeout: TimeInterval = 15
    static func bundled() -> Self {
        var c = Self()
        let url = Bundle.main.url(forResource:"ServiceConfiguration",withExtension:"plist")
        let values = url.flatMap { try? Data(contentsOf:$0) }.flatMap { try? PropertyListSerialization.propertyList(from:$0,format:nil) as? [String:String] } ?? [:]
        if let value = values["BeerAPIBaseURL"], let url = URL(string:value), url.scheme == "https" { c.baseURL = url }
        if let value = values["EnrichmentURL"] { c.enrichmentURL = URL(string:value) }
        c.enrichmentKey = values["EnrichmentKey"]
        return c
    }
    func endpoint(_ path: String) -> URL { baseURL.appendingPathComponent(path) }
    func trustedLogin(_ url: URL) -> Bool { url.scheme == baseURL.scheme && url.host == baseURL.host && url.port == baseURL.port && url.user == nil && url.password == nil }
    static func dataURL(_ url: URL) -> Bool { url.scheme == "https" && url.host == "fsbs.beerknurd.com" && ["/bk-store-json.php","/bk-member-json.php"].contains(url.path) && url.user == nil && url.password == nil }
}

/// Reject cross-origin redirects before URLSession can forward authentication headers.
final class RedirectPolicy: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        Diagnostics.shared.recordTask(seconds: metrics.taskInterval.duration, redirects: metrics.redirectCount)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let original = task.originalRequest?.url, let next = request.url,
              original.scheme == next.scheme, original.host == next.host, original.port == next.port else { completionHandler(nil); return }
        completionHandler(request)
    }
}
struct HTTPFailure: LocalizedError { var status: Int; var errorDescription: String? { "Server request failed (\(status))." } }
final class BeerAPI {
    let configuration: APIConfiguration
    private let session: URLSession
    init(configuration: APIConfiguration = .bundled(), session: URLSession? = nil) {
        self.configuration = configuration
        let c = URLSessionConfiguration.ephemeral; c.httpShouldSetCookies = false; c.timeoutIntervalForRequest = configuration.timeout; c.timeoutIntervalForResource = 45
        self.session = session ?? URLSession(configuration:c,delegate:RedirectPolicy(),delegateQueue:nil)
    }
    static func form(_ fields: [String:String]) -> Data {
        let allowed = CharacterSet(charactersIn:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return Data(fields.sorted { $0.key < $1.key }.map { "\($0.key.addingPercentEncoding(withAllowedCharacters:allowed)!)=\($0.value.addingPercentEncoding(withAllowedCharacters:allowed)!)" }.joined(separator:"&").utf8)
    }
    static func cookies(_ member: MemberSession, saved: [String:String]) -> String {
        var values = saved
        values.merge(["member_id":member.memberId,"store__id":member.storeId,"store_name":member.storeName,"PHPSESSID":member.sessionId,"username":member.username ?? "","first_name":member.firstName ?? "","last_name":member.lastName ?? "","email":member.email ?? "","cardNum":member.cardNum ?? ""],uniquingKeysWith: { _,new in new })
        let allowed = CharacterSet(charactersIn:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        return values.sorted { $0.key < $1.key }.filter { $0.key.range(of:#"^[A-Za-z0-9_\-]+$"#,options:.regularExpression) != nil }.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters:allowed)!)" }.joined(separator:"; ")
    }
    func request(_ url: URL, method: String = "GET", fields: [String:String]? = nil, member: MemberSession? = nil, cookies: [String:String] = [:], referer: String = "member-dash.php", headers: [String:String] = [:], retry: Bool = true, json: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        let interval = Diagnostics.shared.begin(.network)
        do {
            var request = URLRequest(url:url); request.httpMethod = method; request.timeoutInterval = configuration.timeout
            request.setValue("BeerSelector/1.1.0 (iOS; Native)",forHTTPHeaderField:"User-Agent")
            if let member {
                guard member.valid, configuration.trustedLogin(url) else { throw BeerError.sessionExpired }
                request.setValue(Self.cookies(member,saved:cookies),forHTTPHeaderField:"Cookie")
                request.setValue(configuration.endpoint(referer).absoluteString,forHTTPHeaderField:"Referer")
                request.setValue(configuration.baseURL.absoluteString,forHTTPHeaderField:"Origin")
                request.setValue("XMLHttpRequest",forHTTPHeaderField:"X-Requested-With")
            }
            if let fields { request.httpBody = Self.form(fields); request.setValue("application/x-www-form-urlencoded; charset=UTF-8",forHTTPHeaderField:"Content-Type") }
            if let json { request.httpBody = json; request.setValue("application/json",forHTTPHeaderField:"Content-Type") }
            for (key,value) in headers { request.setValue(value,forHTTPHeaderField:key) }
            for attempt in 0...3 {
                do {
                    let (data,response) = try await session.data(for:request)
                    guard let response = response as? HTTPURLResponse else { throw BeerError.invalidResponse("No HTTP response") }
                    if response.statusCode == 401 || response.statusCode == 403 { throw BeerError.sessionExpired }
                    guard (200...299).contains(response.statusCode) || response.statusCode == 304 else { throw HTTPFailure(status:response.statusCode) }
                    if member != nil, let final = response.url, ["/kiosk.php","/login.php"].contains(final.path) { throw BeerError.sessionExpired }
                    interval.finish(.success)
                    return (data,response)
                } catch {
                    let http = error as? HTTPFailure
                    let transient = (error as? URLError).map { [.timedOut,.networkConnectionLost,.notConnectedToInternet,.cannotConnectToHost,.cannotFindHost].contains($0.code) } ?? (http.map { $0.status >= 500 || $0.status == 429 || $0.status == 408 } ?? false)
                    guard retry, method == "GET", transient, attempt < 3 else { throw error }
                    try await Task.sleep(for:.seconds(pow(2,Double(attempt))))
                }
            }
            throw BeerError.invalidResponse("Request exhausted")
        } catch { interval.finish(Diagnostics.isCancellation(error) ? .cancelled : .failure); throw error }
    }
    static func scalarRow(_ row: [String:Any]) throws -> [String:String] {
        var result: [String:String] = [:]
        for (key,value) in row {
            if value is NSNull { continue }
            if let string = value as? String { result[key] = string }
            else if let n = value as? NSNumber { result[key] = n.stringValue }
            else { throw BeerError.invalidResponse("Unexpected field type: \(key)") }
        }
        return result
    }
    static func parseBeers(_ data: Data, tasted: Bool = false, proxy: Bool = false) throws -> [Beer] {
        return try Diagnostics.shared.measure(.parsing) {
            let object = try JSONSerialization.jsonObject(with:data)
            var entries: [Any]?
            if proxy { entries = (object as? [String:Any])?["beers"] as? [Any] }
            else if let array = object as? [Any] {
                if array.count > 1, let envelope = array[1] as? [String:Any] { entries = envelope[tasted ? "tasted_brew_current_round" : "brewInStock"] as? [Any] }
                if entries == nil && !tasted && (array.first as? [String:Any])?["id"] != nil { entries = array }
            } else if !tasted, let dict = object as? [String:Any] { entries = (dict["brewInStock"] ?? dict["beers"] ?? dict["beer_list"]) as? [Any] }
            guard let entries else { throw BeerError.invalidResponse("Missing beer array") }
            if entries.isEmpty && !tasted { throw BeerError.invalidResponse("An empty taplist cannot replace saved beers.") }
            return try entries.map {
                guard let row = $0 as? [String:Any] else { throw BeerError.invalidResponse("Invalid beer row") }
                var values = try scalarRow(row)
                if proxy { values["abv"] = values["enriched_abv"] }
                if values["enrichment_source"] == "description-fallback" { values["enrichment_source"] = "description" }
                return try Beer(row:values)
            }
        }
    }
    static func parseRewards(_ data: Data) throws -> [Reward] {
        return try Diagnostics.shared.measure(.parsing) {
            guard let array = try JSONSerialization.jsonObject(with:data) as? [Any], array.count > 2, let dict = array[2] as? [String:Any], let entries = dict["reward"] as? [Any] else { throw BeerError.invalidResponse("Missing reward array") }
            let rewards = try entries.compactMap { value -> Reward? in
                guard let row = value as? [String:Any], let id = row["reward_id"] as? String, !id.isEmpty else { return nil }
                let values = try scalarRow(row)
                return Reward(id:id,type:values["reward_type"] ?? "",redeemed:values["redeemed"] == "1")
            }
            if !entries.isEmpty && rewards.isEmpty { throw BeerError.invalidResponse("No readable rewards") }
            return rewards
        }
    }
    static func parseQueue(_ data: Data) throws -> [QueueEntry] {
        return try Diagnostics.shared.measure(.parsing) {
            let html = String(decoding:data,as:UTF8.self)
            guard !html.contains("name=\"password\"") else { throw BeerError.sessionExpired }
            let pattern = #"<h3\s+class=["']brewName["']\s*>\s*(.*?)\s*<div\s+class=["']brew_added_date["']\s*>(.*?)</div>\s*</h3>.*?deleteQueuedBrew\.php\?cid=(\d+)"#
            let regex = try NSRegularExpression(pattern:pattern,options:[.dotMatchesLineSeparators,.caseInsensitive])
            return regex.matches(in:html,range:NSRange(html.startIndex...,in:html)).map { match in
                func value(_ index: Int) -> String { String(html[Range(match.range(at:index),in:html)!]).trimmingCharacters(in:.whitespacesAndNewlines).replacingOccurrences(of:"&amp;",with:"&") }
                return QueueEntry(id:value(3),name:value(1),date:value(2))
            }
        }
    }
}
