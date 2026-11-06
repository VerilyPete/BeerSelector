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

/// Saucer stores some names with backslash-escaped quotes ("Dragon\'s"), per record,
/// and the enrichment API serves them repaired. Every source passes through here
/// so queue, tasted and taplist names compare in one form.
enum BeerName {
    static func clean(_ name: String) -> String {
        name.replacingOccurrences(of:#"\\(['"])"#,with:"$1",options:.regularExpression)
            .replacingOccurrences(of:#"\s+"#,with:" ",options:.regularExpression)
            .trimmingCharacters(in:.whitespaces)
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
        self.init(id: id, name: BeerName.clean(name))
        brewer = BeerName.clean(row["brewer"] ?? ""); brewer_loc = row["brewer_loc"] ?? ""
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
    private var addedAt: Date? {
        guard let seconds = Double(added_date), seconds.isFinite, seconds > 0 else { return nil }
        return Date(timeIntervalSince1970: seconds)
    }
    /// Store days since arrival. A day of clock skew counts as today; anything further ahead is unusable.
    func arrivalAge(relativeTo now: Date = Date(), calendar: Calendar = .current) -> Int? {
        guard let added = addedAt,
              let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: added), to: calendar.startOfDay(for: now)).day,
              days >= -1 else { return nil }
        return max(0, days)
    }
    func arrivalLabel(relativeTo now: Date = Date(), calendar: Calendar = .current) -> String? {
        guard let added = addedAt, let days = arrivalAge(relativeTo: now, calendar: calendar) else { return nil }
        switch days {
        case 0: return "Added today"
        case 1: return "Added yesterday"
        case 2...6: return "Added \(days) days ago"
        default: return "Added " + added.formatted(date: .abbreviated, time: .omitted)
        }
    }
    /// Home's compact New on Tap row: arrival day, style and container, e.g. "Sep 9 · Imperial Stout · Bottle".
    func newOnTapLine(calendar: Calendar = .current, locale: Locale = .current) -> String {
        let style = Date.FormatStyle(date:.omitted,time:.omitted,locale:locale,calendar:calendar,timeZone:calendar.timeZone).month(.abbreviated).day()
        let day = addedAt.map { $0.formatted(style) }
        return [day,brew_style,brew_container].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator:" · ")
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
/// One entry in the sort menu: a sort key and its direction, chosen together.
struct SortOption: Hashable {
    let sort: BeerSort
    let ascending: Bool
    static let all = [SortOption(sort:.date,ascending:false),SortOption(sort:.date,ascending:true),
                      SortOption(sort:.name,ascending:true),SortOption(sort:.name,ascending:false),
                      SortOption(sort:.abv,ascending:false),SortOption(sort:.abv,ascending:true)]
    init(sort: BeerSort, ascending: Bool) { self.sort = sort; self.ascending = ascending }
    init(filter: BeerFilter) { self.init(sort:filter.sort,ascending:filter.ascending) }
    func apply(to filter: inout BeerFilter) { filter.sort = sort; filter.ascending = ascending }
    var usesBeerIcon: Bool { sort == .abv }
    var chipLabel: String { "\(sort.rawValue.uppercased()) · \(shortChipLabel)" }
    /// The chip's text when the filter row is tight: the icon already names the sort.
    var shortChipLabel: String {
        switch sort {
        case .date: ascending ? "OLD" : "NEW"
        case .name: ascending ? "A-Z" : "Z-A"
        case .abv: ascending ? "LOW" : "HIGH"
        }
    }
    var menuTitle: String {
        switch sort {
        case .date: ascending ? "Oldest first" : "Newest first"
        case .name: ascending ? "Name A–Z" : "Name Z–A"
        case .abv: ascending ? "Lowest ABV" : "Highest ABV"
        }
    }
    var spokenLabel: String {
        switch sort {
        case .date: ascending ? "Date, oldest first" : "Date, newest first"
        case .name: ascending ? "Name, A to Z" : "Name, Z to A"
        case .abv: ascending ? "ABV, lowest first" : "ABV, highest first"
        }
    }
}
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
    static func recentArrivals(_ beers: [Beer], relativeTo now: Date = Date(), calendar: Calendar = .current) -> [Beer] {
        beers.filter { ($0.arrivalAge(relativeTo: now, calendar: calendar) ?? 7) < 7 }
            .sorted { (Double($0.added_date) ?? 0) > (Double($1.added_date) ?? 0) }
    }
    /// Home's New on Tap: the newest taplist beers, tasted or not. Undated beers follow dated ones.
    static func newOnTap(_ beers: [Beer], count: Int) -> [Beer] {
        let keyed = beers.enumerated().map { (offset:$0.offset, beer:$0.element, added:Double($0.element.added_date).flatMap { $0.isFinite && $0 > 0 ? $0 : nil }) }
        return keyed.sorted { a, b in
            switch (a.added, b.added) {
            case let (lhs?, rhs?) where lhs != rhs: return lhs > rhs
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.offset < b.offset
            }
        }.prefix(max(0,count)).map(\.beer)
    }
    static func untasted(all: [Beer], tasted: [Beer]) -> [Beer] {
        let ids = Set(tasted.map(\.id)); return all.filter { !ids.contains($0.id) }
    }
}

/// What Home's Rewards card can honestly say, given the model's separate loaded and error state.
enum RewardsCardStatus: Equatable {
    case hidden, checking, ready(Int), saved(Int), unavailable

