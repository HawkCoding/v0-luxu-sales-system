import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "./lib/browser-runtime"

configurePlaywrightRuntime()

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "qa/playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      // Shrinks the Gmail-style optimistic-send window from 5s to 3s so
      // qa/specs/06-phase5-smoke.spec.ts can deterministically test the
      // undo + commit paths. Anything shorter (500–1000ms) races
      // Playwright's element-discovery + click sequence; the timer fires
      // before Undo gets clicked. Production keeps the 5s default.
      NEXT_PUBLIC_OPTIMISTIC_SEND_DELAY_MS: "3000",
      // .env.local sets MAILPIT_SMTP_PORT=54325 but not _HOST. The transport
      // ignores port-only configs and falls back to :1025. Wire the host
      // explicitly so /api/correspondence can actually deliver via the
      // local Supabase Inbucket container during QA runs.
      MAILPIT_SMTP_HOST: "127.0.0.1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
