//
//  IssueFlowUITests.swift
//  OpsPilotUITests
//
//  Created by Ben Koo
//

import XCTest

final class OpsPilotUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing"]
        app.launch()
        return app
    }

    @MainActor
    func testCreatedIssueAppearsInList() throws {
        let app = launchApp()
        let title = "Smoke \(Int(Date().timeIntervalSince1970))"
        app.buttons["newIssueButton"].tap()

        let titleField = app.textFields["titleField"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 5),
                      "The new issue form should appear.")
        titleField.tap()
        titleField.typeText(title)

        let locationField = app.textFields["locationField"]
        locationField.tap()
        locationField.typeText("Store 128 · Freezer")
        app.buttons["saveButton"].tap()

        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5),
                      "The saved issue should appear in the list.")
    }
}
