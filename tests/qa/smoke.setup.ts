import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import { SMOKE_USER, SMOKE_STORAGE_STATE } from "./smoke.fixtures"

// Logs in as the seeded `manager` user (dirk) and saves the session so the
// smoke spec can run cross-cutting checks as a manager.
async function globalSetup(): Promise<void> {
  configurePlaywrightRuntime()
  loadQaEnv()

  const supabase = createQaSupabase()
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, clearance_level, is_active")
    .eq("email", SMOKE_USER.email)
    .maybeSingle()
  if (error) {
    throw new Error(`Cannot read profiles (${error.message}). Is local Supabase running (pnpm db:start)?`)
  }
  if (!data || data.clearance_level !== "manager") {
    throw new Error(
      `Seeded manager ${SMOKE_USER.email} (clearance_level=manager) not found. ` +
        `Run \`pnpm db:reset\` to load the seed before running the smoke QA suite.`,
    )
  }

  mkdirSync(dirname(SMOKE_STORAGE_STATE), { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: "http://localhost:3000" })
  try {
    let loggedIn = false
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.goto("/login")
      await page.getByLabel("Email").fill(SMOKE_USER.email)
      await page.getByLabel("Password").fill(SMOKE_USER.password)
      await page.getByRole("button", { name: /sign in with email/i }).click()
      loggedIn = await page
        .waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (loggedIn) break
      await page.waitForTimeout(3_000 * attempt)
    }
    if (!loggedIn) {
      throw new Error(`Failed to log in as ${SMOKE_USER.email}. Current URL: ${page.url()}`)
    }
    await page.context().storageState({ path: SMOKE_STORAGE_STATE })
  } finally {
    await browser.close()
  }
}

export default globalSetup
