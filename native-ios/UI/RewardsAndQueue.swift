import SwiftUI

struct JourneyPanel: View {
    let count: Int
    @Environment(\.dynamicTypeSize) private var typeSize
    private var progress: Double { min(max(Double(count) / 200,0),1) }
    var body: some View {
        ChromePanel(padding:20,riveted:true) {
            ViewThatFits(in:.horizontal) {
                HStack(spacing:20) { details; ring }
                VStack(alignment:.leading,spacing:20) { details; ring.frame(maxWidth:.infinity) }
            }.frame(minHeight:174)
        }.accessibilityElement(children:.ignore)
            .accessibilityLabel("Your journey: \(count) of 200 beers tasted, \(max(200-count,0)) remaining")
    }
    private var details: some View {
        VStack(alignment:.leading,spacing:8) {
            Text("YOUR JOURNEY").font(Robo.mono(9)).tracking(3).foregroundStyle(Robo.steel)
            Text("\(count) of 200 beers tasted").font(Robo.title(15)).fixedSize(horizontal:false,vertical:true)
            Text(count >= 200 ? "Plate Complete!" : "\(200-count) more to go").font(Robo.mono()).foregroundStyle(Robo.steel)
        }.frame(minWidth:typeSize.isAccessibilitySize ? 220 : 130,maxWidth:.infinity,alignment:.leading)
    }
    private var ring: some View {
        VStack(spacing:12) {
            ZStack {
                Circle().stroke(Robo.metal([(0xE8ECF0,0),(0x6B727B,0.5),(0xD4D8DD,1)]),lineWidth:4).padding(5)
                Circle().stroke(Robo.border,lineWidth:2).padding(9)
                Circle().stroke(Robo.cyan.opacity(0.12),lineWidth:10).padding(15)
                Circle().trim(from:0,to:progress).stroke(Robo.cyan,style:StrokeStyle(lineWidth:10,lineCap:.round)).rotationEffect(.degrees(-90)).padding(15)
                if !typeSize.isAccessibilitySize { progressLabel }
            }.frame(width:130,height:130)
            if typeSize.isAccessibilitySize { progressLabel }
        }
    }
    private var progressLabel: some View {
        VStack(spacing:2) {
            Text("\(Int(progress * 100))%").font(Robo.bold(28))
            Text("COMPLETE").font(Robo.mono(8)).tracking(1)
        }.foregroundStyle(Robo.cyan).fixedSize(horizontal:false,vertical:true)
    }
}

