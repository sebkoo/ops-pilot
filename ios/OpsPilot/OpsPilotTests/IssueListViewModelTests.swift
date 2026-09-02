//
//  IssueListViewModelTests.swift
//  IssueListViewModelTests
//
//  Created by Bonmyeong Koo - Vendor on 9/2/26.
//

import Testing
@testable import OpsPilot

@MainActor
struct IssueListViewModelTests {
    @Test("A newly created issue appears at the top of the list")
    func createdPutsIssueFirst() async throws {
        let repository = InMemoryIssueRepository(seed: [])
        let viewModel = IssueListViewModel(repository: repository)
        await viewModel.create(title: "Freezer temperature issue",
                               details: "",
                               category: .equipment,
                               priority: .high,
                               location: "Store #128"
        )
        #expect(viewModel.issues.count == 1)
        #expect(viewModel.issues.first?.title == "Freezer temperature issue")
    }

    @Test("Status moves only from Open -> Assigned -> In Progress -> Resolved")
    func advanceFollowsStateMachine() async throws {
        let viewModel = IssueListViewModel(repository: InMemoryIssueRepository())
        await viewModel.load()
        let open = try #require(viewModel.issues.first { $0.status == .open })
        await viewModel.advanceStatus(of: open)
        #expect(viewModel.issue(id: open.id)?.status == .assigned)
        #expect(viewModel.issue(id: open.id)?.version == 2)
    }

    @Test("Saving a stale copy results in a conflict error")
    func staleVersionIsRejected() async throws {
        let viewModel = IssueListViewModel(repository: InMemoryIssueRepository())
        await viewModel.load()
        let stale = try #require(viewModel.issues.first {
            $0.status == .open
        })
        await viewModel.advanceStatus(of: stale)
        await viewModel.advanceStatus(of: stale)
        #expect(viewModel.errorMessage?.contains("issue was updated") == true)
    }
}
