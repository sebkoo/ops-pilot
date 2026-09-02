//
//  IssueCategory.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation

enum IssueCategory: String, CaseIterable, Codable, Identifiable {
    case equipment, safety, cleanliness, inventory, other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .equipment: "equipment"
        case .safety: "safety"
        case .cleanliness: "cleanliness"
        case .inventory: "inventory"
        case .other: "other"
        }
    }

    var symbol: String {
        switch self {
        case .equipment: "wrench.and.screwdriver"
        case .safety: "exclamationmark.triangle"
        case .cleanliness: "sparkles"
        case .inventory: "shippingbox"
        case .other: "questionmark.circle"
        }
    }
}

enum IssuePriority: String, CaseIterable, Codable, Identifiable, Comparable {
    case low, medium, high, critical

    var id: String { rawValue }

    var label: String {
        switch self {
        case .low: "low"
        case .medium: "medium"
        case .high: "high"
        case .critical: "critical"
        }
    }

    var rank: Int {
        switch self {
        case .low: 0
        case .medium: 1
        case .high: 2
        case .critical: 3
        }
    }

    static func < (lhs: IssuePriority, rhs: IssuePriority) -> Bool {
        lhs.rank < rhs.rank
    }
}

enum IssueStatus: String, CaseIterable, Codable, Identifiable {
    case open, assigned, inProgress = "in-progress", resolved

    var id: String { rawValue }

    var label: String {
        switch self {
        case .open: "open"
        case .assigned: "assigned"
        case .inProgress: "in progress"
        case .resolved: "resolved"
        }
    }

    var next: IssueStatus? {
        switch self {
        case .open: .assigned
        case .assigned: .inProgress
        case .inProgress: .resolved
        case .resolved: nil
        }
    }
}
