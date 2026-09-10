//
//  APIClientTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/9/26.
//

import Foundation
import Testing

@testable import OpsPilot

@MainActor
struct APIClientTests {
    private let stub = StubTransport()
    private let client: APIClient

    init() {
        client = APIClient(
            baseURL: stub.baseURL,
            transport: stub
        )
    }

    @Test("On 401, refresh once and try the same request - but do not retry if refresh fails")
    func refreshesOnceThenRetries() async throws {
        await stub.enqueue(
            "GET /issues",
            .json(401, TestJSON.error("token_expired", "Token expired")),
            .json(200, "[]")
        )
        await stub.on("GET /health", .json(200, "{}"))
        let refreshes = Counter()
        client.accessTokenProvider = { "token-1" }
        client.onUnauthorized = {
            await refreshes.bump()
            return true
        }
        _ = try await client.send(
            Endpoint(method: "GET", path: "issues"),
            as: [Issue].self
        )
        try await client.send(
            Endpoint(
                method: "GET",
                path: "health",
                requiresAuth: false)
        )
        let attempts = await refreshes.count
        var calls = await stub.calls

        #expect(attempts == 1)
        #expect(calls.map(\.path) == ["/issues", "/issues", "/health"])
        #expect(calls[0].headers["Authorization"] == "Bearer token-1")
        #expect(calls[2].headers["Authorization"] == nil)

        await stub.on(
            "GET /stats",
            .json(401, TestJSON.error("token_expired", "Token expired"))
        )
        client.onUnauthorized = { false }
        await #expect(throws: APIError.self) {
            try await client.send(
                Endpoint(method: "GET", path: "stats")
            )
        }
        calls = await stub.calls
        #expect(calls.filter { $0.path == "/stats" }.count == 1)

        await stub.enqueue(
            "GET /me",
            .json(401, TestJSON.error("token_expired", "Token expired")),
            .json(401, TestJSON.error("token_expired", "Token expired")),
            .json(200, "{}")
        )
        let secondRound = Counter()
        client.onUnauthorized = {
            await secondRound.bump()
            return true
        }
        await #expect(throws: APIError.self) {
            try await client.send(Endpoint(method: "GET", path: "me"))
        }
        let rounds = await secondRound.count
        let meCalls = await stub.calls.filter {
            $0.path == "/me"
        }.count
        #expect(rounds == 1)
        #expect(meCalls == 2)
    }

    @Test("Use the server code, fall back to the status code, and treat connection failures as URLError")
    func translatesErrors() async throws {
        await stub.on("PATCH /issues/*", .json(409, TestJSON.conflict))
        await stub.on("GET /issues", .json(502, "<html>bad gateway</html>"))
        await stub.on("POST /issues", .offline(.notConnectedToInternet))
        do {
            try await client.send(
                Endpoint(method: "PATCH", path: "issues/abc")
            )
            Testing.Issue.record("Expected a 409 error, but no error was thrown.")
        } catch APIError.http(let status, let code, let message) {
            #expect(status == 409)
            #expect(code == "version_conflict")
            #expect(message.contains("updated elsewhere"))
        }
        do {
            try await client.send(
                Endpoint(method: "GET", path: "issues")
            )
            Testing.Issue.record("Expected a 502 error, but no error was thrown.")
        } catch APIError.http(_, let code, _) {
            #expect(code == "http_502")
        }
        await #expect(throws: URLError.self) {
            try await client.send(
                Endpoint(method: "POST", path: "issues")
            )
        }
    }
}
