//
//  AuthSession.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/4/26.
//

import Foundation
import Observation

@MainActor
@Observable
final class AuthSession {

    struct User: Codable, Equatable {
        let id: UUID
        let email: String
        let displayName: String
        let role: String
    }

    private struct TokenPair: Decodable {
        let accessToken: String
        let refreshToken: String
    }

    private struct AuthResponse: Decodable {
        let user: User
        let tokens: TokenPair
    }

    private(set) var user: User?
    private(set) var accessToken: String?
    private var refreshToken: String?

    var isSignedIn: Bool { accessToken != nil }
    var isManager: Bool { user?.role == "manager" }

    enum SignOutReason { case user, expired }
    var onSignedIn: ((UUID) -> Void)?
    var onSignedOut: ((SignOutReason) -> Void)?

    private let client: APIClient
    private let keychain = KeychainStore(service: "com.bkoo.OpsPilot")
    private let userDefaultsKey = "auth.user"

    init(client: APIClient) {
        self.client = client
        accessToken = keychain.read("accessToken")
        refreshToken = keychain.read("refreshToken")
        if let data = UserDefaults.standard.data(forKey: userDefaultsKey) {
            user = try? JSONDecoder().decode(User.self, from: data)
        }
        client.accessTokenProvider = { [weak self] in
            self?.accessToken
        }
        client.onUnauthorized = { [weak self] in
            await self?.refresh() ?? false
        }
    }

    func register(email: String, password: String, displayName: String) async throws {
        let body = try client.encode([
            "email": email,
            "password": password,
            "displayName": displayName]
        )
        apply(try await client.send(Endpoint(
            method: "POST",
            path: "auth/register",
            body: body,
            requiresAuth: false
        ), as: AuthResponse.self))
    }

    func login(email: String, password: String) async throws {
        let body = try client.encode(["email": email, "password": password])
        apply(try await client.send(Endpoint(
            method: "POST",
            path: "auth/login",
            body: body,
            requiresAuth: false
        ), as: AuthResponse.self))
    }

    func refresh() async -> Bool {
        guard let refreshToken else { return false }
        do {
            let body = try client.encode(["refreshToken": refreshToken])
            apply(try await client.send(Endpoint(
                method: "POST",
                path: "auth/refresh",
                body: body, requiresAuth: false
            ), as: AuthResponse.self))
            return true
        } catch {
            logout(reason: .expired)
            return false
        }
    }

    func logout(reason: SignOutReason = .user) {
        user = nil
        accessToken = nil
        refreshToken = nil
        keychain.delete("accessToken")
        keychain.delete("refreshToken")
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
        onSignedOut?(reason)
    }

    private func apply(_ response: AuthResponse) {
        let isDifferentUser = user?.id != response.user.id
        user = response.user
        accessToken = response.tokens.accessToken
        refreshToken = response.tokens.refreshToken
        keychain.save(response.tokens.accessToken, for: "accessToken")
        keychain.save(response.tokens.refreshToken, for: "refreshToken")
        if let data = try? JSONEncoder().encode(response.user) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey)
        }
        if isDifferentUser { onSignedIn?(response.user.id) }
    }

}
