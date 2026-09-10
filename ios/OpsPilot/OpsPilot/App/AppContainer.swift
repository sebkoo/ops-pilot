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
    let syncEngine: SyncEngine

    init(
        issueRepository: any IssueRepository,
        modelContainer: ModelContainer,
        apiClient: APIClient,
        authSession: AuthSession,
        syncEngine: SyncEngine
    ) {
        self.issueRepository = issueRepository
        self.modelContainer = modelContainer
        self.apiClient = apiClient
        self.authSession = authSession
        self.syncEngine = syncEngine
    }

    static func live() -> AppContainer {
        let container: ModelContainer

        do {
            container = try AppSchema.makeContainer()
        } catch {
            fatalError("Cannot open database: \(error)")
        }

        let client = APIClient(
            baseURL: AppConfig.apiBaseURL,
            transport: LiveTransport()
        )
        let auth = AuthSession(client: client)
        let local = SwiftDataIssueRepository(context: container.mainContext)
        let engine = SyncEngine(
            context: container.mainContext,
            local: local,
            client: client
        )
        
        engine.start()
        auth.onSignedOut = { reason in
            if reason == .user { engine.reset() }
        }
        auth.onSignedIn = { _ in engine.reset() }

        return AppContainer(
            issueRepository: SyncingIssueRepository(
                local: local,
                engine: engine
            ),
            modelContainer: container,
            apiClient: client,
            authSession: auth,
            syncEngine: engine
        )
    }
}
