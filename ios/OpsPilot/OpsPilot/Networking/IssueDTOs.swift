//
//  IssueDTOs.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/7/26.
//

import Foundation

nonisolated struct CreateIssueBody: Encodable {
    let id: UUID
    let title: String
    let details: String
    let category: IssueCategory
    let priority: IssuePriority
    let status: IssueStatus
    let location: String

    init(_ issue: Issue) {
        id = issue.id
        title = issue.title
        details = issue.details
        category = issue.category
        priority = issue.priority
        status = issue.status
        location = issue.location
    }
}

nonisolated struct UpdateIssueBody: Encodable {
    let version: Int
    let title: String
    let details: String
    let category: IssueCategory
    let priority: IssuePriority
    let status: IssueStatus
    let location: String

    init(_ issue: Issue) {
        version = issue.version
        title = issue.title
        details = issue.details
        category = issue.category
        priority = issue.priority
        status = issue.status
        location = issue.location
    }
}
