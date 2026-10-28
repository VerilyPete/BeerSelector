import XCTest
import Combine
@testable import BeerSelectorNative

final class NoticeTests: XCTestCase {
    @MainActor private func model() -> AppModel {
        AppModel(api:HTTPFixture().api(configuration:APIConfiguration()),monitorConnectivity:false)
    }

    @MainActor func testPostedNoticeIsPresented() {
        let model = model()
        model.notice = "Pliny has been added to your queue!"
        XCTAssertEqual(model.presentedNotice?.message,"Pliny has been added to your queue!")
    }
    @MainActor func testIdenticalConsecutiveNoticesAreSeparatePresentations() throws {
        let model = model()
        model.notice = "Check-in saved"
        let first = try XCTUnwrap(model.presentedNotice)
        model.dismissNotice(first)
        model.notice = "Check-in saved"
        let second = try XCTUnwrap(model.presentedNotice)
        XCTAssertNotEqual(first.id,second.id)
    }
    @MainActor func testDismissingNoticeClearsIt() throws {
        let model = model()
        model.notice = "Refresh timestamps cleared"
        model.dismissNotice(try XCTUnwrap(model.presentedNotice))
        XCTAssertNil(model.presentedNotice)
        XCTAssertNil(model.notice)
    }
    @MainActor func testDismissingAnAlreadyDismissedNoticePublishesNothing() throws {
        let model = model()
        model.notice = "Diagnostic history cleared"
        let shown = try XCTUnwrap(model.presentedNotice)
        model.dismissNotice(shown)
        var changes = 0
        let subscription = model.objectWillChange.sink { changes += 1 }
        defer { subscription.cancel() }
        model.dismissNotice(shown)
        XCTAssertEqual(changes,0,"SwiftUI repeats dismissal during view updates, where publishing is not allowed")
    }
    @MainActor func testNoticeArrivingWhileAnotherIsShownWaitsItsTurn() async throws {
        let model = model()
        model.notice = "Pliny has been added to your queue!"
        let first = try XCTUnwrap(model.presentedNotice)
        model.notice = "Heady Topper has been added to your queue!"
        XCTAssertEqual(model.presentedNotice,first,"A displayed alert ignores data changes, so the next notice must wait")
        model.dismissNotice(first)
        XCTAssertNil(model.presentedNotice,"The alert must close before the next one can present")
        let second = await nextPresentedNotice(model)
        XCTAssertEqual(second?.message,"Heady Topper has been added to your queue!")
        XCTAssertNotEqual(second?.id,first.id)
    }
    @MainActor func testClearingNoticesDropsPendingOnes() throws {
        let model = model()
        model.notice = "First"
        model.notice = "Second"
        model.notice = nil
        XCTAssertNil(model.presentedNotice)
        model.notice = "Third"
        XCTAssertEqual(model.presentedNotice?.message,"Third","Nothing pending may be shown ahead of it")
    }
    @MainActor func testClearingNoticesCancelsTheNextPresentation() async throws {
        let model = model()
        model.notice = "First"
        model.notice = "Second"
        model.dismissNotice(try XCTUnwrap(model.presentedNotice))
        model.notice = nil
        model.notice = "Third"
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Third")
        await Task.yield()
        XCTAssertEqual(model.presentedNotice?.message,"Third")
    }
    @MainActor func testDismissingANoticeThatWasNeverDisplayedChangesNothing() throws {
        let model = model()
        model.notice = "Shown"
        let shown = try XCTUnwrap(model.presentedNotice)
        model.notice = "Waiting"
        var changes = 0
        let subscription = model.objectWillChange.sink { changes += 1 }
        defer { subscription.cancel() }
        model.dismissNotice(Notice(message:"Waiting"))
        XCTAssertEqual(model.presentedNotice,shown)
        XCTAssertEqual(changes,0)
    }
    @MainActor private func nextPresentedNotice(_ model: AppModel) async -> Notice? {
        if let notice = model.presentedNotice { return notice }
        for await notice in model.$presentedNotice.values where notice != nil { return notice }
        return nil
    }
}
