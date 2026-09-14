import { resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { HANDBOOK_USERS } from "./handbook-shots.fixtures"

// Training-video capture for the Quick Start Guide.
//
// Run with: playwright test --config tests/qa/training-video.config.ts
//
// One Playwright test == one video file, so the spec is written as eight
// independent tests rather than two long ones. Everything is recorded through
// the standard `page` fixture: a context made by `browser.newContext()` does
// not inherit `use`, so it would silently record nothing.
//
// Raw .webm files land in docs/handbook/dist/video/.raw/<test-slug>/video.webm
// and are renamed and transcoded to .mp4 afterwards.
//
// Prerequisites: local Supabase up with `pnpm db:reset` applied, and a dev
// server on :3000 (an existing one is reused).
configurePlaywrightRuntime()

/** 720p — the clips are watched in a browser tab, not projected. */
export const VIDEO_SIZE = { width: 1280, height: 720 } as const

export const VIDEO_RAW_DIR = resolve(process.cwd(), "docs/handbook/dist/video/.raw")

export default defineConfig({
  testDir: ".",
  testMatch: "training-video.spec.ts",
  globalSetup: "./handbook-shots.setup.ts",
  outputDir: VIDEO_RAW_DIR,
  // A clip drives a whole pipeline stage end to end, including two server-side
  // PDF renders and a pair of five-second optimistic-send timers.
  timeout: 900_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    colorScheme: "light",
    storageState: HANDBOOK_USERS.consultant.storageState,
    actionTimeout: 60_000,
    navigationTimeout: 90_000,
    trace: "retain-on-failure",
    video: { mode: "on", size: VIDEO_SIZE },
    // Slow enough that a human can follow every click without the clip
    // turning into a screensaver.
    launchOptions: { slowMo: 400 },
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
        viewport: VIDEO_SIZE,
        // 1 keeps the .webm small; the clips are played at 720p, not zoomed.
        deviceScaleFactor: 1,
      },
    },
  ],
})
