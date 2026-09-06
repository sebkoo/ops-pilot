//
//  PreviewDeps.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/5/26.
//

import SwiftData

@MainActor
enum PreviewDeps {
    static var client: APIClient { APIClient(baseURL: AppConfig.apiBaseURL) }
    static var auth: AuthSession { AuthSession(client: client) }
    static var container: AppContainer {
        let model = try! ModelContainer(
            for: IssueEntity.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return AppContainer(issueRepository: InMemoryIssueRepository(),
                            modelContainer: model,
                            apiClient: client,
                            authSession: auth
        )
    }
}
