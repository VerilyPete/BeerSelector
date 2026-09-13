import Foundation
import SQLite3

/// Snapshot of src/database/schema.ts and schemaVersion.ts at 363ac3ef (RN schema 8).
/// Raw SQLite creates the legacy database before BeerDatabase ever opens it.
enum LegacyV8Fixture {
    static let schema = #"""
CREATE TABLE IF NOT EXISTS allbeers (
    id TEXT PRIMARY KEY,
    added_date TEXT,
    brew_name TEXT,
    brewer TEXT,
    brewer_loc TEXT,
    brew_style TEXT,
    brew_container TEXT,
    review_count TEXT,
    review_rating TEXT,
    brew_description TEXT,
    container_type TEXT,
    abv REAL,
    enrichment_confidence REAL,
    enrichment_source TEXT
  );
CREATE TABLE IF NOT EXISTS tasted_brew_current_round (
    id TEXT PRIMARY KEY,
    roh_lap TEXT,
    tasted_date TEXT,
    brew_name TEXT,
    brewer TEXT,
    brewer_loc TEXT,
    brew_style TEXT,
    brew_container TEXT,
    review_count TEXT,
    review_ratings TEXT,
    brew_description TEXT,
    chit_code TEXT,
    container_type TEXT,
    abv REAL,
    enrichment_confidence REAL,
    enrichment_source TEXT
  );
CREATE TABLE IF NOT EXISTS rewards (
    reward_id TEXT PRIMARY KEY,
    redeemed TEXT,
    reward_type TEXT
  );
CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT
  );
CREATE TABLE IF NOT EXISTS operation_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    retry_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    last_retry_timestamp INTEGER
  );
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
CREATE INDEX idx_operation_queue_status ON operation_queue(status);
CREATE INDEX idx_operation_queue_timestamp ON operation_queue(timestamp);
"""#
    static func execute(_ url: URL, _ sql: String) throws {
        var handle: OpaquePointer?
        guard sqlite3_open(url.path,&handle) == SQLITE_OK else { throw NSError(domain:"LegacyFixture",code:1) }
        defer { sqlite3_close(handle) }
        guard sqlite3_exec(handle,sql,nil,nil,nil) == SQLITE_OK else {
            throw NSError(domain:"LegacyFixture",code:2,userInfo:[NSLocalizedDescriptionKey:String(cString:sqlite3_errmsg(handle))])
        }
    }
    static func rows(_ url: URL, _ sql: String) throws -> [[String:String]] {
        var handle: OpaquePointer?
        guard sqlite3_open(url.path,&handle) == SQLITE_OK else { throw NSError(domain:"LegacyFixture",code:1) }
        defer { sqlite3_close(handle) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle,sql,-1,&statement,nil) == SQLITE_OK else { throw NSError(domain:"LegacyFixture",code:3) }
        defer { sqlite3_finalize(statement) }
        var result: [[String:String]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw NSError(domain:"LegacyFixture",code:4) }
            var row: [String:String] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                if let value = sqlite3_column_text(statement,index) { row[String(cString:sqlite3_column_name(statement,index))] = String(cString:value) }
            }
            result.append(row)
        }
    }
    static func create(_ url: URL, migrated: Bool = false) throws {
        try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
        try execute(url,schema)
        for version in migrated ? Array(3...8) : [8] {
            try execute(url,"INSERT INTO schema_version VALUES(\(version),'2026-01-01T00:00:00.000Z');")
        }
        try execute(url,#"""
        INSERT INTO allbeers VALUES('101','2026-01-01','Legacy draft','Brewer','Texas','IPA','Draft','12','4.5','Description','tulip',8.2,0.95,'description');
        INSERT INTO tasted_brew_current_round VALUES('102','4','2026-01-02','Legacy tasting','Brewer','Texas','Lager','Can','7','4','Tasted description','102-1-42','can',5.1,0.8,'cache');
        INSERT INTO rewards VALUES('reward-1','0','Shirt'),('reward-2','1','Plate');
        INSERT INTO preferences VALUES
          ('all_beers_api_url','https://fsbs.beerknurd.com/bk-store-json.php?sid=1','store URL'),
          ('my_beers_api_url','https://fsbs.beerknurd.com/bk-member-json.php?uid=42','member URL'),
          ('first_launch','false','setup complete'),
          ('is_visitor_mode','false','member mode'),
          ('last_all_beers_refresh','1700000000000','timestamp'),
          ('last_my_beers_refresh','1700000000100','timestamp'),
          ('custom_setting','preserve me','custom description');
        INSERT INTO operation_queue VALUES
          ('pending','CHECK_IN_BEER','{"beerId":"101","beerName":"Legacy draft","memberId":"42","storeId":"1","storeName":"Fixture"}',1700000000000,1,'pending','offline',1700000000010),
          ('retrying','CHECK_IN_BEER','{"beerId":"103","beerName":"Interrupted","memberId":"42","storeId":"1"}',1700000000100,2,'retrying','connection lost',1700000000110),
          ('failed','CHECK_IN_BEER','{"beerId":"104","beerName":"Review","memberId":"42","storeId":"1"}',1700000000200,3,'failed','rejected',1700000000210),
          ('success','CHECK_IN_BEER','{"beerId":"105","beerName":"Done","memberId":"42","storeId":"1"}',1700000000300,0,'success',NULL,NULL);
        """#)
    }
}
