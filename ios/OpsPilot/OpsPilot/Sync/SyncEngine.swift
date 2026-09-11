//
//  SyncEngine.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/7/26.
//

import Foundation
import Network
import Observation
import SwiftData

@MainActor
@Observable
final class SyncEngine {
    enum Status: Equatable {
        case idle, syncing, offline
        case failed(String)
    }

    private(set) var status: Status = .idle
    private(set) var isOnline = true
    private(set) var pendingCount = 0
    private(set) var lastSyncedAt: Date?
    private(set) var lastConflictCount = 0

    private let context: ModelContext
    private let local: SwiftDataIssueRepository
    private let client: APIClient
    private let encoder = JSONEncoder.api
    private let decoder = JSONDecoder.api
    private let monitor = NWPathMonitor()

    private var monitorTask: Task<Void, Never>?
    private var isRunning = false
    private let cursorKey = "sync.cursor"

    var isPaused = false

    init(
        context: ModelContext,
        local: SwiftDataIssueRepository,
        client: APIClient
    ) {
        self.context = context
        self.local = local
        self.client = client
        refreshPendingCount()
    }

    func start() {
        monitorTask?.cancel()
        monitorTask = Task { [weak self, monitor] in
            for await path in monitor {
                guard let self else { return }
                let online = path.status == .satisfied
                let wasOnline = self.isOnline
                self.isOnline = online
                if online && !wasOnline { Task { await self.sync() } }
            }
        }
    }

    func stop() {
        monitorTask?.cancel()
        monitorTask = nil
    }

    func enqueue(_ kind: OperationKind, issue: Issue) throws {
        let payload = try encoder.encode(issue)
        if let existing = try pendingOperation(for: issue.id) {
            existing.payload = payload
            existing.id = UUID()
        } else {
            context.insert(
                PendingOperation(
                    kind: kind,
                    issueID: issue.id,
                    payload: payload)
            )
        }
        try context.save()
        refreshPendingCount()
    }

    func sync() async {
        guard !isPaused, !isRunning else { return }
        isRunning = true
        defer {
            isRunning = false
            refreshPendingCount()
        }
        status = .syncing
        lastConflictCount = 0
        do {
            try await pushPending()
            try await pullChanges()
            lastSyncedAt = Date()

            status = .idle
        } catch is URLError {
            status = .offline
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    func reset() {
        try? context.delete(model: PendingOperation.self)
        try? context.delete(model: IssueEntity.self)
        try? context.save()
        UserDefaults.standard.removeObject(forKey: cursorKey)
        lastSyncedAt = nil
        lastConflictCount = 0
        status = .idle
        refreshPendingCount()
    }

    private func pushPending() async throws {
        let ops = try context.fetch(
            FetchDescriptor<PendingOperation>()
        ).sorted { $0.createdAt < $1.createdAt }

        for op in ops {
            do {
                let snapshot = try decoder.decode(Issue.self, from: op.payload)
                let serverIssue = try await send(op)
                try local.upsert(serverIssue)
                context.delete(op)
                try context.save()

                if op.kind == .create
                    && (serverIssue.status != snapshot.status || serverIssue.priority != snapshot.priority
                        || serverIssue.category != snapshot.category)
                {
                    var followUp = snapshot
                    followUp.version = serverIssue.version
                    _ = try local.applyLocalEdit(followUp)
                    try enqueue(.update, issue: followUp)
                }
            } catch APIError.http(
                status: 409,
                code: "version_conflict",
                message: _
            ) {
                if let current = try await fetchRemote(op.issueID) {
                    try local.upsert(current)
                }
                context.delete(op)
                try context.save()
                lastConflictCount += 1
            } catch let APIError.http(status, _, _)
                where status == 400 || status == 403 || status == 404 || status == 422
            {
                context.delete(op)
                try context.save()
            } catch {
                op.attempts += 1
                op.lastError = error.localizedDescription
                try context.save()
                throw error
            }
        }
    }

    private func send(_ op: PendingOperation) async throws -> Issue {
        let snapshot = try decoder.decode(Issue.self, from: op.payload)
        let headers = ["Idempotency-Key": op.id.uuidString.lowercased()]
        switch op.kind {
        case .create:
            return try await client.send(
                Endpoint(
                    method: "POST",
                    path: "issues",
                    body: try encoder.encode(CreateIssueBody(snapshot)),
                    headers: headers),
                as: Issue.self
            )
        case .update:
            return try await client.send(
                Endpoint(
                    method: "PATCH",
                    path: "issues/\(snapshot.id.uuidString.lowercased())",
                    body: try encoder.encode(UpdateIssueBody(snapshot)),
                    headers: headers),
                as: Issue.self
            )
        }
    }

    private func fetchRemote(_ id: UUID) async throws -> Issue? {
        do {
            return try await client.send(
                Endpoint(
                    method: "GET",
                    path: "issues/\(id.uuidString.lowercased())"),
                as: Issue.self
            )
        } catch APIError.http(status: 404, code: _, message: _) {
            return nil
        }
    }

    private struct ChangesPage: Decodable {
        let items: [Issue]
        let cursor: String?
        let hasMore: Bool
    }

    private func pullChanges() async throws {
        var cursor = UserDefaults.standard.string(forKey: cursorKey)
        var hasMore = true
        while hasMore {
            var query = [URLQueryItem(name: "limit", value: "200")]
            if let cursor {
                query.append(URLQueryItem(name: "cursor", value: cursor))
            }
            let page = try await client.send(
                Endpoint(
                    method: "GET",
                    path: "sync/changes",
                    query: query),
                as: ChangesPage.self
            )
            for issue in page.items {
                try local.upsert(issue)
            }
            if let next = page.cursor {
                cursor = next
                UserDefaults.standard.set(next, forKey: cursorKey)
            }
            hasMore = page.hasMore && !page.items.isEmpty
        }
    }

    private func pendingOperation(for issueID: UUID) throws -> PendingOperation? {
        var descriptor = FetchDescriptor<PendingOperation>(
            predicate: #Predicate<PendingOperation> {
                $0.issueID == issueID
            })
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }

    private func refreshPendingCount() {
        pendingCount =
            (try? context
                .fetchCount(FetchDescriptor<PendingOperation>())) ?? 0
    }
}
