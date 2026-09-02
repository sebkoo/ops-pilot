//
//  NewIssueView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftUI

struct NewIssueView: View {
    let viewModel: IssueListViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var details = ""
    @State private var location = ""
    @State private var category: IssueCategory = .equipment
    @State private var priority: IssuePriority = .medium

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !location.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("What happened?") {
                    TextField("Title (e.g.: Freezer temperature issue)", text: $title)
                    TextField("Details", text: $details, axis: .vertical).lineLimit(3...6)
                }
                Section("Where?") {
                    TextField("Location (e.g., Store #128 · Freezer", text: $location)
                }
                Section("Classification") {
                    Picker("Category", selection: $category) {
                        ForEach(IssueCategory.allCases) {
                            Text($0.label).tag($0)
                        }
                    }
                    Picker("Priority", selection: $priority) {
                        ForEach(IssuePriority.allCases) {
                            Text($0.label).tag($0)
                        }
                    }.pickerStyle(.segmented)
                }
            }
            .navigationTitle("New Issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await viewModel.create(title: title,
                                                   details: details,
                                                   category: category,
                                                   priority: priority,
                                                   location: location
                            )
                            dismiss()
                        }
                    }.disabled(!canSave)
                }
            }
        }
    }
}

#Preview {
    NewIssueView(viewModel: IssueListViewModel(repository: InMemoryIssueRepository()))
}
