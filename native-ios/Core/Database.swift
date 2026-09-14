import Foundation
import SQLite3

/// Serialized by AppModel on the main actor. No suspension inside transactions.
final class BeerDatabase {
    private var handle: OpaquePointer?
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    let url: URL
    init(url: URL? = nil) throws {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.url = url ?? documents.appendingPathComponent("SQLite/beers.db")
        try FileManager.default.createDirectory(at: self.url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard sqlite3_open_v2(self.url.path, &handle, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else { throw BeerError.storage("Could not open beers.db") }
        // AppModel calls synchronously on MainActor. Never sleep waiting for another
        // writer: let the transaction fail, retain the snapshot, and allow a later retry.
        sqlite3_busy_timeout(handle, 0)
        try execute("PRAGMA journal_mode=WAL")
        try execute("PRAGMA synchronous=NORMAL")
        try setup()
    }
    deinit { sqlite3_close(handle) }
    private func prepare(_ sql: String, _ values: [String?]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw failure() }
        for (index, value) in values.enumerated() {
            let status: Int32
            if let value { status = sqlite3_bind_text(statement, Int32(index + 1), value, -1, transient) }
            else { status = sqlite3_bind_null(statement, Int32(index + 1)) }
            guard status == SQLITE_OK else { sqlite3_finalize(statement); throw failure() }
        }
        return statement
    }
    private func failure() -> BeerError { .storage(handle.map { String(cString: sqlite3_errmsg($0)) } ?? "Database unavailable") }
    func execute(_ sql: String, _ values: [String?] = []) throws {
        let statement = try prepare(sql, values); defer { sqlite3_finalize(statement) }
        var result = sqlite3_step(statement)
        while result == SQLITE_ROW { result = sqlite3_step(statement) }
        guard result == SQLITE_DONE else { throw failure() }
    }
    func rows(_ sql: String, _ values: [String?] = []) throws -> [[String: String]] {
        let statement = try prepare(sql, values); defer { sqlite3_finalize(statement) }
        var rows: [[String: String]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return rows }
            guard status == SQLITE_ROW else { throw failure() }
            var row: [String: String] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                if let value = sqlite3_column_text(statement, index) { row[String(cString: sqlite3_column_name(statement, index))] = String(cString: value) }
            }
            rows.append(row)
        }
    }
    func transaction(_ work: () throws -> Void) throws {
        try Diagnostics.shared.measure(.transaction) {
            try execute("BEGIN IMMEDIATE")
            do { try work(); try execute("COMMIT") }
            catch { try? execute("ROLLBACK"); throw error }
        }
    }
    func preference(_ key: String) throws -> String? { try rows("SELECT value FROM preferences WHERE key=?", [key]).first?["value"] }
    func setPreference(_ key: String, _ value: String?) throws {
        try execute("INSERT INTO preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key,value])
    }
    private func setup() throws {
        try transaction {
            try execute("CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT,description TEXT)")
            for table in ["allbeers", "tasted_brew_current_round"] {
                try execute("CREATE TABLE IF NOT EXISTS \(table)(id TEXT PRIMARY KEY,brew_name TEXT)")
                let existing = Set(try rows("PRAGMA table_info(\(table))").compactMap { $0["name"] })
                let columns = ["brewer", "brewer_loc", "brew_style", "brew_container", "brew_description", "added_date", "tasted_date", "roh_lap", "chit_code", "review_count", "review_rating", "review_ratings", "container_type", "enrichment_source"]
                for column in columns where !existing.contains(column) { try execute("ALTER TABLE \(table) ADD COLUMN \(column) TEXT") }
                for column in ["abv", "enrichment_confidence"] where !existing.contains(column) { try execute("ALTER TABLE \(table) ADD COLUMN \(column) REAL") }
            }
            try execute("CREATE TABLE IF NOT EXISTS rewards(reward_id TEXT PRIMARY KEY,redeemed TEXT,reward_type TEXT)")
            try execute("CREATE TABLE IF NOT EXISTS operation_queue(id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,timestamp INTEGER NOT NULL,retry_count INTEGER DEFAULT 0,status TEXT DEFAULT 'pending',error_message TEXT,last_retry_timestamp INTEGER)")
            // Recover older interrupted dispatches conservatively. Ordinary check-ins retain
            // their legacy retry policy; recommendations always require explicit review.
            for row in try rows("SELECT id,payload,error_message FROM operation_queue WHERE status='retrying'") {
                let payload = row["payload"].flatMap { $0.data(using:.utf8) }
                    .flatMap { try? JSONSerialization.jsonObject(with:$0) as? [String:Any] }
                let needsReview = payload == nil || payload?["recommendation"].map { String(describing:$0) } == "true"
                try execute("UPDATE operation_queue SET status=?,error_message=? WHERE id=?", [
                    needsReview ? "failed" : "pending",
                    needsReview ? "Check-in may have been sent. Review your beer queue before retrying." : row["error_message"],
                    row["id"]
                ])
            }
            // Credentials are read only from Keychain. Never resurrect the removed plaintext credential preference.
            try execute("DELETE FROM preferences WHERE key='auth_cookies'")
            try setupRecentTastings()
            try setPreference("native_schema_version", "2")
        }
    }
    func beers(tasted: Bool = false) throws -> [Beer] {
        try rows("SELECT * FROM \(tasted ? "tasted_brew_current_round" : "allbeers")").map { try Beer(row: $0) }
    }
    func replaceBeers(_ beers: [Beer], tasted: Bool = false) throws {
        let table = tasted ? "tasted_brew_current_round" : "allbeers"
        try execute("DELETE FROM \(table)")
        for b in beers {
            try execute("INSERT INTO \(table)(id,brew_name,brewer,brewer_loc,brew_style,brew_container,brew_description,added_date,tasted_date,roh_lap,chit_code,abv,container_type,enrichment_confidence,enrichment_source,review_count,review_rating,review_ratings) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [b.id,b.brew_name,b.brewer,b.brewer_loc,b.brew_style,b.brew_container,b.brew_description,b.added_date,b.tasted_date,b.roh_lap,b.chit_code,b.abv.map { String($0) },b.container_type,b.enrichment_confidence.map { String($0) },b.enrichment_source,b.review_count,b.review_rating,b.review_ratings])
        }
    }
    func rewards() throws -> [Reward] { try rows("SELECT * FROM rewards").compactMap { r in guard let id = r["reward_id"], !id.isEmpty else { return nil }; return Reward(id: id,type: r["reward_type"] ?? "",redeemed: r["redeemed"] == "1") } }
    func replaceRewards(_ rewards: [Reward]) throws {
        try execute("DELETE FROM rewards")
        for r in rewards { try execute("INSERT INTO rewards(reward_id,redeemed,reward_type) VALUES(?,?,?)", [r.id,r.redeemed ? "1" : "0",r.type]) }
    }
    func operations() throws -> [PendingOperation] {
        try rows("SELECT * FROM operation_queue WHERE status!='success' ORDER BY timestamp").map { r in
            guard let payload = r["payload"]?.data(using: .utf8), let dict = try JSONSerialization.jsonObject(with: payload) as? [String: Any] else { throw BeerError.storage("Unreadable queued operation") }
            return PendingOperation(id:r["id"] ?? "",type:r["type"] ?? "",payload:dict.mapValues { String(describing:$0) },timestamp:Double(r["timestamp"] ?? "0") ?? 0,retryCount:Int(r["retry_count"] ?? "0") ?? 0,status:r["status"] ?? "pending",error:r["error_message"])
        }
    }
    @discardableResult func enqueue(type: String, payload: [String: String]) throws -> String {
        let id = UUID().uuidString
        let encoded = String(decoding:try JSONEncoder().encode(payload),as:UTF8.self)
        try execute("INSERT INTO operation_queue(id,type,payload,timestamp) VALUES(?,?,?,?)",[id,type,encoded,String(Date().timeIntervalSince1970 * 1000)])
        return id
    }
}
