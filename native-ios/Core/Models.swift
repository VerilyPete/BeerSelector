import Foundation

enum BeerError: LocalizedError {
    case invalidResponse(String), storage(String), sessionExpired, changedAccount
    var errorDescription: String? {
        switch self {
        case .invalidResponse(let detail): return "Could not read the server response. \(detail)"
        case .storage(let detail): return "Could not access saved data. \(detail)"
        case .sessionExpired: return "Your session has expired. Please log in again in Settings."
        case .changedAccount: return "Your account or location changed. Please refresh."
        }
    }
}

struct Beer: Identifiable, Codable, Equatable {
    var id: String
    var brew_name: String
    var brewer: String = ""
    var brewer_loc: String = ""
    var brew_style: String = ""
    var brew_container: String = ""
    var brew_description: String = ""
    var added_date: String = ""
    var tasted_date: String = ""
    var roh_lap: String = ""
    var review_count: String = ""
    var review_rating: String = ""
    var review_ratings: String = ""
    var chit_code: String = ""
    var abv: Double?
    var container_type: String?
    var enrichment_confidence: Double?
    var enrichment_source: String?

    init(id: String, name: String) { self.id = id; brew_name = name }
    init(row: [String: String]) throws {
        guard let id = row["id"], !id.isEmpty, let name = row["brew_name"], !name.isEmpty else {
            throw BeerError.invalidResponse("A beer is missing its ID or name.")
        }
        self.init(id: id, name: name)
        brewer = row["brewer"] ?? ""; brewer_loc = row["brewer_loc"] ?? ""
        brew_style = row["brew_style"] ?? ""; brew_container = row["brew_container"] ?? ""
        brew_description = row["brew_description"] ?? ""; added_date = row["added_date"] ?? ""
        tasted_date = row["tasted_date"] ?? ""; roh_lap = row["roh_lap"] ?? ""; chit_code = row["chit_code"] ?? ""
        review_count = row["review_count"] ?? ""; review_rating = row["review_rating"] ?? ""; review_ratings = row["review_ratings"] ?? ""
        abv = row["abv"].flatMap(Double.init).flatMap { $0.isFinite ? $0 : nil }
        enrichment_confidence = row["enrichment_confidence"].flatMap(Double.init)
        enrichment_source = row["enrichment_source"]
        container_type = row["container_type"] ?? inferredContainer
    }
    var inferredContainer: String? {
        let c = brew_container.lowercased(), s = brew_style.lowercased()
        let draft = c.contains("draft") || c.contains("draught")
        if (brew_name.range(of: #"\bflight\b"#, options: [.regularExpression,.caseInsensitive]) != nil || s == "flight"), c.isEmpty || draft || c.contains("flight") { return "flight" }
        if c.contains("can") { return "can" }
        if c.contains("bottle") { return "bottle" }
        guard draft else { return nil }
        if c.contains("13oz") || c.contains("13 oz") { return "tulip" }
        if c.contains("16oz") || c.contains("16 oz") { return "pint" }
        if let value = abv ?? Self.descriptionABV(brew_description) { return value >= 8 ? "tulip" : "pint" }
        if ["pilsner", "lager"].contains(where: s.contains) { return "pint" }
        if ["imperial", "tripel", "quad", "barleywine"].contains(where: s.contains) { return "tulip" }
        return nil
    }
    static func descriptionABV(_ html: String) -> Double? {
        let text = html.replacingOccurrences(of:#"<[^>]*>"#,with:"",options:.regularExpression)
        for pattern in [#"(?<!-)\b(\d+(?:\.\d+)?)\s*%"#, #"ABV[:\s]*(?<!-)\b(\d+(?:\.\d+)?)"#, #"(?<!-)\b(\d+(?:\.\d+)?)\s*ABV"#] {
            guard let regex = try? NSRegularExpression(pattern:pattern,options:.caseInsensitive), let match = regex.firstMatch(in:text,range:NSRange(text.startIndex...,in:text)), let range = Range(match.range(at:1),in:text), let number = Double(text[range]), (0...30).contains(number) else { continue }
            return number
        }
        return nil
    }
    var displayDate: String {
        if !tasted_date.isEmpty { return tasted_date }
        guard let seconds = Double(added_date), seconds > 0 else { return "Unknown date" }
        return Date(timeIntervalSince1970: seconds).formatted(date: .abbreviated, time: .omitted)
    }
    var plainDescription: String {
        brew_description.replacingOccurrences(of: #"<br\s*/?>|</p>"#, with: "\n", options: .regularExpression)
            .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&#39;", with: "'").replacingOccurrences(of: "&quot;", with: "\"")
    }
}

struct MemberSession: Codable, Equatable {
    var memberId: String
    var storeId: String
    var storeName: String
    var sessionId: String
    var username: String?
    var firstName: String?
    var lastName: String?
    var email: String?
    var cardNum: String?
    var isVisitor: Bool { memberId == "visitor" }
    var valid: Bool { !memberId.isEmpty && !storeId.isEmpty && !sessionId.isEmpty && !storeName.isEmpty }
    var displayName: String { firstName ?? username ?? "Beer Enthusiast" }
    var identity: String { "\(memberId):\(storeId)" }
}

struct Reward: Identifiable, Equatable {
    var id: String
    var type: String
    var redeemed: Bool
}
struct QueueEntry: Identifiable, Equatable { var id: String; var name: String; var date: String }
struct PendingOperation: Identifiable {
    var id: String; var type: String; var payload: [String: String]
    var timestamp: Double; var retryCount: Int; var status: String; var error: String?
}

enum BeerSort: String, CaseIterable { case date, name, abv }
enum ContainerFilter: String, CaseIterable { case all = "ALL", draft = "DRAFT", cans = "CANS / BOTTLES" }
struct BeerFilter {
    var search = ""
    var container: ContainerFilter = .all
    var sort: BeerSort = .date
    var ascending = false
    func apply(_ beers: [Beer], tasted: Bool = false) -> [Beer] {
        let query = search.lowercased()
        let dateFormatter: DateFormatter?
        if sort == .date && tasted {
            let formatter = DateFormatter()
            formatter.dateFormat = "MM/dd/yyyy"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            dateFormatter = formatter
        } else { dateFormatter = nil }
        return beers.filter { b in
            let c = b.brew_container.lowercased()
            return (query.isEmpty || [b.brew_name, b.brewer, b.brew_style, b.brewer_loc].contains { $0.lowercased().contains(query) }) &&
                (container == .all || (container == .draft && (c.contains("draft") || c.contains("draught"))) || (container == .cans && (c.contains("can") || c.contains("bottle"))))
        }.enumerated().map { offset, beer in
            // DateFormatter parsing is expensive; calculate each key once, outside
            // the O(n log n) comparisons, while preserving original tie order.
            let date: TimeInterval
            if sort == .date {
                date = tasted ? dateFormatter?.date(from:beer.tasted_date)?.timeIntervalSince1970 ?? 0 : Double(beer.added_date) ?? 0
            } else { date = 0 }
            return (offset:offset, element:beer, date:date)
        }.sorted { a, b in
            var comparison: ComparisonResult = .orderedSame
            switch sort {
            case .name: comparison = a.element.brew_name.localizedCompare(b.element.brew_name)
            case .abv:
                if a.element.abv == nil && b.element.abv != nil { return false }
                if a.element.abv != nil && b.element.abv == nil { return true }
                let lhs = a.element.abv ?? 0, rhs = b.element.abv ?? 0
                comparison = lhs == rhs ? .orderedSame : lhs < rhs ? .orderedAscending : .orderedDescending
            case .date:
                let lhs = a.date, rhs = b.date
                comparison = lhs == rhs ? .orderedSame : lhs < rhs ? .orderedAscending : .orderedDescending
            }
            if comparison == .orderedSame { return a.offset < b.offset }
            return comparison == (ascending ? .orderedAscending : .orderedDescending)
        }.map(\.element)
    }
    static func untasted(all: [Beer], tasted: [Beer]) -> [Beer] {
        let ids = Set(tasted.map(\.id)); return all.filter { !ids.contains($0.id) }
    }
}
