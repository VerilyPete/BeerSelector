#if DEBUG
import Foundation

extension AppModel {
    /// Isolated, offline fixtures for screenshots/UI tests. Never read or replace an existing user's database or Keychain.
    func loadPreviewFixtures() throws {
        invalidatePreviewWork()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("native-preview/beers.db")
        db = try BeerDatabase(url:url)
        session = MemberSession(memberId:"preview",storeId:"preview",storeName:"Fort Worth",sessionId:"preview",firstName:"Beer Enthusiast")
        var beers: [Beer] = []
        let examples = [("Bell's Two Hearted","Bell's Brewery","American IPA","Draft",7.0),("Firestone Walker Parabola","Firestone Walker","Imperial Stout","Bottle",13.0),("Sierra Nevada Pale Ale","Sierra Nevada","American Pale Ale","Draft",5.6),("Weihenstephaner Hefeweissbier","Weihenstephaner","Hefeweizen","Draft",5.4),("Founders All Day IPA","Founders","Session IPA","Can",4.7),("Belgian Tasting Flight","Flying Saucer","Flight","Draft",0.0)]
        for (index,e) in examples.enumerated() {
            var b = Beer(id:String(index+1),name:e.0); b.brewer = e.1; b.brew_style = e.2; b.brew_container = e.3; b.abv = e.4 > 0 ? e.4 : nil; b.brewer_loc = "United States"; b.added_date = "1789000000"; b.brew_description = "A distinctive beer selected for the Flying Saucer taplist. Explore its aroma, character, and finish."; b.container_type = b.inferredContainer; beers.append(b)
        }
        var tasted: [Beer] = []
        for index in 0..<83 { var b = Beer(id:"tasted-\(index)",name:"Tasted Brew \(index+1)"); b.brewer = "Flying Saucer"; b.tasted_date = "09/01/2026"; b.brew_style = "IPA"; b.brew_container = "Draft"; b.abv = 6.0; b.container_type = "pint"; tasted.append(b) }
        try db?.transaction {
            try db?.replaceBeers(beers); try db?.replaceBeers(tasted,tasted:true)
            try db?.replaceRewards([Reward(id:"r1",type:"UFO Club Reward",redeemed:false),Reward(id:"r2",type:"First Flight",redeemed:true)])
            try db?.setPreference("all_beers_api_url","preview://taplist"); try db?.setPreference("my_beers_api_url","preview://member"); try db?.setPreference("is_visitor_mode","false")
        }
        queue = [QueueEntry(id:"q1",name:"Bell's Two Hearted (Draft)",date:"Sep 10, 2026")]
        queueLoaded = true; queueError = nil; loadingQueue = false
        rewardsLoaded = true; rewardsError = nil; rewardsNotice = nil
        queuedBeerIDs = ["1"]
        try reload(); loading = false; showSettings = false
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--preview-queue-style") {
            queue = [
                QueueEntry(id:"q1",name:"Bell's Two Hearted (Draft)",date:"Sep 12, 2026 · 12:51pm"),
                QueueEntry(id:"q2",name:"Firestone Walker Parabola (2026) (BTL)",date:"Sep 12, 2026 · 12:52pm"),
                QueueEntry(id:"q3",name:"Weihenstephaner Hefeweissbier (Draft)",date:"Sep 12, 2026 · 12:53pm")
            ]
        }
        if let index = arguments.firstIndex(of:"--preview-queue-state"), arguments.indices.contains(index+1) {
            switch arguments[index+1] {
            case "loading": queue = []; queueLoaded = false; loadingQueue = true
            case "empty": queue = []
            case "busy": if let entry = queue.first { busyIDs.insert(entry.id) }
            case "error": queue = []; queueLoaded = false; queueError = "Couldn’t refresh your queue. Please try again."
            case "cached-error": queueError = "Couldn’t refresh your queue. Please try again."
            default: break
            }
        }
        if let index = arguments.firstIndex(of:"--preview-rewards-state"), arguments.indices.contains(index+1) {
            switch arguments[index+1] {
            case "loading": rewards = []; rewardsLoaded = false; refreshing = true
            case "empty": rewards = []
            case "error": rewards = []; rewardsLoaded = false; rewardsError = "Couldn’t refresh your rewards. Please try again."
            case "cached-error": rewardsError = "Couldn’t refresh your rewards. Please try again."
            default: break
            }
        }
        if let index = arguments.firstIndex(of:"--preview-screen"), arguments.indices.contains(index+1) {
            switch arguments[index+1] {
            case "beers": tab = .all
            case "finder": tab = .finder
            case "tasted": tab = .tasted
            case "queue": showQueue = true
            case "rewards": showRewards = true
            case "settings": showSettings = true
            case "operations":
                operations = [
                    PendingOperation(id:"foreign",type:"CHECK_IN_BEER",payload:["beerId":"1","beerName":"Saved at another location","memberId":"preview","storeId":"other","storeName":"Other Flying Saucer"],timestamp:Date().timeIntervalSince1970 * 1000,retryCount:0,status:"pending",error:nil),
                    PendingOperation(id:"failed",type:"CHECK_IN_BEER",payload:["beerId":"2","beerName":"Request needs review","memberId":"preview","storeId":"preview","storeName":"Fort Worth"],timestamp:Date().timeIntervalSince1970 * 1000,retryCount:3,status:"failed",error:"Check-in could not be confirmed.")
                ]
                showOperations = true
            default: tab = .home
            }
        }
    }
}
#endif
