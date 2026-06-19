import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"

configurePlaywrightRuntime()

export default defineConfig({
  testDir: ".",
  testMatch: "visual-audit-3.spec.ts",
  globalSetup: "./smoke.setup.ts",
  timeout: 240_000,
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
