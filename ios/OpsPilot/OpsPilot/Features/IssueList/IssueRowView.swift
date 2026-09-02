//
//  IssueRowView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import SwiftUI

struct IssueRowView: View {
    let issue: Issue

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: issue.category.symbol)
                .font(.title3)
                .foregroundStyle(issue.priority.color)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(issue.title)
                    .font(.headline)
                    .lineLimit(2)
                Text(issue.location)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    StatusBadge(status: issue.status)
                    Text(issue.priority.label)
                        .font(.caption)
                        .foregroundStyle(issue.priority.color)
                    Spacer()
                    Text(issue.createdAt, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }.padding(.vertical, 4)
    }
}

#Preview {
    List(SampleData.issues) {
        IssueRowView(issue: $0)
    }
}
