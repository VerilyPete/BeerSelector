import SwiftUI

struct MissedCreditBanner: View {
    let visits: [MissedCreditVisit]
    let open: () -> Void
    private var count: Int { visits.reduce(0) { $0 + $1.beers.count } }
    var body: some View {
        Button(action:open) {
            HStack(alignment:.top,spacing:12) {
                Image(systemName:"exclamationmark.triangle").font(.system(size:18,weight:.medium)).foregroundStyle(QueueChrome.amber)
                    .frame(width:32,height:32).accessibilityHidden(true)
                VStack(alignment:.leading,spacing:6) {
                    Text("\(count) \(count == 1 ? "beer wasn’t" : "beers weren’t") credited").font(Robo.title(16)).foregroundStyle(QueueChrome.text)
                    Text("Show your missed credit report to your server.").font(Robo.mono(10)).foregroundStyle(QueueChrome.secondary)
                }.frame(maxWidth:.infinity,alignment:.leading)
                Image(systemName:"chevron.right").foregroundStyle(QueueChrome.amber).padding(.top,8).accessibilityHidden(true)
            }.padding(14)
                .background(QueueChrome.amber.opacity(0.08),in:RoundedRectangle(cornerRadius:17))
                .overlay(RoundedRectangle(cornerRadius:17).strokeBorder(QueueChrome.amber.opacity(0.5),lineWidth:1))
        }.buttonStyle(.plain).multilineTextAlignment(.leading)
            .accessibilityHint("Opens your missed credit report")
            .accessibilityIdentifier("missed-credit-banner")
    }
}

struct MissedCreditScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) var dismiss
    @State private var removal: CreditLogEntry?
    @State private var resolving: MissedCreditVisit?
    private var memberName: String {
        let parts = [model.session?.firstName,model.session?.lastName].compactMap { $0?.trimmingCharacters(in:.whitespaces) }.filter { !$0.isEmpty }
        return parts.isEmpty ? model.session?.username ?? "Not available" : parts.joined(separator:" ")
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:16) {
                    Text("Copy these details onto the store’s missed credit slip, or show this screen to your server.")
                        .font(Robo.mono()).foregroundStyle(QueueChrome.secondary).fixedSize(horizontal:false,vertical:true)
                    ChromePanel(padding:16) {
                        VStack(alignment:.leading,spacing:14) {
                            field("NAME",memberName,id:"missed-credit-name")
                            field("UFO CLUB CARD",model.session?.cardNum.flatMap { $0.isEmpty ? nil : $0 } ?? "Not available",id:"missed-credit-card")
                            field("STORE",model.session?.storeName ?? "",id:"missed-credit-store")
                        }
                    }
                    if model.missedCredits.isEmpty {
                        Text("Every queued beer has been credited.").font(Robo.title(16)).padding(.vertical,24)
                            .frame(maxWidth:.infinity).accessibilityIdentifier("missed-credit-empty")
                    }
                    ForEach(model.missedCredits) { visit in
                        VStack(alignment:.leading,spacing:10) {
                            field("DATE OF VISIT",visit.day.formatted(.dateTime.month(.abbreviated).day().year()),id:"missed-credit-visit")
                            ForEach(visit.beers) { beer in row(beer) }
                            Button("Mark visit as resolved") { resolving = visit }.font(Robo.mono(10)).foregroundStyle(Robo.cyan)
                                .frame(maxWidth:.infinity,minHeight:44)
                                .accessibilityIdentifier("missed-credit-resolve-visit")
                        }.padding(14)
                            .background(QueueChrome.background,in:RoundedRectangle(cornerRadius:17))
                            .overlay(RoundedRectangle(cornerRadius:17).strokeBorder(QueueChrome.metal.opacity(0.45),lineWidth:1))
                    }
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.background(Robo.background).foregroundStyle(Robo.text)
                .navigationTitle("Missed Credit").navigationBarTitleDisplayMode(.inline)
                .safeAreaInset(edge:.top,spacing:0) { ChromeScreenHeader(title:"Missed Credit",close:{ dismiss() }) }
                .toolbar(.hidden,for:.navigationBar)
                .confirmationDialog("Remove from report?",isPresented:Binding(get:{ removal != nil },set:{ if !$0 { removal = nil } }),titleVisibility:.visible) {
                    if let beer = removal { Button("Remove",role:.destructive) { model.dismissMissedCredit(beer); removal = nil } }
                } message: { Text("Use this once the store has credited \(removal.map { QueueEntry.serving(of:$0.name).name } ?? "this beer").") }
                .confirmationDialog("Resolve this visit?",isPresented:Binding(get:{ resolving != nil },set:{ if !$0 { resolving = nil } }),titleVisibility:.visible) {
                    if let visit = resolving { Button("Remove \(visit.beers.count) \(visit.beers.count == 1 ? "beer" : "beers")",role:.destructive) { model.resolveMissedCreditVisit(visit); resolving = nil } }
                } message: { Text("Use this once the store has credited every beer from this visit.") }
        }.tint(Robo.cyan)
    }
    private func field(_ label: String, _ value: String, id: String) -> some View {
        VStack(alignment:.leading,spacing:4) {
            Text(label).font(Robo.mono(9)).tracking(2).foregroundStyle(QueueChrome.secondary)
            Text(value).font(Robo.bold(22)).foregroundStyle(QueueChrome.text).textSelection(.enabled).fixedSize(horizontal:false,vertical:true)
        }.accessibilityElement(children:.combine).accessibilityIdentifier(id)
    }
    private func row(_ beer: CreditLogEntry) -> some View {
        let serving = QueueEntry.serving(of:beer.name)
        return HStack(alignment:.firstTextBaseline,spacing:10) {
            VStack(alignment:.leading,spacing:6) {
                Text(serving.name).font(Robo.title(19)).foregroundStyle(QueueChrome.text).textSelection(.enabled).fixedSize(horizontal:false,vertical:true)
                if let container = serving.container {
                    Text(container.uppercased()).font(Robo.mono(9)).tracking(0.6).foregroundStyle(QueueChrome.cyan)
                }
            }.frame(maxWidth:.infinity,alignment:.leading).accessibilityElement(children:.combine)
            Button("Remove") { removal = beer }.font(Robo.mono(10)).foregroundStyle(Robo.color(0xDB8F91))
                .frame(minWidth:44,minHeight:44)
                .accessibilityLabel("Remove \(serving.name) from report")
                .accessibilityIdentifier("missed-credit-remove-\(beer.id)")
        }.accessibilityIdentifier("missed-credit-beer-\(beer.id)")
    }
}
