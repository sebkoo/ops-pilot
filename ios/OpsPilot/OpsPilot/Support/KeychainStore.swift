//
//  KeychainStore.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/4/26.
//

import Foundation
import Security

struct KeychainStore {
    let service: String

    private func baseQuery(for key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrServer as String: service,
         kSecAttrAccount as String: key]
    }

    func save(_ value: String, for key: String) {
        SecItemDelete(baseQuery(for: key) as CFDictionary)
        var attributes = baseQuery(for: key)
        attributes[kSecValueData as String] = Data(value.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    func read(_ key: String) -> String? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func delete(_ key: String) {
        SecItemDelete(baseQuery(for: key) as CFDictionary)
    }
}
