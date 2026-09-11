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
        ZStack {
            Circle().stroke(Robo.metal([(0xE8ECF0,0),(0x6B727B,0.5),(0xD4D8DD,1)]),lineWidth:4).padding(5)
            Circle().stroke(Robo.border,lineWidth:2).padding(9)
            Circle().stroke(Robo.cyan.opacity(0.12),lineWidth:10).padding(15)
            Circle().trim(from:0,to:progress).stroke(Robo.cyan,style:StrokeStyle(lineWidth:10,lineCap:.round)).rotationEffect(.degrees(-90)).padding(15)
            VStack(spacing:2) {
                Text("\(Int(progress * 100))%").font(Robo.bold(28))
                Text("COMPLETE").font(Robo.mono(8)).tracking(1)
            }.foregroundStyle(Robo.cyan)
        }.frame(width:130,height:130)
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
                    if !model.isMember { empty("Members Only","Rewards are exclusive to UFO Club members. Log in to view and claim your rewards!") }
                    else if model.rewards.isEmpty { empty("No Rewards Yet","Keep tasting new beers to earn rewards!") }
                    ForEach(model.rewards) { reward in
                        Button {
                            if reward.redeemed { model.notice = "This reward has already been claimed." }
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
                        }.disabled(model.busyIDs.contains(reward.id)).accessibilityIdentifier("reward-\(reward.id)")
                    }
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.refreshable { await model.refresh() }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Rewards").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge:.top,spacing:0) { ChromeScreenHeader(title:"Rewards",close:{ dismiss() }) }
                .toolbar(.hidden,for:.navigationBar)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Done") { dismiss() } } }
                .confirmationDialog("Queue Reward",isPresented:Binding(get:{ selected != nil },set:{ if !$0 { selected = nil } }),titleVisibility:.visible) {
                    if let reward = selected { Button("Queue It!") { Task { await model.queueReward(reward) }; selected = nil } }
                } message: { Text("Would you like to add \"\(selected?.type ?? "")\" to your queue?") }
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
                    if model.queue.isEmpty { Text("No beers in your queue").font(Robo.title(18)).padding(40) }
                    ForEach(model.queue) { entry in
                        ChromePanel {
                            VStack(alignment:.leading,spacing:12) {
                                Text(entry.name).font(Robo.title()).foregroundStyle(Robo.cyan)
                                Text(entry.date).font(Robo.mono()).foregroundStyle(Robo.steel)
                                Button("DELETE") { deletion = entry }.buttonStyle(RoboButtonStyle(color:Robo.red)).disabled(model.busyIDs.contains(entry.id))
                            }
                        }
                    }
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.refreshable { await model.refreshQueue() }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Your Beer Queue").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Close") { dismiss() } }; ToolbarItem(placement:.primaryAction) { Button { Task { await model.refreshQueue() } } label: { Image(systemName:"arrow.clockwise") }.accessibilityLabel("Refresh queue") } }
                .confirmationDialog("Delete queued beer?",isPresented:Binding(get:{ deletion != nil },set:{ if !$0 { deletion = nil } }),titleVisibility:.visible) {
                    if let entry = deletion { Button("Delete",role:.destructive) { Task { await model.deleteQueueEntry(entry) }; deletion = nil } }
                } message: { Text(deletion?.name ?? "") }
        }.tint(Robo.cyan)
    }
}
struct OperationsScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
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
                                if let error = operation.error { Text(error).font(Robo.mono()).foregroundStyle(Robo.steel) }
                                HStack {
                                    Button("RETRY") { retry = operation }.buttonStyle(RoboButtonStyle()).disabled(model.offline || model.processing)
                                    Button("REMOVE") { removal = operation }.buttonStyle(RoboButtonStyle(color:Robo.red)).disabled(operation.status == "retrying")
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
