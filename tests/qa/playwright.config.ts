import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

// QA-expert config for the Consultant UAT journey (Phase 33).
// Kept separate from qa/playwright.config.ts so it can target tests/qa/ as the
// user requested without disturbing the existing suite. It deliberately does
// NOT run `pnpm db:reset` — the local seed already contains a `consultant`
// account (leonie@luxustravel.co.za) plus 37 bookings across every stage, and
// these tests discover suitable bookings at runtime rather than rebuilding the
// world on each run.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  // Pinned so this config runs ONLY the consultant spec — without it, testDir "."
  // matches every *.spec.ts in tests/qa/ (manager + admin too), which cross-writes
  // the other suites' reports. Each role config owns exactly one spec + report.
  testMatch: "consultant.spec.ts",
  globalSetup: "./consultant.setup.ts",
  timeout: 150_000,
  expect: { timeout: 15_000 },
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
