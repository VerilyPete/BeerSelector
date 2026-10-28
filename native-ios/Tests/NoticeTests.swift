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
    @MainActor func testDismissingSupersededNoticeKeepsTheNewerOne() throws {
        let model = model()
        model.notice = "First"
        let first = try XCTUnwrap(model.presentedNotice)
        model.notice = "Second"
        model.dismissNotice(first)
        XCTAssertEqual(model.presentedNotice?.message,"Second")
    }
}
