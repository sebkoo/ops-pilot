//
//  PendingOperation.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/7/26.
//

import Foundation
import SwiftData

enum OperationKind: String {
    case create, update
}

@Model
final class PendingOperation {
    @Attribute(.unique) var id: UUID
    var kindRaw: String
    var issueID: UUID
    var payload: Data
    var createdAt: Date
    var attempts: Int
    var lastError: String?

    init(
        kind: OperationKind,
        issueID: UUID,
        payload: Data
    ) {
        id = UUID()
        kindRaw = kind.rawValue
        self.issueID = issueID
        self.payload = payload
        createdAt = Date()
        attempts = 0
        lastError = nil
    }

    var kind: OperationKind {
        OperationKind(rawValue: kindRaw) ?? .update
    }
}