struct RewardsScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State var selected: Reward?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:16) {
                    if model.isMember {
                        JourneyPanel(count:model.tastedBeers.count)
                        HStack(spacing:10) {
                            ForEach([50,100,150,200],id:\.self) { milestone in
                                Text("\(milestone)").font(Robo.mono(13))
                                    .frame(maxWidth:.infinity,minHeight:34)
                                    .foregroundStyle(model.tastedBeers.count >= milestone ? Robo.red : Robo.steel)
                                    .background(Robo.display,in:RoundedRectangle(cornerRadius:8))
                                    .padding(2).background(model.tastedBeers.count >= milestone ? Robo.redChrome : Robo.chrome,in:RoundedRectangle(cornerRadius:10))
                                    .overlay(RoundedRectangle(cornerRadius:10).strokeBorder(.white.opacity(0.188),lineWidth:1))
                                    .accessibilityLabel("\(milestone) beers, " + (model.tastedBeers.count >= milestone ? "achieved" : "not yet achieved"))
                            }
                        }
                    }
                    LabelPlate(title:"REWARD LOG")
                    if model.refreshing { ProgressView("Loading rewards…").font(Robo.mono()).accessibilityIdentifier("rewards-loading") }
                    if let error = model.rewardsError {
                        VStack(alignment:.leading,spacing:12) {
                            Text(error).font(Robo.mono())
                            if !model.rewards.isEmpty { Text("Showing saved rewards.").font(Robo.mono()).foregroundStyle(Robo.steel) }
                            Button("Refresh Rewards") { Task { await model.refreshRewards() } }.buttonStyle(BeerControlStyle()).disabled(model.refreshing)
                            Button("Read Saved Rewards") { model.retrySavedRewards() }.buttonStyle(BeerControlStyle())
                        }.padding(12).background(Robo.panel,in:RoundedRectangle(cornerRadius:12)).accessibilityIdentifier("rewards-error")
                    }
                    if !model.isMember { empty("Members Only","Rewards are exclusive to UFO Club members. Log in to view and claim your rewards!") }
                    else if model.rewards.isEmpty && model.rewardsLoaded && !model.refreshing && model.rewardsError == nil { empty("No Rewards Yet","Keep tasting new beers to earn rewards!") }
                    ForEach(model.rewards) { reward in
                        Button {
                            if reward.redeemed { model.rewardsNotice = "This reward has already been claimed." }
                            else { selected = reward }
                        } label: {
                                HStack(spacing:14) {
                                    Image(systemName:reward.redeemed ? "checkmark.circle" : "gift")
                                        .font(.system(size:20)).foregroundStyle(reward.redeemed ? Robo.steel : Robo.cyan)
                                        .frame(width:40,height:40).background(Robo.display,in:RoundedRectangle(cornerRadius:12))
                                        .overlay(RoundedRectangle(cornerRadius:12).strokeBorder(reward.redeemed ? Robo.color(0x3A3F47) : Robo.cyan.opacity(0.267),lineWidth:1))
                                    VStack(alignment:.leading,spacing:8) {
                                        Text(reward.type).font(Robo.title()).foregroundStyle(reward.redeemed ? Robo.steel : Robo.cyan)
                                        if !reward.redeemed { Text("Tap to add to your queue").font(Robo.mono(10)).foregroundStyle(Robo.steel) }
                                        Text(reward.redeemed ? "REDEEMED" : "AVAILABLE").font(Robo.mono(9)).tracking(2).foregroundStyle(Robo.cyan)
                                    }.frame(maxWidth:.infinity,alignment:.leading)
                                    if model.busyIDs.contains(reward.id) { ProgressView() } else { Image(systemName:"chevron.right").foregroundStyle(Robo.cyan) }
                                }.padding(.horizontal,16).padding(.vertical,14)
                                    .background(Robo.metal([(0x2A2E35,0),(0x1A1D22,1)]),in:RoundedRectangle(cornerRadius:14))
                                    .overlay(RoundedRectangle(cornerRadius:14).strokeBorder(reward.redeemed ? Robo.color(0x3A3F47) : Robo.cyan.opacity(0.267),lineWidth:1))
                                    .opacity(reward.redeemed ? 0.5 : 1)
                        }.multilineTextAlignment(.leading).disabled(model.busyIDs.contains(reward.id)).accessibilityIdentifier("reward-\(reward.id)")
                    }
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.refreshable { await model.refreshRewards() }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Rewards").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge:.top,spacing:0) { ChromeScreenHeader(title:"Rewards",close:{ dismiss() },refresh:{ Task { await model.refreshRewards() } },refreshing:model.refreshing) }
                .task { if !model.rewardsLoaded { await model.refreshRewards() } }
                .toolbar(.hidden,for:.navigationBar)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Done") { dismiss() } } }
                .alert(selected == nil ? "Rewards" : "Queue Reward",isPresented:Binding(get:{ selected != nil || model.rewardsNotice != nil },set:{ if !$0 { selected = nil; model.rewardsNotice = nil } })) {
                    if let reward = selected {
                        Button("Queue It!") { selected = nil; Task { await model.queueReward(reward) } }
                        Button("Cancel",role:.cancel) { selected = nil }
                    } else { Button("OK") { model.rewardsNotice = nil } }
                } message: { Text(selected?.type ?? model.rewardsNotice ?? "") }
        }.tint(Robo.cyan)
    }
    private func empty(_ title: String,_ message: String) -> some View { VStack(spacing:12) { Image(systemName:"gift").font(.system(size:48)); Text(title).font(Robo.bold(20)); Text(message).font(Robo.mono()).multilineTextAlignment(.center) }.frame(maxWidth:.infinity).padding(.vertical,40) }
}
struct QueueScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State private var deletion: QueueEntry?
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing:12) {
                    if model.loadingQueue {
                        ProgressView("Loading your queue…").font(Robo.mono()).tint(Robo.cyan).padding()
                            .accessibilityIdentifier("queue-loading")
                    }
                    if let error = model.queueError {
                        VStack(alignment:.leading,spacing:12) {
                            Text(error).font(Robo.mono()).foregroundStyle(Robo.text)
                            if !model.queue.isEmpty { Text("Showing the last loaded queue.").font(Robo.mono()).foregroundStyle(Robo.steel) }
                            Button("Refresh Queue") { Task { await model.refreshQueue() } }
                                .buttonStyle(BeerControlStyle()).disabled(model.loadingQueue)
                                .accessibilityIdentifier("queue-retry")
                        }.frame(maxWidth:.infinity,alignment:.leading).padding()
                            .background(Robo.panel,in:RoundedRectangle(cornerRadius:12)).accessibilityIdentifier("queue-error")
                    }
                    if model.queue.isEmpty && model.queueLoaded && !model.loadingQueue && model.queueError == nil {
                        Text("No beers in your queue").font(Robo.title(18)).padding(40).accessibilityIdentifier("queue-empty")
                    }
                    if !model.queue.isEmpty {
                        Text("\(model.queue.count) \(model.queue.count == 1 ? "BEER" : "BEERS") QUEUED")
                            .font(Robo.mono(10)).tracking(1.4).foregroundStyle(QueueChrome.secondary)
                            .frame(maxWidth:.infinity,alignment:.leading).padding(.vertical,4)
                    }
                    ForEach(Array(model.queue.enumerated()),id:\.element.id) { index,entry in
                        QueueBeerCard(entry:entry,position:index + 1,busy:model.busyIDs.contains(entry.id)) { deletion = entry }
                    }
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.refreshable { await model.refreshQueue() }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Your Beer Queue").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge:.top,spacing:0) {
                    ChromeScreenHeader(title:"Queue",close:{ dismiss() },refresh:{ Task { await model.refreshQueue() } },refreshing:model.loadingQueue)
                }
                .toolbar(.hidden,for:.navigationBar)
                .task { await model.refreshQueue() }
                .alert("Delete queued beer?",isPresented:Binding(get:{ deletion != nil },set:{ if !$0 { deletion = nil } })) {
                    if let entry = deletion { Button("Delete",role:.destructive) { Task { await model.deleteQueueEntry(entry) }; deletion = nil } }
                    Button("Cancel",role:.cancel) { deletion = nil }
                } message: { Text(deletion?.name ?? "") }
        }.tint(Robo.cyan)
    }
}
private struct QueueBeerCard: View {
    let entry: QueueEntry
    let position: Int
    let busy: Bool
    let remove: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    // Separate only recognized serving labels; parentheses in a beer's actual name stay intact.
    private var details: (name: String,container: String?) {
        guard let range = entry.name.range(of:#"(?i)\s+\((draft|can|cans|btl|bottle|bottles|flight)\)$"#,options:.regularExpression) else {
            return (entry.name,nil)
        }
        let suffix = entry.name[range].trimmingCharacters(in:.whitespaces)
        let container = String(suffix.dropFirst().dropLast())
        return (String(entry.name[..<range.lowerBound]),container.lowercased() == "btl" ? "Bottle" : container)
    }
    var body: some View {
        let details = details
        HStack(alignment:.top,spacing:12) {
            if !typeSize.isAccessibilitySize {
                Text(String(format:"%02d",position)).font(Robo.mono(11))
                    .foregroundStyle(QueueChrome.secondary)
                    .frame(width:32,height:32)
                    .background(QueueChrome.background,in:RoundedRectangle(cornerRadius:10))
                    .overlay(RoundedRectangle(cornerRadius:10).strokeBorder(QueueChrome.metal.opacity(0.4),lineWidth:1))
                    .padding(.top,2).accessibilityHidden(true)
            }
            VStack(alignment:.leading,spacing:10) {
                Text(details.name).font(Robo.title(17)).foregroundStyle(QueueChrome.text)
                    .fixedSize(horizontal:false,vertical:true)
                (typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:8)) : AnyLayout(HStackLayout(alignment:.firstTextBaseline,spacing:9))) {
                    if let container = details.container {
                        Text(container.uppercased()).font(Robo.mono(9)).tracking(0.6)
                            .foregroundStyle(QueueChrome.cyan).padding(.horizontal,7).padding(.vertical,4)
                            .background(QueueChrome.cyan.opacity(0.07),in:RoundedRectangle(cornerRadius:5))
                            .fixedSize(horizontal:!typeSize.isAccessibilitySize,vertical:true)
                    }
                    Text(entry.date.isEmpty ? "Date unavailable" : entry.date)
                        .font(Robo.mono(10)).foregroundStyle(QueueChrome.secondary)
                        .fixedSize(horizontal:false,vertical:true)
                }
            }.frame(maxWidth:.infinity,alignment:.leading)
                .accessibilityElement(children:.combine)
            Button(action:remove) {
                Group {
                    if busy { ProgressView().tint(QueueChrome.secondary) }
                    else { Image(systemName:"trash").font(.system(size:16,weight:.medium)).foregroundStyle(Robo.color(0xDB8F91)) }
                }
                .frame(width:32,height:32)
                .background(Robo.color(0x241C20),in:RoundedRectangle(cornerRadius:9))
                .overlay(RoundedRectangle(cornerRadius:9).strokeBorder(Robo.color(0x614044).opacity(0.6),lineWidth:1))
                .frame(width:44,height:44).contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(busy)
                .accessibilityLabel("Delete \(entry.name) from queue")
                .accessibilityHint("Asks for confirmation")
                .accessibilityValue(busy ? "Removing" : "")
                .accessibilityIdentifier("queue-delete-\(entry.id)")
        }
        .padding(14)
        .background(LinearGradient(colors:[Robo.color(0x202830),QueueChrome.background],startPoint:.topLeading,endPoint:.bottomTrailing),in:RoundedRectangle(cornerRadius:17))
        .overlay(RoundedRectangle(cornerRadius:17).strokeBorder(QueueChrome.metal.opacity(0.45),lineWidth:1))
        .accessibilityIdentifier("queue-card-\(entry.id)")
    }
}

