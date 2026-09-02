//
//  SwiftDataIssueRepository.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation
import SwiftData

@MainActor
final class SwiftDataIssueRepository: IssueRepository {
    private let context: ModelContext

    init(context: ModelContext) {
        self.context = context
    }

    func fetchAll() async throws -> [Issue] {
        let descriptor = FetchDescriptor<IssueEntity>(sortBy: [
            SortDescriptor(\IssueEntity.createdAt, order: .reverse)
        ])
        return try context.fetch(descriptor).map(\.asIssue)
    }

    func fetch(id: UUID) async throws -> Issue? {
        try entity(id: id)?.asIssue
    }

    func create(_ issue: Issue) async throws -> Issue {
        let entity = IssueEntity(from: issue)
        context.insert(entity)
        try context.save()
        return entity.asIssue
    }

    func update(_ issue: Issue) async throws -> Issue {
        guard let entity = try entity(id: issue.id) else {
            throw RepositoryError.notFound
        }
        guard entity.version == issue.version else {
            throw RepositoryError.conflict
        }
        entity.apply(issue)
        entity.version += 1
        entity.updatedAt = Date()
        try context.save()
        return entity.asIssue
    }

    private func entity(id: UUID) throws -> IssueEntity? {
        var descriptor = FetchDescriptor<IssueEntity>(
            predicate: #Predicate<IssueEntity> { $0.id == id }
        )
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }
}
