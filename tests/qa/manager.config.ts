import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

// QA-expert config for the Manager UAT journey (Phase 33). Kept separate from the
// Consultant config so it logs in as the seeded `manager` account and only runs
// manager.spec.ts. Like the Consultant config it does NOT run `pnpm db:reset` —
// the local seed already contains a `manager` account (dirk@luxustravel.co.za)
// and the tests discover/prepare the state they need at runtime, restoring or
// deleting anything they mutate.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "manager.spec.ts",
  globalSetup: "./manager.setup.ts",
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
