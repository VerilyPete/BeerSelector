import XCTest
@testable import BeerSelectorNative

final class SortOptionTests: XCTestCase {
    func testTheMenuOffersEachSortInBothDirections() {
        XCTAssertEqual(SortOption.all.map(\.menuTitle),["Newest first","Oldest first","Name A–Z","Name Z–A","Highest ABV","Lowest ABV"])
        XCTAssertEqual(SortOption.all.map(\.chipLabel),["DATE · NEW","DATE · OLD","NAME · A-Z","NAME · Z-A","ABV · HIGH","ABV · LOW"])
    }

    func testEachOptionSortsTheListItNames() {
        let expected: [(BeerSort,Bool)] = [(.date,false),(.date,true),(.name,true),(.name,false),(.abv,false),(.abv,true)]
        XCTAssertEqual(SortOption.all.map(\.sort),expected.map(\.0))
        XCTAssertEqual(SortOption.all.map(\.ascending),expected.map(\.1))
    }

    func testTheChipFollowsTheFilter() {
        var filter = BeerFilter()
        XCTAssertEqual(SortOption(filter:filter).chipLabel,"DATE · NEW")
        filter.sort = .abv; filter.ascending = true
        XCTAssertEqual(SortOption(filter:filter).chipLabel,"ABV · LOW")
        filter.sort = .name; filter.ascending = false
        XCTAssertEqual(SortOption(filter:filter).chipLabel,"NAME · Z-A")
    }

    func testChoosingAnOptionSetsSortAndDirectionTogether() {
        var filter = BeerFilter(); filter.search = "ipa"; filter.container = .draft
        SortOption.all[2].apply(to:&filter)
        XCTAssertEqual(filter.sort,.name)
        XCTAssertTrue(filter.ascending)
        XCTAssertEqual(filter.search,"ipa")
        XCTAssertEqual(filter.container,.draft)
    }

    func testOnlyTheABVSortUsesTheBeerIconsGlyph() {
        XCTAssertEqual(SortOption.all.map(\.usesBeerIcon),[false,false,false,false,true,true])
    }

    func testSpokenLabelsReadNaturally() {
        XCTAssertEqual(SortOption.all.map(\.spokenLabel),["Date, newest first","Date, oldest first","Name, A to Z","Name, Z to A","ABV, highest first","ABV, lowest first"])
    }
}
