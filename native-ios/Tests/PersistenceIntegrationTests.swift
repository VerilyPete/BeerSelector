import XCTest
import UIKit
import SQLite3
import Security
@testable import BeerSelectorNative

final class PersistenceIntegrationTests: XCTestCase {
    func testCustomFontsAreBundledAndRegistered() {
        for name in ["SpaceGrotesk-Regular","SpaceGrotesk-SemiBold","SpaceGrotesk-Bold","SpaceMono-Regular","DSEG7Classic-Bold","BeerIcons"] {
            XCTAssertNotNil(Bundle.main.url(forResource:name,withExtension:"ttf"),name)
            XCTAssertNotNil(UIFont(name:name == "BeerIcons" ? Robo.beerIconFont : name,size:14),name)
        }
    }
    func testNativeDatabaseReopenPreservesDataAndRecoversInterruptedOperations() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder) }
        let url = folder.appendingPathComponent("beers.db")
        do {
            let original = try BeerDatabase(url:url)
            try original.setPreference("custom_user_setting","keep me")
            try original.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
            try original.setPreference("auth_cookies","legacy plaintext must be removed")
            try original.transaction {
                try original.replaceBeers([Beer(id:"1",name:"Saved beer")])
                try original.replaceBeers([Beer(id:"2",name:"Tasted beer")],tasted:true)
                try original.replaceRewards([Reward(id:"reward",type:"Shirt",redeemed:false)])
            }
            try original.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"1","beerName":"Saved beer","memberId":"test","storeId":"1","storeName":"Test store"])
            try original.execute("UPDATE operation_queue SET status='retrying'")
        }
        let reopened = try BeerDatabase(url:url)
        XCTAssertEqual(try reopened.preference("custom_user_setting"),"keep me")
        XCTAssertNil(try reopened.preference("auth_cookies"))
        XCTAssertEqual(try reopened.beers().map(\.id),["1"])
        XCTAssertEqual(try reopened.beers(tasted:true).map(\.id),["2"])
        XCTAssertEqual(try reopened.rewards().map(\.id),["reward"])
        XCTAssertEqual(try reopened.operations().first?.status,"pending")
        XCTAssertEqual(try reopened.operations().first?.payload["memberId"],"test")
    }
    func testFailedReplacementRollsBackPreviousSnapshot() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder) }
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        try db.transaction { try db.replaceBeers([Beer(id:"saved",name:"Saved")]) }
        XCTAssertThrowsError(try db.transaction { try db.replaceBeers([Beer(id:"duplicate",name:"One"),Beer(id:"duplicate",name:"Two")]) })
        XCTAssertEqual(try db.beers().map(\.id),["saved"])
    }
    func testPreVersionedReactNativeDatabaseUpgradesWithoutLosingRows() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:folder) }
        let url = folder.appendingPathComponent("beers.db")
        var handle: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path,&handle),SQLITE_OK)
        let sql = "CREATE TABLE allbeers(id TEXT PRIMARY KEY,brew_name TEXT,glass_type TEXT); INSERT INTO allbeers VALUES('old','Legacy beer','tulip'); CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT,description TEXT); INSERT INTO preferences VALUES('custom','original value','keep');"
        XCTAssertEqual(sqlite3_exec(handle,sql,nil,nil,nil),SQLITE_OK)
        sqlite3_close(handle)
        let db = try BeerDatabase(url:url)
        XCTAssertEqual(try db.beers().first?.brew_name,"Legacy beer")
        XCTAssertEqual(try db.preference("custom"),"original value")
        XCTAssertTrue(try db.rows("PRAGMA table_info(allbeers)").contains { $0["name"] == "enrichment_source" })
    }
    func testNativeKeychainGenerationsRetainSessionAndCleanup() throws {
        let unique = "native_test_" + UUID().uuidString
        let store = CredentialStore(prefix:unique,sessionStorageKey:unique + "_legacy_session")
        defer { try? store.clear() }
        let session = MemberSession(memberId:"test",storeId:"1",storeName:"Fixture",sessionId:"not-a-real-session")
        let cookies = ["PHPSESSID":"not-a-real-session","payload":String(repeating:"ø=",count:2000)]
        try store.save(session:session,cookies:cookies)
        let restored = try store.load()
        XCTAssertEqual(restored.0,session); XCTAssertEqual(restored.1,cookies)
        try store.save(session:session,cookies:["PHPSESSID":"replacement"])
        XCTAssertEqual(try store.load().1,["PHPSESSID":"replacement"])
        try store.clear()
        XCTAssertNil(try store.load().0)
    }
    func testIncompleteCredentialGenerationFailsClosed() throws {
        let unique = "native_test_" + UUID().uuidString
        let store = CredentialStore(prefix:unique,sessionStorageKey:unique + "_legacy_session")
        defer { try? store.clear() }
        try store.write(unique + "_meta",Data(#"{"generation":"interrupted","count":2,"hasSession":true}"#.utf8))
        let session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try store.write(unique + "_interrupted_session",JSONEncoder().encode(session))
        try store.write(unique + "_interrupted_0",Data("e3".utf8))
        XCTAssertThrowsError(try store.load())
        // Supplying the missing chunk repairs this generation without changing its session.
        try store.write(unique + "_interrupted_1",Data("0=".utf8))
        XCTAssertEqual(try store.load().0,session)
        XCTAssertEqual(try store.load().1,[:])
    }

    func testCommittedCookiesWithoutMatchingSessionFailClosed() throws {
        let unique = "native_test_" + UUID().uuidString
        let store = CredentialStore(prefix:unique,sessionStorageKey:unique + "_legacy_session")
        defer { try? store.clear() }
        try store.write(unique + "_meta",Data(#"{"generation":"interrupted","count":1,"hasSession":true}"#.utf8))
        try store.write(unique + "_interrupted_0",Data("e30=".utf8))
        XCTAssertThrowsError(try store.load())
    }

    @MainActor func testBrokenTaplistDoesNotPreventOtherCachesLoading() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder) }
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        try db.execute("INSERT INTO allbeers(id,brew_name) VALUES('broken',NULL)")
        try db.replaceBeers([Beer(id:"tasted",name:"Saved tasting")],tasted:true)
        try db.replaceRewards([Reward(id:"reward",type:"Shirt",redeemed:false)])
        try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"pending"])
        let model = AppModel(api:BeerAPI(configuration:APIConfiguration()),monitorConnectivity:false); model.db = db
        model.session = MemberSession(memberId:"fixture",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        model.allBeers = [Beer(id:"retained",name:"Already displayed")]
        XCTAssertThrowsError(try model.reload())
        XCTAssertEqual(model.allBeers.map(\.id),["retained"])
        XCTAssertEqual(model.tastedBeers.map(\.id),["tasted"])
        XCTAssertEqual(model.rewards.map(\.id),["reward"])
        XCTAssertEqual(model.operations.first?.payload["beerId"],"pending")
    }

    func testRefreshPreservesReviewFieldsAndAdditionalRewardColumns() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:folder) }
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        let beer = try Beer(row:["id":"rated","brew_name":"Rated beer","review_count":"12","review_rating":"4.2","review_ratings":"5"])
        try db.transaction { try db.replaceBeers([beer],tasted:true) }
        XCTAssertEqual(try db.beers(tasted:true).first,beer)
        try db.execute("ALTER TABLE rewards ADD COLUMN legacy_metadata TEXT")
        let reward = Reward(id:"reward",type:"Shirt",redeemed:true)
        try db.transaction { try db.replaceRewards([reward]) }
        XCTAssertEqual(try db.rewards(),[reward])
    }

    func testReadsExpoLegacySessionFromEachSupportedKeychainService() throws {
        for service in ["app:no-auth","app","app:auth"] {
            let unique = "native_test_" + UUID().uuidString
            let store = CredentialStore(prefix:unique,sessionStorageKey:unique + "_session")
            defer { try? store.clear() }
            let member = MemberSession(memberId:"legacy",storeId:"1",storeName:"Fixture",sessionId:"fixture")
            let cookies = ["PHPSESSID":"fixture"]
            // Write the old Expo wire format directly, without using the native save implementation.
            let values: [String:Data] = [
                unique + "_session": try JSONEncoder().encode(member),
                unique + "_meta": Data(#"{"generation":"legacy","count":1}"#.utf8),
                unique + "_legacy_0": Data(try JSONEncoder().encode(cookies).base64EncodedString().utf8)
            ]
            for (key,data) in values {
                let query: [String:Any] = [
                    kSecClass as String:kSecClassGenericPassword,
                    kSecAttrService as String:service,
                    kSecAttrAccount as String:Data(key.utf8),
                    kSecAttrGeneric as String:Data(key.utf8),
                    kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                    kSecValueData as String:data
                ]
                let status = SecItemAdd(query as CFDictionary,nil)
                guard status == errSecSuccess else { throw NSError(domain:NSOSStatusErrorDomain,code:Int(status)) }
            }
            let restored = try store.load()
            XCTAssertEqual(restored.0,member,service)
            XCTAssertEqual(restored.1,cookies,service)
            try store.clear()
            XCTAssertNil(try store.load().0,service)
        }
    }
}
