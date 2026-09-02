//
//  InMemoryIssueRepository.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation

@MainActor
final class InMemoryIssueRepository: IssueRepository {
    private var storage: [UUID: Issue]

    init(seed: [Issue] = SampleData.issues) {
        storage = Dictionary(uniqueKeysWithValues: seed.map { ($0.id, $0) })
    }

    func fetchAll() async throws -> [Issue] {
        storage.values.sorted { $0.createdAt > $1.createdAt }
    }
    
    func fetch(id: UUID) async throws -> Issue? {
        storage[id]
    }
    
    func create(_ issue: Issue) async throws -> Issue {
        storage[issue.id] = issue
        return issue
    }
    
    func update(_ issue: Issue) async throws -> Issue {
        guard let current = storage[issue.id] else { throw RepositoryError.notFound }
        guard current.version == issue.version else { throw RepositoryError.conflict }
        var saved = issue
        saved.version += 1
        saved.updatedAt = Date()
        storage[issue.id] = saved
        return saved

    }
}
