import XCTest
import Combine
@testable import BeerSelectorNative

/// Stands in for the pause while a dismissed alert animates away. A release ends every pause in
/// progress, or the next one to start if none is waiting. Like Task.sleep, a cancelled pause ends
/// at once, whether it was cancelled before or while waiting, and never uses up a release.
final class NoticeSpacingGate: @unchecked Sendable {
    private let lock = NSLock()
    private var waiting: [UUID: CheckedContinuation<Void, Never>] = [:]
    private var watchers: [CheckedContinuation<Void, Never>] = []
    private var released = 0
    private var startedPauses = 0
    var started: Int { lock.withLock { startedPauses } }
    @MainActor func install(on model: AppModel) { model.noticeSpacing = { [self] in await pause() } }
    func pause() async {
        let id = UUID()
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let (endsNow, watching) = lock.withLock {
                    if Task.isCancelled { return (true,[CheckedContinuation<Void, Never>]()) }
                    startedPauses += 1
                    if released > 0 { released -= 1; return (true,[]) }
                    waiting[id] = continuation
                    defer { watchers = [] }
                    return (false,watchers)
                }
                if endsNow { continuation.resume() }
                watching.forEach { $0.resume() }
            }
        } onCancel: {
            lock.withLock { waiting.removeValue(forKey:id) }?.resume()
        }
    }
    /// Returns once a pause is waiting for a release.
    func waitUntilWaiting() async {
        await withCheckedContinuation { continuation in
            let waitingNow = lock.withLock {
                if !waiting.isEmpty { return true }
                watchers.append(continuation)
                return false
            }
            if waitingNow { continuation.resume() }
        }
    }
    func release() {
        let finished = lock.withLock {
            if waiting.isEmpty { released += 1; return [CheckedContinuation<Void, Never>]() }
            defer { waiting = [:] }
            return Array(waiting.values)
        }
        finished.forEach { $0.resume() }
    }
}

final class NoticeTests: XCTestCase {
    @MainActor private func model(_ spacing: NoticeSpacingGate = NoticeSpacingGate()) -> AppModel {
        let model = AppModel(api:HTTPFixture().api(configuration:APIConfiguration()),monitorConnectivity:false)
        spacing.install(on:model)
        return model
    }

