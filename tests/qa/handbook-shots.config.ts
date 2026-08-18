import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { SHOT_VIEWPORT } from "./handbook-shots.fixtures"

// Handbook screenshot capture. Not a test suite — the assertions here only exist
// so a broken flow fails loudly instead of writing a screenshot of an error page.
//
// Prerequisites: local Supabase up, `pnpm db:reset` then `pnpm db:seed:demo` so
// the captures show presentable demo data rather than QA fixtures.
configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "handbook-shots.spec.ts",
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
      // viewport + scale factor come last: devices["Desktop Chrome"] sets both,
      // and project-level `use` wins over the top-level block.
      use: {
        ...devices["Desktop Chrome"],
        viewport: SHOT_VIEWPORT,
        deviceScaleFactor: 2, // retina-density PNGs so the figures stay sharp in print
      },
    },
  ],
})
