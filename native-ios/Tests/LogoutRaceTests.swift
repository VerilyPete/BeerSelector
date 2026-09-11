import XCTest
import Combine
@testable import BeerSelectorNative

final class LogoutRaceTests: XCTestCase {
    @MainActor private func exercise(holdCleanup: Bool, cancelLogin: Bool = false) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let prefix = "logout_race_" + UUID().uuidString
        let credentials = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_session")
        let fixture = HTTPFixture()
        let api = fixture.api(configuration:APIConfiguration())
        let model = AppModel(api:api,credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        let old = MemberSession(memberId:"1",storeId:"1",storeName:"Old",sessionId:"old")
        try credentials.save(session:old,cookies:["PHPSESSID":"old"])
        try model.restoreCredentials()
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        let held = expectation(description:"Old logout suspended")
        let dashboard = expectation(description:"New login response received")
        var release: CheckedContinuation<Void,Never>?
        var cleanupCalls = 0
        model.webCookieCleanup = {
            cleanupCalls += 1
            if holdCleanup && cleanupCalls == 1 { await withCheckedContinuation { release = $0; held.fulfill() } }
        }
        fixture.handler = { request in
            switch request.url!.path {
            case "/logout.php":
                XCTAssertTrue(request.value(forHTTPHeaderField:"Cookie")?.contains("old") == true)
                if !holdCleanup { await withCheckedContinuation { release = $0; held.fulfill() } }
                throw URLError(.networkConnectionLost)
            case "/member-dash.php":
                dashboard.fulfill()
                return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
            case "/bk-store-json.php": return (200,Data(#"[{"id":"new","brew_name":"New"}]"#.utf8))
            case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
            case "/memberQueues.php": return (200,Data("<html></html>".utf8))
            default: throw URLError(.unsupportedURL)
            }
        }
        defer { release?.resume(); fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        let logout = Task { await model.logout() }
        await fulfillment(of:[held],timeout:3)
        let url = api.configuration.endpoint("member-dash.php")
        let cookies = ["member_id":"2","store__id":"2","PHPSESSID":"new"].map {
            HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])!
        }
        let premature = XCTestExpectation(description:"Login must not commit during old cookie cleanup")
        premature.isInverted = true
        let observation = model.$session.sink { if holdCleanup && $0?.memberId == "2" { premature.fulfill() } }
        let login = Task { try await model.completeLogin(url:url,nativeCookies:cookies) }
        await fulfillment(of:[dashboard],timeout:3)
        if holdCleanup { await fulfillment(of:[premature],timeout:0.2) }
        else { try await login.value }
        observation.cancel()
        var secondLogout: Task<Void,Never>?
        if cancelLogin {
            let signedOut = expectation(description:"Second logout invalidates pending login")
            let secondObservation = model.$session.dropFirst().sink { if $0 == nil { signedOut.fulfill() } }
            secondLogout = Task { await model.logout() }
            await fulfillment(of:[signedOut],timeout:3)
            secondObservation.cancel()
        }
        release?.resume(); release = nil
        await logout.value
        if let secondLogout {
            await secondLogout.value
            do { try await login.value; XCTFail("Superseded login must not commit") }
            catch { guard case BeerError.changedAccount = error else { return XCTFail("Unexpected error: \(error)") } }
            XCTAssertNil(model.session)
            XCTAssertNil(try credentials.load().0)
            XCTAssertFalse(model.configured)
            return
        }
        try await login.value
        XCTAssertEqual(model.session?.memberId,"2")
        XCTAssertEqual(try credentials.load().0?.memberId,"2")
        XCTAssertEqual(try db.preference("all_beers_api_url"),"https://fsbs.beerknurd.com/bk-store-json.php?sid=2")
        XCTAssertEqual(try db.preference("my_beers_api_url"),"https://fsbs.beerknurd.com/bk-member-json.php?uid=2")
        XCTAssertTrue(model.configured)
        XCTAssertFalse(model.showSettings)
        XCTAssertNil(model.error,"Old server logout failure must not appear in the new session")
        let fresh = AppModel(api:api,credentials:credentials,monitorConnectivity:false); fresh.db = db
        try fresh.restoreCredentials()
        XCTAssertEqual(fresh.session?.memberId,"2")
        XCTAssertTrue(fresh.configured)
    }
    @MainActor func testLoginWaitsForOldLocalCleanup() async throws { try await exercise(holdCleanup:true) }
    @MainActor func testSecondLogoutInvalidatesLoginWaitingForCleanup() async throws { try await exercise(holdCleanup:true,cancelLogin:true) }
    @MainActor func testOldServerLogoutFailureCannotOverwriteNewSession() async throws { try await exercise(holdCleanup:false) }
}
