import SwiftUI
import Network
import WebKit

@MainActor
final class AppModel: ObservableObject {
    @Published var session: MemberSession? { didSet { if oldValue?.identity != session?.identity { semanticIndex.invalidate() } } }
    @Published var beerFeedback: [BeerFeedback] = []
    @Published var recentTastings: [Beer] = []
    @Published var showRecommendations = false
    let semanticIndex = SemanticTaplistIndex()
    lazy var recommendations = RecommendationController(model:self)
    private var taplistValidation: UUID?
    private var tastingValidation: UUID?
    private var queueValidation: UUID?
    var recommendationAccount: String? {
        guard isMember, let member = session else { return nil }
        // Member IDs are not proven globally unique across Saucer locations.
        return (api.configuration.baseURL.host ?? "") + ":" + member.identity
    }
    var recommendationSnapshot: RecommendationSnapshot {
        RecommendationSnapshot(epoch:epoch,identity:session?.identity,offline:offline,
            taplist:allBeers,history:recentTastings,excluded:recommendationExcludedIDs,feedback:beerFeedback,repeatHistory:tastedBeers,
            taplistValidation:taplistValidation,tastingValidation:tastingValidation,queueValidation:queueValidation)
    }
    var recommendationExcludedIDs: Set<String> {
        Set(tastedBeers.map(\.id)).union(RecommendationRules.dislikedIDs(in:allBeers,feedback:beerFeedback)).union(queuedBeerIDs).union(busyIDs)
            .union(operations.filter { ownsOperation($0) }.compactMap { $0.payload["beerId"] })
            .union(allBeers.filter { beer in queue.contains { $0.name.localizedCaseInsensitiveContains(beer.brew_name) } }.map(\.id))
    }
    func setBeerRating(_ beer: Beer, rating: BeerRating, account: String?) {
        guard let account, account == recommendationAccount, let db,
              tastedBeers.contains(where:{ $0.id == beer.id }) || beerFeedback.contains(where:{ $0.id == beer.id }) else { return }
        do {
            try db.saveBeerFeedback(BeerFeedback(beer:beer,rating:rating),account:account)
            beerFeedback = try db.beerFeedback(account:account); recommendations.cancel()
        } catch { self.error = error.localizedDescription }
    }
    func deleteCachedBeerFeedback(account: String?) {
        guard let account, account == recommendationAccount, let db else { return }
        do {
            try db.deleteCachedBeerFeedback(account:account)
            beerFeedback = try db.beerFeedback(account:account); recommendations.cancel()
        } catch { self.error = error.localizedDescription }
    }
    func clearRecommendationHistory() {
        guard let db, let account = recommendationAccount else { return }
        do {
            try db.transaction { try db.clearRecentTastings(account:account,baseline:tastedBeers) }
            recentTastings = []; recommendations.cancel()
        } catch { self.error = error.localizedDescription }
    }
    /// A failed source or a queue request already in progress cannot certify freshness.
    func validateRecommendationSources() async -> Bool {
        let token = epoch
        guard isMember, !offline, !previewMode, !processing else { return false }
        let previousQueue = queueValidation
        await refresh(requireNewPass:true)
        guard token == epoch, !Task.isCancelled, !offline, taplistValidation != nil, tastingValidation != nil else { return false }
        await refreshQueue()
        return token == epoch && !Task.isCancelled && !offline && !processing && queueError == nil &&
            !loadingQueue && queueValidation != nil && queueValidation != previousQueue
    }
    @Published var allBeers: [Beer] = [] {
        didSet {
            if previewMode { semanticIndex.invalidate() }
            else { semanticIndex.schedule(epoch:epoch,account:recommendationAccount,taplist:allBeers) }
        }
    }
    @Published var tastedBeers: [Beer] = []
    @Published var rewards: [Reward] = []
    @Published var queue: [QueueEntry] = []
    @Published var queuedBeerIDs: Set<String> = []
    @Published var operations: [PendingOperation] = []
    @Published var loading = true
    @Published var refreshing = false
    @Published var loadingQueue = false
    @Published var queueLoaded = false
    @Published var queueError: String?
    @Published var rewardsLoaded = false
    @Published var rewardsError: String?
    @Published var rewardsNotice: String?
    @Published var offline = false
    @Published var error: String?
    @Published var notice: String?
    @Published var busyIDs: Set<String> = []
    @Published var tab: AppTab = .home
    @Published var showSettings = false
    @Published var showLogin = false
    @Published var showQueue = false
    @Published var showOperations = false
    @Published var showRewards = false
    @Published var browserURL: URL?
    var db: BeerDatabase?
    let api: BeerAPI
    lazy var enrichment = EnrichmentService(api:api)
    let credentials: CredentialStore
    let liveActivity = LiveActivityController()
    private var cookies: [String:String] = [:]
    private var accountCleanupTask: Task<[String], Never>?
    var activityCleanup: (@MainActor () async -> Void)?
    var activityUpdate: (@MainActor (MemberSession, [QueueEntry]) async -> Void)?
    var webCookieCleanup: (@MainActor () async -> Void)?
    private let monitor = NWPathMonitor()
    private var epoch = UUID() { didSet { semanticIndex.invalidate(); busyIDs = []; recommendations.cancel(); recentTastings = []; beerFeedback = []; taplistValidation = nil; tastingValidation = nil; queueValidation = nil; cancelEnrichmentUpdates(); queueLoaded = false; queueError = nil; loadingQueue = false; rewardsLoaded = false; rewardsError = nil; rewardsNotice = nil } }
    @Published private(set) var processing = false
    private var lastFocusRefresh = Date.distantPast
    private var pendingURL: URL?
    private var started = false
    private var refreshTask: Task<Void, Never>?
    private var refreshEpoch: UUID?
    private var refreshAgain = false
    private var queueEpoch: UUID?
    private(set) var enrichmentTask: Task<Void,Never>?
    private var enrichmentGeneration = UUID()
    var previewMode: Bool { session?.memberId == "preview" }
    var isMember: Bool { session?.valid == true && session?.isVisitor == false }
    // Account restoration comes from Keychain; missing cached data links are recoverable.
    var configured: Bool { session?.valid == true && db != nil }
    func ownsOperation(_ operation: PendingOperation) -> Bool {
        isMember && operation.payload["memberId"] == session?.memberId && operation.payload["storeId"] == session?.storeId
    }
    func operationRestriction(_ operation: PendingOperation) -> String? {
        guard isMember else { return "Sign in to the account and location that saved this request to retry it." }
        guard operation.payload["memberId"] != nil, operation.payload["storeId"] != nil else {
            return "This request has no account or location information. Remove it and check your queue before submitting again."
        }
        guard operation.payload["memberId"] == session?.memberId else { return "Saved by another account. Sign in to that account to retry." }
        guard operation.payload["storeId"] == session?.storeId else { return "Saved at another location. Sign in at that location to retry." }
        guard operation.type == "CHECK_IN_BEER", operation.payload["beerId"] != nil, operation.payload["beerName"] != nil else {
            return "This request cannot be retried. Remove it and check your queue before submitting again."
        }
        return nil
    }
    func hasSavedCheckIn(_ beerID: String) -> Bool {
        operations.contains { ownsOperation($0) && $0.type == "CHECK_IN_BEER" && $0.payload["beerId"] == beerID }
    }
    var untasted: [Beer] {
        let pending = Set(operations.filter { ownsOperation($0) && $0.type == "CHECK_IN_BEER" && ["pending","retrying"].contains($0.status) }.compactMap { $0.payload["beerId"] })
        return BeerFilter.untasted(all:allBeers,tasted:tastedBeers).filter { !queuedBeerIDs.contains($0.id) && !pending.contains($0.id) }
    }
    init(api: BeerAPI = BeerAPI(), credentials: CredentialStore = CredentialStore(), monitorConnectivity: Bool = true) {
        self.api = api
        self.credentials = credentials
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = self.offline
                self.offline = path.status != .satisfied
                if wasOffline && !self.offline {
                    try? await Task.sleep(for:.seconds(2))
                    await self.processOperations()
                }
            }
        }
        if monitorConnectivity { monitor.start(queue:DispatchQueue(label:"BeerSelector.connectivity")) }
    }
    deinit { monitor.cancel(); enrichmentTask?.cancel() }
    #if DEBUG
    func invalidatePreviewWork() { epoch = UUID() }
    #endif
    func start() async {
        guard !started else { return }; started = true
        loading = true
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--preview-fixtures") {
            do { try loadPreviewFixtures() } catch { self.error = error.localizedDescription; loading = false }
            return
        }
        #endif
        do {
            db = try BeerDatabase()
            var failures: [String] = []
            do { try restoreCredentials() }
            catch { failures.append(error.localizedDescription) }
            do { try reload() } catch { failures.append(error.localizedDescription) }
            if !configured { showSettings = true }
            if !failures.isEmpty { error = failures.joined(separator:"\n") }
        } catch { self.error = error.localizedDescription }
        loading = false
        if let url = pendingURL { pendingURL = nil; handleURL(url) }
        if configured {
            if isMember && !offline { do { try await autoLogin() } catch { /* Cached lists stay available when reauthentication fails. */ } }
            await refresh(); await refreshQueue(); await processOperations()
        }
    }
    func restoreCredentials() throws {
        guard let db else { throw BeerError.storage("Database is not open") }
        guard try db.preference("native_account_transition") == nil else {
            session = nil; cookies = [:]; tastedBeers = []; rewards = []; queue = []; queuedBeerIDs = []
            throw BeerError.storage("An account change was interrupted. Please sign in again.")
        }
        let loaded = try credentials.load()
        session = loaded.0; cookies = loaded.1
    }
    func reload() throws {
        guard let db else { throw BeerError.storage("Database is not open") }
        var failures: [String] = []
        do {
            if let account = recommendationAccount {
                if try db.preference("recent_tastings_owner") == nil {
                    try db.transaction { try db.recordTastings(db.beers(tasted:true),account:account) }
                }
                recentTastings = try db.recentTastings(account:account)
                beerFeedback = try db.beerFeedback(account:account)
            } else { recentTastings = []; beerFeedback = [] }
        } catch { failures.append("Recent tastings: " + error.localizedDescription) }
        do { allBeers = try db.beers() } catch { failures.append("Taplist: " + error.localizedDescription) }
        do { tastedBeers = isMember ? try db.beers(tasted:true) : [] } catch { failures.append("Tastings: " + error.localizedDescription) }
        do {
            rewards = isMember ? try db.rewards() : []
            if !rewards.isEmpty { rewardsLoaded = true }
        } catch {
            rewardsError = "Couldn’t read saved rewards. Please try again."
            failures.append("Rewards: " + error.localizedDescription)
        }
        do { operations = try db.operations() } catch { failures.append("Pending operations: " + error.localizedDescription) }
        if !failures.isEmpty { throw BeerError.storage(failures.joined(separator:"\n")) }
    }
    func localRetry() {
        do { try reload(); error = nil } catch { self.error = error.localizedDescription }
    }
    func retrySavedRewards() {
        guard isMember, let db else { return }
        do { rewards = try db.rewards(); rewardsLoaded = true; rewardsError = nil }
        catch { rewardsError = "Couldn’t read saved rewards. Please try again." }
    }
    func refreshRewards() async { await refresh(requireNewPass:true) }
    func refreshFinder() async {
        let token = epoch
        await refresh()
        guard token == epoch else { return }
        await refreshQueue()
    }
    func refresh(requireNewPass: Bool = false) async {
        if let refreshTask, refreshEpoch == epoch {
            if requireNewPass { refreshAgain = true }
            await refreshTask.value; return
        }
        let token = epoch
        // SwiftUI can cancel its refreshable action when the view changes. The
        // model owns this shared refresh so cached data still gets updated.
        let task = Task { @MainActor in
            repeat {
                guard token == epoch else { return }
                refreshAgain = false
                await performRefresh(token:token)
            } while token == epoch && refreshAgain
            if refreshEpoch == token { refreshTask = nil; refreshEpoch = nil }
        }
        refreshEpoch = token
        refreshTask = task
        await task.value
    }
    /// Recover missing database configuration without making a restored member sign in again.
    private func restoreDataLinks(token: UUID) async throws {
        guard let db, let member = session, member.valid else { return }
        let oldStore = try db.preference("all_beers_api_url")
        let oldMember = try db.preference("my_beers_api_url")
        guard (oldStore ?? "").isEmpty || (!member.isVisitor && (oldMember ?? "").isEmpty) else { return }
        let links: (member: String, store: String)
        if member.isVisitor {
            guard member.storeId.allSatisfy({ $0.isASCII && $0.isNumber }) else { throw BeerError.invalidResponse("Invalid saved location") }
            links = ("none://visitor_mode", "https://fsbs.beerknurd.com/bk-store-json.php?sid=\(member.storeId)")
        } else {
            let (data,_) = try await api.request(api.configuration.endpoint("member-dash.php"),member:member,cookies:cookies)
            links = try Self.dataLinks(in:data)
            guard URLComponents(string:links.store)?.queryItems?.first(where:{ $0.name == "sid" })?.value == member.storeId else {
                throw BeerError.invalidResponse("The restored account returned a different location. Please sign in again.")
            }
        }
        try Task.checkCancellation()
        guard token == epoch, session?.identity == member.identity else { throw BeerError.changedAccount }
        try db.transaction {
            try db.setPreference("all_beers_api_url",links.store)
            try db.setPreference("my_beers_api_url",links.member)
        }
    }
    private static func dataLinks(in data: Data) throws -> (member: String, store: String) {
        let html = String(decoding:data,as:UTF8.self)
        func extract(_ pattern: String) throws -> String {
            guard let range = html.range(of:pattern,options:.regularExpression), let found = URL(string:String(html[range])), APIConfiguration.dataURL(found) else { throw BeerError.invalidResponse("Could not read the account data links") }
            return found.absoluteString
        }
        return try (extract(#"https://[^"'\s]+bk-member-json\.php\?uid=\d+"#),
                    extract(#"https://[^"'\s]+bk-store-json\.php\?sid=\d+"#))
    }
    private func performRefresh(token: UUID) async {
        guard token == epoch, !previewMode, let db, configured else { return }
        cancelEnrichmentUpdates()
        taplistValidation = nil; tastingValidation = nil
        var pendingEnrichment = EnrichmentService.Pending()
        refreshing = true
        rewardsError = nil
        defer { if token == epoch { refreshing = false } }
        let interval = Diagnostics.shared.begin(.refresh)
        var outcome = Diagnostics.Outcome.cancelled
        defer { interval.finish(outcome) }
        var errors: [String] = []
        do { try await restoreDataLinks(token:token) }
        catch {
            guard token == epoch, !Self.isRefreshCancellation(error) else { return }
            self.error = "Couldn’t restore your saved data links. Try Refresh All Data in Settings. " + error.localizedDescription
            outcome = .failure
            return
        }
        guard token == epoch else { return }
        if let raw = try? db.preference("all_beers_api_url"), let url = URL(string:raw), APIConfiguration.dataURL(url) {
            do {
                var beers: [Beer]
                var etag: String?
                var notModified = false
                var pending = EnrichmentService.Pending()
                if enrichment.configured, let sid = session?.storeId {
                    do {
                        let stored = allBeers.isEmpty ? nil : try db.preference("native_taplist_etag")
                        let response = try await enrichment.taplist(storeID:sid,etag:stored)
                        notModified = response.beers == nil
                        beers = response.beers ?? allBeers
                        etag = response.etag
                    } catch {
                        if Self.isRefreshCancellation(error) { return }
                        enrichment.recordFallback()
                        let (data,_) = try await api.request(url)
                        let enriched = await enrichment.enrichWithPending(try BeerAPI.parseBeers(data))
                        beers = enriched.beers; pending = enriched.pending
                    }
                } else {
                    let (data,_) = try await api.request(url)
                    beers = try BeerAPI.parseBeers(data)
                }
                guard token == epoch, try db.preference("all_beers_api_url") == raw else { throw BeerError.changedAccount }
                // Preserve previously enriched values when using the direct upstream fallback.
                let previous = Dictionary(allBeers.map { ($0.id,$0) },uniquingKeysWith: { first,_ in first })
                for index in beers.indices where beers[index].abv == nil {
                    if let old = previous[beers[index].id] { beers[index].abv = old.abv; beers[index].enrichment_source = old.enrichment_source; beers[index].enrichment_confidence = old.enrichment_confidence; beers[index].container_type = beers[index].inferredContainer }
                }
                try db.transaction {
                    if !notModified { try db.replaceBeers(beers); try db.setPreference("native_taplist_etag",etag) }
                    try db.setPreference("last_all_beers_refresh",String(Date().timeIntervalSince1970 * 1000))
                }
                taplistValidation = UUID()
                pendingEnrichment.merge(pending)
            } catch {
                if Self.isRefreshCancellation(error) { return }
                errors.append(error.localizedDescription)
            }
        }
        // An old store response must not start requests for the newly signed-in member.
        guard token == epoch else { return }
        if isMember, let raw = try? db.preference("my_beers_api_url"), let url = URL(string:raw), APIConfiguration.dataURL(url) {
            do {
                let (data,_) = try await api.request(url)
                guard epoch == token, try db.preference("my_beers_api_url") == raw else { throw BeerError.changedAccount }
                // Each source validates before its own replacement; malformed rewards cannot erase tastings.
                do {
                    let enriched = await enrichment.enrichWithPending(try BeerAPI.parseBeers(data,tasted:true))
                    let tasted = enriched.beers
                    guard token == epoch else { throw BeerError.changedAccount }
                    try db.transaction {
                        if let account = recommendationAccount {
                            // Archive the old round before the authoritative empty/new round replaces it.
                            try db.recordTastings(db.beers(tasted:true),account:account)
                            try db.observeChoiceTastings(tasted,previous:db.beers(tasted:true),account:account)
                            try db.recordTastings(tasted,account:account)
                        }
                        try db.replaceBeers(tasted,tasted:true)
                        try db.setPreference("last_my_beers_refresh",String(Date().timeIntervalSince1970 * 1000))
                    }
                    tastingValidation = UUID()
                    pendingEnrichment.merge(enriched.pending)
                } catch {
                    if Self.isRefreshCancellation(error) { return }
                    errors.append(error.localizedDescription)
                }
                guard token == epoch else { return }
                do {
                    let rewards = try BeerAPI.parseRewards(data)
                    try db.transaction { try db.replaceRewards(rewards) }
                    rewardsLoaded = true
                }
                catch {
                    if Self.isRefreshCancellation(error) || token != epoch { return }
                    rewardsError = "Couldn’t refresh your rewards. Please try again."
                    errors.append(error.localizedDescription)
                }
            } catch {
                if Self.isRefreshCancellation(error) || token != epoch { return }
                rewardsError = "Couldn’t refresh your rewards. Please try again."
                errors.append(error.localizedDescription)
            }
        } else if isMember {
            rewardsError = "Rewards are unavailable. Sign in again to restore access."
        }
        guard token == epoch else { return }
        do { try reload() } catch { errors.append(error.localizedDescription) }
        outcome = errors.isEmpty ? .success : .failure
        error = errors.isEmpty ? nil : errors.joined(separator:"\n")
        startEnrichmentUpdates(pendingEnrichment,token:token,database:db)
    }
    private func cancelEnrichmentUpdates() {
        enrichmentTask?.cancel(); enrichmentTask = nil
        enrichmentGeneration = UUID()
    }
    private func startEnrichmentUpdates(_ pending: EnrichmentService.Pending,token: UUID,database: BeerDatabase) {
        guard !pending.ids.isEmpty else { return }
        let generation = enrichmentGeneration
        let memberID = session?.memberId, storeID = session?.storeId
        let taplistURL = try? database.preference("all_beers_api_url")
        let memberURL = try? database.preference("my_beers_api_url")
        let service = enrichment
        let current: () -> Bool = { [weak self] in
            guard let self else { return false }
            return self.epoch == token && self.enrichmentGeneration == generation && self.db === database &&
                self.session?.memberId == memberID && self.session?.storeId == storeID && !self.previewMode &&
                (try? database.preference("all_beers_api_url")) == taplistURL &&
                (try? database.preference("my_beers_api_url")) == memberURL
        }
        enrichmentTask = Task { @MainActor [weak self] in
            await service.poll(pending,isCurrent:current) { [weak self] updates in
                guard let self, current(), !self.refreshing else { return }
                try self.applyEnrichmentUpdates(updates,database:database)
            }
            if let self, self.enrichmentGeneration == generation { self.enrichmentTask = nil }
        }
    }
    private func applyEnrichmentUpdates(_ updates: [String:EnrichmentService.EnrichmentRow],database: BeerDatabase) throws {
        // Read the current rows, not a captured refresh snapshot. Never insert a
        // removed beer, overwrite tasting metadata, or advance refresh timestamps.
        var currentAll: [Beer] = [], currentTasted: [Beer] = []
        try database.transaction {
            for tasted in [false,true] {
                let current = try database.beers(tasted:tasted)
                let merged = try current.map { beer -> Beer in
                    guard let update = updates[beer.id] else { return beer }
                    let value = update.applying(to:beer)
                    if value != beer {
                        let table = tasted ? "tasted_brew_current_round" : "allbeers"
                        try database.execute("UPDATE \(table) SET abv=?,enrichment_confidence=?,enrichment_source=?,brew_description=?,container_type=? WHERE id=?",
                            [value.abv.map { String($0) },value.enrichment_confidence.map { String($0) },value.enrichment_source,value.brew_description,value.container_type,value.id])
                    }
                    return value
                }
                if tasted { currentTasted = merged } else { currentAll = merged }
            }
        }
        allBeers = currentAll
        tastedBeers = isMember ? currentTasted : []
    }
    private static func isRefreshCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled || Task.isCancelled
    }
    func foreground() async {
        await liveActivity.expireIfNeeded()
        guard !loading, Date().timeIntervalSince(lastFocusRefresh) > 30, configured else { return }
        lastFocusRefresh = Date()
        await refresh(); await refreshQueue(); await processOperations()
    }
    func completeLogin(url: URL, nativeCookies: [HTTPCookie]) async throws {
        let interval = Diagnostics.shared.begin(.login)
        do {
            let loginEpoch = epoch
            guard api.configuration.trustedLogin(url), ["/member-dash.php","/visitor.php"].contains(url.path), let db else { throw BeerError.sessionExpired }
            var values: [String:String] = [:]
            for cookie in nativeCookies {
                let domain = cookie.domain.trimmingCharacters(in:CharacterSet(charactersIn:"."))
                guard let host = api.configuration.baseURL.host, host == domain || host.hasSuffix("." + domain) else { continue }
                values[cookie.name] = cookie.value.removingPercentEncoding ?? cookie.value
            }
            let visitor = url.path == "/visitor.php"
            guard let sid = values["store__id"] ?? values["store"], !sid.isEmpty else { throw BeerError.invalidResponse("Missing store information") }
            let next = MemberSession(memberId:visitor ? "visitor" : values["member_id"] ?? "",storeId:sid,storeName:values["store_name"] ?? "Flying Saucer",sessionId:values["PHPSESSID"] ?? (visitor ? "visitor_session" : ""),username:values["username"],firstName:values["first_name"],lastName:values["last_name"],email:values["email"],cardNum:values["cardNum"])
            guard next.valid else { throw BeerError.invalidResponse("Incomplete account details") }
            var memberURL = "none://visitor_mode"
            var storeURL = "https://fsbs.beerknurd.com/bk-store-json.php?sid=\(sid)"
            if !visitor {
                let (data,_) = try await api.request(url,member:next,cookies:values)
                let links = try Self.dataLinks(in:data)
                memberURL = links.member; storeURL = links.store
            }
            // Prior login/logout cleanup may still be deleting browser cookies or activities.
            // Wait before publishing a new account; old server requests are independent.
            if let accountCleanupTask { _ = await accountCleanupTask.value }
            try Task.checkCancellation()
            guard loginEpoch == epoch else { throw BeerError.changedAccount }
            let previous = try credentials.load()
            let oldConfiguration = try db.preference("all_beers_api_url")
            let previousTransition = try db.preference("native_account_transition")
            // Persist before touching Keychain so an interrupted or failed rollback
            // cannot pair the new credentials with the previous member's cache.
            try db.transaction {
                try db.setPreference("native_account_transition","pending")
                try db.setPreference("all_beers_api_url","")
            }
            var credentialsCommitted = false
            do {
            // save publishes its new generation only after every required write succeeds.
            // Until then the existing credentials remain authoritative; do not rewrite them.
            try credentials.save(session:next,cookies:visitor ? [:] : values)
            credentialsCommitted = true
            epoch = UUID()
            try db.transaction {
                if session?.identity != next.identity { try db.forgetRecentTastings() }
                if session?.identity != next.identity {
                    try db.execute("DELETE FROM allbeers"); try db.execute("DELETE FROM tasted_brew_current_round"); try db.execute("DELETE FROM rewards")
                }
                try db.setPreference("native_taplist_etag",nil)
                try db.setPreference("is_visitor_mode",visitor ? "true" : "false")
                try db.setPreference("my_beers_api_url",memberURL)
                try db.setPreference("first_launch","false")
                try db.setPreference("all_beers_api_url",storeURL)
                try db.setPreference("native_account_transition",nil)
            }
            } catch {
                do {
                    if credentialsCommitted {
                        if let old = previous.0 { try credentials.save(session:old,cookies:previous.1) } else { try credentials.clear() }
                    }
                    try db.transaction {
                        try db.setPreference("all_beers_api_url",oldConfiguration)
                        try db.setPreference("native_account_transition",previousTransition)
                    }
                } catch {
                    // Leave the persistent transition marker in place until a full
                    // login succeeds. Do not expose either member's state meanwhile.
                    epoch = UUID(); refreshing = false
                    session = nil; cookies = [:]; tastedBeers = []; rewards = []; queue = []; queuedBeerIDs = []
                    notice = nil; showSettings = true; showLogin = true
                    await endAccountActivities()
                    throw BeerError.storage("Account recovery could not finish. Please sign in again.")
                }
                throw error
            }
            let committedEpoch = epoch
            session = next; cookies = visitor ? [:] : values
            queue = []; queuedBeerIDs = []
            let previousCleanup = accountCleanupTask
            let cleanup = Task { @MainActor () -> [String] in
                if let previousCleanup { _ = await previousCleanup.value }
                if visitor { await clearWebCookies() }
                await endAccountActivities()
                return []
            }
            accountCleanupTask = cleanup
            _ = await cleanup.value
            guard committedEpoch == epoch else { throw BeerError.changedAccount }
            accountCleanupTask = nil
            showLogin = false; showSettings = false; tab = .home
            try reload(); await refresh()
            guard committedEpoch == epoch else { throw BeerError.changedAccount }
            await refreshQueue()
            guard committedEpoch == epoch else { throw BeerError.changedAccount }
            interval.finish(.success)
        } catch { interval.finish(Diagnostics.isCancellation(error) ? .cancelled : .failure); throw error }
    }
    func autoLogin() async throws {
        guard let member = session, !member.isVisitor else { throw BeerError.sessionExpired }
        let token = epoch
        let (data,_) = try await api.request(api.configuration.endpoint("auto-login.php"),method:"POST",fields:[:],member:member,cookies:cookies,retry:false)
        guard token == epoch else { throw BeerError.changedAccount }
        guard let object = try JSONSerialization.jsonObject(with:data) as? [String:Any], let raw = object["session"] else { throw BeerError.sessionExpired }
        let next = try JSONDecoder().decode(MemberSession.self,from:JSONSerialization.data(withJSONObject:raw))
        guard next.valid, next.identity == member.identity else { throw BeerError.sessionExpired }
        try credentials.save(session:next,cookies:cookies); session = next
    }
    func refreshQueue() async {
        guard !previewMode, (!loadingQueue || queueEpoch != epoch), isMember, let member = session else { return }
        let token = epoch
        queueEpoch = token; loadingQueue = true; queueError = nil
        defer { if queueEpoch == token { queueEpoch = nil; loadingQueue = false } }
        do {
            let (data,_) = try await api.request(api.configuration.endpoint("memberQueues.php"),member:member,cookies:cookies)
            let next = try BeerAPI.parseQueue(data)
            guard token == epoch else { return }
            queue = next; queueLoaded = true; queueValidation = UUID()
            queuedBeerIDs = Set(next.compactMap { entry in allBeers.first { entry.name.contains($0.brew_name) || $0.brew_name.contains(entry.name) }?.id })
            if let activityUpdate { await activityUpdate(member,next) }
            else { await liveActivity.update(member:member,queue:next) }
        } catch { if token == epoch, !Diagnostics.isCancellation(error) { queueError = "Couldn’t refresh your queue. Please try again." } }
    }
    @discardableResult func checkIn(_ beer: Beer, recommendation: Bool = false, choiceContextID: String? = nil) async -> CheckInResult {
        guard !previewMode, isMember, let member = session, let db, !busyIDs.contains(beer.id) else { return .unavailable }
        guard !tastedBeers.contains(where: { $0.id == beer.id }), !hasSavedCheckIn(beer.id) else { return .unavailable }
        if recommendation && (offline || processing || recommendationExcludedIDs.contains(beer.id) || !allBeers.contains(where: { $0.id == beer.id })) { return .unavailable }
        let token = epoch
        busyIDs.insert(beer.id); defer { if token == epoch { busyIDs.remove(beer.id) } }
        var payload = ["beerId":beer.id,"beerName":beer.brew_name,"storeId":member.storeId,"storeName":member.storeName,"memberId":member.memberId]
        if recommendation { payload["recommendation"] = "true" }
        if let choiceContextID { payload["choiceContextID"] = choiceContextID }
        var savedRecommendation = false
        do {
            let id: String
            var manualChoice: BeerChoiceContext?
            if !recommendation, recommendationAccount != nil {
                // Capture intent even offline; acknowledgement is recorded only after delivery.
                var choice = BeerChoiceContext(taplist:allBeers.contains(where:{ $0.id == beer.id }) ? allBeers : allBeers + [beer],shown:[],preferences:.init(),usedModel:false,taplistValidation:taplistValidation)
                choice.selected = [beer.id]
                choice.selectedAt = [beer.id:choice.presentedAt]
                payload["choiceContextID"] = choice.id
                manualChoice = choice
            }
            id = try db.enqueue(type:"CHECK_IN_BEER",payload:payload)
            savedRecommendation = recommendation
            try reload()
            if let choice = manualChoice, let account = recommendationAccount {
                do { try db.saveChoicePresentation(choice,account:account) }
                catch { self.error = error.localizedDescription }
            }
            notice = offline ? "Check-in saved. It will retry when you’re connected." : nil
            if offline { return .savedForRetry }
            let results = await processOperations(only:recommendation ? id : nil)
            guard token == epoch else { return .unavailable }
            return results[id] ?? (recommendation ? .needsReview : .savedForRetry)
        } catch {
            if token == epoch { self.error = error.localizedDescription }
            return savedRecommendation ? .needsReview : .failed
        }
    }
    @discardableResult func processOperations(only operationID: String? = nil) async -> [String:CheckInResult] {
        var results: [String:CheckInResult] = [:]
        guard !previewMode, !processing, !offline, isMember, let db else { return results }
        processing = true; defer { processing = false }
        let interval = Diagnostics.shared.begin(.queue)
        var outcome = Diagnostics.Outcome.success
        defer { interval.finish(outcome) }
        let token = epoch
        do {
            func canDispatch(_ op: PendingOperation) -> Bool {
                guard operationID == nil || operationID == op.id else { return false }
                if op.payload["recommendation"] == "true" {
                    // Only the current confirmed submission or an explicit retry
                    // authorizes this one operation; background drains never do.
                    return operationID == op.id && ["pending","failed"].contains(op.status)
                }
                return op.status == "pending"
            }
            for op in try db.operations() where canDispatch(op) {
                guard !offline, !Task.isCancelled, let member = session, token == epoch else { outcome = .cancelled; return results }
                guard try db.operations().contains(where: { $0.id == op.id && canDispatch($0) }) else { continue }
                // Never replay a previous account's or location's write under a new session.
                if let owner = op.payload["memberId"], owner != member.memberId { continue }
                if let store = op.payload["storeId"], store != member.storeId { continue }
                guard op.type == "CHECK_IN_BEER", let beerID = op.payload["beerId"], let name = op.payload["beerName"], op.payload["memberId"] != nil, op.payload["storeId"] != nil else {
                    try db.execute("UPDATE operation_queue SET status='failed',error_message=? WHERE id=?",["This saved operation requires review before retrying.",op.id]); continue
                }
                // Persist the ambiguous state before dispatch. A crash or account change may
                // prevent receipt handling; recommendations must then require explicit retry.
                let dispatchStatus = op.payload["recommendation"] == "true" ? "failed" : "retrying"
                let dispatchError: String? = dispatchStatus == "failed" ? "Check-in may have been sent. Review your beer queue before retrying." : nil
                try db.execute("UPDATE operation_queue SET status=?,error_message=?,last_retry_timestamp=? WHERE id=?",[dispatchStatus,dispatchError,String(Date().timeIntervalSince1970 * 1000),op.id]); try reload()
                do {
                    let fields = ["chitCode":"\(beerID)-\(member.storeId)-\(member.memberId)","chitBrewId":beerID,"chitBrewName":name,"chitStoreName":member.storeName]
                    let (data,_) = try await api.request(api.configuration.endpoint("addToQueue.php"),method:"POST",fields:fields,member:member,cookies:cookies,retry:false)
                    if let object = try? JSONSerialization.jsonObject(with:data) as? [String:Any], object["success"] as? Bool == false { throw BeerError.invalidResponse(object["error"] as? String ?? "Check-in rejected") }
                    if op.payload["recommendation"] == "true",
                       !String(decoding:data,as:UTF8.self).trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                        guard let object = try? JSONSerialization.jsonObject(with:data) as? [String:Any],
                              object["success"] as? Bool == true else {
                            throw BeerError.invalidResponse("Check-in could not be confirmed")
                        }
                    }
                    guard token == epoch else { outcome = .cancelled; return results }
                    try db.execute("DELETE FROM operation_queue WHERE id=?",[op.id])
                    results[op.id] = .added
                    if let choiceID = op.payload["choiceContextID"], let account = recommendationAccount {
                        // A cache failure must never turn a delivered check-in into a retry.
                        do { try db.updateChoice(id:choiceID,account:account,beerID:beerID,outcome:.added) }
                        catch { self.error = error.localizedDescription }
                    }
                    queuedBeerIDs.insert(beerID)
                    if operationID == nil { notice = "\(name) has been added to your queue!" }
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } catch {
                    outcome = Diagnostics.isCancellation(error) ? .cancelled : .failure
                    guard token == epoch else { outcome = .cancelled; return results }
                    // Match the reference: failed check-ins remain pending for up to three retries.
                    results[op.id] = .needsReview
                    if op.retryCount < 3 && op.payload["recommendation"] != "true" {
                        try db.execute("UPDATE operation_queue SET status='pending',retry_count=retry_count+1,error_message=? WHERE id=?",[error.localizedDescription,op.id])
                    } else {
                        try db.execute("UPDATE operation_queue SET status='failed',error_message=? WHERE id=?",[error.localizedDescription,op.id])
                    }
                    self.error = "Check-in could not be confirmed. Review Pending Operations and your beer queue before retrying."
                }
                try reload()
                if op.retryCount > 0 { try await Task.sleep(for:.seconds(min(pow(2,Double(op.retryCount)),30))) }
            }
            await refreshQueue()
        } catch { outcome = Diagnostics.isCancellation(error) ? .cancelled : .failure; if token == epoch { self.error = error.localizedDescription } }
        return results
    }
    func retryOperation(_ id: String) async {
        guard !processing else { return }
        guard let operation = operations.first(where: { $0.id == id }), operationRestriction(operation) == nil else { return }
        do {
            if operation.payload["recommendation"] == "true" {
                await processOperations(only:id)
            } else {
                try db?.execute("UPDATE operation_queue SET status='pending',error_message=NULL WHERE id=?",[id])
                try reload(); await processOperations()
            }
        }
        catch { self.error = error.localizedDescription }
    }
    func removeOperation(_ id: String) {
        guard !processing else { return }
        do { try db?.execute("DELETE FROM operation_queue WHERE id=?",[id]); try reload() } catch { self.error = error.localizedDescription }
    }
    func clearOperations() {
        guard !processing else { return }
        do { try db?.execute("DELETE FROM operation_queue"); try reload() } catch { self.error = error.localizedDescription }
    }
    func deleteQueueEntry(_ entry: QueueEntry) async {
        guard !previewMode, let member = session, isMember, !busyIDs.contains(entry.id) else { return }
        let token = epoch
        busyIDs.insert(entry.id); defer { if token == epoch { busyIDs.remove(entry.id) } }
        var url = URLComponents(url:api.configuration.endpoint("deleteQueuedBrew.php"),resolvingAgainstBaseURL:false)!
        url.queryItems = [.init(name:"cid",value:entry.id)]
        do {
            _ = try await api.request(url.url!,member:member,cookies:cookies,referer:"memberQueues.php",retry:false)
            guard token == epoch else { return }
            await refreshQueue()
        } catch { if token == epoch { queueError = "Couldn’t confirm deletion. Refresh your queue before trying again." } }
    }
    func queueReward(_ reward: Reward) async {
        guard !previewMode, let member = session, isMember, !reward.redeemed, !busyIDs.contains(reward.id) else { return }
        rewardsError = nil; rewardsNotice = nil
        let token = epoch
        busyIDs.insert(reward.id); defer { if token == epoch { busyIDs.remove(reward.id) } }
        do {
            _ = try await api.request(api.configuration.endpoint("addToRewardQueue.php"),method:"POST",fields:["chitCode":reward.id,"chitRewardType":reward.type,"chitStoreName":member.storeName,"chitUserId":member.memberId],member:member,cookies:cookies,referer:"memberRewards.php",retry:false)
            guard token == epoch else { return }
            rewardsNotice = "\(reward.type) has been added to your queue!"
            await refreshQueue()
            guard token == epoch else { return }
            await refresh(requireNewPass:true)
        } catch { if token == epoch { rewardsError = "Couldn’t confirm that the reward was queued. Check your queue before trying again." } }
    }
    private func endAccountActivities() async {
        if let activityCleanup { await activityCleanup() }
        else { await liveActivity.endAll() }
    }
    func clearWebCookies() async {
        if let webCookieCleanup { await webCookieCleanup(); return }
        for cookie in HTTPCookieStorage.shared.cookies ?? [] { HTTPCookieStorage.shared.deleteCookie(cookie) }
        let store = WKWebsiteDataStore.default().httpCookieStore
        for cookie in await store.allCookies() { await store.deleteCookie(cookie) }
    }
    func logout() async {
        if previewMode { session = nil; allBeers = []; tastedBeers = []; rewards = []; queue = []; showSettings = true; return }
        let old = session; let saved = cookies
        epoch = UUID(); refreshing = false; session = nil; cookies = [:]; queue = []; queuedBeerIDs = []; tastedBeers = []; rewards = []
        let token = epoch
        let previousCleanup = accountCleanupTask
        let cleanup = Task { @MainActor in
            if let previousCleanup { _ = await previousCleanup.value }
            await endAccountActivities()
            var failures: [String] = []
            do { try credentials.clear() } catch { failures.append(error.localizedDescription) }
            await clearWebCookies()
            do {
                try db?.transaction { try db?.forgetRecentTastings() }
                try db?.setPreference("is_visitor_mode","false")
                try db?.setPreference("all_beers_api_url","")
                try db?.setPreference("my_beers_api_url","")
            } catch { failures.append(error.localizedDescription) }
            return failures
        }
        accountCleanupTask = cleanup
        var failures = await cleanup.value
        if token == epoch {
            accountCleanupTask = nil
            showSettings = true; tab = .home
        }
        if let old, !old.isVisitor {
            do { _ = try await api.request(api.configuration.endpoint("logout.php"),method:"POST",fields:[:],member:old,cookies:saved,retry:false) }
            catch { failures.append("Signed out locally; server logout could not be confirmed.") }
        }
        if token == epoch, !failures.isEmpty { error = failures.joined(separator:"\n") }
    }
    func openUntappd(_ beer: Beer) {
        let name = beer.brew_name.replacingOccurrences(of:#"\s*\([^)]*\)\s*"#,with:" ",options:.regularExpression).trimmingCharacters(in:.whitespaces)
        var url = URLComponents(string:"https://untappd.com/search")!; url.queryItems = [.init(name:"q",value:name)]
        browserURL = url.url
    }
    func handleURL(_ url: URL) {
        guard url.scheme == "beerselector" else { return }
        if loading { pendingURL = url; return }
        switch url.host {
        case "mybeers", "beerfinder": if isMember { tab = .finder } else { showSettings = true }
        case "settings": showSettings = true; if URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.contains(where: { $0.name == "action" && $0.value == "login" }) == true { showLogin = true }
        case "beerlist": tab = .all
        case "tastedbrews": if isMember { tab = .tasted }
        default: tab = .home
        }
    }
}
