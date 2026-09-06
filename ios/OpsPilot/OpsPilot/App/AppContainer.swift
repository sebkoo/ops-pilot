//
//  AppContainer.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation
import SwiftData

@MainActor
final class AppContainer {
    let issueRepository: any IssueRepository
    let modelContainer: ModelContainer
    let apiClient: APIClient
    let authSession: AuthSession

    init(issueRepository: any IssueRepository,
         modelContainer: ModelContainer,
         apiClient: APIClient,
         authSession: AuthSession
    ) {
        self.issueRepository = issueRepository
        self.modelContainer = modelContainer
        self.apiClient = apiClient
        self.authSession = authSession
    }

    static func live() -> AppContainer {
        let container: ModelContainer
        do {
            container = try ModelContainer(for: IssueEntity.self)
        } catch {
            fatalError("Cannot open database: \(error)")
        }
        seedIfEmpty(context: container.mainContext)
        let client = APIClient(baseURL: AppConfig.apiBaseURL)
        let auth = AuthSession(client: client)

        return AppContainer(
            issueRepository: RemoteIssueRepository(client: client),
            modelContainer: container,
            apiClient: client,
            authSession: auth
        )
    }

    private static func seedIfEmpty(context: ModelContext) {
        let count = (try? context.fetchCount(FetchDescriptor<IssueEntity>())) ?? 0
        guard count == 0 else { return }
        for issue in SampleData.issues {
            context.insert(IssueEntity(from: issue))
        }
        try? context.save()
    }
}
