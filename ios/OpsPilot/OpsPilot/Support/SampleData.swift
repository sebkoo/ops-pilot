//
//  SampleData.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/2/26.
//

import Foundation

nonisolated enum SampleData {
    static let issues: [Issue] = [
        make("Freezer temperature has risen to 48°F.",
            "The alarm has been sounding since 9:00 a.m. The door gasket is loose.",
            .equipment,
            .critical,
            .open,
            "Store #128 · Freezer",
            hoursAgo: 1
        ),
        make("Water on the floor at the store entrance",
             "Water from umbrellas has pooled on the floor, creating a slipping hazard. A warning sign is needed.",
            .safety,
            .high,
            .assigned,
             "Store #128 · Main Entrance",
             assignee: "Minsoo Kim",
             hoursAgo: 2
        ),
        make("Receipt paper is running low at Register #3",
             "Only one roll is left.",
            .inventory,
            .low,
            .resolved,
             "Store #128 · Register",
             assignee: "Seoyeon Park",
             hoursAgo: 26
        )
    ]

    private static func make(_ title: String,
                             _ details: String,
                             _ category: IssueCategory,
                             _ priority: IssuePriority,
                             _ status: IssueStatus,
                             _ location: String,
                             assignee: String? = nil,
                             hoursAgo: Double
    ) -> Issue {
        let created = Date().addingTimeInterval(-hoursAgo * 3600)
        return Issue(id: UUID(),
                     title: title,
                     details: details,
                     category: category,
                     priority: priority,
                     status: status,
                     location: location,
                     assignee: assignee,
                     aiSummary: nil,
                     version: 1,
                     createdAt: created,
                     updatedAt: created
        )
    }
}
