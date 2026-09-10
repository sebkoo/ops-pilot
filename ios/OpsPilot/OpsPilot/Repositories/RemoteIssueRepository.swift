//
//  RemoteIssueRepository.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/3/26.
//

import Foundation

@MainActor
final class RemoteIssueRepository: IssueRepository {
    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    private struct Page<Item: Decodable>: Decodable {
        let items: [Item]
        let nextCursor: String?
    }

    func fetchAll() async throws -> [Issue] {
        try await mapError {
            try await client.send(
                Endpoint(
                    method: "GET",
                    path: "issues",
                    query: [URLQueryItem(name: "limit", value: "100")]
                ), as: Page.self
            ).items
        }
    }

    func fetch(id: UUID) async throws -> Issue? {
        do {
            return try await mapError {
                try await client.send(
                    Endpoint(
                        method: "GET",
                        path: "issues/\(id.uuidString.lowercased())"
                    ), as: Issue.self)
            }
        } catch RepositoryError.notFound {
            return nil
        }
    }

    func create(_ issue: Issue) async throws -> Issue {
        let body = try client.encode(CreateIssueBody(issue))

        return try await mapError {
            try await client.send(
                Endpoint(
                    method: "POST",
                    path: "issues",
                    body: body
                ), as: Issue.self)
        }
    }

    func update(_ issue: Issue) async throws -> Issue {
        let body = try client.encode(UpdateIssueBody(issue))

        return try await mapError {
            try await client.send(
                Endpoint(method: "PATCH", path: "issues/\(issue.id.uuidString.lowercased())", body: body),
                as: Issue.self)
        }
    }

    private func mapError<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as APIError {
            switch error {
            case .http(404, _, _): throw RepositoryError.notFound
            case .http(409, _, _): throw RepositoryError.conflict
            default: throw RepositoryError.network(error.localizedDescription)
            }
        } catch let error as URLError {
            throw RepositoryError.network(error.localizedDescription)
        }
    }
}
