//
//  IssueListViewModel.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation
import Observation

@MainActor
@Observable
final class IssueListViewModel {
    private(set) var issues: [Issue] = []
    private(set) var isLoading = false
    var errorMessage: String?
    var statusFilter: IssueStatus?

    private let repository: any IssueRepository

    init(repository: any IssueRepository) {
        self.repository = repository
    }

    var visibleIssues: [Issue] {
        guard let statusFilter else { return issues }
        return issues.filter { $0.status == statusFilter }
    }

    func issue(id: UUID) -> Issue? {
        issues.first { $0.id == id }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            issues = try await repository.fetchAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func create(title: String,
                details: String,
                category: IssueCategory,
                priority: IssuePriority,
                location: String
    ) async {
        let draft = Issue.new(title: title,
                              details: details,
                              category: category,
                              priority: priority,
                              location: location
        )
        do {
            let saved = try await repository.create(draft)
            issues.insert(saved, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func advanceStatus(of issue: Issue) async {
        guard let next = issue.status.next else { return }
        var changed = issue
        changed.status = next
        await save(changed)
    }

    func save(_ issue: Issue) async {
        do {
            let saved = try await repository.update(issue)
            replace(saved)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func replace(_ issue: Issue) {
        guard let index = issues.firstIndex(where: {
            $0.id == issue.id })
        else { return }
        issues[index] = issue
    }
}
