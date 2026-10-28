import XCTest
@testable import BeerSelectorNative

final class MissedCreditTests: XCTestCase {
    private let calendar: Calendar = {
        var calendar = Calendar(identifier:.gregorian)
        calendar.timeZone = TimeZone(identifier:"America/Chicago")!
        return calendar
    }()
    private func at(_ month: Int, _ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from:DateComponents(year:2026,month:month,day:day,hour:hour,minute:minute))!
    }
    private func entry(_ id: String, _ name: String, _ queued: String, seen: Date? = nil) -> CreditLogEntry {
        CreditLogEntry(id:id,name:name,queued:queued,firstSeen:seen ?? at(10,25,21))
    }
    private func tasted(_ name: String) -> Beer {
        var beer = Beer(id:UUID().uuidString,name:name); beer.tasted_date = "10/25/2026"
        return beer
    }
    private func visits(_ log: [CreditLogEntry], tasted: [Beer] = [], now: Date) -> [MissedCreditVisit] {
        MissedCredit.visits(log:log,tasted:tasted,now:now,calendar:calendar)
    }

    func testBeerStillUncreditedTheNextMorningIsReportedUnderItsVisitDay() {
        let log = [entry("1","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
        let result = visits(log,now:at(10,26,9))
        XCTAssertEqual(result.map(\.day),[at(10,25,0)])
        XCTAssertEqual(result.first?.beers.map(\.id),["1"])
    }
    func testBeerQueuedTonightIsNotReportedWhileTheVisitMayStillBeOpen() {
        let log = [entry("1","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
        XCTAssertEqual(visits(log,now:at(10,25,23,59)),[])
        XCTAssertEqual(visits(log,now:at(10,26,3,30)).count,1)
    }
    func testBeerThatReachedTastedBrewsIsNotReported() {
        let log = [entry("1","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm"),
                   entry("2","A & B (CAN)","Oct 25, 2026 @ 09:30:00pm"),
                   entry("3","Hazy (Little) Thing","Oct 25, 2026 @ 09:40:00pm")]
        let result = visits(log,tasted:[tasted("example oktoberfest"),tasted("A & B (CAN)"),tasted("Hazy")],now:at(10,26,9))
        XCTAssertEqual(result.flatMap(\.beers).map(\.id),["3"])
    }
    func testDraftAndPackagedVersionsAreDifferentBeers() {
        let log = [entry("draft","Duvel (Draft)","Oct 25, 2026 @ 09:21:29pm"),
                   entry("bottle","Piraat (BTL)","Oct 25, 2026 @ 09:30:00pm"),
                   entry("can","Guinness Draught (CAN)","Oct 25, 2026 @ 09:40:00pm")]
        let result = visits(log,tasted:[tasted("Duvel (BTL)"),tasted("Piraat"),tasted("Guinness Draught")],now:at(10,26,9))
        XCTAssertEqual(result.flatMap(\.beers).map(\.id),["draft","bottle","can"],"Tasting one SKU never credits the other")
    }
    func testDateOnlyEntriesWaitFromWhenTheAppFirstSawThem() {
        let log = [entry("1","Old Format","Oct 25, 2026",seen:at(10,25,22))]
        XCTAssertEqual(visits(log,now:at(10,26,1)),[])
        XCTAssertEqual(visits(log,now:at(10,26,4)).map(\.day),[at(10,25,0)])
    }
    func testUnreadableDateFallsBackToWhenTheAppFirstSawIt() {
        let log = [entry("1","Mystery","Date unavailable",seen:at(10,24,20))]
        XCTAssertEqual(visits(log,now:at(10,26,9)).map(\.day),[at(10,24,0)])
    }
    func testVisitsAreNewestFirstWithBeersInTheOrderTheyWereQueued() {
        let log = [entry("late","Late","Oct 25, 2026 @ 10:15:00pm"),
                   entry("old","Old","Oct 20, 2026 @ 07:00:00pm"),
                   entry("early","Early","Oct 25, 2026 @ 06:05:00pm")]
        let result = visits(log,now:at(10,26,9))
        XCTAssertEqual(result.map(\.day),[at(10,25,0),at(10,20,0)])
        XCTAssertEqual(result.first?.beers.map(\.id),["early","late"])
    }
    @MainActor private func withDB(_ body: (BeerDatabase,URL) throws -> Void) throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:folder) }
        let url = folder.appendingPathComponent("beers.db")
        try body(BeerDatabase(url:url),url)
    }
    @MainActor func testLogKeepsBeersAfterTheyLeaveTheQueueAndRemembersFirstSighting() throws {
        try withDB { db,url in
            let queued = QueueEntry(id:"1",name:"Example Oktoberfest (Draft)",date:"Oct 25, 2026 @ 09:21:29pm")
            try db.recordQueue([queued],account:"a",seenAt:at(10,25,21,30))
            try db.recordQueue([queued],account:"a",seenAt:at(10,25,23))
            try db.recordQueue([],account:"a",seenAt:at(10,26,22))
            XCTAssertEqual(try BeerDatabase(url:url).creditLog(account:"a"),
                           [CreditLogEntry(id:"1",name:"Example Oktoberfest (Draft)",queued:"Oct 25, 2026 @ 09:21:29pm",firstSeen:at(10,25,21,30))])
        }
    }
    @MainActor func testLogIsScopedToTheAccountThatSawIt() throws {
        try withDB { db,_ in
            try db.recordQueue([QueueEntry(id:"1",name:"Mine",date:"")],account:"a",seenAt:at(10,25,21))
            XCTAssertEqual(try db.creditLog(account:"b"),[])
            try db.recordQueue([QueueEntry(id:"1",name:"Theirs",date:"")],account:"b",seenAt:at(10,25,21))
            XCTAssertEqual(try db.creditLog(account:"a").map(\.name),["Mine"])
        }
    }
    @MainActor func testDismissedBeersStayDismissedWhenSeenAgain() throws {
        try withDB { db,_ in
            let entry = QueueEntry(id:"1",name:"Gone",date:"")
            try db.recordQueue([entry,QueueEntry(id:"2",name:"Kept",date:"")],account:"a",seenAt:at(10,25,21))
            try db.dismissCredit(ids:["1"],account:"a")
            try db.recordQueue([entry],account:"a",seenAt:at(10,25,22))
            XCTAssertEqual(try db.creditLog(account:"a").map(\.id),["2"])
        }
    }
    @MainActor func testLogForgetsBeersFirstSeenOverThirtyDaysAgo() throws {
        try withDB { db,_ in
            try db.recordQueue([QueueEntry(id:"old",name:"Old",date:"")],account:"a",seenAt:at(9,20,21))
            try db.recordQueue([QueueEntry(id:"new",name:"New",date:"")],account:"a",seenAt:at(10,25,21))
            XCTAssertEqual(try db.creditLog(account:"a").map(\.id),["new"])
        }
    }
    @MainActor func testForgettingTheLogClearsEveryAccount() throws {
        try withDB { db,_ in
            try db.recordQueue([QueueEntry(id:"1",name:"A",date:"")],account:"a",seenAt:at(10,25,21))
            try db.recordQueue([QueueEntry(id:"1",name:"B",date:"")],account:"b",seenAt:at(10,25,21))
            try db.forgetCreditLog()
            XCTAssertEqual(try db.creditLog(account:"a") + db.creditLog(account:"b"),[])
        }
    }
    func testQueueTimesAreGregorianWhateverCalendarThePhoneUses() {
        var buddhist = Calendar(identifier:.buddhist); buddhist.timeZone = calendar.timeZone
        let log = [entry("1","Example Oktoberfest (Draft)","Oct 25, 2026 @ 09:21:29pm")]
        XCTAssertEqual(MissedCredit.visits(log:log,tasted:[],now:at(10,25,23),calendar:buddhist),[])
        XCTAssertEqual(MissedCredit.visits(log:log,tasted:[],now:at(10,26,9),calendar:buddhist).map(\.day),[at(10,25,0)])
    }
    func testReportShowsCheckInTimeOnlyWhenSaucerGaveOne() {
        XCTAssertEqual(MissedCredit.checkInTime(of:entry("1","Timed","Oct 25, 2026 @ 09:21:29pm"),calendar:calendar),
                       at(10,25,21,21).addingTimeInterval(29))
        XCTAssertNil(MissedCredit.checkInTime(of:entry("2","Old Format","Oct 25, 2026"),calendar:calendar))
        XCTAssertNil(MissedCredit.checkInTime(of:entry("3","Mystery","Date unavailable"),calendar:calendar))
    }
    func testMorningQueueTimesAreReadAsAM() {
        let log = [entry("1","Brunch","Oct 25, 2026 @ 11:05:00am")]
        XCTAssertEqual(visits(log,now:at(10,25,16)),[])
        XCTAssertEqual(visits(log,now:at(10,25,17,10)).count,1)
    }
}
