import XCTest
@testable import BeerSelectorNative

final class RecentTastingsTests: XCTestCase {
    private func beer(_ id: Int, lap: String = "7", date: String = "09/12/2026") -> Beer {
        var b = Beer(id:String(id),name:"Beer \(id)")
        b.roh_lap = lap; b.tasted_date = date; b.brew_style = "IPA"
        return b
    }
    private func withDB(_ body: (BeerDatabase,URL) throws -> Void) throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:folder) }
        try body(BeerDatabase(url:folder.appendingPathComponent("beers.db")),folder.appendingPathComponent("beers.db"))
    }
    func testChoiceContextIsImmutableScopedAndSeparatesQueueFromTasting() throws {
        try withDB { db,url in
            var b = beer(1)
            let formatter = DateFormatter(); formatter.dateFormat = "MM/dd/yyyy"; formatter.timeZone = TimeZone(secondsFromGMT:0)
            b.tasted_date = formatter.string(from:Date())
            let choice = BeerChoiceContext(taplist:[b],shown:[b.id],preferences:.init(),usedModel:false)
            try db.saveChoicePresentation(choice,account:"a")
            var replacement = choice; replacement.taplist = []
            try db.saveChoicePresentation(replacement,account:"a")
            try db.updateChoice(id:choice.id,account:"b",beerID:b.id,selected:true)
            XCTAssertTrue(try db.choiceContexts(account:"b").isEmpty)
            try db.updateChoice(id:choice.id,account:"a",beerID:b.id,selected:true)
            try db.updateChoice(id:choice.id,account:"a",beerID:b.id,outcome:.added)
            let saved = try XCTUnwrap(BeerDatabase(url:url).choiceContexts(account:"a").first)
            XCTAssertEqual(saved.taplist.count,1)
            XCTAssertEqual(saved.selected,[b.id])
            XCTAssertEqual(saved.queued,[b.id])
            XCTAssertTrue(saved.laterTasted.isEmpty)
            try db.observeChoiceTastings([b],previous:[b],account:"a")
            XCTAssertEqual(try db.choiceContexts(account:"a").first?.laterTasted,[])
            var old = b; old.tasted_date = "01/01/2000"
            try db.observeChoiceTastings([old],previous:[],account:"a")
            XCTAssertEqual(try db.choiceContexts(account:"a").first?.laterTasted,[])
            try db.observeChoiceTastings([b],previous:[],account:"a")
            XCTAssertEqual(try db.choiceContexts(account:"a").first?.laterTasted,[b.id])
        }
    }
    func testChoiceRetentionAndHistoryClearNeverDeleteFeedback() throws {
        try withDB { db,_ in
            try db.saveBeerFeedback(.init(beer:beer(1),rating:.liked),account:"a")
            for i in 0..<105 {
                var choice = BeerChoiceContext(taplist:[beer(i)],shown:[String(i)],preferences:.init(),usedModel:false)
                choice.presentedAt = Date(timeIntervalSince1970:Double(i))
                try db.saveChoicePresentation(choice,account:"a")
            }
            XCTAssertEqual(try db.choiceContexts(account:"a").count,100)
            try db.forgetRecentTastings()
            XCTAssertTrue(try db.choiceContexts(account:"a").isEmpty)
            XCTAssertEqual(try db.beerFeedback(account:"a").count,1)
            // Use a real Beer encoding to exercise pre-timestamp persisted records.
            var object = try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(BeerFeedback(beer:beer(1),rating:.liked))) as? [String:Any])
            object.removeValue(forKey:"ratedAt")
            let decoded = try JSONDecoder().decode(BeerFeedback.self,from:JSONSerialization.data(withJSONObject:object))
            XCTAssertNil(decoded.ratedAt)
            XCTAssertNotNil(try db.beerFeedback(account:"a").first?.ratedAt)
        }
    }
    func testFullRoundDuplicateRefreshAndRolloverPreserveHundredAcrossReopen() throws {
        try withDB { db,url in
            for count in [198,199,200] { try db.transaction { try db.recordTastings((1...count).map { beer($0) },account:"a") } }
            let before = try db.recentTastings(account:"a")
            XCTAssertEqual(before.count,100)
            try db.transaction { try db.recordTastings([],account:"a") }
            XCTAssertEqual(try BeerDatabase(url:url).recentTastings(account:"a"),before)
            try db.transaction { try db.recordTastings([beer(999,lap:"8",date:"09/13/2026")],account:"a") }
            let after = try db.recentTastings(account:"a")
            XCTAssertEqual(after.count,100); XCTAssertEqual(after.first?.id,"999")
            try db.recordTastings((1...200).map { beer($0) },account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a"),after,"An older round must not roll history back")
        }
    }
    func testExpandingExistingCacheBackfillsAvailableSourceWithoutReorderingExistingEvents() throws {
        try withDB { db,_ in
            let rows = (1...200).map { beer($0) }
            try db.recordTastings(rows,account:"a")
            try db.execute("DELETE FROM recent_tastings WHERE event NOT IN (SELECT event FROM recent_tastings ORDER BY day DESC,observed DESC,event DESC LIMIT 20)")
            try db.setPreference("recent_tastings_capacity","20")
            let previous = try db.recentTastings(account:"a")
            try db.recordTastings(rows.reversed(),account:"a")
            let expanded = try db.recentTastings(account:"a")
            XCTAssertEqual(expanded.count,100)
            XCTAssertEqual(Array(expanded.prefix(20)),previous)
        }
    }
    func testExpandingCacheDoesNotUndoHistoryClear() throws {
        try withDB { db,_ in
            let rows = (1...200).map { beer($0) }
            try db.recordTastings(rows,account:"a")
            try db.clearRecentTastings(account:"a",baseline:rows)
            try db.setPreference("recent_tastings_capacity","20")
            try db.recordTastings(rows,account:"a")
            XCTAssertTrue(try db.recentTastings(account:"a").isEmpty)
        }
    }
    func testFeedbackSurvivesHistoryPruningClearAccountSwitchAndReopen() throws {
        try withDB { db,url in
            try db.saveBeerFeedback(BeerFeedback(beer:beer(1),rating:.liked),account:"a")
            try db.saveBeerFeedback(BeerFeedback(beer:beer(1),rating:.notForMe),account:"b")
            try db.recordTastings((2...201).map { beer($0) },account:"a")
            try db.clearRecentTastings(account:"a",baseline:[])
            try db.forgetRecentTastings()
            try db.recordTastings([beer(999)],account:"b")
            let reopened = try BeerDatabase(url:url)
            XCTAssertEqual(try reopened.beerFeedback(account:"a").first?.rating,.liked)
            XCTAssertEqual(try reopened.beerFeedback(account:"b").first?.rating,.notForMe)
            try reopened.deleteCachedBeerFeedback(account:"a")
            XCTAssertTrue(try reopened.beerFeedback(account:"a").isEmpty)
            XCTAssertEqual(try reopened.beerFeedback(account:"b").count,1)
        }
    }
    func testFeedbackIsNotCappedAtHistoryLimitAndReratingUpdatesOneRecord() throws {
        try withDB { db,_ in
            for id in 1...120 { try db.saveBeerFeedback(BeerFeedback(beer:beer(id),rating:.liked),account:"a") }
            try db.saveBeerFeedback(BeerFeedback(beer:beer(1),rating:.notForMe),account:"a")
            let ratings = try db.beerFeedback(account:"a")
            XCTAssertEqual(ratings.count,120)
            XCTAssertEqual(ratings.first { $0.id == "1" }?.rating,.notForMe)
        }
    }
    func testRepeatedBeerInNewRoundIsNewEventAndMetadataUpdateIsNot() throws {
        try withDB { db,_ in
            var old = beer(1); try db.recordTastings([old],account:"a")
            old.brew_description = "Updated description"
            try db.recordTastings([old],account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a").count,1)
            XCTAssertEqual(try db.recentTastings(account:"a").first?.brew_description,old.brew_description)
            try db.recordTastings([beer(1,lap:"8",date:"09/13/2026")],account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a").count,2)
        }
    }
    func testClearDoesNotReimportOldSnapshotAndAllowsNewEvents() throws {
        try withDB { db,_ in
            let rows = (1...200).map { beer($0) }
            try db.recordTastings(rows,account:"a")
            try db.clearRecentTastings(account:"a",baseline:rows)
            try db.recordTastings(rows.reversed(),account:"a")
            XCTAssertTrue(try db.recentTastings(account:"a").isEmpty)
            try db.recordTastings([beer(999,lap:"8",date:"09/13/2026")],account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a").map(\.id),["999"])
        }
    }
    func testAccountIsolationForgetAndRollback() throws {
        try withDB { db,_ in
            try db.recordTastings([beer(1)],account:"a")
            XCTAssertTrue(try db.recentTastings(account:"b").isEmpty)
            enum Abort: Error { case test }
            XCTAssertThrowsError(try db.transaction { try db.recordTastings([beer(2)],account:"a"); throw Abort.test })
            XCTAssertEqual(try db.recentTastings(account:"a").map(\.id),["1"])
            try db.forgetRecentTastings()
            XCTAssertTrue(try db.recentTastings(account:"a").isEmpty)
        }
    }

    func testNewlyObservedSameDayTastingOutranksOlderBeerIDs() throws {
        try withDB { db,_ in
            let original = (1000..<1020).map { beer($0) }
            try db.recordTastings(original,account:"a")
            try db.recordTastings(original + [beer(1)],account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a").first?.id,"1")
            let snapshot = try db.recentTastings(account:"a")
            try db.recordTastings(original.reversed() + [beer(1)],account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a"),snapshot)
        }
    }
    func testDatesAreValidatedAndSameDayOrderIsStable() throws {
        try withDB { db,_ in
            let rows = [beer(1,date:"invalid"),beer(2,date:"02/30/2026"),beer(3),beer(4)]
            try db.recordTastings(rows,account:"a")
            let before = try db.recentTastings(account:"a")
            XCTAssertEqual(Set(before.map(\.id)),["3","4"])
            try db.recordTastings(rows.reversed(),account:"a")
            XCTAssertEqual(try db.recentTastings(account:"a"),before)
        }
    }
}
