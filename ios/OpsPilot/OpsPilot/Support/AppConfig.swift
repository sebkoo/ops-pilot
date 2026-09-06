//
//  AppConfig.swift
//  OpsPilot
//
//  Created by Ben Koo on 9/3/26.
//

import Foundation

enum AppConfig {
    static let apiBaseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:8787")!

        #else
        return URL(string: "https://REPLACE-ME.lambda-rul.us-east-1.on.aws")!
        #endif
    }()
}
