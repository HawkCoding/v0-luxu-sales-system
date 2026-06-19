import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { configurePlaywrightRuntime } from "../../qa/lib/browser-runtime"
import { createQaSupabase, loadQaEnv } from "../../qa/lib/db"
import { ADMIN, ADMIN_STORAGE_STATE } from "./admin.fixtures"

// Logs in as the seeded `admin` user (Carmen) and saves the session so the spec
// runs as an Admin rather than the manager/consultant used elsewhere.
async function globalSetup(): Promise<void> {
  configurePlaywrightRuntime()
  loadQaEnv()

  // Sanity-check the seeded admin exists; fail loudly with guidance if not.
  const supabase = createQaSupabase()
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, clearance_level, is_active")
    .eq("email", ADMIN.email)
    .maybeSingle()
  if (error) {
    throw new Error(`Cannot read profiles (${error.message}). Is local Supabase running (pnpm db:start)?`)
  }
  if (!data || data.clearance_level !== "admin") {
    throw new Error(
      `Seeded admin ${ADMIN.email} (clearance_level=admin) not found. ` +
        `Run \`pnpm db:reset\` to load the seed before running the Admin QA suite.`,
    )
  }

  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL: "http://localhost:3000" })
  try {
    let loggedIn = false
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.goto("/login")
      await page.getByLabel("Email").fill(ADMIN.email)
      await page.getByLabel("Password").fill(ADMIN.password)
      await page.getByRole("button", { name: /sign in with email/i }).click()
      loggedIn = await page
        .waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false)
      if (loggedIn) break
      await page.waitForTimeout(3_000 * attempt)
    }
    if (!loggedIn) {
      throw new Error(`Failed to log in as admin ${ADMIN.email}. Current URL: ${page.url()}`)
    }
    await page.context().storageState({ path: ADMIN_STORAGE_STATE })
  } finally {
    await browser.close()
  }
}

export default globalSetup
