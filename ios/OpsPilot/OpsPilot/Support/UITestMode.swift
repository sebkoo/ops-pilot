//
//  UITestMode.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/10/26.
//

import Foundation

enum UITestMode {
    static let isOn = ProcessInfo
        .processInfo
        .arguments
        .contains("-ui-testing")
}
