import XCTest
import Security
@testable import BeerSelectorNative

final class LegacyUpgradeTests: XCTestCase {
    @MainActor func testLegacyDatabaseAndChunkedExpoCredentialsRestoreTogetherAcrossServices() async throws {
        for service in ["app:no-auth","app","app:auth"] {
            for generationSession in [false,true] {
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                let key = "legacy_combined_" + UUID().uuidString
                let store = CredentialStore(prefix:key,sessionStorageKey:key + "_session")
                defer { try? store.clear(); try? FileManager.default.removeItem(at:folder) }
                let url = folder.appendingPathComponent("beers.db")
                try LegacyV8Fixture.create(url,migrated:true)
                let member = MemberSession(memberId:"42",storeId:"1",storeName:"Fixture",sessionId:"legacy-session")
                let cookies = ["PHPSESSID":"legacy-session","payload":String(repeating:"ø=",count:1500)]
                let encoded = Array(try JSONEncoder().encode(cookies).base64EncodedString())
                let chunks = stride(from:0,to:encoded.count,by:1500).map { String(encoded[$0..<min($0+1500,encoded.count)]) }
                XCTAssertGreaterThan(chunks.count,1)
                var marker: [String:Any] = ["generation":"expo","count":chunks.count]
                if generationSession { marker["hasSession"] = true }
                var values: [String:Data] = [
                    key + "_meta": try JSONSerialization.data(withJSONObject:marker),
                    generationSession ? key + "_expo_session" : key + "_session": try JSONEncoder().encode(member)
                ]
                for (index,chunk) in chunks.enumerated() { values[key + "_expo_" + String(index)] = Data(chunk.utf8) }
                for (name,data) in values {
                    let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,
                        kSecAttrService as String:service,kSecAttrAccount as String:Data(name.utf8),
                        kSecAttrGeneric as String:Data(name.utf8),kSecValueData as String:data,
                        kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
                    XCTAssertEqual(SecItemAdd(query as CFDictionary,nil),errSecSuccess)
                }
                let db = try BeerDatabase(url:url)
                let fixture = HTTPFixture()
                let api = fixture.api(configuration:APIConfiguration())
                var requests = 0
                fixture.handler = { _ in requests += 1; throw URLError(.unsupportedURL) }
                defer { fixture.handler = nil }
                let model = AppModel(api:api,credentials:store,monitorConnectivity:false); model.db = db
                try model.restoreCredentials(); try model.reload()
                XCTAssertEqual(model.session,member)
                XCTAssertTrue(model.configured)
                XCTAssertEqual(model.allBeers.map(\.id),["101"])
                XCTAssertEqual(model.tastedBeers.map(\.id),["102"])
                XCTAssertEqual(model.rewards.count,2)
                XCTAssertEqual(model.operations.count,3)
                XCTAssertEqual(try store.load().1,cookies)
                // Native credential rotation must preserve restored legacy caches/settings.
                var renewed = member; renewed.sessionId = "native-session"
                fixture.handler = { request in
                    requests += 1
                    XCTAssertEqual(request.url!.path,"/auto-login.php")
                    let object = try JSONSerialization.jsonObject(with:JSONEncoder().encode(renewed))
                    return (200,try JSONSerialization.data(withJSONObject:["session":object]))
                }
                XCTAssertEqual(requests,0,"Restore must be usable without network refresh")
                try await model.autoLogin()
                XCTAssertEqual(requests,1)
                let restarted = AppModel(api:api,credentials:store,monitorConnectivity:false)
                restarted.db = try BeerDatabase(url:url)
                try restarted.restoreCredentials(); try restarted.reload()
                XCTAssertEqual(restarted.session,renewed)
                XCTAssertEqual(restarted.tastedBeers,model.tastedBeers)
                XCTAssertEqual(restarted.rewards,model.rewards)
                XCTAssertEqual(restarted.operations.map(\.id),model.operations.map(\.id))
                XCTAssertEqual(try restarted.db?.preference("custom_setting"),"preserve me")
                XCTAssertEqual(try restarted.db?.preference("last_my_beers_refresh"),"1700000000100")
                XCTAssertEqual(try store.load().1,cookies)
                try store.clear()
                XCTAssertNil(try store.load().0)
                for name in values.keys { XCTAssertNil(try store.read(name),"Logout must clear legacy-format keys from every supported service") }
            }
        }
    }
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
                // Additive recommendation tables may add their own indexes; legacy indexes must survive.
                XCTAssertEqual(try db.rows("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name NOT IN ('recent_tastings','tasting_baseline','beer_feedback','beer_choices') ORDER BY name"),indexes)
                XCTAssertEqual(try db.preference("native_schema_version"),"2")
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
        XCTAssertEqual(try db.preference("native_schema_version"),"2")
        XCTAssertEqual(try db.beers().map(\.id),["101"])
        XCTAssertEqual(try db.operations().first { $0.id == "retrying" }?.status,"pending")
    }
}
