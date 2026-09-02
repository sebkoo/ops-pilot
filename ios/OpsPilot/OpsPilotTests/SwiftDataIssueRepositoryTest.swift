//
//  SwiftDataIssueRepositoryTest.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/2/26.
//

import Testing
import SwiftData
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
        let draft = Issue.new(title: "test",
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
        let draft = Issue.new(title: "A",
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
}
