//
//  RemoteIssueRepositoryTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/9/26.
//

import Foundation
import Testing

@testable import OpsPilot

@MainActor
struct RemoteIssueRepositoryTests {
    private let stub = StubTransport()
    private let repository: RemoteIssueRepository

    init() {
        repository = RemoteIssueRepository(
            client: APIClient(baseURL: stub.baseURL, transport: stub)
        )
    }

    private func sample(_ title: String) -> Issue {
        Issue.new(
            title: title,
            details: "",
            category: .safety,
            priority: .high,
            location: "128 #128 · Main Entrance"
        )
    }

    @Test("Calls the server-defined response shape and extracts only the payload")
    func speaksTheServerShape() async throws {
        print(
            TestJSON.list(
                [sample("A"), sample("B")],
                nextCursor: "next-page")
        )
        let draft = sample("Wet Floor")
        var serverCopy = draft
        serverCopy.assignee = "Minsoo Kim"
        await stub.on(
            "GET /issues",
            .json(
                200,
                TestJSON.list(
                    [sample("A"), sample("B")],
                    nextCursor: "next-page")
            )
        )
        await stub.on(
            "POST /issues",
            .json(201, TestJSON.issue(serverCopy))
        )
        let issues = try await repository.fetchAll()
        let saved = try await repository.create(draft)
        let calls = await stub.calls

        #expect(issues.map(\.title) == ["A", "B"])
        #expect(calls[0].query["limit"] == "100")
        #expect(saved.assignee == "Minsoo Kim")
        #expect(calls[1].field("id") == draft.id.uuidString)
        #expect(calls[1].field("version") == nil)
    }

    @Test("The UI does not know about HTTP")
    func translateErrorsIntoRepositoryErrors() async throws {
        let issue = sample("X")
        await stub.on(
            "GET /issues/*",
            .json(404, TestJSON.error("not_found", "Not found"))
        )
        await stub.on(
            "PATCH /issues/*",
            .json(409, TestJSON.conflict)
        )
        await stub.on("GET /issues", .offline(.notConnectedToInternet))
        let missing = try await repository.fetch(id: issue.id)
        #expect(missing == nil)

        do {
            _ = try await repository.update(issue)
            Testing.Issue.record("Expected a 409 error, but no error was thrown.")
        } catch RepositoryError.conflict {
            #expect(RepositoryError.conflict.errorDescription?.contains("updated elsewhere") == true)
        }
        do {
            _ = try await repository.fetchAll()
            Testing.Issue.record("Expected a network error, but no error was thrown.")
        } catch RepositoryError.network {
            // Reaching this point is itself an assertion:
            // The record above was not executed, so the error translation worked correctly.
        }
    }
}
