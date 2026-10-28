import Foundation

extension QueueEntry {
    // Separate only recognized serving labels; parentheses in a beer's actual name stay intact.
    static func serving(of name: String) -> (name: String, container: String?) {
        guard let range = name.range(of:#"(?i)\s+\((draft|can|cans|btl|bottle|bottles|flight)\)$"#,options:.regularExpression) else {
            return (name,nil)
        }
        let container = String(name[range].trimmingCharacters(in:.whitespaces).dropFirst().dropLast())
        return (String(name[..<range.lowerBound]),container.lowercased() == "btl" ? "Bottle" : container)
    }
}

/// A queue entry as first observed by this device. The upstream queue forgets
/// uncredited beers after about a day, so this log is the member's only record.
struct CreditLogEntry: Equatable, Identifiable {
    var id: String; var name: String; var queued: String; var firstSeen: Date
}
struct MissedCreditVisit: Equatable, Identifiable {
    var day: Date; var beers: [CreditLogEntry]
    var id: Date { day }
}
enum MissedCredit {
    /// Servers verify when the tab closes; until then a queued beer is not yet missed.
    static let grace: TimeInterval = 6 * 3600
    static let retention: TimeInterval = 30 * 24 * 3600

    // Saucer keeps packaging in the beer name: "Duvel" is the draft SKU and
    // "Duvel (BTL)" is a different beer. Only a draft label is the queue's own.
    static func visits(log: [CreditLogEntry], tasted: [Beer], now: Date, calendar: Calendar = .current) -> [MissedCreditVisit] {
        let credited = Set(tasted.map { key($0.brew_name) })
        let missed = log.compactMap { entry -> (CreditLogEntry,Date,Date)? in
            guard !credited.contains(key(entry.name)),
                  !credited.contains(key(entry.name.replacingOccurrences(of:#"(?i)\s+\((draft|draught)\)$"#,with:"",options:.regularExpression))) else { return nil }
            let (queuedAt,day) = queuedTime(entry,calendar:calendar)
            return now.timeIntervalSince(queuedAt) >= grace ? (entry,queuedAt,day) : nil
        }
        return Dictionary(grouping:missed) { $0.2 }
            .map { day,beers in MissedCreditVisit(day:day,beers:beers.sorted { ($0.1,$0.0.id) < ($1.1,$1.0.id) }.map(\.0)) }
            .sorted { $0.day > $1.day }
    }
    private static func key(_ name: String) -> String {
        name.trimmingCharacters(in:.whitespacesAndNewlines).lowercased()
    }
    private static func queuedTime(_ entry: CreditLogEntry, calendar: Calendar) -> (Date,Date) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier:"en_US_POSIX"); formatter.calendar = Calendar(identifier:.gregorian); formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "MMM dd, yyyy '@' hh:mm:ssa"
        if let time = formatter.date(from:entry.queued) { return (time,calendar.startOfDay(for:time)) }
        formatter.dateFormat = "MMM dd, yyyy"
        if let day = formatter.date(from:entry.queued) { return (entry.firstSeen,calendar.startOfDay(for:day)) }
        return (entry.firstSeen,calendar.startOfDay(for:entry.firstSeen))
    }
}

extension BeerDatabase {
    func setupCreditLog() throws {
        try execute("CREATE TABLE IF NOT EXISTS credit_log(account TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,queued TEXT NOT NULL,first_seen REAL NOT NULL,dismissed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account,id))")
    }
    func recordQueue(_ entries: [QueueEntry], account: String, seenAt: Date) throws {
        guard !account.isEmpty else { return }
        for entry in entries {
            try execute("INSERT INTO credit_log(account,id,name,queued,first_seen) VALUES(?,?,?,?,?) ON CONFLICT(account,id) DO NOTHING",[account,entry.id,entry.name,entry.date,String(seenAt.timeIntervalSince1970)])
        }
        try execute("DELETE FROM credit_log WHERE first_seen<?",[String(seenAt.timeIntervalSince1970 - MissedCredit.retention)])
    }
    func creditLog(account: String) throws -> [CreditLogEntry] {
        try rows("SELECT id,name,queued,first_seen FROM credit_log WHERE account=? AND dismissed=0 ORDER BY first_seen,id",[account]).map {
            CreditLogEntry(id:$0["id"] ?? "",name:$0["name"] ?? "",queued:$0["queued"] ?? "",firstSeen:Date(timeIntervalSince1970:Double($0["first_seen"] ?? "") ?? 0))
        }
    }
    func dismissCredit(ids: [String], account: String) throws {
        for id in ids { try execute("UPDATE credit_log SET dismissed=1 WHERE account=? AND id=?",[account,id]) }
    }
    func forgetCreditLog() throws { try execute("DELETE FROM credit_log") }
}
