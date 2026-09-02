//
//  AppContainer.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation

@MainActor
final class AppContainer {
    let issueRepository: any IssueRepository

    init(issueRepository: any IssueRepository) {
        self.issueRepository = issueRepository
    }

    static func live() -> AppContainer {
        AppContainer(issueRepository: InMemoryIssueRepository())
    }
}
