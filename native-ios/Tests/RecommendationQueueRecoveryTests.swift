import XCTest
@testable import BeerSelectorNative

final class RecommendationQueueRecoveryTests: XCTestCase {
    @MainActor private func withModel(_ body: (AppModel,BeerDatabase,HTTPFixture) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let key = UUID().uuidString
        let credentials = CredentialStore(prefix:key,sessionStorageKey:key)
        let fixture = HTTPFixture()
        let model = AppModel(api:fixture.api(configuration:APIConfiguration()),credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.db = db
        model.session = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"fixture")
        try credentials.save(session:model.session!,cookies:[:])
        model.activityUpdate = { _,_ in }; model.activityCleanup = {}; model.webCookieCleanup = {}
        fixture.handler = { _ in (200,Data("No brew in queue".utf8)) }
        defer { fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        try await body(model,db,fixture)
    }

    @MainActor func testNewAndLegacyPendingRecommendationsNeverAutomaticallyReplay() async throws {
        try await withModel { model,db,fixture in
            let payload = ["beerId":"new","beerName":"New beer","memberId":"1","storeId":"1","recommendation":"true"]
            let id = try db.enqueue(type:"CHECK_IN_BEER",payload:payload)
            XCTAssertEqual(try db.operations().first?.status,"failed")
            var writes = 0
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" { writes += 1; return (200,Data()) }
                return (200,Data("No brew in queue".utf8))
            }
            await model.processOperations()
            XCTAssertEqual(writes,0)
            // Older builds could stop after saving pending intent, before dispatch.
            try db.execute("UPDATE operation_queue SET status='pending' WHERE id=?",[id])
            await model.processOperations()
            XCTAssertEqual(writes,0)
            model.db = try BeerDatabase(url:db.url)
            XCTAssertEqual(try model.db!.operations().first?.status,"failed")
            try model.reload()
            await model.processOperations()
            XCTAssertEqual(writes,0)
            await model.retryOperation(id)
            XCTAssertEqual(writes,1)
            XCTAssertTrue(try db.operations().isEmpty)
        }
    }

