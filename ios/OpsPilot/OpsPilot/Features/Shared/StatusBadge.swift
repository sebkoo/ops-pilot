//
//  StatusBadge.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftUI

struct StatusBadge: View {
    let status: IssueStatus

    var body: some View {
        Text(status.label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(status.tint)
    }
}

#Preview {
    VStack {
        ForEach(IssueStatus.allCases) {
            StatusBadge(status: $0)
        }
    }
}
