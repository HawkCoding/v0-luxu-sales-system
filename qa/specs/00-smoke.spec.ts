import { expect, test } from "@playwright/test"
import { ADMIN_STORAGE_STATE } from "../lib/auth"
import { attachBrowserDiagnostics, ReportBuilder } from "../lib/report"

test.use({ storageState: ADMIN_STORAGE_STATE })

test("smoke opens authenticated app and writes baseline report", async ({ page, baseURL }) => {
  const report = new ReportBuilder("smoke", "Phase 0 Smoke QA")
  const diagnostics = attachBrowserDiagnostics(page)
  report.setGoal("Verify the QA harness can reset the DB, authenticate as admin, open /app, and capture a baseline screenshot.")
  report.setEnvironment({
    baseURL,
    storageState: ADMIN_STORAGE_STATE,
    browser: "chromium",
  })

  try {
    await page.goto("/app")
    await expect(page).toHaveURL(/\/app(?:\/)?$/)
    await expect(page.locator("body")).toContainText(/Luxus|Dashboard|Pipeline|Bookings/i)

    const screenshot = await report.screenshot(page, "app-baseline")
    report.step("Opened /app as seeded admin", {
      screenshot,
      evidence: {
        url: page.url(),
      },
    })
  } catch (error) {
    const screenshot = await report.screenshot(page, "app-baseline-failure").catch(() => undefined)
    report.step("Opened /app as seeded admin", {
      status: "fail",
      screenshot,
      notes: [error instanceof Error ? error.message : String(error)],
    })
    throw error
  } finally {
    report.step("Captured browser diagnostics", {
      status:
        diagnostics.consoleErrors.length === 0 && diagnostics.failedResponses.length === 0
          ? "pass"
          : "warn",
      evidence: diagnostics,
    })
    report.write()
  }
})
