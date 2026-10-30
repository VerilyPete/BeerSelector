import XCTest
@testable import BeerSelectorNative

final class MissedCreditModelTests: XCTestCase {
    private final class Upstream {
        var queue: [(id: String, name: String, date: String)] = []
        var tasted: [String] = []
        var deleted: [String] = []
    }
    private func at(_ month: Int, _ day: Int, _ hour: Int) -> Date {
        Calendar.current.date(from:DateComponents(year:2026,month:month,day:day,hour:hour))!
    }
    @MainActor private func withModel(_ body: (AppModel, BeerDatabase, Upstream) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let key = "missed_credit_test_" + UUID().uuidString
        let credentials = CredentialStore(prefix:key,sessionStorageKey:key + "_session")
        let upstream = Upstream()
        let fixture = HTTPFixture()
        fixture.handler = { request in
            switch request.url!.path {
            case "/memberQueues.php":
                guard !upstream.queue.isEmpty else { return (200,Data("<p>No beers currently in your queue.</p>".utf8)) }
                let rows = upstream.queue.map { #"<h3 class="brewName">\#($0.name)<div class="brew_added_date">\#($0.date)</div></h3><a href="deleteQueuedBrew.php?cid=\#($0.id)">Delete</a>"# }
                return (200,Data(rows.joined().utf8))
            case "/deleteQueuedBrew.php":
                let id = URLComponents(url:request.url!,resolvingAgainstBaseURL:false)?.queryItems?.first { $0.name == "cid" }?.value ?? ""
                upstream.deleted.append(id); upstream.queue.removeAll { $0.id == id }
                return (200,Data())
            case "/bk-store-json.php": return (200,Data("[]".utf8))
            case "/bk-member-json.php":
                let tasted = upstream.tasted.enumerated().map { #"{"id":"t\#($0.offset)","brew_name":"\#($0.element)","tasted_date":"10/25/2026"}"# }
                return (200,Data(#"[{},{"tasted_brew_current_round":[\#(tasted.joined(separator:","))]},{"reward":[]}]"#.utf8))
            case "/member-dash.php":
                return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
            case "/logout.php": return (200,Data())
            default: throw URLError(.unsupportedURL)
            }
        }
        var configuration = APIConfiguration()
        configuration.enrichmentURL = nil; configuration.enrichmentKey = nil
        let model = AppModel(api:fixture.api(configuration:configuration),credentials:credentials,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db"))
        model.db = db
        model.activityUpdate = { _,_ in }; model.activityCleanup = {}; model.webCookieCleanup = {}
        let member = MemberSession(memberId:"1",storeId:"1",storeName:"Fixture",sessionId:"session")
        model.session = member
        try credentials.save(session:member,cookies:[:])
        try db.setPreference("all_beers_api_url","https://fsbs.beerknurd.com/bk-store-json.php?sid=1")
        try db.setPreference("my_beers_api_url","https://fsbs.beerknurd.com/bk-member-json.php?uid=1")
        defer { fixture.handler = nil; try? credentials.clear(); try? FileManager.default.removeItem(at:folder) }
        try await body(model,db,upstream)
    }

    @MainActor func testBeerLeftInTheQueueOvernightIsReportedEvenAfterSaucerDropsIt() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,25,22) }
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits,[],"Not missed while the visit may still be open")
            upstream.queue = []
            model.now = { self.at(10,26,20) }
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.name),["Example Oktoberfest (Draft)"])
        }
    }
    @MainActor func testBeerCreditedLaterLeavesTheReport() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits.count,1)
            upstream.tasted = ["Example Oktoberfest"]
            await model.refresh()
            XCTAssertEqual(model.missedCredits,[])
        }
    }
    @MainActor func testCreditedBeerStaysCreditedAfterTheRoundResets() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            upstream.queue = []; upstream.tasted = ["Example Oktoberfest"]
            await model.refresh()
            upstream.tasted = []
            await model.refresh()
            XCTAssertEqual(model.missedCredits,[],"A new round empties Tasted Brews but the beer was already credited")
        }
    }
    @MainActor func testOnlyFreshTastingsRecordCreditForGood() async throws {
        try await withModel { model,_,upstream in
            upstream.tasted = ["Repeat Favorite"]
            await model.refresh()
            upstream.tasted = []; upstream.queue = [("8","Repeat Favorite","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            await model.refresh()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["8"],"Last round's cached tasting never credits this round's beer")
        }
    }
    @MainActor func testQueueScreenRefreshNoticesARoundResetHidingAMissedBeer() async throws {
        try await withModel { model,_,upstream in
            upstream.tasted = ["Repeat Favorite"]
            await model.refresh()
            upstream.tasted = []; upstream.queue = [("8","Repeat Favorite","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueueAndCredits()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["8"])
        }
    }
    @MainActor func testRefreshingTheQueueScreenPicksUpCreditsThatArrivedMeanwhile() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueueAndCredits()
            XCTAssertEqual(model.missedCredits.count,1)
            upstream.queue = []; upstream.tasted = ["Example Oktoberfest"]
            await model.refreshQueueAndCredits()
            XCTAssertEqual(model.missedCredits,[])
        }
    }
    @MainActor func testBeerDeletedFromTheQueueBeforeItWasMissedIsNotReported() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Changed My Mind","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,25,21) }
            await model.refreshQueue()
            await model.deleteQueueEntry(model.queue[0])
            XCTAssertEqual(upstream.deleted,["7"])
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits,[])
        }
    }
    @MainActor func testStaleBeerDeletedFromTheQueueStaysReportedUntilTheMemberClearsIt() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Never Poured","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["7"])
            await model.deleteQueueEntry(model.queue[0])
            XCTAssertEqual(upstream.deleted,["7"])
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["7"],"Deleting the queue row does not erase the check-in record")
            model.dismissMissedCredit(try XCTUnwrap(model.missedCredits.first?.beers.first))
            XCTAssertEqual(model.missedCredits,[])
        }
    }
    @MainActor func testBeerThatBecameMissedSinceTheLastRefreshStaysReportedWhenDeleted() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Never Poured","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,25,22) }
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits,[])
            model.now = { self.at(10,26,9) }
            await model.deleteQueueEntry(model.queue[0])
            XCTAssertEqual(upstream.deleted,["7"])
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["7"],"Grace elapsed before the delete, so the beer is already missed")
        }
    }
    @MainActor func testMemberCanRemoveABeerFromTheReport() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Got It Sorted","Oct 25, 2026 @ 09:21:29pm"),("8","Still Missing","Oct 25, 2026 @ 09:25:00pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            model.dismissMissedCredit(try XCTUnwrap(model.missedCredits.first?.beers.first))
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["8"])
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["8"])
        }
    }
    @MainActor func testMemberCanResolveAWholeVisitAndKeepOtherVisits() async throws {
        try await withModel { model,_,upstream in
            upstream.queue = [("7","Friday One","Oct 23, 2026 @ 08:00:00pm"),("8","Saturday One","Oct 25, 2026 @ 09:21:29pm"),
                              ("9","Saturday Two","Oct 25, 2026 @ 09:25:00pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            model.resolveMissedCreditVisit(try XCTUnwrap(model.missedCredits.first))
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["7"])
            await model.refreshQueue()
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["7"])
        }
    }
    @MainActor func testLogoutForgetsTheReport() async throws {
        try await withModel { model,db,upstream in
            upstream.queue = [("7","Private","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            await model.logout()
            XCTAssertEqual(model.missedCredits,[])
            XCTAssertEqual(try db.rows("SELECT COUNT(*) AS count FROM credit_log").first?["count"],"0")
        }
    }
    @MainActor func testSigningInAsSomeoneElseForgetsTheReport() async throws {
        try await withModel { model,db,upstream in
            upstream.queue = [("7","Private","Oct 25, 2026 @ 09:21:29pm")]
            model.now = { self.at(10,26,9) }
            await model.refreshQueue()
            upstream.queue = []
            let url = model.api.configuration.endpoint("member-dash.php")
            let cookies = ["member_id":"2","store__id":"2","PHPSESSID":"new"].map { HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])! }
            var reportDuringSwitch: [MissedCreditVisit]?
            model.activityCleanup = { if model.session?.memberId == "2" { reportDuringSwitch = model.missedCredits } }
            try await model.completeLogin(url:url,nativeCookies:cookies)
            XCTAssertEqual(reportDuringSwitch,[],"The new member is never shown the previous member's beers")
            XCTAssertEqual(model.missedCredits,[])
            XCTAssertEqual(try db.rows("SELECT COUNT(*) AS count FROM credit_log").first?["count"],"0")
        }
    }
    @MainActor func testPreviousMembersTastingsNeverCreditTheNextMembersBeers() async throws {
        try await withModel { model,_,upstream in
            upstream.tasted = ["Shared Favorite"]
            await model.refresh()
            let url = model.api.configuration.endpoint("member-dash.php")
            let cookies = ["member_id":"2","store__id":"2","PHPSESSID":"new"].map { HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])! }
            model.now = { self.at(10,26,9) }
            model.activityCleanup = {
                guard model.session?.memberId == "2" else { return }
                upstream.tasted = []; upstream.queue = [("9","Shared Favorite","Oct 25, 2026 @ 09:21:29pm")]
                await model.refreshQueue()
            }
            try await model.completeLogin(url:url,nativeCookies:cookies)
            XCTAssertEqual(model.missedCredits.flatMap(\.beers).map(\.id),["9"],"The new member never tasted it")
        }
    }
}
