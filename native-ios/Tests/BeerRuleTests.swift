import XCTest
@testable import BeerSelectorNative

final class BeerRuleTests: XCTestCase {
    func testUntastedIsSetDifferenceNotCountSubtraction() {
        let all = [Beer(id:"1",name:"One"),Beer(id:"2",name:"Two")]
        let tasted = [Beer(id:"1",name:"One"),Beer(id:"elsewhere",name:"Another location")]
        XCTAssertEqual(BeerFilter.untasted(all:all,tasted:tasted).map(\.id),["2"])
    }
    func testMissingABVSortsLastInBothDirections() {
        var a = Beer(id:"a",name:"A"); a.abv = 8
        var b = Beer(id:"b",name:"B"); b.abv = 4
        let unknown = Beer(id:"c",name:"C")
        var filter = BeerFilter(); filter.sort = .abv
        // The unknown row must stay last regardless of the server's input order.
        for input in [[unknown,a,b],[unknown,b,a],[a,unknown,b],[a,b,unknown],[b,unknown,a],[b,a,unknown]] {
            filter.ascending = false
            XCTAssertEqual(filter.apply(input).map(\.id),["a","b","c"],"Input: \(input.map(\.id))")
            filter.ascending = true
            XCTAssertEqual(filter.apply(input).map(\.id),["b","a","c"],"Input: \(input.map(\.id))")
        }
    }
    func testFilterMatchesLocationAndContainer() {
        var beer = Beer(id:"1",name:"Porter"); beer.brewer_loc = "Austin, TX"; beer.brew_container = "Draught"
        var filter = BeerFilter(); filter.search = "austin"; filter.container = .draft
        XCTAssertEqual(filter.apply([beer]).count,1)
        filter.container = .cans; XCTAssertTrue(filter.apply([beer]).isEmpty)
    }
    func testTastedDateSortUsesCalendarDates() {
        var a = Beer(id:"a",name:"A"); a.tasted_date = "12/31/2025"
        var b = Beer(id:"b",name:"B"); b.tasted_date = "01/01/2026"
        XCTAssertEqual(BeerFilter().apply([a,b],tasted:true).map(\.id),["b","a"])
    }
    func testTastedDateSortPreservesTiesAndMissingDateOrder() {
        var older = Beer(id:"older",name:"Older"); older.tasted_date = "12/31/2025"
        var newer = Beer(id:"newer",name:"Newer"); newer.tasted_date = "01/01/2026"
        var same = Beer(id:"same",name:"Same date"); same.tasted_date = older.tasted_date
        let missing = Beer(id:"missing",name:"Missing date")
        var malformed = Beer(id:"malformed",name:"Malformed date"); malformed.tasted_date = "not a date"
        let input = [older,missing,newer,same,malformed]
        var filter = BeerFilter()
        XCTAssertEqual(filter.apply(input,tasted:true).map(\.id),["newer","older","same","missing","malformed"])
        filter.ascending = true
        XCTAssertEqual(filter.apply(input,tasted:true).map(\.id),["missing","malformed","older","same","newer"])
    }

