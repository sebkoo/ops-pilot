//
//  APIClient.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/3/26.
//

import Foundation

struct Endpoint {
    var method: String
    var path: String
    var query: [URLQueryItem] = []
    var body: Data? = nil
    var requiresAuth = true
}

nonisolated enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case http(status: Int, code: String, message: String)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "The request URL is invalid."
        case .invalidResponse: "Unable to understand the server response."
        case .http(_, _, let message): message
        case .decoding: "The data format is invalid."
        }
    }
}

private struct ServerErrorBody: Decodable {
    struct Detail: Decodable {
        let code: String
        let message: String
    }
    let error: Detail
}

@MainActor
final class APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder.api
    private let encoder = JSONEncoder.api
    var accessTokenProvider: () -> String? = { nil }
    var onUnauthorized: (() async -> Bool)?

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func encode<Body: Encodable>(_ body: Body) throws -> Data {
        try encoder.encode(body)
    }

    func send<Response: Decodable>(_ endpoint: Endpoint, as type: Response.Type) async throws -> Response {
        let data = try await perform(endpoint, allowRetry: true)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func send(_ endpoint: Endpoint) async throws {
        _ = try await perform(endpoint, allowRetry: true)
    }

    private func perform(_ endpoint: Endpoint, allowRetry: Bool) async throws -> Data {
        let request = try makeRequest(endpoint)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        if http.statusCode == 401,
           allowRetry,
           endpoint.requiresAuth,
           let refresh = onUnauthorized,
           await refresh() {
            return try await perform(endpoint, allowRetry: false)
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = try? decoder.decode(ServerErrorBody.self, from: data)
            throw APIError.http(
                status: http.statusCode,
                code: body?.error.code ?? "http_\(http.statusCode)",
                message: body?.error.message ?? "Request failed (\(http.statusCode)"
            )
        }
        return data
    }

    private func makeRequest(_ endpoint: Endpoint) throws -> URLRequest {
        guard var components = URLComponents(
            url: baseURL.appending(path: endpoint.path),
            resolvingAgainstBaseURL: false)
        else { throw APIError.invalidURL }
        if !endpoint.query.isEmpty {
            components.queryItems = endpoint.query
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body = endpoint.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if endpoint.requiresAuth,
           let token = accessTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }
}