    @MainActor func testPostedNoticeIsPresented() {
        let model = model()
        model.notice = "Pliny has been added to your queue!"
        XCTAssertEqual(model.presentedNotice?.message,"Pliny has been added to your queue!")
    }
    @MainActor func testIdenticalConsecutiveNoticesAreSeparatePresentations() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.notice = "Check-in saved"
        let first = try XCTUnwrap(model.presentedNotice)
        model.dismissNotice(first)
        model.notice = "Check-in saved"
        spacing.release()
        let second = await nextPresentedNotice(model)
        XCTAssertEqual(second?.message,"Check-in saved")
        XCTAssertNotEqual(first.id,second?.id)
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
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.notice = "Pliny has been added to your queue!"
        let first = try XCTUnwrap(model.presentedNotice)
        model.notice = "Heady Topper has been added to your queue!"
        XCTAssertEqual(model.presentedNotice,first,"A displayed alert ignores data changes, so the next notice must wait")
        model.dismissNotice(first)
        XCTAssertNil(model.presentedNotice,"The alert must close before the next one can present")
        spacing.release()
        let second = await nextPresentedNotice(model)
        XCTAssertEqual(second?.message,"Heady Topper has been added to your queue!")
        XCTAssertNotEqual(second?.id,first.id)
    }
    @MainActor func testNoticeArrivingJustAfterDismissalWaitsForTheAlertToClose() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.notice = "Pliny has been added to your queue!"
        model.dismissNotice(try XCTUnwrap(model.presentedNotice))
        model.notice = "Heady Topper has been added to your queue!"
        XCTAssertNil(model.presentedNotice,"SwiftUI drops an alert presented while the last one animates away")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Heady Topper has been added to your queue!")
    }
    @MainActor func testClearingADisplayedNoticeSpacesTheNextOne() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.notice = "Check-in saved. It will retry when you’re connected."
        model.notice = nil
        model.notice = "Pliny has been added to your queue!"
        XCTAssertNil(model.presentedNotice,"Clearing closes the alert just as dismissing does")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Pliny has been added to your queue!")
    }
    @MainActor func testClearingDuringSpacingDropsOldNoticesAndKeepsTheNewOneWaiting() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.notice = "First"
        model.notice = "Second"
        model.dismissNotice(try XCTUnwrap(model.presentedNotice))
        model.notice = nil
        model.notice = "Third"
        XCTAssertNil(model.presentedNotice,"The first alert is still animating away")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Third","Nothing posted before clearing may be shown")
        XCTAssertEqual(spacing.started,1)
    }
    @MainActor func testNoticeShowsOnTheMainScreenWhenNoSheetIsOpen() {
        XCTAssertEqual(model().noticeHost,.root)
    }
    @MainActor func testNoticeShowsOnTheOpenSheet() {
        let model = model()
        let sheets: [(ReferenceWritableKeyPath<AppModel, Bool>, NoticeHost)] = [
            (\.showRecommendations,.recommendations),(\.showSettings,.settings),(\.showRewards,.rewards),
            (\.showQueue,.queue),(\.showOperations,.operations)
        ]
        for (sheet,host) in sheets {
            model[keyPath:sheet] = true
            XCTAssertEqual(model.noticeHost,host)
            model[keyPath:sheet] = false
        }
    }
    @MainActor func testNoticeShowsOnTheSheetOpenedFromAnotherSheet() {
        let model = model()
        model.showSettings = true; model.showLogin = true
        XCTAssertEqual(model.noticeHost,.login)
        model.showSettings = false; model.showLogin = false
        model.showQueue = true; model.showMissedCredit = true
        XCTAssertEqual(model.noticeHost,.missedCredit)
    }
    @MainActor func testNestedSheetFlagsWithoutTheirParentSheetDoNotHostNotices() {
        let model = model()
        model.showLogin = true; model.showMissedCredit = true
        XCTAssertEqual(model.noticeHost,.root,"Login and missed credit only appear above Settings and Queue")
    }
    @MainActor func testSettingsOpenedOverQueueHostsTheNotice() {
        let model = model()
        model.showQueue = true; model.showSettings = true
        XCTAssertEqual(model.noticeHost,.settings,"Only Settings opens over another sheet, and SwiftUI stacks it on top")
    }
    @MainActor func testOpeningASheetMovesTheDisplayedNoticeToItAfterAPause() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.notice = "Pliny has been added to your queue!"
        let shown = try XCTUnwrap(model.presentedNotice)
        model.showSettings = true
        model.noticePresenter(.settings,isReady:true)
        XCTAssertNil(model.presentedNotice,"SwiftUI drops an alert whose presenter changes, so the notice must be presented again")
        spacing.release()
        let again = await nextPresentedNotice(model)
        XCTAssertEqual(again,shown)
        XCTAssertEqual(model.noticeHost,.settings)
    }
    @MainActor func testClosingASheetMovesTheDisplayedNoticeToTheMainScreenAfterAPause() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.showRecommendations = true
        model.noticePresenter(.recommendations,isReady:true)
        spacing.release()
        model.notice = "Pliny has been added to your queue!"
        let displayed = await nextPresentedNotice(model)
        let shown = try XCTUnwrap(displayed)
        model.showRecommendations = false
        XCTAssertNil(model.presentedNotice)
        spacing.release()
        let again = await nextPresentedNotice(model)
        XCTAssertEqual(again,shown)
        XCTAssertEqual(model.noticeHost,.root)
    }
    @MainActor func testClosingANestedSheetMovesTheDisplayedNoticeToItsParentAfterAPause() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.showQueue = true; model.showMissedCredit = true
        model.noticePresenter(.queue,isReady:true); model.noticePresenter(.missedCredit,isReady:true)
        spacing.release()
        model.notice = "Credit report updated"
        let displayed = await nextPresentedNotice(model)
        let shown = try XCTUnwrap(displayed)
        model.showMissedCredit = false
        XCTAssertNil(model.presentedNotice)
        spacing.release()
        let again = await nextPresentedNotice(model)
        XCTAssertEqual(again,shown)
        XCTAssertEqual(model.noticeHost,.queue)
    }
    @MainActor func testSignInClosingLoginAndSettingsKeepsNoticesInOrder() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.showSettings = true; model.showLogin = true
        model.noticePresenter(.settings,isReady:true); model.noticePresenter(.login,isReady:true)
        spacing.release()
        model.notice = "First"
        let displayed = await nextPresentedNotice(model)
        let first = try XCTUnwrap(displayed)
        model.notice = "Second"
        model.showLogin = false; model.showSettings = false
        XCTAssertNil(model.presentedNotice)
        spacing.release()
        let again = await nextPresentedNotice(model)
        XCTAssertEqual(again,first,"The displayed notice goes back to the head of the queue")
        XCTAssertEqual(model.noticeHost,.root)
        model.dismissNotice(first)
        spacing.release()
        let second = await nextPresentedNotice(model)
        XCTAssertEqual(second?.message,"Second")
    }
    @MainActor func testNoticePostedJustAfterASheetClosesWaitsForThePause() async {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.showRecommendations = true
        model.noticePresenter(.recommendations,isReady:true)
        spacing.release()
        await Task.yield()
        model.showRecommendations = false
        model.notice = "Pliny has been added to your queue!"
        XCTAssertNil(model.presentedNotice,"The closing sheet still covers the main screen")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Pliny has been added to your queue!")
    }
    @MainActor func testBlockedPresenterHoldsNoticesUntilAPauseAfterItIsFree() async {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.showQueue = true
        model.noticePresenter(.queue,isReady:true)
        spacing.release()
        model.noticePresenter(.queue,isReady:false)
        model.notice = "Pliny has been added to your queue!"
        XCTAssertNil(model.presentedNotice,"Another alert is already open on Queue")
        spacing.release()
        await Task.yield()
        XCTAssertNil(model.presentedNotice)
        model.noticePresenter(.queue,isReady:true)
        XCTAssertNil(model.presentedNotice,"The other alert is still animating away")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Pliny has been added to your queue!")
    }
    @MainActor func testSheetThatHasNotAppearedYetHoldsNoticesUntilAPauseAfterItAppears() async {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.showQueue = true; model.showMissedCredit = true
        model.notice = "Pliny has been added to your queue!"
        spacing.release()
        await Task.yield()
        XCTAssertNil(model.presentedNotice,"SwiftUI presents a nested sheet only after its parent finishes, and drops alerts meanwhile")
        model.noticePresenter(.queue,isReady:true)
        spacing.release()
        await Task.yield()
        XCTAssertNil(model.presentedNotice,"Missed Credit is frontmost but not on screen yet")
        model.noticePresenter(.missedCredit,isReady:true)
        XCTAssertNil(model.presentedNotice,"Missed Credit is still animating in")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Pliny has been added to your queue!")
        XCTAssertEqual(model.noticeHost,.missedCredit)
    }
    @MainActor func testPresenterChangeWhileAPauseIsWaitingStillPresentsAfterTheNewPause() async throws {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.noticePresenter(.settings,isReady:true)
        model.notice = "Shown"
        model.dismissNotice(try XCTUnwrap(model.presentedNotice))
        await spacing.waitUntilWaiting()
        XCTAssertEqual(spacing.started,1,"The first pause is waiting")
        model.notice = "Next"
        model.showSettings = true
        spacing.release()
        let presented = expectation(description:"Next is presented after the pause that replaced the cancelled one")
        let watcher = model.$presentedNotice.compactMap { $0 }.first().sink { _ in presented.fulfill() }
        defer { watcher.cancel() }
        await fulfillment(of:[presented],timeout:2)
        XCTAssertEqual(model.presentedNotice?.message,"Next")
    }
    @MainActor func testUntappdBrowserHoldsNoticesUntilAPauseAfterItCloses() async {
        let spacing = NoticeSpacingGate()
        let model = model(spacing)
        model.browserURL = URL(string:"https://untappd.com/search?q=Pliny")
        model.notice = "Pliny has been added to your queue!"
        XCTAssertNil(model.presentedNotice,"The system browser covers every presenter")
        spacing.release()
        await Task.yield()
        XCTAssertNil(model.presentedNotice)
        model.browserURL = nil
        XCTAssertNil(model.presentedNotice,"The browser is still animating away")
        spacing.release()
        let next = await nextPresentedNotice(model)
        XCTAssertEqual(next?.message,"Pliny has been added to your queue!")
    }
    @MainActor func testBlockedPresenterBehindTheFrontmostOneDoesNotHoldNotices() {
        let model = model()
        model.noticePresenter(.queue,isReady:false)
        model.notice = "Pliny has been added to your queue!"
        XCTAssertNotNil(model.presentedNotice)
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
}

@MainActor func nextPresentedNotice(_ model: AppModel) async -> Notice? {
    if let notice = model.presentedNotice { return notice }
    for await notice in model.$presentedNotice.values where notice != nil { return notice }
    return nil
}