    init(isMember: Bool, loaded: Bool, error: String?, rewards: [Reward]) {
        let available = rewards.filter { !$0.redeemed }.count
        switch (isMember, loaded, error) {
        case (false, _, _): self = .hidden
        case (true, true, nil): self = .ready(available)
        case (true, true, _?): self = .saved(available)
        case (true, false, nil): self = .checking
        case (true, false, _?): self = .unavailable
        }
    }

    var headline: String {
        switch self {
        case .hidden, .checking: "Rewards"
        case .ready(let count), .saved(let count): count == 0 ? "No rewards ready" : "\(count) \(count == 1 ? "reward" : "rewards") ready"
        case .unavailable: "Rewards unavailable"
        }
    }

    var detail: String {
        switch self {
        case .hidden: ""
        case .checking: "Checking your rewards…"
        case .ready(0): "Keep tasting toward your next milestone."
        case .ready: "Tap to view and claim."
        case .saved: "Couldn’t refresh. Showing saved rewards."
        case .unavailable: "Couldn’t load your rewards."
        }
    }

    var cardLine: String {
        switch self {
        case .hidden: ""
        case .checking: "Checking your rewards…"
        case .ready(0): "No rewards ready yet. Keep tasting."
        case .ready(let count): "\(count) \(count == 1 ? "reward" : "rewards") ready to claim"
        case .saved: "\(headline). Couldn’t refresh."
        case .unavailable: "Couldn’t load your rewards."
        }
    }

    var offersRetry: Bool {
        switch self { case .saved, .unavailable: true; default: false }
    }

    var spokenSummary: String { "Rewards: \(headline). \(detail)" }
}

/// Whether the compact Home fits its screen or scrolls, and how many New on Tap rows a scrolling Home shows.
enum CompactHomeMode: Equatable {
    case fitted, scrolling(rows: Int)

    /// Accessibility text always scrolls with two arrivals. An open description scrolls with the rows already shown,
    /// but only if Home actually shows that beer; a stale expansion from another layout is ignored.
    init(expandedID: String?, taplist: [Beer], accessibility: Bool, fittedRows: Int) {
        if accessibility { self = .scrolling(rows:2); return }
        guard let expandedID, BeerFilter.newOnTap(taplist,count:fittedRows).contains(where: { $0.id == expandedID }) else { self = .fitted; return }
        self = .scrolling(rows:fittedRows)
    }
}
