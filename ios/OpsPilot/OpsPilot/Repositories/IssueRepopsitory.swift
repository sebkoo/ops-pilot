//
//  IssueRepopsitory.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation

@MainActor
protocol IssueRepository {
    func fetchAll() async throws -> [Issue]
    func fetch(id: UUID) async throws -> Issue?
    func create(_ issue: Issue) async throws -> Issue
    func update(_ issue: Issue) async throws -> Issue
}

nonisolated enum RepositoryError: Error, LocalizedError {
    case notFound
    case conflict
    case network(String)

    var errorDescription: String? {
        switch self {
        case .notFound: "Issue not found"
        case .conflict: "This issue was updated elsewhere first. Refresh and try again."
        case .network(let message): "network error: \(message)"
        }
    }
}
