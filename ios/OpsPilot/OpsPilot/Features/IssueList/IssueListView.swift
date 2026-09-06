//
//  IssueListView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftUI

struct IssueListView: View {
    @Environment(AuthSession.self) private var auth

    @State private var viewModel: IssueListViewModel
    @State private var showNewIssue = false
    @State private var isPresentingDeleteAccount = false

    init(repository: any IssueRepository) {
        _viewModel = State(initialValue: IssueListViewModel(repository: repository))
    }

    var body: some View {
        NavigationStack {
            List(viewModel.visibleIssues) { issue in
                NavigationLink(value: issue.id) {
                    IssueRowView(issue: issue)
                }
            }
            .navigationTitle("Issues")
            .navigationDestination(for: UUID.self) { id in
                IssueDetailView(issueID: id, viewModel: viewModel)
            }.toolbar {
                ToolbarItem(placement: .topBarLeading) { filterMenu }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showNewIssue = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showNewIssue) {
                NewIssueView(viewModel: viewModel)
            }
            .sheet(isPresented: $isPresentingDeleteAccount) {
                DeleteAccountView()
            }
            .overlay {
                if viewModel.visibleIssues.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView("No issues", systemImage: "checkmark.circle", description: Text("Tap + to create your first issue."))
                }
            }
            .refreshable { await viewModel.load() }
            .task { await viewModel.load() }
            .alert("Something went wrong", isPresented: hasError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private var hasError: Binding<Bool> {
        Binding(
            get: { viewModel.errorMessage != nil },
            set: { if !$0 { viewModel.errorMessage = nil } }
        )
    }

    private var filterMenu: some View {
        Menu {
            Picker("Status", selection: $viewModel.statusFilter) {
                Text("Whole").tag(IssueStatus?.none)
                ForEach(IssueStatus.allCases) { status in
                    Text(status.label).tag(Optional(status))
                }
            }
            Divider()
            if let name = auth.user?.displayName {
                Text("\(name) · \(auth.isManager ? "Manager" : "Staff")")
            }
            Button("Logout", role: .destructive) {
                auth.logout()
            }
            Button("Delete Account", role: .destructive) {
                isPresentingDeleteAccount = true
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
    }
}

#Preview {
    IssueListView(repository: InMemoryIssueRepository())
        .environment(PreviewDeps.auth)
}
