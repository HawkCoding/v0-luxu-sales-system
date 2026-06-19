import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

// QA-expert config for the Admin UAT journey (todo.md Phase 33 Admin UAT +
// Phase 35 backup/restore). Kept separate from the Consultant/Manager configs so
// it logs in as the seeded `admin` account (carmen@luxustravel.co.za) and only
// runs admin.spec.ts. Unlike the other two it MAY perform a destructive restore
// (criterion 5) — but only against local Supabase and only when QA_ALLOW_RESTORE=1
// is set after a clean `pnpm db:reset` (see admin.spec.ts A5 pre-checks).
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "admin.spec.ts",
  globalSetup: "./admin.setup.ts",
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
