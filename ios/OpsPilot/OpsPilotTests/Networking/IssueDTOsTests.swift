//
//  IssueDTOsTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/10/26.
//

import Foundation
import Testing

@testable import OpsPilot

struct IssueDTOsTests {
    private func keys(of data: Data) -> Set<String> {
        Set(
            ((try? JSONSerialization
                .jsonObject(with: data))
                as? [String: Any] ?? [:]).keys)
    }

    @Test("Request bodies match the server schema")
    func envelopesMatchTheServerContract() throws {
        var issue = Issue.new(
            title: "T",
            details: "D",
            category: .safety,
            priority: .high,
            location: "L"
        )
        issue.status = .inProgress
        issue.version = 3

        let create = try JSONEncoder.api.encode(CreateIssueBody(issue))
        let update = try JSONEncoder.api.encode(UpdateIssueBody(issue))

        #expect(
            keys(of: create) == [
                "id",
                "title",
                "details",
                "category",
                "priority",
                "status",
                "location",
            ]
        )
        #expect(
            keys(of: update) == [
                "version",
                "title",
                "details",
                "category",
                "priority",
                "status",
                "location",
            ]
        )
        let text = String(decoding: update, as: UTF8.self)
        #expect(text.contains(#""status":"in_progress""#))
        #expect(text.contains(#""category":"safety""#))
    }
}
