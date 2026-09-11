//
//  SyncEngineTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/10/26.
//

import Foundation
import SwiftData
import Testing

@testable import OpsPilot

@MainActor
struct SyncEngineTests {
    private let stub = StubTransport()
    private let container: ModelContainer
    private let local: SwiftDataIssueRepository
    private let defaults: UserDefaults
    private let engine: SyncEngine

    init() async throws {
        container = try AppSchema.makeContainer(inMemory: true)
        local = SwiftDataIssueRepository(
            context: container.mainContext
        )
        defaults = try #require(
            UserDefaults(
                suiteName: "SyncEngineTests-\(UUID().uuidString)")
        )
        engine = SyncEngine(
            context: container.mainContext,
            local: local,
            client: APIClient(baseURL: stub.baseURL, transport: stub),
            defaults: defaults
        )
        await stub.on(
            "GET /sync/changes",
            .json(
                200,
                TestJSON
                    .changes(
                        [],
                        cursor: nil,
                        hasMore: false)
            )
        )
    }

    private func pendingOps() throws -> [PendingOperation] {
        try container.mainContext.fetch(
            FetchDescriptor<PendingOperation>(
                sortBy: [SortDescriptor(\PendingOperation.createdAt)]
            )
        )
    }

    private func sample(_ title: String) -> Issue {
        Issue.new(
            title: title,
            details: "",
            category: .equipment,
            priority: .high,
            location: "Store #128 · Freezer"
        )
    }

    @Test("One operation per issue, sent in creation order")
    func pushSendsInOrderWithIdempotencyKeys() async throws {
        var issueA = sample("A")
        try engine.enqueue(.create, issue: issueA)
        issueA.title = "A (Updated)"
        try engine.enqueue(.update, issue: issueA)
        let issueB = sample("B")
        try engine.enqueue(.create, issue: issueB)
        let ops = try pendingOps()

        #expect(ops.count == 2)
        #expect(ops.first?.kind == .create)

        let keys = ops.map { $0.id.uuidString.lowercased() }
        await stub.enqueue(
            "POST /issues",
            .json(201, TestJSON.issue(issueA)),
            .json(201, TestJSON.issue(issueB))
        )
        await engine.sync()
        let posts = await stub.calls.filter {
            $0.method == "POST" && $0.path == "/issues"
        }

        #expect(
            posts.map {
                $0.field("title")
            } == ["A (Updated)", "B"])
        #expect(
            posts.compactMap {
                $0.headers["Idempotency-Key"]
            } == keys)
        #expect(engine.pendingCount == 0)
        #expect(engine.status == .idle)
    }

    @Test("The server wins when a 409 conflict occurs")
    func conflictServerWins() async throws {
        let mine = try await local.create(sample("Freezer"))
        var edited = mine
        edited.status = .assigned
        _ = try local.applyLocalEdit(edited)
        try engine.enqueue(.update, issue: edited)
        var theirs = mine
        theirs.status = .inProgress
        theirs.version = 3
        await stub.on(
            "PATCH /issues/*",
            .json(409, TestJSON.conflict)
        )
        await stub.on(
            "GET /issues/*",
            .json(200, TestJSON.issue(theirs))
        )
        await engine.sync()
        let fetched = try await local.fetch(id: mine.id)

        let stored = try #require(fetched)
        #expect(stored.status == .inProgress)
        #expect(stored.version == 3)
        #expect(engine.lastConflictCount == 1)
        #expect(engine.pendingCount == 0)
    }

    @Test("Recoverable failures keep the operation queued")
    func offlineKeepsQueue() async throws {
        try engine.enqueue(.create, issue: sample("A"))
        await stub.on("POST /issues", .offline(.notConnectedToInternet))
        await engine.sync()
        #expect(engine.status == .offline)
        #expect(engine.pendingCount == 1)

        let op = try #require(try pendingOps().first)
        #expect(op.attempts == 1)
        #expect(op.lastError != nil)
    }

    @Test("Pulls only changes after the cursor and saves the new cursor")
    func pullAppliesPagesAndSavesCursor() async throws {
        defaults.set("c0", forKey: "sync.cursor")
        await stub.enqueue(
            "GET /sync/changes",
            .json(
                200,
                TestJSON
                    .changes([sample("Server Update")], cursor: "c1", hasMore: true)
            ),
            .json(200, TestJSON.changes([], cursor: nil, hasMore: false))
        )
        await engine.sync()

        let pulls = await stub.calls.filter {
            $0.path == "/sync/changes"
        }
        #expect(pulls.map { $0.query["cursor"] } == ["c0", "c1"])
        #expect(defaults.string(forKey: "sync.cursor") == "c1")

        let titles = try await local.fetchAll().map(\.title)
        #expect(titles == ["Server Update"])
        #expect(engine.lastSyncedAt != nil)
    }

    @Test("reset() clears local copies, queued operations, and the cursor")
    func resetClearsEverything() async throws {
        _ = try await local.create(sample("Someone Else's Issue"))
        try engine.enqueue(.create, issue: sample("Pending Upload"))
        defaults.set("c9", forKey: "sync.cursor")
        engine.reset()

        let left = try await local.fetchAll()
        #expect(left.isEmpty)
        #expect(engine.pendingCount == 0)
        #expect(defaults.string(forKey: "sync.cursor") == nil)
    }

    @Test("Moves permanent failures to the dead-letter queue instead of discarding them")
    func permanentFailureGoesToDLQ() async throws {
        try engine.enqueue(.create, issue: sample("Invalid Request"))
        await stub.on("POST /issues",
            .json(422, TestJSON.error("invalid_transition",
                                      "This state transition is not allowed.")
            )
        )
        await engine.sync()
        #expect(engine.pendingCount == 0)
        #expect(engine.failedCount == 1)

        let dead = try pendingOps()
        #expect(dead.first?.failedAt != nil)
        #expect(dead.first?.lastError?.contains("422") == true)

        await engine.sync()
        let posts = await stub.calls.filter {
            $0.method == "POST"
        }
        #expect(posts.count == 1)

        engine.discardFailed()
        #expect(engine.failedCount == 0)

        let left = try pendingOps()
        #expect(left.isEmpty)
    }
}