    @MainActor func testStartupRequiresReviewForInterruptedRecommendationButRecoversOrdinaryRetry() async throws {
        try await withModel { model,db,fixture in
            let payload = ["beerId":"new","beerName":"New beer","memberId":"1","storeId":"1"]
            var recommendation = payload; recommendation["recommendation"] = "true"
            let protected = try db.enqueue(type:"CHECK_IN_BEER",payload:recommendation)
            var ordinary = payload; ordinary["beerId"] = "ordinary"
            let legacy = try db.enqueue(type:"CHECK_IN_BEER",payload:ordinary)
            try db.execute("UPDATE operation_queue SET status='retrying'")
            model.db = try BeerDatabase(url:db.url)
            let operations = try model.db!.operations()
            XCTAssertEqual(operations.first { $0.id == protected }?.status,"failed")
            XCTAssertNotNil(operations.first { $0.id == protected }?.error)
            XCTAssertEqual(operations.first { $0.id == legacy }?.status,"pending")
            var writes = 0
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" { writes += 1; return (200,Data()) }
                return (200,Data("No brew in queue".utf8))
            }
            await model.processOperations()
            XCTAssertEqual(writes,1,"Only the ordinary interrupted check-in may automatically retry")
            XCTAssertEqual(try db.operations().map(\.id),[protected])
            await model.retryOperation(protected)
            XCTAssertEqual(writes,2,"Explicit review/retry may dispatch the recommendation")
            XCTAssertTrue(try db.operations().isEmpty)
        }
    }

    @MainActor func testDispatchedRecommendationSurvivesLogoutAndRestartWithoutReplay() async throws {
        try await withModel { model,db,fixture in
            let owner = model.session
            let beer = Beer(id:"new",name:"New beer")
            model.allBeers = [beer]
            var writes = 0
            fixture.handler = { request in
                if request.url!.path == "/addToQueue.php" {
                    writes += 1
                    let inFlight = try XCTUnwrap(db.operations().first)
                    XCTAssertEqual(inFlight.status,"failed","Review state must be durable before dispatch")
                    model.removeOperation(inFlight.id)
                    XCTAssertEqual(try db.operations().first?.id,inFlight.id,"In-flight operations cannot be removed")
                    if writes == 1 { await model.logout() }
                    return (200,Data())
                }
                return (200,Data("No brew in queue".utf8))
            }
            let result = await model.checkIn(beer,recommendation:true)
            XCTAssertEqual(result,.unavailable)
            XCTAssertTrue(model.busyIDs.isEmpty)
            model.session = owner
            await model.processOperations()
            XCTAssertEqual(writes,1,"Same-owner return must not replay without restarting either")
            model.db = try BeerDatabase(url:db.url)
            await model.processOperations()
            XCTAssertEqual(writes,1)
            let operation = try XCTUnwrap(db.operations().first)
            XCTAssertEqual(operation.status,"failed")
            await model.retryOperation(operation.id)
            XCTAssertEqual(writes,2)
            XCTAssertTrue(try db.operations().isEmpty)
        }
    }

    @MainActor func testSameAccountReauthenticationDuringDispatchStillRequiresReview() async throws {
        try await withModel { model,db,fixture in
            let beer = Beer(id:"new",name:"New beer")
            model.allBeers = [beer]
            var writes = 0
            fixture.handler = { request in
                switch request.url!.path {
                case "/addToQueue.php":
                    writes += 1
                    let url = model.api.configuration.endpoint("member-dash.php")
                    let cookies = ["member_id":"1","store__id":"1","PHPSESSID":"replacement"].map {
                        HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])!
                    }
                    try await model.completeLogin(url:url,nativeCookies:cookies)
                    return (200,Data())
                case "/member-dash.php":
                    return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=1 https://fsbs.beerknurd.com/bk-store-json.php?sid=1".utf8))
                case "/bk-store-json.php": return (200,Data(#"[{"id":"new","brew_name":"New beer"}]"#.utf8))
                case "/bk-member-json.php": return (200,Data(#"[{},{"tasted_brew_current_round":[]},{"reward":[]}]"#.utf8))
                default: return (200,Data("No brew in queue".utf8))
                }
            }
            _ = await model.checkIn(beer,recommendation:true)
            XCTAssertEqual(model.session?.sessionId,"replacement")
            XCTAssertTrue(model.busyIDs.isEmpty)
            XCTAssertEqual(try db.operations().first?.status,"failed")
            await model.processOperations()
            XCTAssertEqual(writes,1)
        }
    }

    @MainActor func testLateAccountCallbackCannotClearNewAccountsBusyRequest() async throws {
        try await withModel { model,_,fixture in
            let entry = QueueEntry(id:"shared",name:"Beer",date:"")
            var firstReceipt: CheckedContinuation<Void,Never>?
            var secondReceipt: CheckedContinuation<Void,Never>?
            var firstStarted: CheckedContinuation<Void,Never>?
            var secondStarted: CheckedContinuation<Void,Never>?
            var writes = 0
            fixture.handler = { request in
                if request.url!.path == "/deleteQueuedBrew.php" {
                    writes += 1
                    if writes == 1 {
                        await withCheckedContinuation { firstReceipt = $0; firstStarted?.resume(); firstStarted = nil }
                    } else {
                        await withCheckedContinuation { secondReceipt = $0; secondStarted?.resume(); secondStarted = nil }
                    }
                    return (200,Data())
                }
                return (200,Data("No brew in queue".utf8))
            }
            var oldTask: Task<Void,Never>!
            await withCheckedContinuation { continuation in
                firstStarted = continuation
                oldTask = Task { await model.deleteQueueEntry(entry) }
            }
            XCTAssertTrue(model.busyIDs.contains(entry.id))
            await model.logout()
            XCTAssertTrue(model.busyIDs.isEmpty)
            guard model.busyIDs.isEmpty else {
                firstReceipt?.resume(); await oldTask.value
                return
            }
            model.session = MemberSession(memberId:"2",storeId:"1",storeName:"Fixture",sessionId:"other")
            var newTask: Task<Void,Never>!
            await withCheckedContinuation { continuation in
                secondStarted = continuation
                newTask = Task { await model.deleteQueueEntry(entry) }
            }
            firstReceipt?.resume()
            await oldTask.value
            XCTAssertTrue(model.busyIDs.contains(entry.id),"The old epoch must not release the new epoch's marker")
            secondReceipt?.resume()
            await newTask.value
            XCTAssertTrue(model.busyIDs.isEmpty)
            XCTAssertEqual(writes,2)
        }
    }
}
