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
                    refreshToken: "r1")
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

    @Test(
        "Login stores the tokens securely, and after 401 the session refreshes itself and retries the original request with the new token"
    )
    func <#test function name#>() async throws {
        // Write your test here and use APIs like `#expect(...)` to check expected conditions.
    }

}
