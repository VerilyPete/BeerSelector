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

    func testAnEmptyTaplistReturnsNothing() {
        XCTAssertEqual(BeerFilter.newOnTap([],count:2).map(\.id),[])
    }

    func testTastedBeersStayEligible() {
        var tasted = beer("tasted",added:"300"); tasted.tasted_date = "11/01/2026"
        XCTAssertEqual(BeerFilter.newOnTap([beer("other",added:"100"),tasted],count:1).map(\.id),["tasted"])
    }
}
