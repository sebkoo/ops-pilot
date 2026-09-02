//
//  IssueDetailView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftUI

struct IssueDetailView: View {
    let issueID: UUID
    let viewModel: IssueListViewModel

    var body: some View {
        if let issue = viewModel.issue(id: issueID) {
            List {
                Section("Content") {
                    Text(issue.details.isEmpty ? "No content" : issue.details)
                }
                Section("Information") {
                    LabeledContent("Location", value: issue.location)
                    LabeledContent("Category", value: issue.category.label)
                    LabeledContent("Priority") {
                        Text(issue.priority.label)
                            .foregroundStyle(issue.priority.color)
                    }
                    LabeledContent("Assignee", value: issue.assignee ?? "Not assigned")
                    LabeledContent("Status") {
                        StatusBadge(status: issue.status)
                    }
                    LabeledContent("Created", value: issue.createdAt
                        .formatted(date: .abbreviated, time: .shortened)
                    )
                    LabeledContent("Version", value: "v\(issue.version)")
                }
                if let next = issue.status.next {
                    Section {
                        Button {
                            Task {
                                await viewModel.advanceStatus(of: issue)
                            }
                        } label: {
                            Label("advanced to \(next.label)",
                                  systemImage: "arrow.right.circle.fill"
                            )
                        }
                    }
                }
            }
            .navigationTitle(issue.title)
            .navigationBarTitleDisplayMode(.inline)
        } else {
            ContentUnavailableView("No issue found",
                                   systemImage: "questionmark.folder"
            )
        }
    }
}

#Preview {
    NavigationStack {
        IssueDetailView(issueID: SampleData.issues[0].id,
                        viewModel: IssueListViewModel(
                            repository: InMemoryIssueRepository()
                        )
        ).task { }
    }
}
