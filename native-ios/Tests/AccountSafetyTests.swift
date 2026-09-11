import XCTest
import Combine
@testable import BeerSelectorNative

final class AccountSafetyTests: XCTestCase {
    @MainActor private func withModel(_ body: (AppModel, BeerDatabase, HTTPFixture, CredentialStore) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let key = "account_test_" + UUID().uuidString
        let credentials = CredentialStore(prefix:key,sessionStorageKey:key + "_session")
        let fixture = HTTPFixture()
        var configuration = APIConfiguration()
        configuration.enrichmentURL = nil
        configuration.enrichmentKey = nil
        let model = AppModel(api:fixture.api(configuration:configuration),credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.db = db
        let member = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"old-session")
        model.session = member
        try credentials.save(session:member,cookies:[:])
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        defer { fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        try await body(model,db,fixture,credentials)
    }

    @MainActor private func login(_ model: AppModel, member: String = "2") async throws {
        let url = model.api.configuration.endpoint("member-dash.php")
        let values = ["member_id":member,"store__id":member,"PHPSESSID":"new-session"]
        let cookies = values.map { name,value in
            HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:name, .value:value])!
        }
        try await model.completeLogin(url:url,nativeCookies:cookies)
    }

    private func response(_ request: URLRequest) throws -> (Int, Data) {
        switch request.url!.path {
        case "/member-dash.php":
            return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
        case "/bk-store-json.php": return (200,Data(#"[{"id":"new-store","brew_name":"New store beer"}]"#.utf8))
        case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[{"id":"new-tasting","brew_name":"New tasting"}]},{"reward":[]}]"#.utf8))
        case "/memberQueues.php": return (200,Data("<html></html>".utf8))
        case "/logout.php": return (200,Data())
        default: throw URLError(.unsupportedURL)
        }
    }

    @MainActor func testNewLoginRefreshesWithoutWaitingForPreviousAccountsRefresh() async throws {
        try await withModel { model,db,fixture,credentials in
            let started = self.expectation(description:"Old store request is in flight")
            let committed = self.expectation(description:"New session committed")
            var release: CheckedContinuation<Void,Never>?
            var pathsAfterSwitch: [String] = []
            fixture.handler = { request in
                if request.url!.query == "sid=1" {
                    await withCheckedContinuation { release = $0; started.fulfill() }
                    return (200,Data(#"[{"id":"stale","brew_name":"Old store"}]"#.utf8))
                }
                pathsAfterSwitch.append(request.url!.path)
                return try self.response(request)
            }
            let subscription = model.$session.sink { if $0?.memberId == "2" { committed.fulfill() } }
            defer { subscription.cancel(); release?.resume() }
            let oldRefresh = Task { await model.refresh() }
            await self.fulfillment(of:[started],timeout:3)
            let login = Task { try await self.login(model) }
            await self.fulfillment(of:[committed],timeout:3)
            // The new account must be able to refresh while the old response is withheld.
            let refreshed = self.expectation(description:"New account refresh completes independently")
            let observer = model.$tastedBeers.sink { if $0.map(\.id) == ["new-tasting"] { refreshed.fulfill() } }
            await self.fulfillment(of:[refreshed],timeout:3)
            observer.cancel()
            release?.resume(); release = nil
            await oldRefresh.value
            try await login.value
            XCTAssertEqual(model.allBeers.map(\.id),["new-store"])
            XCTAssertEqual(try db.beers().map(\.id),["new-store"])
            XCTAssertEqual(model.tastedBeers.map(\.id),["new-tasting"])
            XCTAssertEqual(try credentials.load().0?.memberId,"2")
            XCTAssertEqual(pathsAfterSwitch.filter { $0 == "/bk-member-json.php" }.count,1)
            XCTAssertNil(model.error)
        }
    }

    @MainActor func testTaplistResponseAfterLogoutPreservesCacheAndStopsMemberRequests() async throws {
        try await withModel { model,db,fixture,_ in
            try db.replaceBeers([Beer(id:"saved",name:"Saved")])
            try db.setPreference("last_all_beers_refresh","123")
            try model.reload()
            var memberRequests = 0
            fixture.handler = { request in
                if request.url!.path == "/bk-store-json.php" { await model.logout() }
                if request.url!.path == "/bk-member-json.php" { memberRequests += 1 }
                return try self.response(request)
            }
            await model.refresh()
            XCTAssertNil(model.session)
            XCTAssertEqual(try db.beers().map(\.id),["saved"])
            XCTAssertEqual(try db.preference("last_all_beers_refresh"),"123")
            XCTAssertTrue(model.tastedBeers.isEmpty)
            XCTAssertEqual(memberRequests,0)
            XCTAssertFalse(model.refreshing)
            XCTAssertNil(model.error)
        }
    }

    @MainActor func testLoginResponseAfterLogoutCannotRestoreCredentials() async throws {
        try await withModel { model,db,fixture,credentials in
            fixture.handler = { request in
                if request.url!.path == "/member-dash.php" { await model.logout() }
                return try self.response(request)
            }
            do { try await self.login(model); XCTFail("Stale login must be rejected") }
            catch { guard case BeerError.changedAccount = error else { return XCTFail("Unexpected error: \(error)") } }
            XCTAssertNil(model.session)
            XCTAssertNil(try credentials.load().0)
            XCTAssertEqual(try db.preference("all_beers_api_url"),"")
        }
    }

    @MainActor func testAutoLoginResponseAfterLogoutCannotRestoreCredentials() async throws {
        try await withModel { model,_,fixture,credentials in
            let old = model.session!
            fixture.handler = { request in
                if request.url!.path == "/auto-login.php" {
                    await model.logout()
                    let data = try JSONEncoder().encode(old)
                    return (200,Data("{\"session\":".utf8) + data + Data("}".utf8))
                }
                return try self.response(request)
            }
            do { try await model.autoLogin(); XCTFail("Stale auto-login must be rejected") }
            catch { guard case BeerError.changedAccount = error else { return XCTFail("Unexpected error: \(error)") } }
            XCTAssertNil(model.session)
            XCTAssertNil(try credentials.load().0)
        }
    }

    @MainActor private func checkInAcrossSwitch(fails: Bool) async throws {
        try await withModel { model,db,fixture,_ in
            for id in ["first","second"] {
                try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":id,"beerName":id,"memberId":"1","storeId":"1"])
            }
            var submissions = 0
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" {
                    submissions += 1
                    try await self.login(model)
                    if fails { throw URLError(.networkConnectionLost) }
                    return (200,Data(#"{"success":true}"#.utf8))
                }
                return try self.response(request)
            }
            await model.processOperations()
            XCTAssertEqual(submissions,1,"Do not submit the next old-account operation")
            XCTAssertEqual(model.session?.memberId,"2")
            XCTAssertTrue(model.queuedBeerIDs.isEmpty)
            XCTAssertNil(model.notice)
            XCTAssertNil(model.error)
            let saved = try db.operations()
            XCTAssertEqual(saved.count,2,"An ambiguous in-flight submission stays available for review")
            XCTAssertEqual(saved.filter { $0.status == "retrying" }.count,1)
            XCTAssertEqual(saved.filter { $0.status == "pending" }.count,1)
            XCTAssertTrue(saved.allSatisfy { $0.retryCount == 0 })
            await model.processOperations()
            XCTAssertEqual(submissions,1,"Neither old operation may replay under the new account")
        }
    }
    @MainActor func testCheckInSuccessAfterSwitchCannotAlterNewAccountsQueue() async throws { try await checkInAcrossSwitch(fails:false) }
    @MainActor func testCheckInFailureAfterSwitchCannotAlterNewAccountsQueue() async throws { try await checkInAcrossSwitch(fails:true) }

    @MainActor func testQueueResponseAfterLogoutCannotRestoreQueue() async throws {
        try await withModel { model,_,fixture,_ in
            fixture.handler = { request in
                if request.url!.path == "/memberQueues.php" {
                    await model.logout()
                    return (200,Data(#"<h3 class="brewName">Old beer<div class="brew_added_date">Sep 11, 2026</div></h3><a href="deleteQueuedBrew.php?cid=123">Delete</a>"#.utf8))
                }
                return try self.response(request)
            }
            await model.refreshQueue()
            XCTAssertNil(model.session)
            XCTAssertTrue(model.queue.isEmpty)
            XCTAssertTrue(model.queuedBeerIDs.isEmpty)
            XCTAssertFalse(model.loadingQueue)
            XCTAssertNil(model.error)
        }
    }
}
