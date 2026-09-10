//
//  InMemoryTokenStore.swift
//  OpsPilotTests
//
//  Created by Ben Koo on 9/9/26.
//

import Foundation

@testable import OpsPilot

final class InMemoryTokenStore: TokenStore {
    private(set) var values: [String: String] = [:]

    func save(_ value: String, for key: String) {
        values[key] = value
    }

    func read(_ key: String) -> String? {
        values[key]
    }

    func delete(_ key: String) {
        values[key] = nil
    }
}

@MainActor
final class Recorder<Value> {
    private(set) var values: [Value] = []

    func append(_ value: Value) {
        values.append(value)
    }
}
