import { chromium, type FullConfig } from "@playwright/test"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { ADMIN_STORAGE_STATE } from "./lib/auth"
import { configurePlaywrightRuntime } from "./lib/browser-runtime"
import { createQaSupabase, loadQaEnv } from "./lib/db"

// The QA suite resets the DB at the start of a run, then phases accumulate
// fixtures into qa/.run-state.json. When phases are invoked separately,
// re-resetting on every Playwright invocation wipes the prior phase's
// fixtures (see qa/reports/2026-05-19-q-and-a.md Item 1). We use the
// run-state file as a freshness sentinel: if it was modified within
// RUN_STATE_FRESH_MS, treat it as the same logical run and skip the reset.
//
// Escape hatches:
//   QA_SKIP_DB_RESET=1   — never reset (developer flow)
//   QA_FORCE_DB_RESET=1  — always reset (force a clean run)
const RUN_STATE_PATH = resolve(process.cwd(), "qa", ".run-state.json")
const RUN_STATE_FRESH_MS = 4 * 60 * 60 * 1000

function runDbReset(): void {
  if (process.env.QA_SKIP_DB_RESET === "1") {
    return
  }

  if (process.env.QA_FORCE_DB_RESET !== "1" && existsSync(RUN_STATE_PATH)) {
    const ageMs = Date.now() - statSync(RUN_STATE_PATH).mtimeMs
    if (ageMs >= 0 && ageMs < RUN_STATE_FRESH_MS) {
      const ageMin = Math.round(ageMs / 60_000)
      console.log(
        `[qa] Skipping pnpm db:reset — run-state sentinel is ${ageMin}m old ` +
          `(< ${RUN_STATE_FRESH_MS / 60_000}m). Set QA_FORCE_DB_RESET=1 to override.`,
      )
      return
    }
  }

  const result = spawnSync("pnpm", ["db:reset"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  })

  if (result.status !== 0) {
    throw new Error(`pnpm db:reset failed with status ${result.status ?? "unknown"}`)
  }
}

async function assertSeededAdminExists(): Promise<void> {
  const supabase = createQaSupabase()
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    throw new Error(
      `Cannot list Supabase users (${error.message}). The auth schema is likely broken — ` +
        `try \`pnpm exec supabase stop\` then \`pnpm exec supabase start\` then \`pnpm db:reset\` ` +
        `before re-running the QA suite.`,
    )
  }
  const adminExists = (data?.users ?? []).some(
    (user) => user.email === "carmen@luxustravel.co.za",
  )
  if (!adminExists) {
    throw new Error(
      "Seeded admin carmen@luxustravel.co.za is missing. Run `pnpm db:reset` (with " +
        "QA_SKIP_DB_RESET unset) before re-running the QA suite.",
    )
  }
}

async function globalSetup(config: FullConfig): Promise<void> {
  configurePlaywrightRuntime()
  loadQaEnv()
  runDbReset()
  await assertSeededAdminExists()

  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true })

  const baseURL =
    String(config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })

  try {
    let loggedIn = false
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.goto("/login")
      await page.getByLabel("Email").fill("carmen@luxustravel.co.za")
      await page.getByLabel("Password").fill("password123")
      await page.getByRole("button", { name: /sign in with email/i }).click()
      loggedIn = await page.waitForURL(/\/app(?:\/)?$/, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (loggedIn) {
        break
      }
      await page.waitForTimeout(5_000 * attempt)
    }

    if (!loggedIn) {
      throw new Error(`Failed to log in as seeded admin. Current URL: ${page.url()}`)
    }
    await page.context().storageState({ path: ADMIN_STORAGE_STATE })
  } finally {
    await browser.close()
  }
}

export default globalSetup
