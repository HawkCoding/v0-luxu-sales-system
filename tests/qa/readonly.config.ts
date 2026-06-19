import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

// QA-expert config for the Read-only UAT journey (Phase 33). Logs in as the
// seeded `readonly` account and only runs readonly.spec.ts. Does NOT reset the
// DB — it discovers target rows at runtime and only ever issues read-only or
// (expected-to-fail) mutation requests, so it leaves no state behind.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "readonly.spec.ts",
  globalSetup: "./readonly.setup.ts",
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
