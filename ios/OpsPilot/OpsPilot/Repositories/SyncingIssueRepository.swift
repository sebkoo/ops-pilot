//
//  SyncingIssueRepository.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/8/26.
//

import Foundation

@MainActor
final class SyncingIssueRepository: IssueRepository {
    private let local: SwiftDataIssueRepository
    private let engine: SyncEngine

    init(local: SwiftDataIssueRepository, engine: SyncEngine) {
        self.local = local
        self.engine = engine
    }

    func fetchAll() async throws -> [Issue] {
        try await local.fetchAll()
    }

    func fetch(id: UUID) async throws -> Issue? {
        try await local.fetch(id: id)
    }

    func create(_ issue: Issue) async throws -> Issue {
        let saved = try await local.create(issue)
        try engine.enqueue(.create, issue: saved)
        Task { await engine.sync() }
        
        return saved
    }

    func update(_ issue: Issue) async throws -> Issue {
        let saved = try local.applyLocalEdit(issue)
        try engine.enqueue(.update, issue: saved)
        Task { await engine.sync() }

        return saved
    }
}
