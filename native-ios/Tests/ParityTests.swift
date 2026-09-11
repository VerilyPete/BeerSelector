import XCTest
import UIKit
import SQLite3
@testable import BeerSelectorNative

final class ParityTests: XCTestCase {
    func testCustomFontsAreBundledAndRegistered() {
        for name in ["SpaceGrotesk-Regular","SpaceGrotesk-SemiBold","SpaceGrotesk-Bold","SpaceMono-Regular","DSEG7Classic-Bold","BeerIcons"] {
            XCTAssertNotNil(Bundle.main.url(forResource:name,withExtension:"ttf"),name)
            XCTAssertNotNil(UIFont(name:name == "BeerIcons" ? Robo.beerIconFont : name,size:14),name)
        }
    }
    func testUntastedIsSetDifferenceNotCountSubtraction() {
        let all = [Beer(id:"1",name:"One"),Beer(id:"2",name:"Two")]
        let tasted = [Beer(id:"1",name:"One"),Beer(id:"elsewhere",name:"Another location")]
        XCTAssertEqual(BeerFilter.untasted(all:all,tasted:tasted).map(\.id),["2"])
    }
    func testMissingABVSortsLastInBothDirections() {
        var a = Beer(id:"a",name:"A"); a.abv = 8
        var b = Beer(id:"b",name:"B"); b.abv = 4
        let unknown = Beer(id:"c",name:"C")
        var filter = BeerFilter(); filter.sort = .abv
        XCTAssertEqual(filter.apply([unknown,a,b]).map(\.id),["a","b","c"])
        filter.ascending = true
        XCTAssertEqual(filter.apply([unknown,a,b]).map(\.id),["b","a","c"])
    }
    func testFilterMatchesLocationAndContainer() {
        var beer = Beer(id:"1",name:"Porter"); beer.brewer_loc = "Austin, TX"; beer.brew_container = "Draught"
        var filter = BeerFilter(); filter.search = "austin"; filter.container = .draft
        XCTAssertEqual(filter.apply([beer]).count,1)
        filter.container = .cans; XCTAssertTrue(filter.apply([beer]).isEmpty)
    }
    func testTastedDateSortUsesCalendarDates() {
        var a = Beer(id:"a",name:"A"); a.tasted_date = "12/31/2025"
        var b = Beer(id:"b",name:"B"); b.tasted_date = "01/01/2026"
        XCTAssertEqual(BeerFilter().apply([a,b],tasted:true).map(\.id),["b","a"])
    }
    func testContainerPriority() throws {
        let beer = try Beer(row:["id":"1","brew_name":"Flight","brew_container":"16 oz draft","brew_style":"Lager","abv":"9"])
        XCTAssertEqual(beer.container_type,"flight")
        let bottle = try Beer(row:["id":"2","brew_name":"Flight","brew_container":"Bottle"])
        XCTAssertEqual(bottle.container_type,"bottle")
        let size = try Beer(row:["id":"3","brew_name":"Strong","brew_container":"16 oz draft","abv":"9"])
        XCTAssertEqual(size.container_type,"pint")
    }
    func testMalformedPayloadDoesNotBecomeEmptySnapshot() throws {
        XCTAssertThrowsError(try BeerAPI.parseBeers(Data(#"[{}, {"brewInStock": "broken"}]"#.utf8)))
        XCTAssertThrowsError(try BeerAPI.parseBeers(Data(#"[{}, {"brewInStock": []}]"#.utf8)))
        XCTAssertThrowsError(try BeerAPI.parseBeers(Data(#"[{}, {"tasted_brew_current_round": {}}]"#.utf8),tasted:true))
        XCTAssertTrue(try BeerAPI.parseBeers(Data(#"[{}, {"tasted_brew_current_round": []}]"#.utf8),tasted:true).isEmpty)
        XCTAssertThrowsError(try BeerAPI.parseRewards(Data(#"[{},{},{"reward":"broken"}]"#.utf8)))
        XCTAssertTrue(try BeerAPI.parseRewards(Data(#"[{},{},{"reward":[]}]"#.utf8)).isEmpty)
    }
    func testProxyNormalizationAndNullABV() throws {
        let data = Data(#"{"beers":[{"id":"1","brew_name":"Test","enriched_abv":5.2,"enrichment_source":"description-fallback"},{"id":"2","brew_name":"Unknown","enriched_abv":null}]}"#.utf8)
        let beers = try BeerAPI.parseBeers(data,proxy:true)
        XCTAssertEqual(beers[0].abv,5.2); XCTAssertEqual(beers[0].enrichment_source,"description"); XCTAssertNil(beers[1].abv)
    }
    func testQueueHTMLAndFormEscaping() throws {
        let html = #"<h3 class="brewName">A &amp; B (Draft)<div class="brew_added_date">Sep 10, 2026</div></h3><a href="deleteQueuedBrew.php?cid=123">Delete</a>"#
        let queue = try BeerAPI.parseQueue(Data(html.utf8))
        XCTAssertEqual(queue,[QueueEntry(id:"123",name:"A & B (Draft)",date:"Sep 10, 2026")])
        XCTAssertEqual(String(decoding:BeerAPI.form(["name":"A&B + 5%"]),as:UTF8.self),"name=A%26B%20%2B%205%25")
    }
    func testTrustChecksRejectLookalikesAndQuerySpoofing() {
        let c = APIConfiguration()
        XCTAssertTrue(c.trustedLogin(URL(string:"https://tapthatapp.beerknurd.com/member-dash.php")!))
        XCTAssertFalse(c.trustedLogin(URL(string:"https://tapthatapp.beerknurd.com.evil.test/member-dash.php")!))
        XCTAssertFalse(c.trustedLogin(URL(string:"http://tapthatapp.beerknurd.com/member-dash.php")!))
        XCTAssertFalse(APIConfiguration.dataURL(URL(string:"https://evil.test/bk-member-json.php?uid=1")!))
    }
    func testMigrationPreservesSettingsBeersRewardsAndOperations() throws {
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
    func testLegacyKeychainChunksRetainSessionAndCleanup() throws {
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
        try store.write(unique + "_interrupted_0",Data("e30=".utf8))
        XCTAssertThrowsError(try store.load())
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
        let model = AppModel(); model.db = db
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

}
