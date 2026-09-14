import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { SHOT_VIEWPORT } from "./handbook-shots.fixtures"

// Figure capture for the Quick Start Guide.
//
// Same shape as handbook-shots.config.ts — it reuses that suite's global setup
// (one storage state per seeded role) and writes into the same screenshots
// directory. Only the spec it matches differs, so the quick-start figures can be
// re-captured without re-running the whole handbook set.
//
// Prerequisites: local Supabase up and `pnpm db:reset` applied. The dev server is
// reused when one is already listening on :3000.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "quickstart-shots.spec.ts",
  globalSetup: "./handbook-shots.setup.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    colorScheme: "light",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: SHOT_VIEWPORT,
        deviceScaleFactor: 2,
      },
    },
  ],
})
