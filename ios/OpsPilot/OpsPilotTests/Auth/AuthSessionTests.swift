//
//  AuthSessionTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/9/26.
//

import Foundation
import Testing

@testable import OpsPilot

@MainActor
struct AuthSessionTests {
    private let stub = StubTransport()
    private let client: APIClient
    private let tokens = InMemoryTokenStore()
    private let defaults: UserDefaults
    private let userID = UUID()

    init() async throws {
        client = APIClient(baseURL: stub.baseURL, transport: stub)
        defaults = try #require(
            UserDefaults(
                suiteName: "AuthSessionTests-\(UUID().uuidString)")
        )
        await stub.on(
            "POST /auth/login",
            .json(
                200,
                TestJSON.auth(
                    userID: userID,
                    accessToken: "a1",
                    refreshToken: "r1"
                )
            )
        )
    }

    private func makeSession() -> AuthSession {
        AuthSession(
            client: client,
            tokens: tokens,
            defaults: defaults
        )
    }

    private func signIn() async throws -> AuthSession {
        let session = makeSession()
        try await session.login(email: "staff@test.com", password: "password")
        return session
    }

    @Test("Login stores the tokens, 401, automatic refresh, retry")
    func loginStoresTokensAndRefreshes() async throws {
        await stub.on(
            "POST /auth/refresh",
            .json(
                200,
                TestJSON.auth(
                    userID: userID,
                    accessToken: "a2",
                    refreshToken: "r2")
            )
        )
        await stub.enqueue("GET /issues", .json(401, TestJSON.error("token_expired", "Token expired")))
        let session = try await signIn()
        #expect(session.isSignedIn)
        #expect(tokens.values["accessToken"] == "a2")
    }

    @Test("Restores the session on launch, and signs out if token refresh also fails")
    func restoresThenSignsOutWhenRefreshFails() async throws {
        await stub.on(
            "POST /auth/refresh",
            .json(
                401,
                TestJSON.error(
                    "invalid_refresh", "Please sign in again.")
            )
        )
        await stub.on(
            "GET /issues",
            .json(
                401,
                TestJSON.error(
                    "token_expired", "Token expired")
            )
        )
        _ = try await signIn()
        let session = makeSession()
        #expect(session.isSignedIn)
        #expect(session.user?.id == userID)

        let reasons = Recorder<AuthSession.SignOutReason>()
        session.onSignedOut = { reason in
            reasons.append(reason)
        }
        await #expect(throws: APIError.self) {
            try await client.send(Endpoint(method: "GET", path: "issues"))
        }
        #expect(reasons.values == [.expired])
        #expect(session.isSignedIn == false)
        #expect(tokens.values.isEmpty)
        #expect(defaults.data(forKey: "auth.user") == nil)
    }
}
