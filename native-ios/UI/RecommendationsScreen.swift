import SwiftUI

@MainActor
struct RecommendationsScreen: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: AppModel
    @ObservedObject private var controller: RecommendationController
    @State private var selected: Set<String> = []
    @State private var expanded: Set<String> = []
    @State private var confirming = false
    init(model: AppModel) {
        self.model = model
        self.controller = model.recommendations
    }
    private var busy: Bool { controller.generating || controller.submitting }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment:.leading,spacing:20) {
                    VStack(alignment:.leading,spacing:8) {
                        Text("SOMETHING TO TRY").font(Robo.mono(10)).tracking(1.5).foregroundStyle(QueueChrome.cyan)
                        Text("Your next discovery").font(Robo.title(25)).foregroundStyle(QueueChrome.text)
                        Text(controller.historyCount == 0 ? "Explore a few choices from your location’s taplist." :
                             "Based on \(controller.historyCount) recent tasted beers, here are some you might enjoy.")
                            .font(Robo.mono(12)).foregroundStyle(QueueChrome.secondary)
                            .fixedSize(horizontal:false,vertical:true)
                    }
                    SuggestionPreferenceControls(preferences:Binding(get:{controller.preferences},set:{controller.setPreferences($0)}))
                        .disabled(controller.submitting)
                    if let message = controller.message {
                        Text(message).font(Robo.mono(12)).foregroundStyle(Robo.amber)
                            .accessibilityIdentifier("recommendation-message")
                    }
                    if busy {
                        HStack(spacing:10) {
                            ProgressView().tint(QueueChrome.cyan)
                            Text(controller.submitting ? "Checking availability and adding your selections…" : "Finding a few options for you…")
                                .font(Robo.mono(12)).foregroundStyle(QueueChrome.secondary)
                        }.frame(maxWidth:.infinity,alignment:.leading).padding(.vertical,12)
                    }
                    ForEach(controller.suggestions) { suggestion in
                        card(suggestion)
                    }
                    if !controller.suggestions.isEmpty {
                        Text(controller.usedModel ? "Selected with Apple Intelligence. Reasons use your saved beer data." :
                             "Selected using local matching. Based on your recent tastings and taplist.")
                            .font(Robo.mono(10)).foregroundStyle(QueueChrome.secondary)

                    }
                    Button(controller.suggestions.isEmpty ? "Find suggestions" : "Show another selection") {
                        selected = []; Task { await controller.generate() }
                    }.buttonStyle(BeerControlStyle()).disabled(busy || (model.offline && !model.previewMode))
                        .accessibilityIdentifier("recommendation-generate")
                    Text("Recent history stays on this device and survives a new UFO round. Clear it in Settings. Signing out removes it.")
                        .font(Robo.mono(10)).foregroundStyle(QueueChrome.secondary)
                }.padding(18).frame(maxWidth:760).frame(maxWidth:.infinity)
            }.background(Robo.background).foregroundStyle(QueueChrome.text)
                .safeAreaInset(edge:.bottom) {
                    if !controller.suggestions.isEmpty {
                        VStack(spacing:8) {
                            Text("Choose one or more beers").font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary)
                            Button("Add \(selected.count) to queue") { confirming = true }
                                .buttonStyle(BeerControlStyle(appearance:.amber))
                                .disabled(selected.isEmpty || busy || (model.offline && !model.previewMode))
                                .accessibilityIdentifier("recommendation-add-selected")
                        }.frame(maxWidth:.infinity).padding(14).background(Robo.background)
                    }
                }
                .navigationTitle("Suggestions").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement:.cancellationAction) { Button("Done") { dismiss() }.disabled(controller.submitting) } }
                .confirmationDialog("Add these beers to your queue?",isPresented:$confirming,titleVisibility:.visible) {
                    Button("Add \(selected.count) to queue") {
                        let ids = selected
                        selected = []
                        Task { await controller.submit(ids:ids) }
                    }
                    Button("Cancel",role:.cancel) {}
                } message: {
                    Text(controller.suggestions.filter { selected.contains($0.id) }.map { $0.beer.brew_name }.joined(separator:"\n"))
                }
                .onChange(of:model.recommendationSnapshot) { _,_ in controller.invalidateIfChanged() }
                .onChange(of:controller.suggestions) { _,_ in selected = []; expanded = [] }
                .task {
                    if controller.suggestions.isEmpty && controller.message == nil { await controller.generate() }
                }
                .onDisappear { controller.cancel() }
                .interactiveDismissDisabled(controller.submitting)
        }.tint(QueueChrome.cyan)
    }
    private func card(_ suggestion: BeerSuggestion) -> some View {
        let beer = suggestion.beer
        let chosen = selected.contains(beer.id)
        let outcome = controller.outcomes[beer.id]
        return VStack(alignment:.leading,spacing:12) {
            HStack(alignment:.top,spacing:12) {
                Image(systemName:"mug").font(.system(size:20)).foregroundStyle(QueueChrome.cyan)
                    .frame(width:36,height:36).background(Robo.color(0x192B2D),in:RoundedRectangle(cornerRadius:10))
                    .accessibilityHidden(true)
                VStack(alignment:.leading,spacing:5) {
                    Text(beer.brew_name).font(Robo.title(17)).foregroundStyle(QueueChrome.text)
                        .accessibilityIdentifier("recommendation-card-\(beer.id)")
                        .fixedSize(horizontal:false,vertical:true)
                    Text([beer.brewer,beer.brew_style,beer.brew_container].filter { !$0.isEmpty }.joined(separator:" · "))
                        .font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary).fixedSize(horizontal:false,vertical:true)
                    if let abv = beer.abv {
                        Text("\(abv.formatted())% ABV").font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary)
                    }
                }.frame(maxWidth:.infinity,alignment:.leading)
            }
            Text(suggestion.reason).font(Robo.mono(12)).foregroundStyle(QueueChrome.secondary)
                .fixedSize(horizontal:false,vertical:true)
            if expanded.contains(beer.id) {
                Text(beer.plainDescription.isEmpty ? "No description available." : beer.plainDescription)
                    .font(Robo.mono(11)).foregroundStyle(QueueChrome.secondary).fixedSize(horizontal:false,vertical:true)
            }
            if let outcome {
                Text(outcome.rawValue).font(Robo.mono(12)).foregroundStyle(outcome == .added ? QueueChrome.cyan : Robo.amber)
                    .accessibilityIdentifier("recommendation-result-\(beer.id)")
            }
            ViewThatFits(in:.horizontal) {
                HStack(spacing:12) { selectionButton(suggestion,chosen:chosen,disabled:outcome != nil); detailsButton(beer) }
                VStack(alignment:.leading,spacing:12) { selectionButton(suggestion,chosen:chosen,disabled:outcome != nil); detailsButton(beer) }
            }
        }.padding(16).frame(maxWidth:.infinity,alignment:.leading)
            .background(QueueChrome.background,in:RoundedRectangle(cornerRadius:17))
            .overlay(RoundedRectangle(cornerRadius:17).strokeBorder(chosen ? AnyShapeStyle(QueueChrome.cyan) : AnyShapeStyle(QueueChrome.metal.opacity(0.45)),lineWidth:1))

    }
    private func selectionButton(_ suggestion: BeerSuggestion,chosen: Bool,disabled: Bool) -> some View {
        Button {
            if chosen { selected.remove(suggestion.id) } else { selected.insert(suggestion.id) }
            controller.recordSelection(id:suggestion.id,selected:!chosen)
        } label: {
            Label(chosen ? "Selected" : "Select",systemImage:chosen ? "checkmark.circle.fill" : "circle")
        }.buttonStyle(BeerControlStyle()).disabled(busy || disabled)
            .accessibilityLabel("Select \(suggestion.beer.brew_name)").accessibilityAddTraits(chosen ? .isSelected : [])
            .accessibilityIdentifier("recommendation-select-\(suggestion.id)")
    }
    private func detailsButton(_ beer: Beer) -> some View {
        Button(expanded.contains(beer.id) ? "Hide details" : "Details") {
            if expanded.contains(beer.id) { expanded.remove(beer.id) } else { expanded.insert(beer.id) }
        }.buttonStyle(BeerControlStyle()).accessibilityLabel("Details for \(beer.brew_name)")
    }
}

private struct SuggestionPreferenceControls: View {
    @Binding var preferences: SuggestionPreferences
    var body: some View {
        VStack(alignment:.leading,spacing:10) {
            Text("YOUR PREFERENCES").font(Robo.mono(10)).tracking(1.5).foregroundStyle(QueueChrome.secondary)
            Picker("Container",selection:$preferences.container) {
                ForEach(SuggestionContainer.allCases,id:\.self) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.menu).accessibilityIdentifier("suggestion-container")
            Picker("ABV",selection:$preferences.abv) {
                ForEach(SuggestionABV.allCases,id:\.self) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.segmented).accessibilityIdentifier("suggestion-abv")
            Text("Lower and higher compare known ABVs among matching beers. Unknown ABVs are omitted unless you choose Any.")
                .font(Robo.mono(10)).foregroundStyle(QueueChrome.secondary)
                .fixedSize(horizontal:false,vertical:true)
        }.padding(14).background(QueueChrome.background,in:RoundedRectangle(cornerRadius:16))
            .tint(QueueChrome.cyan)
    }
}
