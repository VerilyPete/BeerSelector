import XCTest
import Security
@testable import BeerSelectorNative

final class CredentialFailureTests: XCTestCase {
    private enum Stage: CaseIterable { case registry, chunk, session, marker }
    private final class Failure {
        var enabled = false
        var hits = 0
        let stage: Stage
        let prefix: String
        init(_ stage: Stage, prefix: String) { self.stage = stage; self.prefix = prefix }
        func rejects(_ query: CFDictionary) -> Bool {
            guard enabled, let data = (query as NSDictionary)[kSecAttrAccount] as? Data,
                  let key = String(data:data,encoding:.utf8) else { return false }
            let matches: Bool
            switch stage {
            case .registry: matches = key == prefix + "_generations"
            case .chunk: matches = key.hasPrefix(prefix + "_") && key.hasSuffix("_1")
            case .session: matches = key.hasPrefix(prefix + "_") && key.hasSuffix("_session")
            case .marker: matches = key == prefix + "_meta"
            }
            if matches { hits += 1 }
            return matches
        }
    }

    @MainActor private func exercise(_ stage: Stage, existing: Bool = true) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let prefix = "credential_failure_" + UUID().uuidString
        let clean = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_legacy_session")
        let failure = Failure(stage,prefix:prefix)
        var injected = clean
        injected.updateItem = { query,values in failure.rejects(query) ? errSecInteractionNotAllowed : SecItemUpdate(query,values) }
        injected.addItem = { query in failure.rejects(query) ? errSecInteractionNotAllowed : SecItemAdd(query,nil) }
        let old = MemberSession(memberId:"1",storeId:"1",storeName:"Old store",sessionId:"old-session")
        let oldCookies = ["PHPSESSID":"old-session"]
        if existing { try clean.save(session:old,cookies:oldCookies) }
        let marker = try clean.read(prefix + "_meta")
        let fixture = HTTPFixture()
        let model = AppModel(api:fixture.api(configuration:APIConfiguration()),credentials:injected,monitorConnectivity:false)
        let db = try BeerDatabase(url:folder.appendingPathComponent("beers.db")); model.db = db
        model.session = existing ? old : nil
        let storeURL = existing ? "https://fsbs.beerknurd.com/bk-store-json.php?sid=1" : ""
        let memberURL = existing ? "https://fsbs.beerknurd.com/bk-member-json.php?uid=1" : ""
        try db.setPreference("all_beers_api_url",storeURL)
        try db.setPreference("my_beers_api_url",memberURL)
        try db.setPreference("native_taplist_etag","old-tag")
        try db.replaceBeers([Beer(id:"saved",name:"Saved")])
        try db.replaceBeers([Beer(id:"tasted",name:"Tasted")],tasted:true)
        try db.replaceRewards([Reward(id:"reward",type:"Saved reward",redeemed:false)])
        try db.enqueue(type:"CHECK_IN_BEER",payload:["beerId":"saved","beerName":"Saved","memberId":"1","storeId":"1"])
        try model.reload()
        model.showLogin = true
        var paths: [String] = []
        fixture.handler = { request in
            paths.append(request.url!.path)
            guard request.url!.path == "/member-dash.php" else { throw URLError(.unsupportedURL) }
            return (200,Data("https://fsbs.beerknurd.com/bk-member-json.php?uid=2 https://fsbs.beerknurd.com/bk-store-json.php?sid=2".utf8))
        }
        defer { fixture.handler = nil; try? clean.clear(); try? FileManager.default.removeItem(at:folder) }
        let url = model.api.configuration.endpoint("member-dash.php")
        let cookies = ["member_id":"2","store__id":"2","PHPSESSID":"new-session","large":String(repeating:"x",count:2400)].map {
            HTTPCookie(properties:[.domain:url.host!, .path:"/", .name:$0.key, .value:$0.value])!
        }
        failure.enabled = true
        do {
            try await model.completeLogin(url:url,nativeCookies:cookies)
            XCTFail("Expected injected Keychain failure")
        } catch {
            guard case BeerError.storage = error else { return XCTFail("Unexpected error: \(error)") }
        }
        XCTAssertGreaterThan(failure.hits,0)
        XCTAssertEqual(try clean.read(prefix + "_meta"),marker,"Failure must not replace the committed generation")
        let restored = try clean.load()
        XCTAssertEqual(restored.0,existing ? old : nil)
        XCTAssertEqual(restored.1,existing ? oldCookies : [:])
        XCTAssertEqual(model.session,existing ? old : nil)
        XCTAssertEqual(try db.preference("all_beers_api_url"),storeURL)
        XCTAssertEqual(try db.preference("my_beers_api_url"),memberURL)
        XCTAssertEqual(try db.preference("native_taplist_etag"),"old-tag")
        XCTAssertEqual(try db.beers().map(\.id),["saved"])
        XCTAssertEqual(try db.beers(tasted:true).map(\.id),["tasted"])
        XCTAssertEqual(try db.rewards().map(\.id),["reward"])
        XCTAssertEqual(try db.operations().count,1)
        XCTAssertEqual(model.allBeers.map(\.id),["saved"])
        XCTAssertEqual(model.tastedBeers.map(\.id),existing ? ["tasted"] : [])
        XCTAssertTrue(model.showLogin)
        XCTAssertEqual(paths,["/member-dash.php"],"No follow-up requests after a failed credential save")
        // Recovery must work without resetting storage, including partial orphan generations.
        failure.enabled = false
        try injected.save(session:old,cookies:oldCookies)
        XCTAssertEqual(try clean.load().0,old)
        XCTAssertEqual(try clean.load().1,oldCookies)
    }

    @MainActor func testRegistryWriteFailurePreservesPreviousAccount() async throws { try await exercise(.registry) }
    @MainActor func testLaterCookieChunkFailurePreservesPreviousAccount() async throws { try await exercise(.chunk) }
    @MainActor func testSessionWriteFailurePreservesPreviousAccount() async throws { try await exercise(.session) }
    @MainActor func testCommitMarkerFailurePreservesPreviousAccount() async throws { try await exercise(.marker) }
    @MainActor func testFirstLoginWriteFailuresLeaveNoCommittedCredentials() async throws {
        for stage in Stage.allCases { try await exercise(stage,existing:false) }
    }

    private static func account(_ query: CFDictionary) -> String? {
        ((query as NSDictionary)[kSecAttrAccount] as? Data).flatMap { String(data:$0,encoding:.utf8) }
    }
    private func generationKeys(_ store: CredentialStore, _ generation: CredentialStore.Generation) -> [String] {
        (0..<generation.count).map { "\(store.prefix)_\(generation.generation)_\($0)" } + ["\(store.prefix)_\(generation.generation)_session"]
    }
    private func savedCookies() -> [String:String] { ["PHPSESSID":"saved-session","large":String(repeating:"x",count:2400)] }
    func testClearRemovesSavedGenerationWhenEnumerationFails() throws {
        let prefix = "credential_clear_" + UUID().uuidString
        let clean = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_legacy_session")
        defer { try? clean.clear() }
        try clean.save(session:MemberSession(memberId:"1",storeId:"1",storeName:"Saved",sessionId:"saved-session"),cookies:savedCookies())
        let generation = try JSONDecoder().decode(CredentialStore.Generation.self,from:XCTUnwrap(clean.read(prefix + "_meta")))
        var injected = clean
        injected.enumerateItems = { _,_ in errSecInteractionNotAllowed }
        XCTAssertThrowsError(try injected.clear())
        let loaded = try clean.load()
        XCTAssertNil(loaded.0)
        XCTAssertEqual(loaded.1,[:])
        for key in generationKeys(clean,generation) { XCTAssertNil(try clean.read(key),key) }
    }
    func testClearRemovesEveryRegisteredGenerationWhenEnumerationFails() throws {
        let prefix = "credential_clear_" + UUID().uuidString
        let clean = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_legacy_session")
        defer { try? clean.clear() }
        var rejectDeletes = true
        var pruning = clean
        pruning.deleteItem = { query in rejectDeletes ? errSecInteractionNotAllowed : SecItemDelete(query) }
        try pruning.save(session:MemberSession(memberId:"1",storeId:"1",storeName:"First",sessionId:"first"),cookies:savedCookies())
        try pruning.save(session:MemberSession(memberId:"2",storeId:"1",storeName:"Second",sessionId:"second"),cookies:savedCookies())
        rejectDeletes = false
        let registry = try JSONDecoder().decode([CredentialStore.Generation].self,from:XCTUnwrap(clean.read(prefix + "_generations")))
        XCTAssertEqual(registry.count,2,"Failed pruning keeps both generations registered")
        let keys = registry.flatMap { generationKeys(clean,$0) }
        for key in keys { XCTAssertNotNil(try clean.read(key),key) }
        var injected = clean
        injected.enumerateItems = { _,_ in errSecInteractionNotAllowed }
        XCTAssertThrowsError(try injected.clear())
        for key in keys { XCTAssertNil(try clean.read(key),key) }
        XCTAssertNil(try clean.read(prefix + "_generations"))
        XCTAssertNil(try clean.read(prefix + "_meta"))
    }
    func testClearDeletesRemainingKeysWhenOneDeleteFails() throws {
        let prefix = "credential_clear_" + UUID().uuidString
        let clean = CredentialStore(prefix:prefix,sessionStorageKey:prefix + "_legacy_session")
        defer { try? clean.clear() }
        try clean.save(session:MemberSession(memberId:"1",storeId:"1",storeName:"Saved",sessionId:"saved-session"),cookies:savedCookies())
        let generation = try JSONDecoder().decode(CredentialStore.Generation.self,from:XCTUnwrap(clean.read(prefix + "_meta")))
        let session = "\(prefix)_\(generation.generation)_session"
        var injected = clean
        injected.deleteItem = { query in Self.account(query) == session ? errSecInteractionNotAllowed : SecItemDelete(query) }
        XCTAssertThrowsError(try injected.clear())
        XCTAssertNotNil(try clean.read(session))
        for key in generationKeys(clean,generation) where key != session { XCTAssertNil(try clean.read(key),key) }
        XCTAssertNil(try clean.read(prefix + "_meta"))
        XCTAssertNil(try clean.read(prefix + "_generations"))
    }
}
