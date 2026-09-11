import XCTest
@testable import BeerSelectorNative

final class LegacyUpgradeTests: XCTestCase {
    func testCompleteV8DatabasePreservesLegacyRowsAndHistory() throws {
        for migrated in [false,true] {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at:folder) }
            let url = folder.appendingPathComponent("beers.db")
            try LegacyV8Fixture.create(url,migrated:migrated)
            let tables = ["allbeers","tasted_brew_current_round","rewards","preferences","schema_version"]
            var snapshots: [String:[[String:String]]] = [:]
            for table in tables { snapshots[table] = try LegacyV8Fixture.rows(url,"SELECT * FROM \(table) ORDER BY 1") }
            let expectedOperations = try LegacyV8Fixture.rows(url,"SELECT * FROM operation_queue ORDER BY id").map { row -> [String:String] in
                var expected = row
                if expected["status"] == "retrying" { expected["status"] = "pending" }
                return expected
            }
            let indexes = try LegacyV8Fixture.rows(url,"SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name")
            for _ in 0..<2 {
                let db = try BeerDatabase(url:url)
                for table in tables {
                    let old = snapshots[table]!
                    let columns = old[0].keys.sorted().joined(separator:",")
                    let filter = table == "preferences" ? " WHERE key != 'native_schema_version'" : ""
                    let key = table == "preferences" ? "key" : table == "schema_version" ? "version" : table == "rewards" ? "reward_id" : "id"
                    XCTAssertEqual(try db.rows("SELECT \(columns) FROM \(table)\(filter) ORDER BY \(key)"),old,table)
                }
                XCTAssertEqual(try db.rows("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name"),indexes)
                XCTAssertEqual(try db.preference("native_schema_version"),"1")
                XCTAssertEqual(try db.beers().first?.abv,8.2)
                XCTAssertEqual(try db.beers().first?.container_type,"tulip")
                XCTAssertEqual(try db.beers(tasted:true).first?.chit_code,"102-1-42")
                XCTAssertEqual(try db.beers(tasted:true).first?.review_ratings,"4")
                XCTAssertEqual(try db.rewards().filter(\.redeemed).map(\.id),["reward-2"])
                XCTAssertEqual(try db.rows("SELECT * FROM operation_queue ORDER BY id"),expectedOperations)
                let ops = try db.operations()
                XCTAssertEqual(ops.map(\.id),["pending","retrying","failed"])
                XCTAssertEqual(ops.map(\.status),["pending","pending","failed"])
                XCTAssertEqual(ops.map(\.retryCount),[1,2,3])
                XCTAssertTrue(ops.allSatisfy { $0.payload["memberId"] == "42" && $0.payload["storeId"] == "1" })
                XCTAssertEqual(try db.rows("SELECT last_retry_timestamp FROM operation_queue WHERE id='retrying'").first?["last_retry_timestamp"],"1700000000110")
            }
        }
    }

    func testNativeReplacementsWorkAgainstLegacyTables() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder) }
        let url = folder.appendingPathComponent("beers.db")
        try LegacyV8Fixture.create(url)
        let db = try BeerDatabase(url:url)
        let beer = try Beer(row:["id":"new","brew_name":"New","review_rating":"4.2","review_ratings":"5","abv":"6.7","enrichment_source":"description"])
        let reward = Reward(id:"new-reward",type:"New reward",redeemed:true)
        try db.transaction { try db.replaceBeers([beer]); try db.replaceBeers([beer],tasted:true); try db.replaceRewards([reward]) }
        try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"new","beerName":"New","memberId":"42","storeId":"1"])
        let reopened = try BeerDatabase(url:url)
        XCTAssertEqual(try reopened.beers(),[beer])
        XCTAssertEqual(try reopened.beers(tasted:true),[beer])
        XCTAssertEqual(try reopened.rewards(),[reward])
        XCTAssertEqual(try reopened.operations().count,4)
        XCTAssertEqual(try reopened.preference("custom_setting"),"preserve me")
        XCTAssertEqual(try reopened.rows("SELECT MAX(version) AS version FROM schema_version").first?["version"],"8")
    }

    func testFailedNativeUpgradeRollsBackSchemaAndDataAndCanRetry() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder) }
        let url = folder.appendingPathComponent("beers.db")
        try LegacyV8Fixture.create(url)
        try LegacyV8Fixture.execute(url,"CREATE TRIGGER reject_native_version BEFORE INSERT ON preferences WHEN NEW.key='native_schema_version' BEGIN SELECT RAISE(ABORT,'fixture upgrade failure'); END;")
        let schema = try LegacyV8Fixture.rows(url,"SELECT name,sql FROM sqlite_master ORDER BY name")
        var snapshots: [String:[[String:String]]] = [:]
        for table in ["allbeers","tasted_brew_current_round","rewards","preferences","schema_version","operation_queue"] {
            snapshots[table] = try LegacyV8Fixture.rows(url,"SELECT * FROM \(table) ORDER BY 1")
        }
        XCTAssertThrowsError(try BeerDatabase(url:url))
        XCTAssertEqual(try LegacyV8Fixture.rows(url,"SELECT name,sql FROM sqlite_master ORDER BY name"),schema)
        for (table,rows) in snapshots { XCTAssertEqual(try LegacyV8Fixture.rows(url,"SELECT * FROM \(table) ORDER BY 1"),rows,table) }
        try LegacyV8Fixture.execute(url,"DROP TRIGGER reject_native_version")
        let db = try BeerDatabase(url:url)
        XCTAssertEqual(try db.preference("native_schema_version"),"1")
        XCTAssertEqual(try db.beers().map(\.id),["101"])
        XCTAssertEqual(try db.operations().first { $0.id == "retrying" }?.status,"pending")
    }
}
