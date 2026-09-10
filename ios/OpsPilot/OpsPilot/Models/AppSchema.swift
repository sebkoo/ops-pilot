//
//  AppSchema.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/9/26.
//

import SwiftData

enum AppSchema {
    static let models: [any PersistentModel.Type] = [
        IssueEntity.self,
        PendingOperation.self,
    ]
    static var schema: Schema { Schema(models) }
    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: inMemory
        )
        return try ModelContainer(
            for: schema,
            configurations: [config]
        )
    }
}
