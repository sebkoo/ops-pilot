//
//  IssueEntity.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation
import SwiftData

@Model
final class IssueEntity {
    @Attribute(.unique) var id: UUID
    var title: String
    var details: String
    var categoryRaw: String
    var priorityRaw: String
    var statusRaw: String
    var location: String
    var assignee: String?
    var aiSummary: String?
    var version: Int
    var createdAt: Date
    var updatedAt: Date

    init(from issue: Issue) {
        id = issue.id
        title = issue.title
        details = issue.details
        categoryRaw = issue.category.rawValue
        priorityRaw = issue.priority.rawValue
        statusRaw = issue.status.rawValue
        location = issue.location
        assignee = issue.assignee
        aiSummary = issue.assignee
        version = issue.version
        createdAt = issue.createdAt
        updatedAt = issue.updatedAt
    }

    func apply(_ issue: Issue) {
        title = issue.title
        details = issue.details
        categoryRaw = issue.category.rawValue
        priorityRaw = issue.priority.rawValue
        statusRaw = issue.status.rawValue
        location = issue.location
        assignee = issue.assignee
        aiSummary = issue.assignee
    }

    var asIssue: Issue {
        Issue(id: id,
              title: title,
              details: details,
              category: IssueCategory(rawValue: categoryRaw) ?? .other,
              priority: IssuePriority(rawValue: priorityRaw) ?? .medium,
              status: IssueStatus(rawValue: statusRaw) ?? .open,
              location: location,
              assignee: assignee,
              aiSummary: aiSummary,
              version: version,
              createdAt: createdAt,
              updatedAt: updatedAt
        )
    }
}