struct OperationsScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var retry: PendingOperation?
    @State private var removal: PendingOperation?
    @State private var confirmClear = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing:12) {
                    if model.operations.isEmpty { Text("No pending operations").font(Robo.title()).padding(40) }
                    ForEach(model.operations) { operation in
                        ChromePanel {
                            VStack(alignment:.leading,spacing:8) {
                                Text(operation.payload["beerName"] ?? operation.payload["rewardType"] ?? operation.type).font(Robo.title()).foregroundStyle(Robo.cyan)
                                Text("\(operation.status.uppercased()) · \(operation.retryCount) retries").font(Robo.mono()).foregroundStyle(Robo.amber)
                                Text(Date(timeIntervalSince1970:operation.timestamp / 1000).formatted()).font(Robo.mono()).foregroundStyle(Robo.steel)
                                if let store = operation.payload["storeName"] { Text("Location: " + store).font(Robo.mono()).foregroundStyle(Robo.steel) }
                                if let restriction = model.operationRestriction(operation) { Text(restriction).font(Robo.mono()).foregroundStyle(Robo.amber) }
                                if let error = operation.error { Text(error).font(Robo.mono()).foregroundStyle(Robo.steel) }
                                (typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment:.leading,spacing:12)) : AnyLayout(HStackLayout())) {
                                    Button("RETRY") { retry = operation }.buttonStyle(RoboButtonStyle()).disabled(model.offline || model.processing || model.operationRestriction(operation) != nil)
                                        .opacity(model.offline || model.processing || model.operationRestriction(operation) != nil ? 0.45 : 1)
                                    Button("REMOVE") { removal = operation }.buttonStyle(RoboButtonStyle(color:Robo.red)).disabled(model.processing || operation.status == "retrying")
                                }
                            }
                        }
                    }
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.background(Robo.background).foregroundStyle(Robo.text).navigationTitle("Pending Operations").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement:.cancellationAction) { Button("Close") { dismiss() } }
                    ToolbarItem(placement:.primaryAction) { Button("Clear All",role:.destructive) { confirmClear = true }.disabled(model.operations.isEmpty || model.processing) }
                }
                .confirmationDialog("Clear all saved operations?",isPresented:$confirmClear,titleVisibility:.visible) {
                    Button("Clear All",role:.destructive) { model.clearOperations() }
                } message: { Text("This removes saved requests from this device. Beers already submitted to your queue remain there.") }
                .confirmationDialog("Retry this operation?",isPresented:Binding(get:{ retry != nil },set:{ if !$0 { retry = nil } }),titleVisibility:.visible) {
                    if let operation = retry { Button("Retry") { Task { await model.retryOperation(operation.id) }; retry = nil } }
                } message: { Text("Check your beer queue first if the previous request could not be confirmed.") }
                .confirmationDialog("Remove saved operation?",isPresented:Binding(get:{ removal != nil },set:{ if !$0 { removal = nil } }),titleVisibility:.visible) {
                    if let operation = removal { Button("Remove",role:.destructive) { model.removeOperation(operation.id); removal = nil } }
                }
        }.tint(Robo.cyan)
    }
}
