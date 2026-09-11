//
//  JSONCodingTests.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/9/26.
//

import Foundation
import Testing

@testable import OpsPilot

struct JSONCodingTests {
    private struct Stamp: Codable {
        let at: Date
    }

    @Test("Accepts the server's two date formats, rejects invalid dates, and writes only one format")
    func datesMatchTheServerContract() throws {
        let withFraction = try JSONDecoder.api.decode(
            Stamp.self,
            from: Data(#"{"at":"2026-09-09T01:32:00.250Z"}"#.utf8)
        )
        let plain = try JSONDecoder.api.decode(
            Stamp.self,
            from: Data(#"{"at":"2026-09-09T01:32:00Z"}"#.utf8)
        )
        #expect(abs(withFraction.at.timeIntervalSince(plain.at) - 0.25) < 0.001)
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder.api.decode(
                Stamp.self,
                from: Data(#"{"at":"About yesterday"#.utf8)
            )
        }

        let text = String(
            decoding: try JSONEncoder.api.encode(
                Stamp(at: Date(timeIntervalSince1970: 1_788_000_000))
            ), as: UTF8.self)
        #expect(text == #"{"at":"2026-08-29T10:40:00Z"}"#)
    }
}
