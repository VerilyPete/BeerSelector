import XCTest
import Combine
@testable import BeerSelectorNative

final class PostLoginCleanupTests: XCTestCase {
    @MainActor private func exercise(visitor: Bool, newLogin: Bool) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let key = "post_login_" + UUID().uuidString
        let credentials = CredentialStore(prefix:key,sessionStorageKey:key + "_session")
        let fixture = HTTPFixture(); let api = fixture.api(configuration:APIConfiguration())
        let model = AppModel(api:api,credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        let held = expectation(description:"First login cleanup suspended")
        var release: CheckedContinuation<Void,Never>?
        var calls = 0
        let cleanup: @MainActor () async -> Void = {
            calls += 1
            if calls == 1 { await withCheckedContinuation { release = $0; held.fulfill() } }
        }
        if visitor { model.webCookieCleanup = cleanup } else { model.activityCleanup = cleanup }
        let secondResponse = XCTestExpectation(description:"Second login fetched dashboard")
        fixture.handler = { request in
            switch request.url!.path {
            case "/member-dash.php":
                let second = request.value(forHTTPHeaderField:"Cookie")?.contains("member_id=2") == true
                if second { secondResponse.fulfill() }
                let id = second ? "2" : "1"
                return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=\(id) https://fsbs.beerknurd.com/bk-store-json.php?sid=\(id)".utf8))
            case "/bk-store-json.php": return (200,Data(#"[{"id":"beer","brew_name":"Beer"}]"#.utf8))
            case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
            case "/memberQueues.php": return (200,Data("<html></html>".utf8))
            case "/logout.php": return (200,Data())
            default: throw URLError(.unsupportedURL)
            }
        }
        defer { release?.resume(); fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        func cookies(_ id: String) -> [HTTPCookie] {
            ["member_id":id,"store__id":id,"PHPSESSID":"session-" + id].map {
                HTTPCookie(properties:[.domain:api.configuration.baseURL.host!, .path:"/", .name:$0.key, .value:$0.value])!
            }
        }
        let first = Task { try await model.completeLogin(url:api.configuration.endpoint(visitor ? "visitor.php" : "member-dash.php"),nativeCookies:cookies("1")) }
        await fulfillment(of:[held],timeout:3)
        if newLogin {
            let premature = XCTestExpectation(description:"Second login must wait for old cleanup"); premature.isInverted = true
            let observer = model.$session.sink { if $0?.memberId == "2" { premature.fulfill() } }
            let second = Task { try await model.completeLogin(url:api.configuration.endpoint("member-dash.php"),nativeCookies:cookies("2")) }
            await fulfillment(of:[secondResponse],timeout:3)
            await fulfillment(of:[premature],timeout:0.2)
            observer.cancel(); release?.resume(); release = nil
            do { try await first.value } catch { guard case BeerError.changedAccount = error else { return XCTFail("Unexpected error: \(error)") } }
            try await second.value
            XCTAssertEqual(model.session?.memberId,"2")
            XCTAssertEqual(try credentials.load().0?.memberId,"2")
            XCTAssertEqual(try db.preference("all_beers_api_url"),"https://fsbs.beerknurd.com/bk-store-json.php?sid=2")
            XCTAssertTrue(model.configured)
            XCTAssertFalse(model.showSettings)
        } else {
            let signedOut = expectation(description:"Logout invalidates pending completion")
            let observer = model.$session.dropFirst().sink { if $0 == nil { signedOut.fulfill() } }
            let logout = Task { await model.logout() }
            await fulfillment(of:[signedOut],timeout:3)
            observer.cancel(); release?.resume(); release = nil
            await logout.value
            do { try await first.value; XCTFail("Old login completion must be rejected") }
            catch { guard case BeerError.changedAccount = error else { return XCTFail("Unexpected error: \(error)") } }
            XCTAssertNil(model.session)
            XCTAssertNil(try credentials.load().0)
            XCTAssertFalse(model.configured)
            XCTAssertTrue(model.showSettings)
            XCTAssertTrue(model.queue.isEmpty)
        }
    }
    @MainActor func testMemberCompletionAfterLogoutCannotCloseSettings() async throws { try await exercise(visitor:false,newLogin:false) }
    @MainActor func testVisitorCompletionAfterLogoutCannotCloseSettings() async throws { try await exercise(visitor:true,newLogin:false) }
    @MainActor func testNewMemberWaitsForVisitorCookieCleanup() async throws { try await exercise(visitor:true,newLogin:true) }
}
