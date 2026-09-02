//
//  AppContainer.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation
import SwiftData

@MainActor
final class AppContainer {
    let issueRepository: any IssueRepository
    let modelContainer: ModelContainer

    init(issueRepository: any IssueRepository,
         modelContainer: ModelContainer
    ) {
        self.issueRepository = issueRepository
        self.modelContainer = modelContainer
    }

    static func live() -> AppContainer {
        let container: ModelContainer
        do {
            container = try ModelContainer(for: IssueEntity.self)
        } catch {
            fatalError("Cannot open database: \(error)")
        }
        seedIfEmpty(context: container.mainContext)
        return AppContainer(issueRepository: SwiftDataIssueRepository(context: container.mainContext),
                            modelContainer: container)
    }

    private static func seedIfEmpty(context: ModelContext) {
        let count = (try? context.fetchCount(FetchDescriptor<IssueEntity>())) ?? 0
        guard count == 0 else { return }
        for issue in SampleData.issues {
            context.insert(IssueEntity(from: issue))
        }
        try? context.save()
    }
}
