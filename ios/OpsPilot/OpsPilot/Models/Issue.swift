//
//  Issue.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation

struct Issue: Identifiable, Hashable, Codable {
    let id: UUID
    var title: String
    var details: String
    var category: IssueCategory
    var priority: IssuePriority
    var status: IssueStatus
    var location: String
    var assignee: String?
    var aiSummary: String?
    var version: Int
    let createdAt: Date
    var updatedAt: Date

    static func new(
        title: String,
        details: String,
        category: IssueCategory,
        priority: IssuePriority,
        location: String
    ) -> Issue {
        let now = Date()
        return Issue(
            id: UUID(),
            title: title,
            details: details,
            category: category,
            priority: priority,
            status: .open,
            location: location,
            assignee: nil,
            aiSummary: nil,
            version: 1,
            createdAt: now,
            updatedAt: now
        )
    }
}
