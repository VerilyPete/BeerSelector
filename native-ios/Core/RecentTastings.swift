import Foundation

extension BeerDatabase {
    static let recentTastingLimit = 100
    func setupRecentTastings() throws {
        try setupBeerFeedback()
        try setupChoiceContexts()
        try execute("CREATE TABLE IF NOT EXISTS recent_tastings(account TEXT NOT NULL,event TEXT NOT NULL,day REAL NOT NULL,beer TEXT NOT NULL,observed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account,event))")
        if try !rows("PRAGMA table_info(recent_tastings)").contains(where: { $0["name"] == "observed" }) {
            try execute("ALTER TABLE recent_tastings ADD COLUMN observed INTEGER NOT NULL DEFAULT 0")
        }
        try execute("CREATE TABLE IF NOT EXISTS tasting_baseline(account TEXT NOT NULL,event TEXT NOT NULL,day REAL NOT NULL,PRIMARY KEY(account,event))")
    }
    func recentTastings(account: String) throws -> [Beer] {
        try rows("SELECT beer FROM recent_tastings WHERE account=? ORDER BY day DESC,observed DESC,event DESC LIMIT \(Self.recentTastingLimit)",[account]).map {
            guard let data = $0["beer"]?.data(using:.utf8) else { throw BeerError.storage("Unreadable tasting history") }
            return try JSONDecoder().decode(Beer.self,from:data)
        }
    }
    /// Caller includes this in the transaction replacing the validated source snapshot.
    /// Lap identifies a round in captured upstream data, not a unique tasting.
    func recordTastings(_ beers: [Beer], account: String) throws {
        guard !account.isEmpty else { return }
        if try preference("recent_tastings_owner") != account {
            try forgetRecentTastings()
            try setPreference("recent_tastings_owner",account)
        }
        // Source dates have day precision. Preserve first-observed batch order
        // within a day; duplicate refreshes must never make old events newer.
        let observation = (Int(try preference("recent_tastings_observation") ?? "") ?? 0) + 1
        try setPreference("recent_tastings_observation",String(observation))
        let expanding = try preference("recent_tastings_capacity") != String(Self.recentTastingLimit)
            && preference("recent_tastings_cleared_before") == nil
        let previousLap = Int(try preference("recent_tastings_lap") ?? "") ?? 0
        let newestLap = max(previousLap,beers.compactMap { Int($0.roh_lap) }.max() ?? 0)
        if newestLap > previousLap {
            try execute("DELETE FROM tasting_baseline WHERE account=?",[account])
            try setPreference("recent_tastings_lap",String(newestLap))
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier:"en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT:0)
        formatter.dateFormat = "MM/dd/yyyy"; formatter.isLenient = false
        let cutoff = Double(try preference("recent_tastings_cleared_before") ?? "") ?? 0
        for beer in beers {
            guard !beer.id.isEmpty, let day = formatter.date(from:beer.tasted_date),
                  formatter.string(from:day) == beer.tasted_date else { continue }
            if let lap = Int(beer.roh_lap), lap < newestLap { continue }
            // Without a lap, the same beer on the same day cannot be distinguished
            // across rounds. Conservatively collapse it; never invent an event.
            let identity = [beer.roh_lap.isEmpty ? beer.tasted_date : beer.roh_lap,beer.id]
            let event = String(decoding:try JSONEncoder().encode(identity),as:UTF8.self)
            let timestamp = day.timeIntervalSince1970
            let seen = try !rows("SELECT event FROM tasting_baseline WHERE account=? AND event=?",[account,event]).isEmpty
            let encoded = String(decoding:try JSONEncoder().encode(beer),as:UTF8.self)
            if (!seen || expanding) && timestamp >= cutoff {
                try execute("INSERT INTO recent_tastings(account,event,day,beer,observed) VALUES(?,?,?,?,?) ON CONFLICT(account,event) DO UPDATE SET day=excluded.day,beer=excluded.beer",[account,event,String(timestamp),encoded,String(seen ? 0 : observation)])
            } else {
                try execute("UPDATE recent_tastings SET day=?,beer=? WHERE account=? AND event=?",[String(timestamp),encoded,account,event])
            }
            try execute("INSERT INTO tasting_baseline(account,event,day) VALUES(?,?,?) ON CONFLICT(account,event) DO UPDATE SET day=excluded.day",[account,event,String(timestamp)])
        }
        try setPreference("recent_tastings_capacity",String(Self.recentTastingLimit))
        try execute("DELETE FROM recent_tastings WHERE account=? AND event NOT IN (SELECT event FROM recent_tastings WHERE account=? ORDER BY day DESC,observed DESC,event DESC LIMIT \(Self.recentTastingLimit))",[account,account])
        try execute("DELETE FROM tasting_baseline WHERE account=? AND event NOT IN (SELECT event FROM tasting_baseline WHERE account=? ORDER BY day DESC,event DESC LIMIT 200)",[account,account])
    }
    func clearRecentTastings(account: String, baseline: [Beer]) throws {
        try recordTastings(baseline,account:account)
        let newest = try rows("SELECT MAX(day) AS day FROM tasting_baseline WHERE account=?",[account]).first?["day"]
        try setPreference("recent_tastings_cleared_before",newest)
        try execute("DELETE FROM recent_tastings WHERE account=?",[account])
        try execute("DELETE FROM beer_choices WHERE account=?",[account])
    }
    func forgetRecentTastings() throws {
        try execute("DELETE FROM recent_tastings")
        try execute("DELETE FROM beer_choices")
        try execute("DELETE FROM tasting_baseline")
        for key in ["recent_tastings_owner","recent_tastings_capacity","recent_tastings_observation","recent_tastings_lap","recent_tastings_cleared_before"] { try setPreference(key,nil) }
    }
}

// Explicit feedback is durable user data, independent of the bounded tasting cache.
enum BeerRating: String, Codable, CaseIterable {
    case liked, notForMe
    var label: String { self == .liked ? "Liked it" : "Not for me" }
}
struct BeerFeedback: Codable, Identifiable, Equatable {
    var beer: Beer
    var rating: BeerRating
    var ratedAt: Date? = Date()
    var id: String { beer.id }
}
extension BeerDatabase {
    func setupBeerFeedback() throws {
        try execute("CREATE TABLE IF NOT EXISTS beer_feedback(account TEXT NOT NULL,beer_id TEXT NOT NULL,feedback TEXT NOT NULL,PRIMARY KEY(account,beer_id))")
    }
    func beerFeedback(account: String) throws -> [BeerFeedback] {
        try rows("SELECT feedback FROM beer_feedback WHERE account=? ORDER BY beer_id",[account]).map {
            try JSONDecoder().decode(BeerFeedback.self,from:Data(($0["feedback"] ?? "").utf8))
        }
    }
    func saveBeerFeedback(_ feedback: BeerFeedback, account: String) throws {
        guard !account.isEmpty, !feedback.id.isEmpty else { throw BeerError.storage("Missing feedback owner or beer") }
        let json = String(decoding:try JSONEncoder().encode(feedback),as:UTF8.self)
        try execute("INSERT INTO beer_feedback(account,beer_id,feedback) VALUES(?,?,?) ON CONFLICT(account,beer_id) DO UPDATE SET feedback=excluded.feedback",[account,feedback.id,json])
    }
    func deleteCachedBeerFeedback(account: String) throws {
        try execute("DELETE FROM beer_feedback WHERE account=?",[account])
    }
}
