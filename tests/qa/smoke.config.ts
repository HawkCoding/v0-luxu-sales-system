import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

// Cross-cutting Phase 35 smoke suite.
// Acting role: Manager (dirk@luxustravel.co.za) — broadest access for upload,
// PDF generation, error-log read/write, and settings nav badge checks.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "smoke.spec.ts",
  globalSetup: "./smoke.setup.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
