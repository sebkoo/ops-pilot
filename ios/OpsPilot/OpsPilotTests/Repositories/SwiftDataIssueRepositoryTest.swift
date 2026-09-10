//
//  SwiftDataIssueRepositoryTest.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftData
import Testing

@testable import OpsPilot

@MainActor
struct SwiftDataIssueRepositoryTest {
    private let container: ModelContainer
    private let repository: SwiftDataIssueRepository

    init() throws {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        container = try ModelContainer(for: IssueEntity.self, configurations: config)
        repository = SwiftDataIssueRepository(context: container.mainContext)
    }

    @Test("A saved issue can be read back")
    func roundTrip() async throws {
        let draft = Issue.new(
            title: "test",
            details: "content",
            category: .safety,
            priority: .low,
            location: "A"
        )
        _ = try await repository.create(draft)
        let all = try await repository.fetchAll()

        #expect(all.count == 1)
        #expect(all.first?.id == draft.id)
        #expect(all.first?.category == .safety)
    }

    @Test("Updating an issue increments the version, and stale versions are rejected")
    func updateBumpsVersionAndRejectStale() async throws {
        let draft = Issue.new(
            title: "A",
            details: "",
            category: .other,
            priority: .medium,
            location: "B"
        )
        let saved = try await repository.create(draft)
        var edited = saved
        edited.status = .assigned
        let v2 = try await repository.update(edited)

        #expect(v2.version == 2)
        await #expect(throws: RepositoryError.self) {
            _ = try await repository.update(saved)
        }
    }

    @Test("Only the server assigns versions")
    func syncExtensionsKeepTheServerInCharge() async throws {
        var server = Issue.new(
            title: "Original Server",
            details: "",
            category: .other,
            priority: .low,
            location: "A"
        )
        try repository.upsert(server)

        server.title = "Updated by Server"
        server.version = 7
        try repository.upsert(server)

        let all = try await repository.fetchAll()
        #expect(all.count == 1)
        #expect(all.first?.title == "Updated by Server")
        #expect(all.first?.version == 7)

        var mine = try #require(all.first)
        mine.status = .assigned
        let edited = try repository.applyLocalEdit(mine)
        #expect(edited.version == 7)
    }
}
