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

final class CompactHomeModeTests: XCTestCase {
    private func beer(_ id: String, added: String) -> Beer { var beer = Beer(id:id,name:id); beer.added_date = added; return beer }
    private var taplist: [Beer] { [beer("newest",added:"500"),beer("second",added:"400"),beer("third",added:"300"),beer("fourth",added:"200"),beer("fifth",added:"100")] }
    private func mode(open: String? = nil, accessibility: Bool = false, fittedRows: Int) -> CompactHomeMode {
        CompactHomeMode(expandedID:open,taplist:taplist,accessibility:accessibility,fittedRows:fittedRows)
    }

    func testWithNothingOpenHomeFitsItsScreen() {
        XCTAssertEqual(mode(fittedRows:1),.fitted)
        XCTAssertEqual(mode(fittedRows:4),.fitted)
    }

    func testAccessibilityTextScrollsAndAlwaysShowsThreeArrivals() {
        XCTAssertEqual(mode(accessibility:true,fittedRows:1),.scrolling(rows:3))
        XCTAssertEqual(mode(open:"newest",accessibility:true,fittedRows:1),.scrolling(rows:3))
        XCTAssertEqual(mode(accessibility:true,fittedRows:4),.scrolling(rows:3))
        XCTAssertEqual(mode(open:"fourth",accessibility:true,fittedRows:4),.scrolling(rows:3))
    }

    func testOpeningAShownArrivalScrollsWithoutChangingWhichRowsShow() {
        XCTAssertEqual(mode(open:"newest",fittedRows:1),.scrolling(rows:1))
        XCTAssertEqual(mode(open:"second",fittedRows:2),.scrolling(rows:2))
        XCTAssertEqual(mode(open:"third",fittedRows:3),.scrolling(rows:3))
        XCTAssertEqual(mode(open:"fourth",fittedRows:4),.scrolling(rows:4))
    }

    func testAnExpansionForABeerHomeDoesNotShowIsIgnored() {
        XCTAssertEqual(mode(open:"second",fittedRows:1),.fitted)
        XCTAssertEqual(mode(open:"third",fittedRows:2),.fitted)
        XCTAssertEqual(mode(open:"fourth",fittedRows:3),.fitted)
        XCTAssertEqual(mode(open:"fifth",fittedRows:4),.fitted)
        XCTAssertEqual(mode(open:"gone",fittedRows:4),.fitted)
    }
}

final class CompactHomeFitTests: XCTestCase {
    func testTheLadderTriesFourRowsThenKeepsThreeBeforeGivingRowsUp() {
        XCTAssertEqual(CompactHomeFit.ladder.map(\.rows),[4,3,3,2,1])
    }

    func testOnlyTheFirstTwoStepsUseRoomySpacingSoAFourthRowNeverTightensHome() {
        XCTAssertEqual(CompactHomeFit.ladder.map(\.roomy),[true,true,false,false,false])
    }

    func testAScrollingHomeKeepsTheFitItHadWhenTheRowCountMatches() {
        XCTAssertEqual(CompactHomeFit(rows:3,roomy:false).scrolling(rows:3),CompactHomeFit(rows:3,roomy:false))
        XCTAssertEqual(CompactHomeFit(rows:4,roomy:true).scrolling(rows:4),CompactHomeFit(rows:4,roomy:true))
        XCTAssertEqual(CompactHomeFit(rows:1,roomy:false).scrolling(rows:1),CompactHomeFit(rows:1,roomy:false))
    }

    func testAScrollingHomeAskedForAnotherRowCountUsesRoomySpacing() {
        XCTAssertEqual(CompactHomeFit(rows:4,roomy:true).scrolling(rows:3),CompactHomeFit(rows:3,roomy:true))
        XCTAssertEqual(CompactHomeFit(rows:2,roomy:false).scrolling(rows:3),CompactHomeFit(rows:3,roomy:true))
        XCTAssertEqual(CompactHomeFit(rows:1,roomy:false).scrolling(rows:3),CompactHomeFit(rows:3,roomy:true))
    }
}

final class SortOrderTests: XCTestCase {
    private func beer(_ id: String, name: String, added: String, abv: Double?) -> Beer {
        var beer = Beer(id:id,name:name); beer.added_date = added; beer.abv = abv; return beer
    }

    func testEveryMenuChoiceSortsTheTaplistTheWayItsTitleSays() {
        let beers = [beer("a",name:"Bravo",added:"200",abv:6),beer("b",name:"Alpha",added:"300",abv:nil),beer("c",name:"Charlie",added:"100",abv:4)]
        let orders = SortOption.all.map { option -> [String] in
            var filter = BeerFilter(); option.apply(to:&filter)
            return filter.apply(beers).map(\.id)
        }
        XCTAssertEqual(orders,[["b","a","c"],["c","a","b"],["b","a","c"],["c","a","b"],["a","c","b"],["c","a","b"]])
    }
}
