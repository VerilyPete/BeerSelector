import XCTest
import Security
@testable import BeerSelectorNative

final class LoginRollbackTests: XCTestCase {
    @MainActor private func exercise(existing: Bool, failRollback: Bool) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let prefix = "rollback_test_" + UUID().uuidString
        let clean = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_session")
        let old = MemberSession(memberId:"1",storeId:"1",storeName:"Old",sessionId:"old")
        if existing { try clean.save(session:old,cookies:["PHPSESSID":"old"]) }
        var injected = clean
        var markerWrites = 0
        var denied = 0
        injected.updateItem = { query,values in
            let key = ((query as NSDictionary)[kSecAttrAccount] as? Data).flatMap { String(data:$0,encoding:.utf8) }
            if key == prefix + "_meta" {
                markerWrites += 1
                if failRollback && markerWrites > 1 { denied += 1; return errSecInteractionNotAllowed }
            }
            return SecItemUpdate(query,values)
        }
        let fixture = HTTPFixture()
        let api = fixture.api(configuration:APIConfiguration())
        let model = AppModel(api:api,credentials:injected,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        try model.restoreCredentials()
        let storeURL = existing ? "https://fsbs.beerknurd.com/bk-store-json.php?sid=1" : ""
        try db.setPreference("all_beers_api_url",storeURL)
        try db.setPreference("my_beers_api_url",existing ? "https://fsbs.beerknurd.com/bk-member-json.php?uid=1" : "")
        try db.replaceBeers([Beer(id:"saved",name:"Saved")])
        try db.replaceBeers([Beer(id:"tasted",name:"Tasted")],tasted:true)
        try db.replaceRewards([Reward(id:"reward",type:"Saved",redeemed:false)])
        try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"saved","beerName":"Saved","memberId":"1","storeId":"1"])
        try model.reload()
        // Fail after the first two deletes, proving SQLite rolls back partial work.
        try db.execute("CREATE TRIGGER reject_account_change BEFORE DELETE ON rewards BEGIN SELECT RAISE(ABORT, 'injected database failure'); END")
        var requests = 0
        fixture.handler = { request in
            requests += 1
            guard request.url!.path == "/member-dash.php" else { throw URLError(.unsupportedURL) }
            return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
        }
        defer { fixture.handler = nil; try? clean.clear(); try? FileManager.default.removeItem(at:folder) }
        let url = api.configuration.endpoint("member-dash.php")
        let cookies = ["member_id":"2","store__id":"2","PHPSESSID":"new"].map {
            HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])!
        }
        do { try await model.completeLogin(url:url,nativeCookies:cookies); XCTFail("Expected database failure") }
        catch { guard case BeerError.storage = error else { return XCTFail("Unexpected error: \(error)") } }
        XCTAssertGreaterThan(markerWrites,0,"New credentials reached their commit marker")
        XCTAssertEqual(requests,1)
        let reopened = try BeerDatabase(url:db.url)
        XCTAssertEqual(try reopened.beers().map(\.id),["saved"])
        XCTAssertEqual(try reopened.beers(tasted:true).map(\.id),["tasted"])
        XCTAssertEqual(try reopened.rewards().map(\.id),["reward"])
        XCTAssertEqual(try reopened.operations().count,1)
        let restarted = AppModel(api:api,credentials:clean,monitorConnectivity:false); restarted.db = reopened
        if failRollback {
            XCTAssertGreaterThan(denied,0)
            XCTAssertNil(model.session,"A mixed persistent account must not remain usable")
            XCTAssertTrue(model.tastedBeers.isEmpty)
            XCTAssertTrue(model.rewards.isEmpty)
            XCTAssertFalse(model.configured)
            XCTAssertThrowsError(try restarted.restoreCredentials(),"Restart must reject the incomplete switch")
            try restarted.reload()
            XCTAssertNil(restarted.session)
            XCTAssertTrue(restarted.tastedBeers.isEmpty)
            XCTAssertTrue(restarted.rewards.isEmpty)
            // Another failed save must not clear the durable protection.
            do { try await model.completeLogin(url:url,nativeCookies:cookies); XCTFail("Expected another failed save") }
            catch {}
            XCTAssertNotNil(try reopened.preference("native_account_transition"))
            XCTAssertNil(model.session)
            // Once storage recovers, a full login replaces the old member cache and
            // clears the marker atomically with the new account configuration.
            try db.execute("DROP TRIGGER reject_account_change")
            fixture.handler = { request in
                switch request.url!.path {
                case "/member-dash.php": return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
                case "/bk-store-json.php": return (200,Data(#"[{"id":"new","brew_name":"New"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                case "/memberQueues.php": return (200,Data("<p>No beers currently in your queue.</p>".utf8))
                default: throw URLError(.unsupportedURL)
                }
            }
            try await restarted.completeLogin(url:url,nativeCookies:cookies)
            XCTAssertEqual(restarted.session?.memberId,"2")
            XCTAssertTrue(restarted.configured)
            XCTAssertNil(try reopened.preference("native_account_transition"))
            XCTAssertTrue(try reopened.beers(tasted:true).isEmpty)
            XCTAssertTrue(try reopened.rewards().isEmpty)
            XCTAssertEqual(try clean.load().0?.memberId,"2")
            let recovered = AppModel(api:api,credentials:clean,monitorConnectivity:false); recovered.db = reopened
            try recovered.restoreCredentials(); try recovered.reload()
            XCTAssertEqual(recovered.session?.memberId,"2")
            XCTAssertTrue(recovered.tastedBeers.isEmpty)
        } else {
            XCTAssertEqual(model.session,existing ? old : nil)
            XCTAssertEqual(try clean.load().0,existing ? old : nil)
            XCTAssertEqual(try reopened.preference("all_beers_api_url"),storeURL)
            try restarted.restoreCredentials(); try restarted.reload()
            XCTAssertEqual(restarted.session,existing ? old : nil)
            XCTAssertEqual(restarted.tastedBeers.map(\.id),existing ? ["tasted"] : [])
        }
    }
    @MainActor func testDatabaseFailureRestoresPreviousAccount() async throws { try await exercise(existing:true,failRollback:false) }
    @MainActor func testDatabaseFailureOnFirstLoginRestoresSignedOutState() async throws { try await exercise(existing:false,failRollback:false) }
    @MainActor func testFailedCredentialRollbackBlocksMixedAccountAcrossRestart() async throws { try await exercise(existing:true,failRollback:true) }
}
