//
//  Models+UI.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftUI

extension IssuePriority {
    var color: Color {
        switch self {
        case .low: .secondary
        case .medium: .blue
        case .high: .orange
        case .critical: .red
        }
    }
}

extension IssueStatus {
    var tint: Color {
        switch self {
        case .open: .orange
        case .assigned: .blue
        case .inProgress: .purple
        case .resolved: .green
        }
    }
}
