//
//  PreviewDeps.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/5/26.
//

import SwiftData

@MainActor
enum PreviewDeps {
    // Preview-only
    // if this fails, the canvas should show the root cause directly.
    // swiftlint:disable:next force_try
    static let model = try! AppSchema.makeContainer(inMemory: true)
    static let client = APIClient(
        baseURL: AppConfig.apiBaseURL,
        transport: LiveTransport()
    )
    static let auth = AuthSession(client: client)

    static var container: AppContainer {
        let local = SwiftDataIssueRepository(context: model.mainContext)
        let engine = SyncEngine(
            context: model.mainContext,
            local: local,
            client: client
        )
        engine.isPaused = true
        return AppContainer(
            issueRepository: InMemoryIssueRepository(),
            modelContainer: model,
            apiClient: client,
            authSession: auth,
            syncEngine: engine
        )
    }
    static var sync: SyncEngine {
        let engine = SyncEngine(
            context: model.mainContext,
            local: SwiftDataIssueRepository(
                context: model.mainContext
            ), client: client
        )
        engine.isPaused = true
        return engine
    }
}
