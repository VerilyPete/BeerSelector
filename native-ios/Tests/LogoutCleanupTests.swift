import XCTest
import Security
@testable import BeerSelectorNative

final class LogoutCleanupTests: XCTestCase {
    private final class Probe {
        var db: BeerDatabase?
        var rejectDeletes = false
        var deletes = 0
        var markerAtFirstDelete: String?
        var holdLogout: (@MainActor () async -> Void)?
    }
    @MainActor private struct Harness {
        let folder: URL
        let clean: CredentialStore
        let probe: Probe
        let fixture: HTTPFixture
        let model: AppModel
        let db: BeerDatabase
        func restarted() throws -> AppModel {
            let fresh = AppModel(api:model.api,credentials:clean,monitorConnectivity:false); fresh.db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
            return fresh
        }
        func newMemberCookies() -> [HTTPCookie] {
            let url = model.api.configuration.endpoint("member-dash.php")
            return ["member_id":"2","store__id":"2","PHPSESSID":"new"].map { HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])! }
        }
        func loginNewMember() async throws {
            try await model.completeLogin(url:model.api.configuration.endpoint("member-dash.php"),nativeCookies:newMemberCookies())
        }
        func close() { fixture.handler = nil; try? clean.clear(); try? FileManager.default.removeItem(at:folder) }
    }
    @MainActor private func harness() throws -> Harness {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let prefix = "logout_cleanup_" + UUID().uuidString
        let clean = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_session")
        let probe = Probe()
        var injected = clean
        injected.deleteItem = { query in
            if probe.deletes == 0 { probe.markerAtFirstDelete = (try? probe.db?.preference("native_account_transition")) ?? nil }
            probe.deletes += 1
            return probe.rejectDeletes ? errSecInteractionNotAllowed : SecItemDelete(query)
        }
        let fixture = HTTPFixture()
        fixture.handler = { request in
            switch request.url!.path {
            case "/logout.php": if let hold = probe.holdLogout { await hold() }; return (200,Data())
            case "/member-dash.php": return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
            case "/bk-store-json.php": return (200,Data(#"[{"id":"new","brew_name":"New"}]"#.utf8))
            case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
            case "/memberQueues.php": return (200,Data("<p>No beers currently in your queue.</p>".utf8))
            default: throw URLError(.unsupportedURL)
            }
        }
        let model = AppModel(api:fixture.api(configuration:APIConfiguration()),credentials:injected,monitorConnectivity:false)
        model.webCookieCleanup = {}; model.activityCleanup = {}
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db; probe.db = db
        try clean.save(session:MemberSession(memberId:"1",storeId:"1",storeName:"Old",sessionId:"old"),cookies:["PHPSESSID":"old"])
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        try model.restoreCredentials()
        return Harness(folder:folder,clean:clean,probe:probe,fixture:fixture,model:model,db:db)
    }

    @MainActor func testFailedCredentialClearCannotBeRestoredOnNextLaunch() async throws {
        let h = try harness(); defer { h.close() }
        h.probe.rejectDeletes = true
        let outcome = await h.model.logout()
        XCTAssertFalse(outcome.credentialsCleared)
        XCTAssertTrue(h.model.error?.contains("Keychain error \(errSecInteractionNotAllowed)") == true,h.model.error ?? "nil")
        XCTAssertNotNil(try h.clean.load().0,"Rejected deletes leave a complete, readable credential pair")
        let fresh = try h.restarted()
        XCTAssertThrowsError(try fresh.restoreCredentials())
        XCTAssertNil(fresh.session)
    }
    @MainActor func testRestoreBlockIsPersistedBeforeCredentialsAreDeleted() async throws {
        let h = try harness(); defer { h.close() }
        _ = await h.model.logout()
        XCTAssertGreaterThan(h.probe.deletes,0)
        XCTAssertEqual(h.probe.markerAtFirstDelete,"pending","Termination mid-clear must leave restoration blocked")
    }
    @MainActor func testFailedURLResetCannotRollBackRestoreBlock() async throws {
        let h = try harness(); defer { h.close() }
        for timing in ["INSERT","UPDATE"] {
            try h.db.execute("CREATE TRIGGER reject_url_\(timing) BEFORE \(timing) ON preferences WHEN NEW.key = 'all_beers_api_url' BEGIN SELECT RAISE(ABORT,'injected'); END")
        }
        h.probe.rejectDeletes = true
        _ = await h.model.logout()
        XCTAssertEqual(try h.db.preference("native_account_transition"),"pending")
        let fresh = try h.restarted()
        XCTAssertThrowsError(try fresh.restoreCredentials())
        XCTAssertNil(fresh.session)
    }
    @MainActor func testSuccessfulLogoutClearsCredentialsAndRestoreBlock() async throws {
        let h = try harness(); defer { h.close() }
        let outcome = await h.model.logout()
        XCTAssertTrue(outcome.credentialsCleared)
        XCTAssertNil(try h.db.preference("native_account_transition"))
        let fresh = try h.restarted()
        try fresh.restoreCredentials()
        XCTAssertNil(fresh.session)
    }
    @MainActor func testLoginAfterFailedLogoutCleanupIsRestored() async throws {
        let h = try harness(); defer { h.close() }
        h.probe.rejectDeletes = true
        _ = await h.model.logout()
        h.probe.rejectDeletes = false
        try await h.loginNewMember()
        XCTAssertNil(try h.db.preference("native_account_transition"))
        let fresh = try h.restarted()
        try fresh.restoreCredentials()
        XCTAssertEqual(fresh.session?.memberId,"2")
    }

    @MainActor func testResetEmptiesAccountDataAndKeepsBeerFeedback() async throws {
        let h = try harness(); defer { h.close() }
        try h.db.replaceBeers([Beer(id:"saved",name:"Saved")])
        try h.db.replaceBeers([Beer(id:"tasted",name:"Tasted")],tasted:true)
        try h.db.replaceRewards([Reward(id:"reward",type:"Saved",redeemed:false)])
        try h.db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"saved","beerName":"Saved","memberId":"1","storeId":"1"])
        try h.db.execute("INSERT INTO recent_tastings(account,event,day,beer) VALUES('account','event',0,'{}')")
        try h.db.execute("INSERT INTO tasting_baseline(account,event,day) VALUES('account','event',0)")
        try h.db.execute("INSERT INTO beer_choices(account,id,day,context) VALUES('account','choice',0,'{}')")
        try h.db.saveBeerFeedback(BeerFeedback(beer:Beer(id:"liked",name:"Liked"),rating:.liked),account:"account")
        await h.model.resetAppData()
        for table in ["allbeers","tasted_brew_current_round","rewards","operation_queue","recent_tastings","tasting_baseline","beer_choices","preferences"] {
            XCTAssertEqual(try h.db.rows("SELECT COUNT(*) AS count FROM \(table)").first?["count"],"0",table)
        }
        XCTAssertEqual(try h.db.beerFeedback(account:"account").map(\.id),["liked"])
    }
    @MainActor func testResetAfterFailedCredentialClearKeepsRestoreBlockAndError() async throws {
        let h = try harness(); defer { h.close() }
        h.probe.rejectDeletes = true
        await h.model.resetAppData()
        XCTAssertTrue(h.model.error?.contains("Keychain error \(errSecInteractionNotAllowed)") == true,"Credential cleanup failure must stay visible: \(h.model.error ?? "nil")")
        let fresh = try h.restarted()
        XCTAssertThrowsError(try fresh.restoreCredentials())
        XCTAssertNil(fresh.session)
    }
    @MainActor func testStaleResetCannotWipeNewerAccount() async throws {
        let h = try harness(); defer { h.close() }
        let held = expectation(description:"Remote logout suspended")
        var release: CheckedContinuation<Void,Never>?
        h.probe.holdLogout = { await withCheckedContinuation { release = $0; held.fulfill() } }
        defer { release?.resume() }
        let reset = Task { await h.model.resetAppData() }
        await fulfillment(of:[held],timeout:3)
        h.probe.holdLogout = nil
        try await h.loginNewMember()
        let errorBeforeRelease = h.model.error
        release?.resume(); release = nil
        await reset.value
        XCTAssertEqual(try h.db.beers().map(\.id),["new"])
        XCTAssertEqual(try h.clean.load().0?.memberId,"2")
        XCTAssertEqual(try h.db.preference("all_beers_api_url"),"https://fsbs.beerknurd.com/bk-store-json.php?sid=2")
        XCTAssertEqual(h.model.error,errorBeforeRelease)
    }
}