    func testContainerPriority() throws {
        let beer = try Beer(row:["id":"1","brew_name":"Flight","brew_container":"16 oz draft","brew_style":"Lager","abv":"9"])
        XCTAssertEqual(beer.container_type,"flight")
        let bottle = try Beer(row:["id":"2","brew_name":"Flight","brew_container":"Bottle"])
        XCTAssertEqual(bottle.container_type,"bottle")
        let size = try Beer(row:["id":"3","brew_name":"Strong","brew_container":"16 oz draft","abv":"9"])
        XCTAssertEqual(size.container_type,"pint")
    }
    func testMalformedPayloadDoesNotBecomeEmptySnapshot() throws {
        XCTAssertThrowsError(try BeerAPI.parseBeers(Data(#"[{}, {"brewInStock": "broken"}]"#.utf8)))
        XCTAssertThrowsError(try BeerAPI.parseBeers(Data(#"[{}, {"brewInStock": []}]"#.utf8)))
        XCTAssertThrowsError(try BeerAPI.parseBeers(Data(#"[{}, {"tasted_brew_current_round": {}}]"#.utf8),tasted:true))
        XCTAssertTrue(try BeerAPI.parseBeers(Data(#"[{}, {"tasted_brew_current_round": []}]"#.utf8),tasted:true).isEmpty)
        XCTAssertThrowsError(try BeerAPI.parseRewards(Data(#"[{},{},{"reward":"broken"}]"#.utf8)))
        XCTAssertTrue(try BeerAPI.parseRewards(Data(#"[{},{},{"reward":[]}]"#.utf8)).isEmpty)
    }
    func testProxyNormalizationAndNullABV() throws {
        let data = Data(#"{"beers":[{"id":"1","brew_name":"Test","enriched_abv":5.2,"enrichment_source":"description-fallback"},{"id":"2","brew_name":"Unknown","enriched_abv":null}]}"#.utf8)
        let beers = try BeerAPI.parseBeers(data,proxy:true)
        XCTAssertEqual(beers[0].abv,5.2); XCTAssertEqual(beers[0].enrichment_source,"description"); XCTAssertNil(beers[1].abv)
    }
    func testQueueParserRecoversMissingDateAndRejectsUnrecognizedOrPartialPages() throws {
        let html = #"<h3 class='brewName'>Undated Beer</h3><a href='deleteQueuedBrew.php?cid=42'>Delete</a>"#
        XCTAssertEqual(try BeerAPI.parseQueue(Data(html.utf8)),[QueueEntry(id:"42",name:"Undated Beer",date:"Date unavailable")])
        let changedDate = #"<h3 class='brewName'>Undated Beer<div class='changed-date'>Yesterday</div></h3><a href='deleteQueuedBrew.php?cid=42'>Delete</a>"#
        XCTAssertEqual(try BeerAPI.parseQueue(Data(changedDate.utf8)),[QueueEntry(id:"42",name:"Undated Beer",date:"Date unavailable")])
        for bad in ["<html>Service unavailable</html>", "<html></html>", html + "<h3 class='brewName'>Broken row</h3>", "<input TYPE='password'>"] {
            XCTAssertThrowsError(try BeerAPI.parseQueue(Data(bad.utf8)))
        }
        XCTAssertEqual(try BeerAPI.parseQueue(Data("<p>No beers currently in your queue.</p>".utf8)),[])
    }

    func testReportedLiveEmptyQueueWording() throws {
        // Exact visible wording reported by the user; markup variants are synthetic.
        for html in ["No brew in queue", "<p>No brew in queue</p>", "<div>No <strong>brew</strong> in\n queue</div>"] {
            XCTAssertEqual(try BeerAPI.parseQueue(Data(html.utf8)),[])
        }
        for html in [
            #"<input type="password"><p>No brew in queue</p>"#,
            #"<h3 class="brewName">Unreadable beer</h3><p>No brew in queue</p>"#,
            #"<a href="deleteQueuedBrew.php?cid=42">Delete</a><p>No brew in queue</p>"#
        ] {
            XCTAssertThrowsError(try BeerAPI.parseQueue(Data(html.utf8)))
        }
    }

    func testEmptyQueueRecognitionIgnoresTemplateCodeAndHTMLSpacing() throws {
        let html = #"""
        <html><head><style>.brewName { color: white; }</style></head><body>
        <script>const deletePath = 'deleteQueuedBrew.php'; const template = '<h3 class="brewName">Example</h3>';</script>
        <p>No beers <strong>currently</strong> in your
        queue.</p>
        </body></html>
        """#
        XCTAssertEqual(try BeerAPI.parseQueue(Data(html.utf8)),[])
        let scriptOnly = #"<html><script>const text = 'No beers currently in your queue.';</script><p>Service unavailable</p></html>"#
        XCTAssertThrowsError(try BeerAPI.parseQueue(Data(scriptOnly.utf8)))
    }

    func testQueueHTMLAndFormEscaping() throws {
        let html = #"<h3 class="brewName">A &amp; B (Draft)<div class="brew_added_date">Sep 10, 2026</div></h3><a href="deleteQueuedBrew.php?cid=123">Delete</a>"#
        let queue = try BeerAPI.parseQueue(Data(html.utf8))
        XCTAssertEqual(queue,[QueueEntry(id:"123",name:"A & B (Draft)",date:"Sep 10, 2026")])
        XCTAssertEqual(String(decoding:BeerAPI.form(["name":"A&B + 5%"]),as:UTF8.self),"name=A%26B%20%2B%205%25")
    }
    func testTrustChecksRejectLookalikesAndQuerySpoofing() {
        let c = APIConfiguration()
        XCTAssertTrue(c.trustedLogin(URL(string:"https://tapthatapp.beerknurd.com/member-dash.php")!))
        XCTAssertFalse(c.trustedLogin(URL(string:"https://tapthatapp.beerknurd.com.evil.test/member-dash.php")!))
        XCTAssertFalse(c.trustedLogin(URL(string:"http://tapthatapp.beerknurd.com/member-dash.php")!))
        XCTAssertFalse(APIConfiguration.dataURL(URL(string:"https://evil.test/bk-member-json.php?uid=1")!))
    }
    func testDescriptionABVChoosesGlassWithoutBecomingAuthoritativeABV() throws {
        let beer = try Beer(row:["id":"1","brew_name":"Strong ale","brew_container":"Draft","brew_description":"<p>9.5% ABV</p>"])
        XCTAssertEqual(beer.inferredContainer,"tulip")
        XCTAssertNil(beer.abv,"Description-derived ABV must not enter the persisted ABV field")
    }

    func testEqualSortKeysPreserveUpstreamOrder() {
        var filter = BeerFilter()
        filter.sort = .abv
        let beers = [Beer(id:"third",name:"Third"),Beer(id:"first",name:"First"),Beer(id:"second",name:"Second")]
        for ascending in [false,true] {
            filter.ascending = ascending
            XCTAssertEqual(filter.apply(beers).map(\.id),["third","first","second"])
        }
    }
}
