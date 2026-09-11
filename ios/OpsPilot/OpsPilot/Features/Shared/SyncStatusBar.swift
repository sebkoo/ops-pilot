//
//  SyncStatusBar.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/9/26.
//

import SwiftUI

struct SyncStatusBar: View {
    let engine: SyncEngine

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .foregroundStyle(tint)
            Text(text)
                .font(.footnote)
                .lineLimit(1)
            Spacer()
            if engine.pendingCount > 0 {
                Text("\(engine.pendingCount) pending")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if engine.failedCount > 0 {
                Button("\(engine.failedCount) Failed · Clear") {
                    engine.discardFailed()
                }
                .font(.footnote)
                .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var text: String {
        if engine.lastConflictCount > 0 {
            return "\(engine.lastConflictCount) conflict(s) were resolved using the server values."
        }
        switch engine.status {
        case .syncing:
            return
                "Syncing..."
        case .offline:
            return
                "Offline - changes are saved and will be sent when you're back online."
        case .failed(let message):
            return
                "Sync failed: \(message)"
        case .idle:
            return engine.lastSyncedAt.map {
                "Synced · \($0.formatted(date: .omitted, time: .shortened))"
            } ?? "Not synced yet"
        }
    }

    private var symbol: String {
        switch engine.status {
        case .syncing: "arrow.triangle.2.circlepath"
        case .offline: "wifi.slash"
        case .failed: "exclamationmark.triangle"
        case .idle: "checkmark.icloud"
        }
    }

    private var tint: Color {
        switch engine.status {
        case .syncing: .blue
        case .offline: .orange
        case .failed: .red
        case .idle: .green
        }
    }
}

#Preview {
    SyncStatusBar(engine: PreviewDeps.sync)
}
