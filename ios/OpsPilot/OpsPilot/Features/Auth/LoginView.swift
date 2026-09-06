//
//  LoginView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/5/26.
//

import SwiftUI

struct LoginView: View {
    let session: AuthSession
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var isRegistering = false
    @State private var isBusy = false
    @State private var errorMessage: String?

    private var canSubmit: Bool {
        email.contains("@") &&
        password.count >= 8 &&
        (!isRegistering ||
         !displayName
            .trimmingCharacters(in: .whitespaces)
            .isEmpty
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password (more than 8 letters)", text: $password)
                    if isRegistering {
                        TextField("Name", text: $displayName)
                    }
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        HStack {
                            Text(isRegistering
                                 ? "Sign Up & Get Started"
                                 : "Log In"
                            )
                            if isBusy { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(!canSubmit || isBusy)
                    Button(isRegistering
                           ? "I already have account."
                           : "New here - Sign Up"
                    ) {
                        isRegistering.toggle()
                        errorMessage = nil
                    }
                }
            }
            .navigationTitle("OpsPilot")
        }
    }

    private func submit() async {
        isBusy = true
        defer { isBusy = false }
        errorMessage = nil
        do {
            if isRegistering {
                try await session.register(
                    email: email,
                    password: password,
                    displayName: displayName
                )
            } else {
                try await session.login(email: email, password: password)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    LoginView(session: PreviewDeps.auth)
}
