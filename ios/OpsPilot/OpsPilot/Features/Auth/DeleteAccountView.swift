//
//  DeleteAccountView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/5/26.
//

import SwiftUI

struct DeleteAccountView: View {
    @Environment(AuthSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var password = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Deleting your account will remove your email address & name, and you will no longer be able to sign in. Reports you submitted will remain as being created by \"Deleted User.\"")
                        .font(.footnote)
                }
                Section("Confirmation") {
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
                Section {
                    Button("Delete Account Permanently", role: .destructive) {
                        Task { await submit() }
                    }
                    .disabled(password.isEmpty || isWorking)
                }
            }
            .navigationTitle("Delete Account")
            .toolbar {
                ToolbarItem(placement: .cancellationAction)
                { Button("Cancel") { dismiss() } }
            }
            .overlay { if isWorking { ProgressView() } }
        }
    }

    private func submit() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await session.deleteAccount(password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    DeleteAccountView()
        .environment(PreviewDeps.auth)
        
}
