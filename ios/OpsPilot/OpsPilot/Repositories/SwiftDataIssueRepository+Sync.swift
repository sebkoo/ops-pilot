//
//  SwiftDataIssueRepository+Sync.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/7/26.
//

import Foundation
import SwiftData

extension SwiftDataIssueRepository {
    func upsert(_ issue: Issue) throws {
        if let entity = try entity(id: issue.id) {
            entity.apply(issue)
            entity.version = issue.version
            entity.updatedAt = issue.updatedAt
        } else {
            context.insert(IssueEntity(from: issue))
        }

        try context.save()
    }

    func applyLocalEdit(_ issue: Issue) throws -> Issue {
        guard let entity = try entity(id: issue.id)
        else { throw RepositoryError.notFound }

        entity.apply(issue)
        entity.updatedAt = Date()

        try context.save()
        return entity.asIssue
    }
}
