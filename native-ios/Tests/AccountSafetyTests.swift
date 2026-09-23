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
        // Account tests verify queue ownership without starting OS Live Activities.
        model.activityUpdate = { _,_ in }
        let member = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"old-session")
        model.session = member
        try credentials.save(session:member,cookies:[:])
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        defer { fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        try await body(model,db,fixture,credentials)
    }

    @MainActor func testRestoredAccountRecoversMissingDataLinksOnRefresh() async throws {
        try await withModel { model,db,fixture,credentials in
            try db.execute("DELETE FROM preferences WHERE key IN ('all_beers_api_url','my_beers_api_url')")
            model.session = nil
            try model.restoreCredentials()
            XCTAssertTrue(model.configured,"Saved credentials must not lead to Get Started when the database is empty")
            var dashboardReads = 0
            fixture.handler = { request in
                if request.url!.path == "/member-dash.php" {
                    dashboardReads += 1
                    return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=987 https://fsbs.beerknurd.com/bk-store-json.php?sid=1".utf8))
                }
                return try self.response(request)
            }
            await model.refresh()
            XCTAssertEqual(dashboardReads,1)
            XCTAssertEqual(try db.preference("my_beers_api_url"),"https://fsbs.beerknurd.com/bk-member-json.php?uid=987","Use the server's data link, not a guessed member ID")
            XCTAssertEqual(model.allBeers.map(\.id),["new-store"])
            XCTAssertEqual(model.tastedBeers.map(\.id),["new-tasting"])
            XCTAssertEqual(try credentials.load().0?.identity,model.session?.identity)
            XCTAssertNil(model.error)
            await model.refresh()
            XCTAssertEqual(dashboardReads,1,"Existing links do not require another dashboard fetch")
        }
    }
    @MainActor func testDataLinkRecoveryFailureKeepsAccountAndCanBeRetried() async throws {
        try await withModel { model,db,fixture,_ in
            try db.setPreference("all_beers_api_url","")
            fixture.handler = { _ in (200,Data("Sign in".utf8)) }
            await model.refresh()
            XCTAssertTrue(model.configured)
            XCTAssertTrue(model.isMember)
            XCTAssertNotNil(model.error)
            XCTAssertFalse(model.refreshing)
            XCTAssertEqual(try db.preference("all_beers_api_url"),"")
            fixture.handler = { request in
                if request.url!.path == "/member-dash.php" {
                    return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=1 https://fsbs.beerknurd.com/bk-store-json.php?sid=1".utf8))
                }
                return try self.response(request)
            }
            await model.refresh()
            XCTAssertNil(model.error)
            XCTAssertFalse(model.allBeers.isEmpty)
        }
    }
    @MainActor func testDataLinkRecoveryRejectsDifferentStore() async throws {
        try await withModel { model,db,fixture,_ in
            try db.setPreference("all_beers_api_url","")
            fixture.handler = { try self.response($0) }
            await model.refresh()
            XCTAssertNotNil(model.error)
            XCTAssertEqual(try db.preference("all_beers_api_url"),"")
            XCTAssertTrue(model.allBeers.isEmpty)
        }
    }
    @MainActor func testDataLinkRecoveryCannotRestoreConfigurationAfterLogout() async throws {
        try await withModel { model,db,fixture,_ in
            try db.setPreference("all_beers_api_url","")
            model.activityCleanup = {}; model.webCookieCleanup = {}
            fixture.handler = { request in
                if request.url!.path == "/member-dash.php" {
                    await model.logout()
                    return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=1 https://fsbs.beerknurd.com/bk-store-json.php?sid=1".utf8))
                }
                return try self.response(request)
            }
            await model.refresh()
            XCTAssertFalse(model.configured)
            XCTAssertNil(model.session)
            XCTAssertEqual(try db.preference("all_beers_api_url"),"")
            XCTAssertTrue(model.allBeers.isEmpty)
        }
    }
    @MainActor func testRestoredVisitorRecoversTaplistWithoutMemberDashboard() async throws {
        try await withModel { model,db,fixture,_ in
            model.session = MemberSession(memberId:"visitor",storeId:"1",storeName:"Fixture",sessionId:"visitor_session")
            try db.setPreference("all_beers_api_url",nil)
            fixture.handler = { request in
                XCTAssertEqual(request.url!.path,"/bk-store-json.php")
                return try self.response(request)
            }
            await model.refresh()
            XCTAssertTrue(model.configured)
            XCTAssertFalse(model.isMember)
            XCTAssertNil(model.error)
            XCTAssertEqual(try db.preference("my_beers_api_url"),"none://visitor_mode")
            XCTAssertFalse(model.allBeers.isEmpty)
        }
    }

    @MainActor func testFinderRefreshPreservesSavedTaplistOnNetworkFailureAndRecoversOnRetry() async throws {
        try await withModel { model,db,fixture,_ in
            try db.replaceBeers([Beer(id:"saved",name:"Saved beer")])
            try model.reload()
            var networkFails = true
            var queueRequests = 0
            fixture.handler = { request in
                if request.url!.path == "/memberQueues.php" { queueRequests += 1 }
                if networkFails { throw URLError(.networkConnectionLost) }
                return try self.response(request)
            }

            await model.refreshFinder()

            XCTAssertEqual(model.allBeers.map(\.id),["saved"])
            XCTAssertEqual(model.untasted.map(\.id),["saved"])
            XCTAssertEqual(try db.beers().map(\.id),["saved"])
            XCTAssertNotNil(model.error)
            XCTAssertNotNil(model.queueError)
            XCTAssertEqual(queueRequests,1,"Finder must attempt queue refresh even when the taplist request fails")
            XCTAssertFalse(model.refreshing)
            XCTAssertFalse(model.loadingQueue)

            networkFails = false
            await model.refreshFinder()

            XCTAssertEqual(model.allBeers.map(\.id),["new-store"])
            XCTAssertEqual(model.untasted.map(\.id),["new-store"])
            XCTAssertEqual(try db.beers().map(\.id),["new-store"])
            XCTAssertNil(model.error)
            XCTAssertNil(model.queueError)
            XCTAssertTrue(model.queueLoaded)
            XCTAssertEqual(queueRequests,2,"Retry must refresh queue availability as well as beer data")
            XCTAssertFalse(model.refreshing)
            XCTAssertFalse(model.loadingQueue)
        }
    }

    @MainActor func testOfflineCheckInHidesBeerUntilSavedRequestIsRemoved() async throws {
        try await withModel { model,db,_,_ in
            let beer = Beer(id:"offline",name:"Offline beer")
            try db.replaceBeers([beer]); try model.reload(); model.offline = true
            await model.checkIn(beer)
            XCTAssertTrue(model.untasted.isEmpty)
            let operation = try XCTUnwrap(model.operations.first)
            try db.execute("UPDATE operation_queue SET status='failed' WHERE id=?",[operation.id]); try model.reload()
            XCTAssertEqual(model.untasted.map(\.id),[beer.id],"A permanently failed request must return to Finder for review")
            XCTAssertTrue(model.hasSavedCheckIn(beer.id),"Review the saved failure before submitting a duplicate")
            model.removeOperation(operation.id)
            XCTAssertEqual(model.untasted.map(\.id),[beer.id])
        }
    }
    @MainActor func testSavedCheckInAtAnotherStoreDoesNotBlockCurrentStore() async throws {
        try await withModel { model,db,_,_ in
            let beer = Beer(id:"shared",name:"Shared beer")
            try db.replaceBeers([beer])
            try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":beer.id,"beerName":beer.brew_name,"memberId":"1","storeId":"2","storeName":"Other store"])
            try model.reload(); model.offline = true
            await model.checkIn(beer)
            XCTAssertEqual(model.operations.count,2)
            XCTAssertEqual(Set(model.operations.compactMap { $0.payload["storeId"] }),["1","2"])
        }
    }
    @MainActor func testRewardWriteDuringRefreshRequiresFreshMemberSnapshot() async throws {
        try await withModel { model,_,fixture,_ in
            let started = self.expectation(description:"Old member snapshot paused")
            var release: CheckedContinuation<Void,Never>?
            var memberReads = 0
            fixture.handler = { request in
                if request.url!.path == "/bk-member-json.php" {
                    memberReads += 1
                    let redeemed = memberReads == 1 ? "0" : "1"
                    if memberReads == 1 { await withCheckedContinuation { release = $0; started.fulfill() } }
                    return (200,Data("[{},{\"tasted_brew_current_round\":[]},{\"reward\":[{\"reward_id\":\"r\",\"reward_type\":\"Reward\",\"redeemed\":\"\(redeemed)\"}]}]".utf8))
                }
                if request.url!.path == "/addToRewardQueue.php" { return (200,Data()) }
                if request.url!.path == "/memberQueues.php" {
                    // Releasing here guarantees the write completed during the older refresh.
                    release?.resume(); release = nil
                }
                return try self.response(request)
            }
            let refresh = Task { await model.refresh() }
            await fulfillment(of:[started],timeout:3)
            await model.queueReward(Reward(id:"r",type:"Reward",redeemed:false))
            await refresh.value
            XCTAssertEqual(memberReads,2)
            XCTAssertEqual(model.rewards.first?.redeemed,true)
        }
    }

    @MainActor func testFinderRefreshReconcilesRemoteDeletionWithoutLosingOfflineRequest() async throws {
        try await withModel { model,db,fixture,_ in
            let beer = Beer(id:"new-store",name:"New store beer")
            try db.replaceBeers([beer]); try model.reload()
            model.queuedBeerIDs = [beer.id]
            fixture.handler = { try self.response($0) }
            await model.refreshFinder()
            XCTAssertEqual(model.untasted.map(\.id),[beer.id])
            model.offline = true; await model.checkIn(beer)
            await model.refreshFinder()
            XCTAssertTrue(model.untasted.isEmpty,"Remote empty queue must not unhide a saved offline check-in")
        }
    }
    @MainActor func testRewardsFailureAndRecoveryAreAvailableInsideRewardsScreen() async throws {
        try await withModel { model,db,fixture,_ in
            fixture.handler = { request in
                if request.url!.path == "/bk-member-json.php" { return (200,Data("malformed".utf8)) }
                return try self.response(request)
            }
            await model.refreshRewards()
            XCTAssertFalse(model.rewardsLoaded)
            XCTAssertNotNil(model.rewardsError)
            try db.replaceRewards([Reward(id:"saved",type:"Saved",redeemed:false)])
            model.retrySavedRewards()
            XCTAssertEqual(model.rewards.map(\.id),["saved"])
            XCTAssertTrue(model.rewardsLoaded)
            XCTAssertNil(model.rewardsError)
            await model.refreshRewards()
            XCTAssertEqual(model.rewards.map(\.id),["saved"])
            XCTAssertNotNil(model.rewardsError)
            fixture.handler = { try self.response($0) }
            await model.refreshRewards()
            XCTAssertTrue(model.rewards.isEmpty)
            XCTAssertTrue(model.rewardsLoaded)
            XCTAssertNil(model.rewardsError)
        }
    }
    @MainActor func testRewardSubmissionFailureHasLocalFeedbackAndNoSuccess() async throws {
        try await withModel { model,_,fixture,_ in
            fixture.handler = { _ in throw URLError(.networkConnectionLost) }
            await model.queueReward(Reward(id:"r",type:"Reward",redeemed:false))
            XCTAssertNotNil(model.rewardsError)
            XCTAssertNil(model.rewardsNotice)
            XCTAssertTrue(model.busyIDs.isEmpty)
        }
    }
    @MainActor func testForeignOperationRetryIsExplainedAndDoesNotChangeSavedRequest() async throws {
        try await withModel { model,db,fixture,_ in
            try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"b","beerName":"Beer","memberId":"2","storeId":"2","storeName":"Other store"])
            try model.reload()
            let operation = try XCTUnwrap(model.operations.first)
            XCTAssertNotNil(model.operationRestriction(operation))
            var requests = 0
            fixture.handler = { request in requests += 1; return try self.response(request) }
            await model.retryOperation(operation.id)
            XCTAssertEqual(requests,0)
            XCTAssertEqual(try db.operations().first?.status,operation.status)
            XCTAssertEqual(try db.operations().first?.retryCount,0)
        }
    }
    @MainActor func testMalformedQueuePreservesQueueFinderAndActivity() async throws {
        try await withModel { model,_,fixture,_ in
            let saved = QueueEntry(id:"1",name:"Saved",date:"")
            model.queue = [saved]; model.queueLoaded = true; model.queuedBeerIDs = ["beer"]
            var activityUpdates = 0
            model.activityUpdate = { _,_ in activityUpdates += 1 }
            fixture.handler = { _ in (200,Data("<html>Service unavailable</html>".utf8)) }
            await model.refreshQueue()
            XCTAssertEqual(model.queue,[saved]); XCTAssertEqual(model.queuedBeerIDs,["beer"])
            XCTAssertEqual(activityUpdates,0); XCTAssertNotNil(model.queueError)
        }
    }

    @MainActor func testOldMemberResponseCannotReplaceNewRewardsFeedback() async throws {
        try await withModel { model,_,fixture,_ in
            fixture.handler = { request in
                if request.url!.query == "uid=1" {
                    try await self.login(model)
                    model.rewardsError = "New account feedback"
                    return (200,Data("old response".utf8))
                }
                return try self.response(request)
            }
            await model.refresh()
            XCTAssertEqual(model.session?.memberId,"2")
            XCTAssertEqual(model.rewardsError,"New account feedback")
        }
    }

    @MainActor func testRepeatedForegroundRefreshIsThrottled() async throws {
        try await withModel { model,_,fixture,_ in
            model.loading = false
            var requests = 0
            fixture.handler = { request in
                requests += 1
                return try self.response(request)
            }
            await model.foreground()
            let firstRefreshRequests = requests
            XCTAssertGreaterThan(firstRefreshRequests,0)
            await model.foreground()
            XCTAssertEqual(requests,firstRefreshRequests,"Repeated activation must not duplicate refresh requests within 30 seconds")
        }
    }

    @MainActor func testDeepLinksRespectMembershipAndIgnoreOtherSchemes() async throws {
        try await withModel { model,_,_,_ in
            model.loading = false
            for (host,tab) in [("mybeers",AppTab.finder),("beerfinder",.finder),("beerlist",.all),("tastedbrews",.tasted)] {
                model.handleURL(URL(string:"beerselector://" + host)!)
                XCTAssertEqual(model.tab,tab)
            }
            model.handleURL(URL(string:"https://beerlist")!)
            XCTAssertEqual(model.tab,.tasted)
            model.session = nil
            model.tab = .home
            model.handleURL(URL(string:"beerselector://mybeers")!)
            XCTAssertEqual(model.tab,.home)
            XCTAssertTrue(model.showSettings)
            model.handleURL(URL(string:"beerselector://tastedbrews")!)
            XCTAssertEqual(model.tab,.home)
            model.handleURL(URL(string:"beerselector://settings?action=login")!)
            XCTAssertTrue(model.showLogin)
        }
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
        case "/memberQueues.php": return (200,Data("<p>No beers currently in your queue.</p>".utf8))
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

    @MainActor private func mutationAcrossSwitch(reward: Bool, fails: Bool) async throws {
        try await withModel { model,_,fixture,credentials in
            var switched = false
            var lateRequests = 0
            var submissions = 0
            fixture.handler = { request in
                if request.url!.path == (reward ? "/addToRewardQueue.php" : "/deleteQueuedBrew.php") {
                    submissions += 1
                    try await self.login(model)
                    model.notice = "New account notice"
                    model.error = "New account error"
                    switched = true
                    if fails { throw URLError(.networkConnectionLost) }
                    return (200,Data())
                }
                if switched { lateRequests += 1 }
                return try self.response(request)
            }
            if reward { await model.queueReward(Reward(id:"reward",type:"Old reward",redeemed:false)) }
            else { await model.deleteQueueEntry(QueueEntry(id:"entry",name:"Old beer",date:"")) }
            XCTAssertEqual(submissions,1)
            XCTAssertEqual(model.session?.memberId,"2")
            XCTAssertEqual(try credentials.load().0?.memberId,"2")
            XCTAssertEqual(model.notice,"New account notice")
            XCTAssertEqual(model.error,"New account error")
            XCTAssertNil(model.queueError,"Old failures cannot appear in the new account’s queue")
            XCTAssertEqual(lateRequests,0,"Old completion must not trigger new-account refreshes")
        }
    }
    @MainActor func testRewardSuccessAfterSwitchCannotAlterNewAccount() async throws { try await mutationAcrossSwitch(reward:true,fails:false) }
    @MainActor func testRewardFailureAfterSwitchCannotAlterNewAccount() async throws { try await mutationAcrossSwitch(reward:true,fails:true) }
    @MainActor func testDeleteSuccessAfterSwitchCannotRefreshNewAccount() async throws { try await mutationAcrossSwitch(reward:false,fails:false) }
    @MainActor func testDeleteFailureAfterSwitchCannotAlterNewAccount() async throws { try await mutationAcrossSwitch(reward:false,fails:true) }

    @MainActor func testCancelledDashboardLoginPreservesPreviousCommittedAccount() async throws {
        try await withModel { model,db,fixture,credentials in
            let old = model.session
            try db.replaceBeers([Beer(id:"saved",name:"Saved")],tasted:true)
            let reached = self.expectation(description:"Login dashboard request suspended")
            var release: CheckedContinuation<Void,Never>?
            fixture.handler = { request in
                XCTAssertEqual(request.url!.path,"/member-dash.php")
                await withCheckedContinuation { release = $0; reached.fulfill() }
                return try self.response(request)
            }
            let login = Task { try await self.login(model) }
            await self.fulfillment(of:[reached],timeout:3)
            login.cancel()
            release?.resume(); release = nil
            do { try await login.value; XCTFail("Cancelled login must not commit") }
            catch { XCTAssertTrue(Diagnostics.isCancellation(error)) }
            XCTAssertEqual(model.session,old)
            XCTAssertEqual(try credentials.load().0,old)
            XCTAssertEqual(try db.preference("all_beers_api_url"),"https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
            XCTAssertNil(try db.preference("native_account_transition"))
            XCTAssertEqual(try db.beers(tasted:true).map(\.id),["saved"])
        }
    }
    @MainActor func testNewLoginLoadsQueueWhilePreviousAccountsRequestIsStillRunning() async throws {
        try await withModel { model,_,fixture,_ in
            let reached = self.expectation(description:"Old queue request suspended")
            var release: CheckedContinuation<Void,Never>?
            fixture.handler = { request in
                if request.url!.path == "/memberQueues.php" {
                    if request.value(forHTTPHeaderField:"Cookie")?.contains("member_id=1") == true {
                        await withCheckedContinuation { release = $0; reached.fulfill() }
                        return (200,Data(#"<h3 class="brewName">Old beer<div class="brew_added_date">Sep 11, 2026</div></h3><a href="deleteQueuedBrew.php?cid=old">Delete</a>"#.utf8))
                    }
                    return (200,Data(#"<h3 class="brewName">New beer<div class="brew_added_date">Sep 11, 2026</div></h3><a href="deleteQueuedBrew.php?cid=222">Delete</a>"#.utf8))
                }
                return try self.response(request)
            }
            defer { release?.resume() }
            let old = Task { await model.refreshQueue() }
            await self.fulfillment(of:[reached],timeout:3)
            try await self.login(model)
            XCTAssertEqual(model.queue.map(\.id),["222"],"New login must load its queue without waiting for the old account")
            release?.resume(); release = nil
            await old.value
            XCTAssertEqual(model.queue.map(\.id),["222"])
            XCTAssertFalse(model.loadingQueue)
        }
    }
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
