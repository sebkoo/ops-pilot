//
//  TestSupport.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/9/26.
//

import Foundation

@testable import OpsPilot

typealias Issue = OpsPilot.Issue

// Test support file
// Here, ! and try! are not hiding failures;
// they are assertions, and failing fast is the correct behavior when a test fixture is broken.
// swiftlint:disable force_unwrapping force_try
actor StubTransport: HTTPTransport {
    struct Call: Sendable {
        let method: String
        let path: String
        let query: [String: String]
        let headers: [String: String]
        let body: Data?

        func field(_ key: String) -> String? {
            guard let body,
                let object = try? JSONSerialization.jsonObject(with: body)
                    as? [String: Any]
            else { return nil }
            return object[key].map { "\($0)" }
        }
    }

    enum Reply: Sendable {
        case json(Int, String)
        case offline(URLError.Code)
    }

    nonisolated let baseURL = URL(string: "https://stub.test")!
    private(set) var calls: [Call] = []
    private var standing: [String: Reply] = [:]
    private var queued: [String: [Reply]] = [:]

    func on(_ route: String, _ reply: Reply) {
        standing[route] = reply
    }

    func enqueue(_ route: String, _ replies: Reply...) {
        queued[route, default: []].append(contentsOf: replies)
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        guard let url = request.url else { throw URLError(.badURL) }
        let items =
            URLComponents(
                url: url,
                resolvingAgainstBaseURL: false
            )?.queryItems ?? []
        let call = Call(
            method: request.httpMethod ?? "GET",
            path: url.path(percentEncoded: false),
            query: Dictionary(
                items.map { ($0.name, $0.value ?? "") },
                uniquingKeysWith: { first, _ in first }),
            headers: request.allHTTPHeaderFields ?? [:],
            body: request.httpBody
        )
        calls.append(call)
        switch next(for: call) {
        case .json(let status, let text):
            let response = HTTPURLResponse(
                url: url,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            return (Data(text.utf8), response)
        case .offline(let code):
            throw URLError(code)
        }
    }

    private func next(for call: Call) -> Reply {
        let key = "\(call.method) \(call.path)"
        let matches = { (route: String) in
            route.hasSuffix("*")
                ? key.hasPrefix(String(route.dropLast()))
                : key == route
        }
        if let route = queued.keys.first(
            where: { matches($0) && !(queued[$0] ?? []).isEmpty }
        ) {
            return queued[route]!.removeFirst()
        }
        if let route = standing.keys.first(where: matches) {
            return standing[route]!
        }
        return .json(404, TestJSON.error("not_found", "stub: No prepared response is available (\(key))"))
    }
}

enum TestJSON {
    static func issue(_ issue: Issue) -> String {
        String(decoding: try! JSONEncoder.api.encode(issue), as: UTF8.self)
    }

    static func list(
        _ issues: [Issue],
        nextCursor: String? = nil
    ) -> String {
        let cursor = nextCursor.map { "\"\($0)\"" } ?? "null"
        return "{\"items\":[\(issues.map(issue).joined(separator: ","))],\"nextCursor\":\(cursor)}"
    }

    static func changes(
        _ issues: [Issue],
        cursor: String?,
        hasMore: Bool
    ) -> String {
        let next = cursor.map { "\"\($0)\"" } ?? "null"
        return "{\"items\":[\(issues.map(issue).joined(separator: ","))],\"cursor\":\(next),\"hasMore\":\(hasMore)}"
    }

    static func auth(
        userID: UUID,
        email: String = "staff@test.com",
        role: String = "staff",
        accessToken: String,
        refreshToken: String
    ) -> String {
        "{\"user\":{\"id\":\"\(userID.uuidString)\",\"email\":\"\(email)\",\"displayName\":\"tester\",\"role\":\"\(role)\"},\"tokens\":{\"accessToken\":\"\(accessToken)\",\"refreshToken\":\"\(refreshToken)\"}}"
    }

    static func error(_ code: String, _ message: String) -> String {
        #"{"error":{"code":"\#(code)","message":"\#(message)"}}"#
    }

    static let conflict = error("version_conflict", "This issue was updated elsewhere first.")
}
// swiftlint:enable force_unwrapping force_try

actor Counter {
    private(set) var count = 0

    @discardableResult
    func bump() -> Int {
        count += 1
        return count
    }
}
