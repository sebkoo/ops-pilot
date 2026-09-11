//
//  SyncingIssueRepositoryTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/10/26.
//

import Foundation
import SwiftData
import Testing

@testable import OpsPilot

@MainActor
struct SyncingIssueRepositoryTests {
    private let stub = StubTransport()
    private let container: ModelContainer
    private let engine: SyncEngine
    private let local: SwiftDataIssueRepository
    private let repository: SyncingIssueRepository

    init() async throws {
        container = try AppSchema.makeContainer(inMemory: true)
        local = SwiftDataIssueRepository(
            context: container.mainContext
        )
        let defaults = try #require(
            UserDefaults(
                suiteName: "SyncingIssueRepositoryTests-\(UUID().uuidString)")
        )
        engine = SyncEngine(
            context: container.mainContext,
            local: local,
            client: APIClient(baseURL: stub.baseURL, transport: stub),
            defaults: defaults
        )
        repository = SyncingIssueRepository(local: local, engine: engine)
        // create() fires an unstructured `Task { await engine.sync() }`.
        // Pause it so no background work outlives this test.
        engine.isPaused = true
        await stub.on("POST /issues", .offline(.notConnectedToInternet))
    }

    @Test("Create writes locally first and returns immediately")
    func createIsLocalFirst() async throws {
        let saved =
            try await repository
            .create(
                Issue.new(
                    title: "Basement Warehouse Leak",
                    details: "",
                    category: .safety,
                    priority: .critical,
                    location: "B1")
            )
        let inLocal = try await local.fetch(id: saved.id)
        #expect(inLocal?.title == "Basement Warehouse Leak")
        #expect(engine.pendingCount == 1)
    }

}
