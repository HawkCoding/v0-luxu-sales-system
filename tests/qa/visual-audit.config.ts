import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

// Ad-hoc visual UI/UX audit. Reuses the running dev server + local Supabase and
// the seeded Manager session (dirk). Captures full-page screenshots only — it
// modifies no product code and saves no supplier/customer records.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "visual-audit.spec.ts",
  globalSetup: "./smoke.setup.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
})
