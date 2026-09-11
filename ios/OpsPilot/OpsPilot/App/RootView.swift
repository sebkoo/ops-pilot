//
//  RootView.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/5/26.
//

import SwiftUI

struct RootView: View {
    let container: AppContainer

    var body: some View {
        Group {
            if container.authSession.isSignedIn || UITestMode.isOn
            { IssueListView(repository: container.issueRepository) }
            else { LoginView(session: container.authSession) }
        }
        .environment(container.authSession)
        .environment(container.syncEngine)
    }
}

#Preview {
    RootView(container: PreviewDeps.container)
}
