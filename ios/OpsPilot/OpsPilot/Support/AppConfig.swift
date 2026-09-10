//
//  AppConfig.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/3/26.
//

import Foundation

// A build-time fixed URL literal
// if this is nil, the app should fail immediately at launch
// so that an invalid build is detected right away.
// swiftlint:disable force_unwrapping
enum AppConfig {
    static let apiBaseURL: URL = {
        #if DEBUG
            return URL(string: "http://localhost:8787")!
        #else
            return URL(string: "https://REPLACE-ME.lambda-rul.us-east-1.on.aws")!
        #endif
    }()
}
// swiftlint:enable force_unwrapping
