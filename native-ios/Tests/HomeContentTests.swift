import XCTest
@testable import BeerSelectorNative

final class NewOnTapTests: XCTestCase {
    private func beer(_ id: String, added: String) -> Beer { var beer = Beer(id:id,name:id); beer.added_date = added; return beer }

    func testPicksTheNewestBeersByAddedDate() {
        let beers = [beer("old",added:"100"),beer("newest",added:"300"),beer("middle",added:"200")]
        XCTAssertEqual(BeerFilter.newOnTap(beers,count:2).map(\.id),["newest","middle"])
    }

    func testTiesKeepTaplistOrder() {
        let beers = [beer("first",added:"200"),beer("second",added:"200"),beer("older",added:"100")]
        XCTAssertEqual(BeerFilter.newOnTap(beers,count:2).map(\.id),["first","second"])
    }

    func testBeersWithoutAUsableDateComeAfterDatedOnes() {
        let beers = [beer("missing",added:""),beer("garbage",added:"soon"),beer("dated",added:"100"),beer("zero",added:"0")]
        XCTAssertEqual(BeerFilter.newOnTap(beers,count:4).map(\.id),["dated","missing","garbage","zero"])
        XCTAssertEqual(BeerFilter.newOnTap(beers,count:2).map(\.id),["dated","missing"])
    }

    func testAShortTaplistReturnsWhatItHas() {
        XCTAssertEqual(BeerFilter.newOnTap([beer("only",added:"100")],count:2).map(\.id),["only"])
    }

    func testTheCompactRowLineShowsArrivalDayStyleAndContainer() {
        var calendar = Calendar(identifier:.gregorian); calendar.timeZone = TimeZone(identifier:"UTC")!
        let locale = Locale(identifier:"en_US")
        var stout = beer("stout",added:"1788950000"); stout.brew_style = "Imperial Stout"; stout.brew_container = "Bottle"
        XCTAssertEqual(stout.newOnTapLine(calendar:calendar,locale:locale),"Sep 9 · Imperial Stout · Bottle")
        var undated = beer("undated",added:""); undated.brew_style = "Lager"; undated.brew_container = ""
        XCTAssertEqual(undated.newOnTapLine(calendar:calendar,locale:locale),"Lager")
        XCTAssertEqual(beer("bare",added:"0").newOnTapLine(calendar:calendar,locale:locale),"")
    }

    func testAnEmptyTaplistReturnsNothing() {
        XCTAssertEqual(BeerFilter.newOnTap([],count:2).map(\.id),[])
    }

    func testTastedBeersStayEligible() {
        var tasted = beer("tasted",added:"300"); tasted.tasted_date = "11/01/2026"
        XCTAssertEqual(BeerFilter.newOnTap([beer("other",added:"100"),tasted],count:1).map(\.id),["tasted"])
    }
}

final class RewardsCardStatusTests: XCTestCase {
    private let available = [Reward(id:"1",type:"Pint Glass",redeemed:false),Reward(id:"2",type:"T-Shirt",redeemed:false),Reward(id:"3",type:"Old",redeemed:true)]
    private func status(member: Bool = true, loaded: Bool, error: String? = nil, rewards: [Reward] = []) -> RewardsCardStatus {
        RewardsCardStatus(isMember:member,loaded:loaded,error:error,rewards:rewards)
    }

    func testVisitorsDoNotSeeTheCard() {
        XCTAssertEqual(status(member:false,loaded:true,rewards:available),.hidden)
    }

    func testBeforeRewardsLoadTheCardSaysItIsChecking() {
        let card = status(loaded:false)
        XCTAssertEqual(card,.checking)
        XCTAssertEqual(card.headline,"Rewards")
        XCTAssertEqual(card.detail,"Checking your rewards…")
        XCTAssertFalse(card.offersRetry)
    }

    func testAConfirmedEmptyListSaysNoneAreReady() {
        let card = status(loaded:true,rewards:[Reward(id:"3",type:"Old",redeemed:true)])
        XCTAssertEqual(card,.ready(0))
        XCTAssertEqual(card.headline,"No rewards ready")
        XCTAssertEqual(card.detail,"Keep tasting toward your next milestone.")
    }

    func testCountsOnlyUnclaimedRewards() {
        let card = status(loaded:true,rewards:available)
        XCTAssertEqual(card,.ready(2))
        XCTAssertEqual(card.headline,"2 rewards ready")
        XCTAssertEqual(card.detail,"Tap to view and claim.")
        XCTAssertEqual(status(loaded:true,rewards:[available[0]]).headline,"1 reward ready")
    }

    func testARefreshErrorOverSavedRewardsShowsTheSavedCountAndSaysSo() {
        let card = status(loaded:true,error:"Network down",rewards:available)
        XCTAssertEqual(card,.saved(2))
        XCTAssertEqual(card.headline,"2 rewards ready")
        XCTAssertEqual(card.detail,"Couldn’t refresh. Showing saved rewards.")
        XCTAssertTrue(card.offersRetry)
        XCTAssertEqual(status(loaded:true,error:"Network down").headline,"No rewards ready")
    }

    func testAFailureWithNothingSavedOffersARetryInsteadOfLoadingForever() {
        let card = status(loaded:false,error:"Network down")
        XCTAssertEqual(card,.unavailable)
        XCTAssertEqual(card.headline,"Rewards unavailable")
        XCTAssertEqual(card.detail,"Couldn’t load your rewards.")
        XCTAssertTrue(card.offersRetry)
    }

    func testNoStateClaimsZeroRewardsWithoutKnowing() {
        XCTAssertNotEqual(status(loaded:false).headline,"No rewards ready")
        XCTAssertNotEqual(status(loaded:false,error:"x").headline,"No rewards ready")
    }

    func testTheCardLineMatchesTheMockAndKeepsErrorsVisible() {
        XCTAssertEqual(status(loaded:false).cardLine,"Checking your rewards…")
        XCTAssertEqual(status(loaded:true).cardLine,"No rewards ready yet. Keep tasting.")
        XCTAssertEqual(status(loaded:true,rewards:available).cardLine,"2 rewards ready to claim")
        XCTAssertEqual(status(loaded:true,rewards:[available[0]]).cardLine,"1 reward ready to claim")
        XCTAssertEqual(status(loaded:true,error:"x",rewards:available).cardLine,"2 rewards ready. Couldn’t refresh.")
        XCTAssertEqual(status(loaded:true,error:"x").cardLine,"No rewards ready. Couldn’t refresh.")
        XCTAssertEqual(status(loaded:false,error:"x").cardLine,"Couldn’t load your rewards.")
    }

    func testSpokenSummaryJoinsHeadlineAndDetail() {
        XCTAssertEqual(status(loaded:true,rewards:available).spokenSummary,"Rewards: 2 rewards ready. Tap to view and claim.")
    }
}
